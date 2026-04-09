import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

export interface ChainSyncHealth {
  chainId: number;
  chainName: string;
  lastBlock: number;
  latestFinalizedBlock: number;
  chainHeadBlock: number;
  blocksBehind: number;
  status: 'healthy' | 'degraded' | 'critical' | 'error';
  gapCount: number;
  lastUpdated: Date;
  lastError: string | null;
}

/**
 * Monitors per-chain sync health. Checks if the indexer is advancing,
 * calculates blocks_behind, and updates sync_cursors.indexer_status.
 *
 * Severity thresholds:
 * - healthy:  <5 blocks behind
 * - degraded: 5-50 blocks behind
 * - critical: >50 blocks behind
 * - error:    no progress in 5 minutes
 */
@Injectable()
export class SyncHealthService {
  private readonly logger = new Logger(SyncHealthService.name);
  private readonly HEALTHY_THRESHOLD = 5;
  private readonly DEGRADED_THRESHOLD = 50;
  private readonly STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Check sync health every 30 seconds.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkHealth(): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    await Promise.all(
      chains.map((chain) =>
        this.checkChainHealth(chain.id, chain.name).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Health check failed for chain ${chain.id}: ${msg}`,
          );
        }),
      ),
    );
  }

  /**
   * Check sync health for a single chain.
   */
  async checkChainHealth(
    chainId: number,
    chainName: string,
  ): Promise<ChainSyncHealth> {
    const cursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });

    let chainHeadBlock: number;
    try {
      const provider = await this.evmProvider.getProvider(chainId);
      chainHeadBlock = await provider.getBlockNumber();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Update cursor to error state
      if (cursor) {
        await this.prisma.syncCursor.update({
          where: { chainId },
          data: {
            indexerStatus: 'error',
            lastError: msg,
            lastErrorAt: new Date(),
          },
        });
      }

      return {
        chainId,
        chainName,
        lastBlock: cursor ? Number(cursor.lastBlock) : 0,
        latestFinalizedBlock: cursor
          ? Number(cursor.latestFinalizedBlock)
          : 0,
        chainHeadBlock: 0,
        blocksBehind: 0,
        status: 'error',
        gapCount: 0,
        lastUpdated: cursor?.updatedAt ?? new Date(),
        lastError: msg,
      };
    }

    const lastBlock = cursor ? Number(cursor.lastBlock) : 0;
    const latestFinalized = cursor
      ? Number(cursor.latestFinalizedBlock)
      : 0;
    const blocksBehind = chainHeadBlock - lastBlock;

    // Check for staleness via Redis cache of last progress timestamp
    const progressKey = `sync:progress:${chainId}`;
    const lastProgressStr = await this.redis.getCache(progressKey);
    const lastProgress = lastProgressStr
      ? parseInt(lastProgressStr, 10)
      : Date.now();

    const isStale = Date.now() - lastProgress > this.STALE_TIMEOUT_MS;

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical' | 'error';
    let indexerStatus: 'syncing' | 'synced' | 'stale' | 'error';

    if (isStale && blocksBehind > 0) {
      status = 'error';
      indexerStatus = 'stale';
    } else if (blocksBehind > this.DEGRADED_THRESHOLD) {
      status = 'critical';
      indexerStatus = 'syncing';
    } else if (blocksBehind > this.HEALTHY_THRESHOLD) {
      status = 'degraded';
      indexerStatus = 'syncing';
    } else {
      status = 'healthy';
      indexerStatus = 'synced';
    }

    // Count open gaps
    const gapCount = await this.prisma.syncGap.count({
      where: {
        chainId,
        status: { in: ['detected', 'backfilling'] },
      },
    });

    // Update sync cursor
    await this.prisma.syncCursor.upsert({
      where: { chainId },
      update: {
        blocksBehind,
        indexerStatus,
        ...(status === 'error'
          ? { lastError: 'Indexer stale - no progress', lastErrorAt: new Date() }
          : { lastError: null, lastErrorAt: null }),
      },
      create: {
        chainId,
        lastBlock: BigInt(0),
        blocksBehind,
        indexerStatus,
      },
    });

    // Update progress timestamp if we're advancing
    if (blocksBehind < this.DEGRADED_THRESHOLD) {
      await this.redis.setCache(
        progressKey,
        Date.now().toString(),
        600,
      );
    }

    return {
      chainId,
      chainName,
      lastBlock,
      latestFinalizedBlock: latestFinalized,
      chainHeadBlock,
      blocksBehind,
      status,
      gapCount,
      lastUpdated: cursor?.updatedAt ?? new Date(),
      lastError: cursor?.lastError ?? null,
    };
  }

  /**
   * Get sync health for all active chains (for admin API).
   */
  async getAllChainHealth(): Promise<ChainSyncHealth[]> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    const results: ChainSyncHealth[] = [];
    for (const chain of chains) {
      try {
        const health = await this.checkChainHealth(chain.id, chain.name);
        results.push(health);
      } catch (error) {
        results.push({
          chainId: chain.id,
          chainName: chain.name,
          lastBlock: 0,
          latestFinalizedBlock: 0,
          chainHeadBlock: 0,
          blocksBehind: 0,
          status: 'error',
          gapCount: 0,
          lastUpdated: new Date(),
          lastError:
            error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}
