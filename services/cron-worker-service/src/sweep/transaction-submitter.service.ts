import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import axios from 'axios';
import { EvmProviderService } from '../blockchain/evm-provider.service';

/** ABI fragments for CvhForwarder flush operations */
const FORWARDER_IFACE = new ethers.Interface([
  'function flushTokens(address tokenContractAddress) external',
  'function batchFlushERC20Tokens(address[] calldata tokenContractAddresses) external',
  'function flush() external',
]);

export interface SignAndSubmitParams {
  chainId: number;
  clientId: number;
  from: string; // Gas Tank address
  to: string; // Forwarder address
  data: string; // Encoded calldata
  gasLimit?: bigint;
}

interface KeyVaultSignResponse {
  success: boolean;
  signedTransaction: string;
  txHash: string;
  from: string;
}

/**
 * Handles the mechanics of building calldata, signing via Key Vault,
 * and submitting sweep transactions to the blockchain.
 */
@Injectable()
export class TransactionSubmitterService {
  private readonly logger = new Logger(TransactionSubmitterService.name);
  private readonly keyVaultUrl: string;

  /** Default gas limit for a single flushTokens call */
  private readonly DEFAULT_GAS_LIMIT = 150_000n;
  /** Extra gas per token in a batch flush (each token transfer ~60k gas) */
  private readonly BATCH_GAS_PER_TOKEN = 65_000n;
  /** Base gas for batch flush overhead */
  private readonly BATCH_BASE_GAS = 50_000n;

  constructor(
    private readonly config: ConfigService,
    private readonly evmProvider: EvmProviderService,
  ) {
    this.keyVaultUrl = this.config.getOrThrow<string>('KEY_VAULT_URL');
  }

  /**
   * Build calldata for flushTokens(tokenAddress) on a CvhForwarder.
   */
  buildFlushCalldata(tokenAddress: string): string {
    return FORWARDER_IFACE.encodeFunctionData('flushTokens', [tokenAddress]);
  }

  /**
   * Build calldata for batchFlushERC20Tokens(tokenAddresses[]) on a CvhForwarder.
   */
  buildBatchFlushCalldata(tokenAddresses: string[]): string {
    return FORWARDER_IFACE.encodeFunctionData('batchFlushERC20Tokens', [
      tokenAddresses,
    ]);
  }

  /**
   * Build calldata for flush() (native ETH) on a CvhForwarder.
   */
  buildFlushNativeCalldata(): string {
    return FORWARDER_IFACE.encodeFunctionData('flush');
  }

  /**
   * Estimate the gas limit for a batch flush based on number of tokens.
   */
  estimateBatchGasLimit(tokenCount: number): bigint {
    return (
      this.BATCH_BASE_GAS + this.BATCH_GAS_PER_TOKEN * BigInt(tokenCount)
    );
  }

  /**
   * Sign and submit a transaction via Key Vault + RPC provider.
   *
   * Flow:
   * 1. Get nonce and gas price from the RPC provider
   * 2. Estimate gas (or use provided/default limit)
   * 3. Call Key Vault to sign the raw transaction
   * 4. Broadcast the signed transaction via the provider
   * 5. Return the real tx hash
   */
  async signAndSubmit(params: SignAndSubmitParams): Promise<string> {
    const { chainId, clientId, from, to, data, gasLimit } = params;
    const provider = await this.evmProvider.getProvider(chainId);

    // 1. Get nonce (include pending txs to avoid nonce collisions)
    const nonce = await provider.getTransactionCount(from, 'pending');

    // 2. Estimate gas or use provided limit
    let finalGasLimit: bigint;
    if (gasLimit) {
      finalGasLimit = gasLimit;
    } else {
      try {
        const estimated = await provider.estimateGas({
          from,
          to,
          data,
        });
        // Add 20% safety margin
        finalGasLimit = (estimated * 120n) / 100n;
      } catch (err) {
        this.logger.warn(
          `Gas estimation failed for ${to} on chain ${chainId}, using default: ${err instanceof Error ? err.message : String(err)}`,
        );
        finalGasLimit = this.DEFAULT_GAS_LIMIT;
      }
    }

    // 3. Get gas pricing (support EIP-1559 and legacy)
    const feeData = await provider.getFeeData();

    const txData: Record<string, any> = {
      to,
      data,
      value: '0',
      gasLimit: finalGasLimit.toString(),
      nonce,
      chainId,
    };

    if (feeData.maxFeePerGas !== null && feeData.maxFeePerGas !== undefined) {
      txData.maxFeePerGas = feeData.maxFeePerGas.toString();
      txData.maxPriorityFeePerGas = (
        feeData.maxPriorityFeePerGas ?? 0n
      ).toString();
    } else if (
      feeData.gasPrice !== null &&
      feeData.gasPrice !== undefined
    ) {
      txData.gasPrice = feeData.gasPrice.toString();
    } else {
      throw new Error(
        `Unable to determine gas price for chain ${chainId}`,
      );
    }

    // 4. Call Key Vault to sign the transaction
    this.logger.debug(
      `Signing tx for client ${clientId}, chain ${chainId}: ${from} -> ${to} (nonce=${nonce})`,
    );

    const signResponse = await axios.post<KeyVaultSignResponse>(
      `${this.keyVaultUrl}/keys/${clientId}/sign-transaction`,
      {
        clientId,
        chainId,
        keyType: 'gas_tank',
        txData,
        requestedBy: 'sweep-service',
      },
      { timeout: 10_000 },
    );

    if (!signResponse.data.success || !signResponse.data.signedTransaction) {
      throw new Error(
        `Key Vault sign-transaction failed for client ${clientId}, chain ${chainId}`,
      );
    }

    const { signedTransaction } = signResponse.data;

    // 5. Broadcast the signed transaction
    this.logger.debug(
      `Broadcasting tx on chain ${chainId}: ${signResponse.data.txHash}`,
    );

    const broadcastResult =
      await provider.broadcastTransaction(signedTransaction);

    this.logger.log(
      `Tx submitted on chain ${chainId}: ${broadcastResult.hash} (nonce=${nonce}, from=${from}, to=${to})`,
    );

    return broadcastResult.hash;
  }
}
