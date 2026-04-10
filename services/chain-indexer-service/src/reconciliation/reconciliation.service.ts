import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])',
  'function getEthBalance(address addr) external view returns (uint256 balance)',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export interface ReconciliationDiscrepancy {
  chainId: number;
  address: string;
  tokenAddress: string | null;
  onChainBalance: string;
  cachedBalance: string;
  difference: string;
}

/**
 * Deep daily reconciliation: compares all on-chain balances vs cached balances.
 * Flags discrepancies for investigation.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Run full reconciliation across all active chains and monitored addresses.
   */
  async runReconciliation(): Promise<ReconciliationDiscrepancy[]> {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    for (const chain of chains) {
      try {
        const chainDiscrepancies = await this.reconcileChain(chain.id);
        discrepancies.push(...chainDiscrepancies);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Reconciliation failed for chain ${chain.id}: ${msg}`,
        );
      }
    }

    if (discrepancies.length > 0) {
      this.logger.warn(
        `Reconciliation found ${discrepancies.length} discrepancies`,
      );

      // Publish discrepancies to Redis Stream (batch)
      await Promise.all(
        discrepancies.map((d) =>
          this.redis.publishToStream('reconciliation:discrepancies', {
            chainId: d.chainId.toString(),
            address: d.address,
            tokenAddress: d.tokenAddress ?? 'native',
            onChainBalance: d.onChainBalance,
            cachedBalance: d.cachedBalance,
            difference: d.difference,
            timestamp: new Date().toISOString(),
          }),
        ),
      );
    } else {
      this.logger.log('Reconciliation complete: no discrepancies found');
    }

    return discrepancies;
  }

  /**
   * Reconcile all monitored addresses on a single chain.
   */
  async reconcileChain(
    chainId: number,
  ): Promise<ReconciliationDiscrepancy[]> {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    const addresses = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
    });
    if (addresses.length === 0) return discrepancies;

    const tokens = await this.prisma.token.findMany({
      where: { chainId, isActive: true },
    });

    const provider = await this.evmProvider.getProvider(chainId);
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain) return discrepancies;

    const multicall3 = new ethers.Contract(
      chain.multicall3Address,
      MULTICALL3_ABI,
      provider,
    );
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    const multicall3Iface = new ethers.Interface(MULTICALL3_ABI);

    // Build batch calls
    const calls: Array<{
      target: string;
      allowFailure: boolean;
      callData: string;
    }> = [];
    const callMeta: Array<{
      address: string;
      tokenAddress: string | null;
      isNative: boolean;
    }> = [];

    for (const addr of addresses) {
      // Native balance
      calls.push({
        target: chain.multicall3Address,
        allowFailure: true,
        callData: multicall3Iface.encodeFunctionData('getEthBalance', [
          addr.address,
        ]),
      });
      callMeta.push({
        address: addr.address,
        tokenAddress: null,
        isNative: true,
      });

      // ERC20 balances
      for (const token of tokens) {
        if (token.isNative) continue;
        calls.push({
          target: token.contractAddress,
          allowFailure: true,
          callData: erc20Iface.encodeFunctionData('balanceOf', [
            addr.address,
          ]),
        });
        callMeta.push({
          address: addr.address,
          tokenAddress: token.contractAddress,
          isNative: false,
        });
      }
    }

    if (calls.length === 0) return discrepancies;

    // Execute batch
    const results: Array<{ success: boolean; returnData: string }> =
      await multicall3.aggregate3.staticCall(calls);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const meta = callMeta[i];

      if (!result.success || result.returnData === '0x') continue;

      let onChainBalance: bigint;
      if (meta.isNative) {
        const [val] = multicall3Iface.decodeFunctionResult(
          'getEthBalance',
          result.returnData,
        );
        onChainBalance = val as bigint;
      } else {
        const [val] = erc20Iface.decodeFunctionResult(
          'balanceOf',
          result.returnData,
        );
        onChainBalance = val as bigint;
      }

      // Compare with cached
      const cacheKey = `balance:${chainId}:${meta.address}:${meta.tokenAddress ?? 'native'}`;
      const cachedStr = await this.redis.getCache(cacheKey);
      const cachedBalance = cachedStr ? BigInt(cachedStr) : 0n;

      if (onChainBalance !== cachedBalance) {
        const difference = onChainBalance - cachedBalance;
        discrepancies.push({
          chainId,
          address: meta.address,
          tokenAddress: meta.tokenAddress,
          onChainBalance: onChainBalance.toString(),
          cachedBalance: cachedBalance.toString(),
          difference: difference.toString(),
        });
      }

      // Update cached balance
      await this.redis.setCache(
        cacheKey,
        onChainBalance.toString(),
        3600,
      );
    }

    return discrepancies;
  }
}
