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
    const projectId = withdrawal.projectId;

    // Load token
    const token = await this.prisma.token.findUnique({
      where: { id: withdrawal.tokenId },
    });
    if (!token) {
      throw new Error(
        `Token ${withdrawal.tokenId} not found for withdrawal ${withdrawalId}`,
      );
    }

    // Load hot wallet (the CvhWalletSimple contract address).
    // For project-scoped withdrawals, use project_chains hot wallet;
    // otherwise fall back to the global client hot wallet.
    let hotWalletAddress: string;
    let hotWalletSequenceIdFromDb: number | null = null;

    const projectWalletInfo = await this.getProjectWalletInfo(projectId, chainId);
    if (projectWalletInfo) {
      hotWalletAddress = projectWalletInfo.hotWalletAddress;
      hotWalletSequenceIdFromDb = projectWalletInfo.sequenceId;
      this.logger.log(
        `Using project hot wallet for withdrawal ${withdrawalId}: project=${projectId}, hotWallet=${hotWalletAddress}`,
      );
    } else {
      // Legacy: use global client hot wallet
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
      hotWalletAddress = hotWallet.address;
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
      hotWalletAddress,
      CVH_WALLET_ABI,
      provider,
    );

    // 3. Get next sequence ID from the contract
    const sequenceId = await this.getNextSequenceId(
      hotWalletAddress,
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

    // 8. Sign the outer transaction via Key Vault (gas_tank key) and broadcast.
    // Uses POST /keys/:clientId/sign-transaction with keyType: 'gas_tank'
    // instead of retrieving the private key directly.
    const { nonce, release } = await this.nonceService.acquireNonce(
      chainId,
      gasTank.address,
    );

    let txHash: string;
    const submittedAt = new Date();

    try {
      const feeData = await provider.getFeeData();

      let gasEstimate: bigint;
      try {
        const estimated = await provider.estimateGas({
          from: gasTank.address,
          to: hotWalletAddress,
          data: txData,
        });
        gasEstimate = (estimated * 120n) / 100n; // 20% safety margin
      } catch {
        gasEstimate = 300_000n; // Conservative default for multisig calls
      }

      const outerTxData: Record<string, any> = {
        to: hotWalletAddress,
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
              requestedBy: 'withdrawal-executor',
            }),
            signal: signTxController.signal,
          },
        );

        if (!signTxRes.ok) {
          const body = await signTxRes.text();
          throw new Error(`Key Vault sign-transaction failed (${signTxRes.status}): ${body}`);
        }

        const signTxResult = (await signTxRes.json()) as {
          success: boolean;
          signedTransaction: string;
          txHash: string;
          from: string;
        };

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
        `Withdrawal ${withdrawalId} broadcast: txHash=${txHash} (nonce=${nonce})`,
      );
    } catch (error) {
      // Reset nonce cache on failure so next attempt re-fetches from chain
      await this.nonceService.resetNonce(chainId, gasTank.address);
      throw error;
    } finally {
      await release();
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

    // 10. If project-scoped, increment the project_chains.hot_wallet_sequence_id
    if (projectWalletInfo) {
      await this.incrementProjectSequenceId(projectId, chainId);
    }

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
   * Get the project's hot wallet info from project_chains.
   * Returns null if the project doesn't have a deployed hot wallet on this chain,
   * which means the legacy client-level hot wallet should be used instead.
   */
  async getProjectWalletInfo(
    projectId: bigint,
    chainId: number,
  ): Promise<{
    hotWalletAddress: string;
    sequenceId: number;
    walletFactoryAddress: string | null;
  } | null> {
    const projectChain = await this.prisma.projectChain.findUnique({
      where: {
        uq_project_chain: {
          projectId,
          chainId,
        },
      },
    });

    if (!projectChain || !projectChain.hotWalletAddress) {
      return null;
    }

    return {
      hotWalletAddress: projectChain.hotWalletAddress,
      sequenceId: projectChain.hotWalletSequenceId,
      walletFactoryAddress: projectChain.walletFactoryAddress,
    };
  }

  /**
   * Increment the hot_wallet_sequence_id on project_chains after a successful broadcast.
   */
  private async incrementProjectSequenceId(
    projectId: bigint,
    chainId: number,
  ): Promise<void> {
    await this.prisma.projectChain.update({
      where: {
        uq_project_chain: {
          projectId,
          chainId,
        },
      },
      data: {
        hotWalletSequenceId: { increment: 1 },
      },
    });
  }

  /**
   * Call Key Vault POST /keys/:clientId/sign to sign the operationHash
   * with the platform key. Includes AbortController with 10s timeout.
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
          requestedBy: 'withdrawal-executor',
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
