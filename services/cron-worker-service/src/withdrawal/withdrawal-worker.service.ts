import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

/**
 * Minimal ABI for CvhWalletSimple: only the functions needed for withdrawal execution.
 */
const CVH_WALLET_ABI = [
  'function sendMultiSig(address toAddress, uint256 value, bytes calldata data, uint256 expireTime, uint256 sequenceId, bytes calldata signature) external',
  'function sendMultiSigToken(address toAddress, uint256 value, address tokenContractAddress, uint256 expireTime, uint256 sequenceId, bytes calldata signature) external',
  'function getNextSequenceId() public view returns (uint256)',
];

interface KeyVaultSignResponse {
  success: boolean;
  clientId: number;
  signature: string;
  v: number;
  r: string;
  s: string;
  address: string;
}

interface KeyVaultSignTransactionResponse {
  success: boolean;
  signedTransaction: string;
  txHash: string;
  from: string;
}

export interface WithdrawalJobData {
  withdrawalId: string;
}

export interface WithdrawalConfirmJobData {
  withdrawalId: string;
  txHash: string;
  chainId: number;
}

export interface WithdrawalJobResult {
  withdrawalId: string;
  txHash: string;
  sequenceId: number;
  status: 'broadcasting' | 'failed';
}

/**
 * BullMQ processor that picks up approved withdrawals and executes them on-chain.
 *
 * Flow:
 * 1. Polls for approved withdrawals (via repeatable cron job)
 * 2. For each approved withdrawal, builds the operationHash, signs via Key Vault,
 *    and submits the multisig transaction
 * 3. On success: marks as 'broadcasting' and enqueues confirmation tracking
 * 4. On failure: marks as 'failed' with error details in logs and events
 *
 * The operationHash MUST match exactly what CvhWalletSimple computes:
 *   - sendMultiSig:      keccak256(abi.encode(getNetworkId(), toAddress, value, data, expireTime, sequenceId))
 *   - sendMultiSigToken:  keccak256(abi.encode(getTokenNetworkId(), toAddress, value, tokenContractAddress, expireTime, sequenceId))
 *
 * Where getNetworkId() = Strings.toString(block.chainid) and getTokenNetworkId() = getNetworkId() + "-ERC20".
 */
@Processor('withdrawal', { concurrency: 2 })
@Injectable()
export class WithdrawalWorkerService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WithdrawalWorkerService.name);
  private readonly keyVaultUrl: string;
  private readonly internalServiceKey: string;
  private readonly expireTimeSeconds: number;

  constructor(
    @InjectQueue('withdrawal') private readonly withdrawalQueue: Queue,
    @InjectQueue('withdrawal-confirm')
    private readonly confirmQueue: Queue,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super();
    // L-3: Use getOrThrow to fail fast if KEY_VAULT_URL is missing,
    // matching the pattern in TransactionSubmitterService and ProjectDeployService.
    // A broken localhost fallback would silently fail in production.
    this.keyVaultUrl = this.config.getOrThrow<string>('KEY_VAULT_URL');
    this.internalServiceKey = this.config.get<string>(
      'INTERNAL_SERVICE_KEY',
      '',
    );
    this.expireTimeSeconds = this.config.get<number>(
      'WITHDRAWAL_EXPIRE_SECONDS',
      3600,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.initWithdrawalPollingJob();
  }

  /**
   * Initialize the repeatable job that polls for approved withdrawals.
   */
  async initWithdrawalPollingJob(
    intervalMs: number = 30_000,
  ): Promise<void> {
    await this.withdrawalQueue.add(
      'poll-approved',
      {},
      {
        repeat: { every: intervalMs },
        jobId: 'withdrawal-poll',
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
    this.logger.log(
      `Withdrawal polling job initialized (every ${intervalMs}ms)`,
    );
  }

  /**
   * BullMQ worker: process withdrawal jobs.
   * Handles two job types:
   * - 'poll-approved': scan DB for approved withdrawals and enqueue each one
   * - 'execute': execute a single approved withdrawal on-chain
   */
  async process(
    job: Job<WithdrawalJobData | Record<string, never>>,
  ): Promise<WithdrawalJobResult | number> {
    if (job.name === 'poll-approved') {
      return this.pollApprovedWithdrawals();
    }

    if (job.name === 'execute') {
      const { withdrawalId } = job.data as WithdrawalJobData;
      return this.executeWithdrawal(withdrawalId, job);
    }

    this.logger.warn(`Unknown job name: ${job.name}`);
    return 0;
  }

  /**
   * Poll for approved withdrawals and enqueue individual execution jobs.
   */
  private async pollApprovedWithdrawals(): Promise<number> {
    const approved = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM cvh_transactions.withdrawals
      WHERE status = 'approved'
      ORDER BY created_at ASC
      LIMIT 50
    `;

    if (approved.length === 0) return 0;

    this.logger.log(
      `Found ${approved.length} approved withdrawals to execute`,
    );

    for (const withdrawal of approved) {
      const jobId = `execute-withdrawal-${withdrawal.id}`;

      // Deduplicate: don't enqueue if already in the queue
      const existing = await this.withdrawalQueue.getJob(jobId);
      if (existing) continue;

      await this.withdrawalQueue.add(
        'execute',
        { withdrawalId: withdrawal.id.toString() },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
    }

    return approved.length;
  }

  /**
   * Execute a single approved withdrawal on-chain.
   */
  private async executeWithdrawal(
    withdrawalId: string,
    job: Job,
  ): Promise<WithdrawalJobResult> {
    // Atomic compare-and-swap: only proceed if we successfully claim this withdrawal.
    // This prevents double-execution when concurrent workers pick up the same withdrawal.
    const claimResult = await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals
      SET status = 'broadcasting'
      WHERE id = ${BigInt(withdrawalId)} AND status = 'approved'
    `;

    if (claimResult !== 1) {
      this.logger.warn(
        `Withdrawal ${withdrawalId} could not be claimed (already picked up or not approved), skipping`,
      );
      return {
        withdrawalId,
        txHash: '',
        sequenceId: 0,
        status: 'failed',
      };
    }

    // Fetch the full withdrawal row now that we own it
    const [withdrawal] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM cvh_transactions.withdrawals WHERE id = ${BigInt(withdrawalId)}
    `;

    if (!withdrawal) {
      throw new Error(`Withdrawal ${withdrawalId} not found after claiming`);
    }

    const clientId = Number(withdrawal.clientId);
    const chainId = withdrawal.chainId;

    try {
      // Load token
      const token = await this.prisma.token.findUnique({
        where: { id: withdrawal.tokenId },
      });
      if (!token) {
        throw new Error(
          `Token ${withdrawal.tokenId} not found`,
        );
      }

      // Load hot wallet (CvhWalletSimple contract address)
      const hotWallet = await this.prisma.wallet.findUnique({
        where: {
          uq_client_chain_type: {
            clientId: BigInt(clientId),
            chainId,
            walletType: 'hot',
          },
        },
      });
      if (!hotWallet) {
        throw new Error(
          `Hot wallet not found for client ${clientId} on chain ${chainId}`,
        );
      }

      // Load gas tank wallet (msg.sender for the multisig tx)
      const gasTank = await this.prisma.wallet.findUnique({
        where: {
          uq_client_chain_type: {
            clientId: BigInt(clientId),
            chainId,
            walletType: 'gas_tank',
          },
        },
      });
      if (!gasTank) {
        throw new Error(
          `Gas tank wallet not found for client ${clientId} on chain ${chainId}`,
        );
      }

      const provider = await this.evmProvider.getProvider(chainId);

      // Get next sequence ID from the contract
      const walletContract = new ethers.Contract(
        hotWallet.address,
        CVH_WALLET_ABI,
        provider,
      );
      const nextSeqId: bigint = await walletContract.getNextSequenceId();
      const sequenceId = Number(nextSeqId);

      // Calculate expiration
      const expireTime =
        Math.floor(Date.now() / 1000) + this.expireTimeSeconds;

      // Build operationHash
      const value = BigInt(withdrawal.amountRaw);
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      let operationHash: string;

      if (token.isNative) {
        // sendMultiSig: abi.encode(getNetworkId(), toAddress, value, data, expireTime, sequenceId)
        const encoded = abiCoder.encode(
          ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          [
            chainId.toString(),
            withdrawal.toAddress,
            value,
            '0x',
            expireTime,
            sequenceId,
          ],
        );
        operationHash = ethers.keccak256(encoded);
      } else {
        // sendMultiSigToken: abi.encode(getTokenNetworkId(), toAddress, value, tokenContractAddress, expireTime, sequenceId)
        const encoded = abiCoder.encode(
          [
            'string',
            'address',
            'uint256',
            'address',
            'uint256',
            'uint256',
          ],
          [
            `${chainId}-ERC20`,
            withdrawal.toAddress,
            value,
            token.contractAddress,
            expireTime,
            sequenceId,
          ],
        );
        operationHash = ethers.keccak256(encoded);
      }

      this.logger.log(
        `Withdrawal ${withdrawalId}: operationHash=${operationHash}, seqId=${sequenceId}, expire=${expireTime}`,
      );

      // Sign the operationHash via Key Vault (platform key).
      // The contract applies "\x19Ethereum Signed Message:\n32" prefix before ecrecover,
      // so we must sign the prefixed hash (since Key Vault uses raw ECDSA sign).
      const prefixedHash = ethers.solidityPackedKeccak256(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', operationHash],
      );

      const signResult = await this.signViaKeyVault(
        clientId,
        prefixedHash,
      );

      this.logger.log(
        `Withdrawal ${withdrawalId}: signed by platform key ${signResult.address}`,
      );

      // Build calldata for the contract call
      let txData: string;
      if (token.isNative) {
        txData = walletContract.interface.encodeFunctionData(
          'sendMultiSig',
          [
            withdrawal.toAddress,
            value,
            '0x',
            expireTime,
            sequenceId,
            signResult.signature,
          ],
        );
      } else {
        txData = walletContract.interface.encodeFunctionData(
          'sendMultiSigToken',
          [
            withdrawal.toAddress,
            value,
            token.contractAddress,
            expireTime,
            sequenceId,
            signResult.signature,
          ],
        );
      }

      // Sign and broadcast the outer transaction via Key Vault (gas_tank key)
      // Uses the same sign-transaction pattern as TransactionSubmitterService (sweep).
      const nonce = await provider.getTransactionCount(gasTank.address, 'pending');
      const feeData = await provider.getFeeData();

      let gasEstimate: bigint;
      try {
        const estimated = await provider.estimateGas({
          from: gasTank.address,
          to: hotWallet.address,
          data: txData,
        });
        gasEstimate = (estimated * 120n) / 100n; // 20% safety margin
      } catch {
        gasEstimate = 300_000n; // Conservative default for multisig calls
      }

      const outerTxData: Record<string, any> = {
        to: hotWallet.address,
        data: txData,
        value: '0',
        gasLimit: gasEstimate.toString(),
        nonce,
        chainId,
      };

      if (feeData.maxFeePerGas !== null && feeData.maxFeePerGas !== undefined) {
        outerTxData.maxFeePerGas = feeData.maxFeePerGas.toString();
        outerTxData.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas ?? 0n).toString();
      } else if (feeData.gasPrice !== null && feeData.gasPrice !== undefined) {
        outerTxData.gasPrice = feeData.gasPrice.toString();
      } else {
        throw new Error(`Unable to determine gas price for chain ${chainId}`);
      }

      const signTxController = new AbortController();
      const signTxTimeout = setTimeout(() => signTxController.abort(), 10_000);

      let txHash: string;
      const submittedAt = new Date();

      try {
        const signTxRes = await fetch(
          `${this.keyVaultUrl}/keys/${clientId}/sign-transaction`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Service-Key': this.internalServiceKey,
            },
            body: JSON.stringify({
              clientId,
              chainId,
              keyType: 'gas_tank',
              txData: outerTxData,
              requestedBy: 'withdrawal-worker',
            }),
            signal: signTxController.signal,
          },
        );

        if (!signTxRes.ok) {
          const body = await signTxRes.text();
          throw new Error(`Key Vault sign-transaction failed (${signTxRes.status}): ${body}`);
        }

        const signTxResult = (await signTxRes.json()) as KeyVaultSignTransactionResponse;
        if (!signTxResult.success || !signTxResult.signedTransaction) {
          throw new Error(`Key Vault sign-transaction returned unsuccessful for client ${clientId}, chain ${chainId}`);
        }

        // Broadcast the signed transaction
        const broadcastResult = await provider.broadcastTransaction(signTxResult.signedTransaction);
        txHash = broadcastResult.hash;
      } finally {
        clearTimeout(signTxTimeout);
      }

      this.logger.log(
        `Withdrawal ${withdrawalId} broadcast: txHash=${txHash}`,
      );

      // Update withdrawal with tx details (status already set to 'broadcasting' during claim)
      await this.prisma.$executeRaw`
        UPDATE cvh_transactions.withdrawals
        SET tx_hash = ${txHash}, sequence_id = ${sequenceId}, submitted_at = ${submittedAt}
        WHERE id = ${BigInt(withdrawalId)}
      `;

      // Enqueue confirmation tracking job
      await this.confirmQueue.add(
        'track-confirmation',
        {
          withdrawalId,
          txHash,
          chainId,
        } as WithdrawalConfirmJobData,
        {
          jobId: `confirm-withdrawal-${withdrawalId}`,
          delay: 15_000, // Wait 15s before first check
          attempts: 60,
          backoff: { type: 'fixed', delay: 15_000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );

      // Publish broadcasting event
      await this.redis.publishToStream('withdrawals:broadcasting', {
        withdrawalId,
        clientId: clientId.toString(),
        chainId: chainId.toString(),
        txHash,
        toAddress: withdrawal.toAddress,
        amount: withdrawal.amount,
        amountRaw: withdrawal.amountRaw,
        sequenceId: sequenceId.toString(),
        timestamp: submittedAt.toISOString(),
      });

      this.evmProvider.reportSuccess(chainId);

      return {
        withdrawalId,
        txHash,
        sequenceId,
        status: 'broadcasting',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const attemptsMade = job.attemptsMade + 1;
      const maxAttempts = job.opts?.attempts ?? 3;
      const isFinalAttempt = attemptsMade >= maxAttempts;

      this.logger.error(
        `Withdrawal ${withdrawalId} execution failed (attempt ${attemptsMade}/${maxAttempts}): ${msg}`,
      );

      this.evmProvider.reportFailure(chainId);

      if (isFinalAttempt) {
        // Final attempt exhausted: mark withdrawal as failed
        await this.prisma.$executeRaw`
          UPDATE cvh_transactions.withdrawals SET status = 'failed' WHERE id = ${BigInt(withdrawalId)}
        `;

        // Publish failure event with rich traceability
        await this.redis.publishToStream('withdrawals:failed', {
          withdrawalId,
          clientId: clientId.toString(),
          chainId: chainId.toString(),
          toAddress: withdrawal.toAddress,
          amount: withdrawal.amount,
          error: msg,
          attempts: attemptsMade.toString(),
          timestamp: new Date().toISOString(),
        });
      } else {
        // Revert status to 'approved' so the next retry attempt can claim it again
        await this.prisma.$executeRaw`
          UPDATE cvh_transactions.withdrawals SET status = 'approved' WHERE id = ${BigInt(withdrawalId)}
        `;
      }

      throw error; // Re-throw so BullMQ can retry (if attempts remain)
    }
  }

  /**
   * Call Key Vault to sign operationHash with platform key.
   * Includes AbortController with 10s timeout.
   */
  private async signViaKeyVault(
    clientId: number,
    operationHash: string,
  ): Promise<KeyVaultSignResponse> {
    const url = `${this.keyVaultUrl}/keys/${clientId}/sign`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': this.internalServiceKey,
        },
        body: JSON.stringify({
          hash: operationHash,
          keyType: 'platform',
          requestedBy: 'withdrawal-worker',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Key Vault sign failed (${res.status}): ${body}`,
        );
      }

      return (await res.json()) as KeyVaultSignResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}
