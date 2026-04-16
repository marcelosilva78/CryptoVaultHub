import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

/** Batch size for processing monitored addresses in chunks. */
const ADDRESS_BATCH_SIZE = 1000;

/** Maximum runtime per chain before saving progress and exiting (5 minutes). */
const MAX_CHAIN_RUNTIME_MS = 5 * 60 * 1000;

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

  // ---------- Watermark helpers ----------

  /**
   * Redis key for the per-chain reconciliation watermark.
   * Tracks how far through the monitored-address list we have reconciled.
   */
  private watermarkKey(chainId: number): string {
    return `reconciliation:watermark:${chainId}`;
  }

  /**
   * Get the last reconciled offset for a chain from Redis.
   * Returns null on first run (no watermark), triggering a full initial scan.
   */
  async getWatermark(chainId: number): Promise<number | null> {
    const cached = await this.redis.getCache(this.watermarkKey(chainId));
    if (cached !== null) {
      return parseInt(cached, 10);
    }
    return null;
  }

  /**
   * Advance the watermark after successful reconciliation.
   * Stored without TTL so it persists across restarts (until Redis flush).
   */
  async setWatermark(chainId: number, offset: number): Promise<void> {
    await this.redis.setCache(this.watermarkKey(chainId), offset.toString());
  }

  /**
   * Cron trigger: run deep reconciliation daily at 3:00 AM UTC.
   */
  @Cron('0 3 * * *')
  async handleReconciliationCron(): Promise<void> {
    this.logger.log('Daily reconciliation cron triggered');
    try {
      const discrepancies = await this.runReconciliation();
      this.logger.log(
        `Daily reconciliation complete: ${discrepancies.length} discrepancies found`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Daily reconciliation cron failed: ${msg}`);
    }
  }

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
   *
   * Optimizations over the original full-scan approach:
   * 1. **Watermark**: tracks the last reconciled address offset per chain in Redis.
   *    On first run (no watermark) processes everything; subsequent runs resume
   *    from where the previous run left off (or restart at 0 once all addresses
   *    have been covered).
   * 2. **Batch processing**: addresses are processed in batches of ADDRESS_BATCH_SIZE
   *    to avoid building oversized multicall payloads.
   * 3. **Timeout protection**: if a single chain exceeds MAX_CHAIN_RUNTIME_MS, progress
   *    is saved and the method exits gracefully so other chains are not starved.
   */
  async reconcileChain(
    chainId: number,
  ): Promise<ReconciliationDiscrepancy[]> {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    const startTime = Date.now();

    // Load addresses ordered by id for deterministic pagination
    const addresses = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
      orderBy: { id: 'asc' },
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

    // Determine starting offset from watermark
    const watermark = await this.getWatermark(chainId);
    let startOffset = watermark !== null ? watermark : 0;

    // If watermark is past the address list, restart from 0 (full cycle done)
    if (startOffset >= addresses.length) {
      startOffset = 0;
    }

    let processed = 0;
    let timedOut = false;

    // Process in batches of ADDRESS_BATCH_SIZE
    for (
      let batchStart = startOffset;
      batchStart < addresses.length;
      batchStart += ADDRESS_BATCH_SIZE
    ) {
      // Timeout protection: check elapsed time before starting a new batch
      const elapsed = Date.now() - startTime;
      if (elapsed >= MAX_CHAIN_RUNTIME_MS) {
        this.logger.warn(
          `Reconciliation for chain ${chainId} timed out after ${Math.round(elapsed / 1000)}s. ` +
            `Processed ${processed} addresses, saving progress at offset ${batchStart}.`,
        );
        await this.setWatermark(chainId, batchStart);
        timedOut = true;
        break;
      }

      const batchEnd = Math.min(
        batchStart + ADDRESS_BATCH_SIZE,
        addresses.length,
      );
      const batchAddresses = addresses.slice(batchStart, batchEnd);

      // Build multicall payload for this batch
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

      for (const addr of batchAddresses) {
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

      if (calls.length === 0) continue;

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

      processed += batchAddresses.length;

      this.logger.log(
        `Reconciliation chain ${chainId}: batch complete — ${processed}/${addresses.length} addresses processed`,
      );
    }

    // Advance watermark: if we completed all addresses, set past the end
    // so the next run restarts from 0 (full cycle). If timed out, watermark
    // was already saved above.
    if (!timedOut) {
      await this.setWatermark(chainId, addresses.length);
    }

    return discrepancies;
  }
}
