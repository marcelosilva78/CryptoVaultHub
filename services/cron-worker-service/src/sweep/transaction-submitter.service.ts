import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import axios from 'axios';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { PrismaService } from '../prisma/prisma.service';

/** ABI fragments for CvhForwarder flush operations */
const FORWARDER_IFACE = new ethers.Interface([
  'function flushTokens(address tokenContractAddress) external',
  'function batchFlushERC20Tokens(address[] calldata tokenContractAddresses) external',
  'function flush() external',
]);

/**
 * ABI fragments for CvhWalletSimple operations used by the sweep path.
 *
 * - flushForwarderTokens: signer-only (no multisig signature). Routes a single
 *   ERC-20 flush through the wallet so the inner forwarder call's msg.sender
 *   equals parentAddress (== wallet). This is the simplest and preferred path
 *   for single-token sweeps.
 *
 * - sendMultiSig: full 2-of-3 multisig call. Required when we need to invoke
 *   arbitrary calldata on a target (e.g. forwarder.batchFlushERC20Tokens or
 *   forwarder.flush) since the wallet contract does not expose a signer-only
 *   wrapper for those operations.
 *
 * - getNextSequenceId: needed to pick a fresh sequenceId for sendMultiSig.
 */
const CVH_WALLET_IFACE = new ethers.Interface([
  'function flushForwarderTokens(address payable forwarderAddress, address tokenContractAddress) external',
  'function sendMultiSig(address toAddress, uint256 value, bytes calldata data, uint256 expireTime, uint256 sequenceId, bytes calldata signature) external',
  'function getNextSequenceId() public view returns (uint256)',
]);

export interface SignAndSubmitParams {
  chainId: number;
  clientId: number;
  from: string; // Gas Tank address (or '' to derive from keyType)
  to: string; // Forwarder address
  data: string; // Encoded calldata
  gasLimit?: bigint;
  /** Amount of native token to send (default 0) */
  value?: bigint;
  /** Key type to use for signing (default 'gas_tank') */
  keyType?: 'gas_tank' | 'platform' | 'client' | 'backup';
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
    private readonly prisma: PrismaService,
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
   * Build calldata for CvhWalletSimple.flushForwarderTokens(forwarder, token).
   * This is the signer-only single-token sweep path: msg.sender to the wallet
   * must be one of the 3 signers (platform/client/backup), and the wallet then
   * calls forwarder.flushTokens(token) — so the forwarder sees msg.sender ==
   * parentAddress (the wallet) and the onlyAllowedAddress modifier passes.
   *
   * No multisig signature is required for this path.
   */
  buildWalletFlushForwarderTokensCalldata(
    forwarderAddress: string,
    tokenContractAddress: string,
  ): string {
    return CVH_WALLET_IFACE.encodeFunctionData('flushForwarderTokens', [
      forwarderAddress,
      tokenContractAddress,
    ]);
  }

  /**
   * Build calldata for CvhWalletSimple.sendMultiSig(...). The inner `data`
   * payload is executed by the wallet as `target.call{value: value}(data)`,
   * so the forwarder sees msg.sender == wallet (parentAddress) and any
   * onlyAllowedAddress-gated function passes.
   *
   * Used for native ETH sweeps (inner = forwarder.flush()) and batch ERC-20
   * sweeps (inner = forwarder.batchFlushERC20Tokens(tokens)) where no
   * signer-only wrapper exists on the wallet.
   */
  buildSendMultiSigCalldata(params: {
    toAddress: string;
    value: bigint;
    innerData: string;
    expireTime: number;
    sequenceId: number;
    signature: string;
  }): string {
    return CVH_WALLET_IFACE.encodeFunctionData('sendMultiSig', [
      params.toAddress,
      params.value,
      params.innerData,
      params.expireTime,
      params.sequenceId,
      params.signature,
    ]);
  }

  /**
   * Fetch the next sequence ID from a CvhWalletSimple deployed at the given
   * address. Mirrors the helper used by withdrawal-worker / withdrawal-executor.
   */
  async getWalletNextSequenceId(
    chainId: number,
    walletAddress: string,
  ): Promise<number> {
    const provider = await this.evmProvider.getProvider(chainId);
    const contract = new ethers.Contract(
      walletAddress,
      CVH_WALLET_IFACE,
      provider,
    );
    const next: bigint = await contract.getNextSequenceId();
    return Number(next);
  }

  /**
   * Ask Key Vault to sign the EIP-191-prefixed operationHash with the given
   * key type. The contract applies "\x19Ethereum Signed Message:\n32" inside
   * ecrecover, so we hash the prefixed payload before calling Key Vault
   * (which exposes raw ECDSA sign over a 32-byte digest).
   *
   * Mirrors WithdrawalWorkerService.signViaKeyVault — keeping it local here
   * avoids a cross-module dependency from sweep -> withdrawal.
   */
  async signOperationHashViaKeyVault(params: {
    clientId: number;
    operationHash: string;
    keyType: 'platform' | 'backup' | 'client';
    requestedBy: string;
  }): Promise<{ signature: string; address: string }> {
    const prefixedHash = ethers.solidityPackedKeccak256(
      ['string', 'bytes32'],
      ['\x19Ethereum Signed Message:\n32', params.operationHash],
    );

    const url = `${this.keyVaultUrl}/keys/${params.clientId}/sign`;
    const internalKey = process.env.INTERNAL_SERVICE_KEY ?? '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': internalKey,
        },
        body: JSON.stringify({
          hash: prefixedHash,
          keyType: params.keyType,
          requestedBy: params.requestedBy,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Key Vault sign failed (${res.status}): ${body}`,
        );
      }

      const data = (await res.json()) as {
        success: boolean;
        signature: string;
        address: string;
      };
      if (!data.success || !data.signature) {
        throw new Error(
          `Key Vault sign returned unsuccessful for client ${params.clientId}`,
        );
      }
      return { signature: data.signature, address: data.address };
    } finally {
      clearTimeout(timeout);
    }
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
    const { chainId, clientId, to, data, gasLimit } = params;
    const keyType = params.keyType ?? 'gas_tank';

    // Resolve 'from' address: if empty, look up the key address from cvh_keyvault.derived_keys
    let from = params.from;
    if (!from) {
      const rows = await this.prisma.$queryRaw<{ address: string }[]>`
        SELECT address FROM cvh_keyvault.derived_keys
        WHERE client_id = ${clientId}
          AND key_type = ${keyType}
          AND is_active = 1
        LIMIT 1
      `;
      if (!rows.length) {
        throw new Error(
          `No active ${keyType} key found for client ${clientId}`,
        );
      }
      from = rows[0].address;
    }

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
      value: (params.value ?? 0n).toString(),
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
        keyType,
        txData,
        requestedBy: 'sweep-service',
      },
      {
        timeout: 10_000,
        headers: {
          'X-Internal-Service-Key':
            process.env.INTERNAL_SERVICE_KEY ?? '',
        },
      },
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
