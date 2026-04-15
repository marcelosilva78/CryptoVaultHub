import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { NonceService } from '../blockchain/nonce.service';

/**
 * Minimal ABI for CvhWalletSimple: only the functions needed for withdrawal execution.
 */
const CVH_WALLET_ABI = [
  'function sendMultiSig(address toAddress, uint256 value, bytes calldata data, uint256 expireTime, uint256 sequenceId, bytes calldata signature) external',
  'function sendMultiSigToken(address toAddress, uint256 value, address tokenContractAddress, uint256 expireTime, uint256 sequenceId, bytes calldata signature) external',
  'function getNextSequenceId() public view returns (uint256)',
  'function getNetworkId() public view returns (string)',
  'function getTokenNetworkId() public view returns (string)',
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

export interface ExecuteWithdrawalResult {
  txHash: string;
  sequenceId: number;
  submittedAt: Date;
}

/**
 * Executes approved withdrawals on-chain by:
 * 1. Building the operationHash matching CvhWalletSimple's signature scheme
 * 2. Requesting a signature from Key Vault (platform key signs the operationHash)
 * 3. Constructing and submitting the sendMultiSig / sendMultiSigToken transaction
 * 4. Updating the withdrawal record with txHash and broadcasting status
 *
 * The msg.sender (gas tank wallet) is one of the 3 signers, and the signature
 * comes from the platform key — satisfying the 2-of-3 multisig requirement.
 */
@Injectable()
export class WithdrawalExecutorService {
  private readonly logger = new Logger(WithdrawalExecutorService.name);
  private readonly keyVaultUrl: string;
  private readonly internalServiceKey: string;
  private readonly expireTimeSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly evmProvider: EvmProviderService,
    private readonly nonceService: NonceService,
  ) {
    this.keyVaultUrl = this.config.get<string>(
      'KEY_VAULT_URL',
      'http://localhost:3005',
    );
    this.internalServiceKey = this.config.get<string>(
      'INTERNAL_SERVICE_KEY',
      '',
    );
    // Default expiry: 1 hour from submission
    this.expireTimeSeconds = this.config.get<number>(
      'WITHDRAWAL_EXPIRE_SECONDS',
      3600,
    );
  }

  /**
   * Execute an approved withdrawal on-chain.
   *
   * Steps:
   * 1. Load withdrawal, wallet, token, and chain data
   * 2. Get next sequence ID from the CvhWalletSimple contract
   * 3. Build the operationHash (must match contract's keccak256 exactly)
   * 4. Request Key Vault to sign the operationHash with the platform key
   * 5. Build the sendMultiSig / sendMultiSigToken calldata
   * 6. Sign and submit the outer transaction from the gas tank wallet
   * 7. Update the withdrawal record to 'broadcasting'
   */
  async executeWithdrawal(
    withdrawalId: string,
  ): Promise<ExecuteWithdrawalResult> {
    // 1. Load withdrawal record
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: BigInt(withdrawalId) },
    });
    if (!withdrawal) {
      throw new NotFoundException(
        `Withdrawal ${withdrawalId} not found`,
      );
    }
    if (withdrawal.status !== 'approved') {
      throw new Error(
        `Withdrawal ${withdrawalId} is not in 'approved' status (current: ${withdrawal.status})`,
      );
    }

    const clientId = Number(withdrawal.clientId);
    const chainId = withdrawal.chainId;

    // Load token
    const token = await this.prisma.token.findUnique({
      where: { id: withdrawal.tokenId },
    });
    if (!token) {
      throw new Error(
        `Token ${withdrawal.tokenId} not found for withdrawal ${withdrawalId}`,
      );
    }

    // Load hot wallet (the CvhWalletSimple contract address)
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

    // Load gas tank wallet (used as msg.sender / tx signer)
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

    // 2. Get provider and contract instance
    const provider = await this.evmProvider.getProvider(chainId);
    const walletContract = new ethers.Contract(
      hotWallet.address,
      CVH_WALLET_ABI,
      provider,
    );

    // 3. Get next sequence ID from the contract
    const sequenceId = await this.getNextSequenceId(
      hotWallet.address,
      provider,
    );

    // 4. Calculate expiration time
    const expireTime = Math.floor(Date.now() / 1000) + this.expireTimeSeconds;

    // 5. Build the operationHash
    // The contract uses abi.encode (NOT abi.encodePacked) with the network ID string
    const value = BigInt(withdrawal.amountRaw);
    let operationHash: string;

    if (token.isNative) {
      // sendMultiSig: operationHash = keccak256(abi.encode(getNetworkId(), toAddress, value, data, expireTime, sequenceId))
      operationHash = this.buildNativeOperationHash({
        networkId: chainId.toString(),
        toAddress: withdrawal.toAddress,
        value,
        data: '0x',
        expireTime,
        sequenceId,
      });
    } else {
      // sendMultiSigToken: operationHash = keccak256(abi.encode(getTokenNetworkId(), toAddress, value, tokenContractAddress, expireTime, sequenceId))
      operationHash = this.buildTokenOperationHash({
        tokenNetworkId: `${chainId}-ERC20`,
        toAddress: withdrawal.toAddress,
        value,
        tokenContractAddress: token.contractAddress,
        expireTime,
        sequenceId,
      });
    }

    this.logger.log(
      `Built operationHash for withdrawal ${withdrawalId}: ${operationHash} (seqId=${sequenceId}, expire=${expireTime})`,
    );

    // 6. Request Key Vault to sign the operationHash with platform key
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
      `Platform key signed prefixedHash for withdrawal ${withdrawalId} (signer: ${signResult.address})`,
    );

    // 7. Build the sendMultiSig / sendMultiSigToken calldata
    let txData: string;

    if (token.isNative) {
      txData = walletContract.interface.encodeFunctionData('sendMultiSig', [
        withdrawal.toAddress,
        value,
        '0x',
        expireTime,
        sequenceId,
        signResult.signature,
      ]);
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

    // 8. Sign and submit the outer transaction from the gas tank
    // The gas tank address is a signer on the CvhWalletSimple contract,
    // and its private key is managed by Key Vault (keyType: 'gas_tank').
    const gasTankKeyResult = await this.getGasTankPrivateKey(
      clientId,
      chainId,
    );

    const gasTankWallet = new ethers.Wallet(
      gasTankKeyResult.privateKeyHex,
      provider,
    );

    // Acquire nonce with mutex to prevent collisions
    const { nonce, release } = await this.nonceService.acquireNonce(
      chainId,
      gasTank.address,
    );

    let txHash: string;
    const submittedAt = new Date();

    try {
      const tx = await gasTankWallet.sendTransaction({
        to: hotWallet.address,
        data: txData,
        nonce,
      });

      txHash = tx.hash;

      this.logger.log(
        `Withdrawal ${withdrawalId} broadcast: txHash=${txHash} (nonce=${nonce})`,
      );
    } catch (error) {
      // Reset nonce cache on failure so next attempt re-fetches from chain
      await this.nonceService.resetNonce(chainId, gasTank.address);
      throw error;
    } finally {
      await release();
      // Zero the private key from memory
      gasTankKeyResult.zero();
    }

    // 9. Update withdrawal record: approved -> broadcasting
    await this.prisma.withdrawal.update({
      where: { id: BigInt(withdrawalId) },
      data: {
        status: 'broadcasting',
        txHash,
        sequenceId,
        submittedAt,
      },
    });

    this.logger.log(
      `Withdrawal ${withdrawalId} status updated to 'broadcasting' (txHash=${txHash}, seqId=${sequenceId})`,
    );

    return { txHash, sequenceId, submittedAt };
  }

  /**
   * Build the operationHash for a native ETH sendMultiSig call.
   *
   * Matches the contract's computation:
   *   keccak256(abi.encode(getNetworkId(), toAddress, value, data, expireTime, sequenceId))
   *
   * getNetworkId() returns Strings.toString(block.chainid), e.g., "1" for mainnet.
   */
  buildNativeOperationHash(params: {
    networkId: string;
    toAddress: string;
    value: bigint;
    data: string;
    expireTime: number;
    sequenceId: number;
  }): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const encoded = abiCoder.encode(
      ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [
        params.networkId,
        params.toAddress,
        params.value,
        params.data,
        params.expireTime,
        params.sequenceId,
      ],
    );

    return ethers.keccak256(encoded);
  }

  /**
   * Build the operationHash for an ERC-20 sendMultiSigToken call.
   *
   * Matches the contract's computation:
   *   keccak256(abi.encode(getTokenNetworkId(), toAddress, value, tokenContractAddress, expireTime, sequenceId))
   *
   * getTokenNetworkId() returns getNetworkId() + "-ERC20", e.g., "1-ERC20" for mainnet.
   */
  buildTokenOperationHash(params: {
    tokenNetworkId: string;
    toAddress: string;
    value: bigint;
    tokenContractAddress: string;
    expireTime: number;
    sequenceId: number;
  }): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const encoded = abiCoder.encode(
      ['string', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [
        params.tokenNetworkId,
        params.toAddress,
        params.value,
        params.tokenContractAddress,
        params.expireTime,
        params.sequenceId,
      ],
    );

    return ethers.keccak256(encoded);
  }

  /**
   * Get next available sequence ID from the CvhWalletSimple contract.
   * The contract tracks a sliding window of 10 recent sequence IDs
   * and returns (highest + 1).
   */
  async getNextSequenceId(
    walletAddress: string,
    provider: ethers.JsonRpcProvider,
  ): Promise<number> {
    const contract = new ethers.Contract(
      walletAddress,
      CVH_WALLET_ABI,
      provider,
    );

    const nextSeqId: bigint = await contract.getNextSequenceId();
    return Number(nextSeqId);
  }

  /**
   * Call Key Vault POST /keys/:clientId/sign to sign the operationHash
   * with the platform key.
   */
  private async signViaKeyVault(
    clientId: number,
    operationHash: string,
  ): Promise<KeyVaultSignResponse> {
    const url = `${this.keyVaultUrl}/keys/${clientId}/sign`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': this.internalServiceKey,
      },
      body: JSON.stringify({
        hash: operationHash,
        keyType: 'platform',
        requestedBy: 'withdrawal-executor',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Key Vault sign failed (${res.status}): ${body}`,
      );
    }

    return (await res.json()) as KeyVaultSignResponse;
  }

  /**
   * Retrieve the gas tank private key from Key Vault for transaction signing.
   * The key is decrypted in memory and must be zeroed after use.
   *
   * Calls POST /keys/:clientId/decrypt-gas-tank with { chainId }.
   */
  private async getGasTankPrivateKey(
    clientId: number,
    chainId: number,
  ): Promise<{ privateKeyHex: string; zero: () => void }> {
    const url = `${this.keyVaultUrl}/keys/${clientId}/decrypt-gas-tank`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': this.internalServiceKey,
      },
      body: JSON.stringify({
        chainId,
        requestedBy: 'withdrawal-executor',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Key Vault decrypt-gas-tank failed (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as {
      success: boolean;
      privateKey: string;
    };

    // Store in a mutable buffer so we can zero it
    const keyBuffer = Buffer.from(data.privateKey.replace(/^0x/, ''), 'hex');
    const privateKeyHex = '0x' + keyBuffer.toString('hex');

    return {
      privateKeyHex,
      zero: () => keyBuffer.fill(0),
    };
  }
}
