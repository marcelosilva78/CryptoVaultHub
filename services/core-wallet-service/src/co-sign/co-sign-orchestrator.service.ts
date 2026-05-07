import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ethers } from 'ethers';

export interface BuildHashParams {
  networkId: string;
  hotWalletAddress: string;
  toAddress: string;
  amountRaw: string;
  tokenContractAddress: string | null;
  expireTime: number;
  sequenceId: number;
}

/**
 * Orchestrates co-sign operations for withdrawals.
 *
 * The co-sign flow requires clients to cryptographically sign the
 * operationHash before a withdrawal can proceed. This implements the
 * 2-of-3 multisig requirement where:
 *  - msg.sender (gas tank) is signer #1
 *  - platform key OR client key is signer #2
 *
 * For co-sign custody mode, the client key provides signer #2 via
 * this service's signature verification.
 */
@Injectable()
export class CoSignOrchestratorService {
  private readonly logger = new Logger(CoSignOrchestratorService.name);
  private readonly keyVaultUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.keyVaultUrl = this.config.get<string>(
      'KEY_VAULT_URL',
      'http://key-vault-service:3005',
    );
    this.internalKey = this.config.get<string>(
      'INTERNAL_SERVICE_KEY',
      '',
    );
  }

  /**
   * Build the operationHash matching the smart contract's ABI encoding.
   *
   * For native ETH (tokenContractAddress is null):
   *   keccak256(abi.encode(networkId, address(this), toAddress, value, data, expireTime, sequenceId))
   *
   * For ERC-20 (tokenContractAddress is set):
   *   keccak256(abi.encode(networkId + "-ERC20", address(this), toAddress, value, tokenContract, expireTime, sequenceId))
   */
  buildOperationHash(params: BuildHashParams): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    if (params.tokenContractAddress) {
      // ERC-20 token transfer
      const encoded = abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'address',
          'uint256',
          'uint256',
        ],
        [
          `${params.networkId}-ERC20`,
          params.hotWalletAddress,
          params.toAddress,
          BigInt(params.amountRaw),
          params.tokenContractAddress,
          params.expireTime,
          params.sequenceId,
        ],
      );
      return ethers.keccak256(encoded);
    }

    // Native ETH transfer
    const encoded = abiCoder.encode(
      [
        'string',
        'address',
        'address',
        'uint256',
        'bytes',
        'uint256',
        'uint256',
      ],
      [
        params.networkId,
        params.hotWalletAddress,
        params.toAddress,
        BigInt(params.amountRaw),
        '0x',
        params.expireTime,
        params.sequenceId,
      ],
    );
    return ethers.keccak256(encoded);
  }

  /**
   * Verify an ECDSA signature by recovering the signer address.
   *
   * Uses ethers.verifyMessage which applies the Ethereum prefix internally,
   * matching the contract's _recoverSigner behavior.
   */
  verifySignature(
    operationHash: string,
    signature: string,
    expectedAddress: string,
  ): boolean {
    const recovered = ethers.verifyMessage(
      ethers.getBytes(operationHash),
      signature,
    );
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  }

  /**
   * Create a co-sign operation for a withdrawal.
   *
   * 1. Loads withdrawal + token data from cvh_transactions
   * 2. Gets hot wallet address from cvh_wallets
   * 3. Gets sequence ID from project_chains
   * 4. Builds the operationHash
   * 5. Fetches the client key address from Key Vault
   * 6. Inserts the co-sign operation record
   * 7. Updates withdrawal status to pending_cosign
   * 8. Publishes cosign:pending event
   */
  async createCoSignOperation(
    withdrawalId: number,
    clientId: number,
    projectId: number,
  ): Promise<{ operationId: string }> {
    // 1. Load the withdrawal with token info
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT w.*, t.contract_address AS token_contract_address
      FROM cvh_transactions.withdrawals w
      LEFT JOIN cvh_admin.tokens t ON w.token_id = t.id
      WHERE w.id = ${BigInt(withdrawalId)} AND w.client_id = ${BigInt(clientId)}
    `;
    const withdrawal = rows[0];
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    // 2. Get hot wallet address
    const walletRows = await this.prisma.$queryRaw<any[]>`
      SELECT address FROM cvh_wallets.wallets
      WHERE client_id = ${BigInt(clientId)} AND project_id = ${BigInt(projectId)}
        AND chain_id = ${withdrawal.chain_id} AND wallet_type = 'hot'
      LIMIT 1
    `;
    const wallet = walletRows[0];
    if (!wallet) throw new NotFoundException('Hot wallet not found');

    // 3. Get sequence ID from project chains
    const pcRows = await this.prisma.$queryRaw<any[]>`
      SELECT hot_wallet_sequence_id FROM cvh_admin.project_chains
      WHERE project_id = ${BigInt(projectId)} AND chain_id = ${withdrawal.chain_id}
    `;
    const sequenceId =
      Number(pcRows[0]?.hot_wallet_sequence_id ?? 0) + 1;

    // 4. Compute expiry (24h from now)
    const expireTime = Math.floor(Date.now() / 1000) + 86400;

    // 5. Build operation hash
    const networkId = String(withdrawal.chain_id);
    const operationHash = this.buildOperationHash({
      networkId,
      hotWalletAddress: wallet.address,
      toAddress: withdrawal.to_address,
      amountRaw: withdrawal.amount_raw,
      tokenContractAddress: withdrawal.token_contract_address || null,
      expireTime,
      sequenceId,
    });

    // 6. Get client key address from Key Vault
    const clientAddress = await this.getClientKeyAddress(clientId, projectId);

    // 7. Generate unique operation ID
    const operationId = `cosign_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    // 8. Insert co-sign operation record
    const expiresAt = new Date(Date.now() + 86400000);
    await this.prisma.$executeRaw`
      INSERT INTO cvh_transactions.co_sign_operations
        (operation_id, withdrawal_id, client_id, project_id, chain_id,
         operation_hash, hot_wallet_address, to_address, amount_raw,
         token_contract_address, expire_time, sequence_id, network_id,
         status, client_address, expires_at)
      VALUES
        (${operationId}, ${BigInt(withdrawalId)}, ${BigInt(clientId)}, ${BigInt(projectId)},
         ${withdrawal.chain_id}, ${operationHash}, ${wallet.address}, ${withdrawal.to_address},
         ${withdrawal.amount_raw}, ${withdrawal.token_contract_address || null},
         ${expireTime}, ${sequenceId}, ${networkId}, 'pending', ${clientAddress}, ${expiresAt})
    `;

    // 9. Update withdrawal status to pending_cosign
    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals SET status = 'pending_cosign'
      WHERE id = ${BigInt(withdrawalId)}
    `;

    // 10. Publish event via Redis Stream
    await this.redis.publishToStream('cosign:pending', {
      operationId,
      withdrawalId: String(withdrawalId),
      clientId: String(clientId),
      projectId: String(projectId),
      chainId: String(withdrawal.chain_id),
      toAddress: withdrawal.to_address,
      amount: withdrawal.amount,
      eventType: 'withdrawal.pending_cosign',
    });

    this.logger.log(
      `Created co-sign operation ${operationId} for withdrawal ${withdrawalId}`,
    );
    return { operationId };
  }

  /**
   * Submit a co-sign signature for verification.
   *
   * Validates the operation is still pending and not expired,
   * verifies the ECDSA signature matches the registered client key,
   * then transitions both the co-sign operation and the withdrawal.
   */
  async submitCoSignature(
    operationId: string,
    clientId: number,
    signature: string,
  ): Promise<{ success: boolean }> {
    // 1. Load the operation
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM cvh_transactions.co_sign_operations
      WHERE operation_id = ${operationId} AND client_id = ${BigInt(clientId)}
    `;
    const operation = rows[0];
    if (!operation) throw new NotFoundException('Co-sign operation not found');

    // 2. Check status
    if (operation.status !== 'pending') {
      throw new BadRequestException(
        `Operation is not pending (current: ${operation.status})`,
      );
    }

    // 3. Check expiry
    if (new Date(operation.expires_at) <= new Date()) {
      throw new BadRequestException('Co-sign operation has expired');
    }

    // 4. Verify signature against registered client key
    const valid = this.verifySignature(
      operation.operation_hash,
      signature,
      operation.client_address,
    );
    if (!valid) {
      throw new BadRequestException(
        'Signature does not match the registered client key',
      );
    }

    // 5. Update co-sign operation to signed
    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.co_sign_operations
      SET status = 'signed', client_signature = ${signature}, signed_at = NOW(3)
      WHERE id = ${operation.id}
    `;

    // 6. Transition withdrawal to approved
    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals SET status = 'approved'
      WHERE id = ${operation.withdrawal_id} AND status = 'pending_cosign'
    `;

    // 7. Publish signed event
    await this.redis.publishToStream('cosign:signed', {
      operationId,
      withdrawalId: String(Number(operation.withdrawal_id)),
      clientId: String(clientId),
      eventType: 'withdrawal.cosigned',
    });

    this.logger.log(
      `Co-sign operation ${operationId} signed successfully`,
    );
    return { success: true };
  }

  /**
   * List pending co-sign operations for a client/project.
   */
  async getPendingOperations(
    clientId: number,
    projectId: number,
  ): Promise<any[]> {
    return this.prisma.$queryRaw<any[]>`
      SELECT co.*, c.name AS chain_name, t.symbol AS token_symbol
      FROM cvh_transactions.co_sign_operations co
      LEFT JOIN cvh_admin.chains c ON co.chain_id = c.id
      LEFT JOIN cvh_admin.tokens t
        ON t.contract_address COLLATE utf8mb4_unicode_ci = co.token_contract_address COLLATE utf8mb4_unicode_ci
       AND t.chain_id = co.chain_id
      WHERE co.client_id = ${BigInt(clientId)}
        AND co.project_id = ${BigInt(projectId)}
        AND co.status = 'pending'
      ORDER BY co.created_at DESC
    `;
  }

  /**
   * Get a single co-sign operation by ID.
   */
  async getOperation(
    operationId: string,
    clientId: number,
  ): Promise<any> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT co.*, c.name AS chain_name, t.symbol AS token_symbol
      FROM cvh_transactions.co_sign_operations co
      LEFT JOIN cvh_admin.chains c ON co.chain_id = c.id
      LEFT JOIN cvh_admin.tokens t
        ON t.contract_address COLLATE utf8mb4_unicode_ci = co.token_contract_address COLLATE utf8mb4_unicode_ci
       AND t.chain_id = co.chain_id
      WHERE co.operation_id = ${operationId} AND co.client_id = ${BigInt(clientId)}
    `;
    if (!rows[0]) throw new NotFoundException('Operation not found');
    return rows[0];
  }

  /**
   * Expire stale co-sign operations that have exceeded their 24h timeout.
   *
   * For each expired operation:
   * - Sets co-sign status to 'expired'
   * - Cancels the associated withdrawal
   * - Publishes a cosign:expired event
   */
  async expireStaleOperations(): Promise<number> {
    const stale = await this.prisma.$queryRaw<any[]>`
      SELECT id, operation_id, withdrawal_id, client_id, project_id, chain_id, to_address, amount_raw
      FROM cvh_transactions.co_sign_operations
      WHERE status = 'pending' AND expires_at < NOW(3)
    `;

    for (const op of stale) {
      await this.prisma.$executeRaw`
        UPDATE cvh_transactions.co_sign_operations SET status = 'expired' WHERE id = ${op.id}
      `;
      await this.prisma.$executeRaw`
        UPDATE cvh_transactions.withdrawals SET status = 'cancelled'
        WHERE id = ${op.withdrawal_id} AND status = 'pending_cosign'
      `;
      await this.redis.publishToStream('cosign:expired', {
        operationId: op.operation_id,
        withdrawalId: String(Number(op.withdrawal_id)),
        clientId: String(Number(op.client_id)),
        eventType: 'withdrawal.cosign_expired',
      });
      this.logger.warn(
        `Co-sign operation ${op.operation_id} expired — withdrawal ${op.withdrawal_id} cancelled`,
      );
    }

    return stale.length;
  }

  /**
   * Fetch the client key address from Key Vault.
   * Uses native fetch with AbortController (matching withdrawal-executor pattern).
   */
  async getClientKeyAddress(
    clientId: number,
    projectId: number,
  ): Promise<string> {
    const url = `${this.keyVaultUrl}/keys/address?clientId=${clientId}&projectId=${projectId}&keyType=client`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Internal-Service-Key': this.internalKey,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Key Vault address lookup failed (${res.status}): ${body}`,
        );
      }

      const data = (await res.json()) as { address: string };
      return data.address;
    } finally {
      clearTimeout(timeout);
    }
  }
}
