import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as promClient from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

/* ── Prometheus metrics for chain indexer sync health ───────────────── */
const syncBlocksBehind = new promClient.Gauge({
  name: 'sync_blocks_behind',
  help: 'Number of blocks the indexer is behind',
  labelNames: ['chain_id'],
});

const syncGapsOpen = new promClient.Gauge({
  name: 'sync_gaps_open',
  help: 'Number of open sync gaps',
  labelNames: ['chain_id'],
});

const syncIndexerStatus = new promClient.Gauge({
  name: 'sync_indexer_status',
  help: 'Indexer status: 0=stopped, 1=running',
  labelNames: ['chain_id'],
});

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
   * Called by a scheduler (setInterval or @nestjs/schedule) in the module.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkHealth(): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    await Promise.all(
      chains.map((chain) =>
        this.checkChainHealth(chain.id, chain.name).catch((err: any) => {
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
    // Fetch full cursor row via raw SQL to access extended columns
    const cursors = await this.prisma.$queryRawUnsafe<
      Array<{
        chain_id: number;
        id: bigint;
        last_block: bigint;
        latest_finalized_block: bigint | null;
        blocks_behind: number | null;
        indexer_status: string | null;
        last_error: string | null;
        last_error_at: Date | null;
        updated_at: Date;
      }>
    >(
      `SELECT chain_id, id, last_block, latest_finalized_block, blocks_behind,
              indexer_status, last_error, last_error_at, updated_at
       FROM sync_cursors WHERE chain_id = ? LIMIT 1`,
      chainId,
    );
    const cursorRow = cursors[0] ?? null;

    let chainHeadBlock: number;
    try {
      const provider = await this.evmProvider.getProvider(chainId);
      chainHeadBlock = await provider.getBlockNumber();
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);

      // Update cursor to error state via raw SQL
      if (cursorRow) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE sync_cursors
           SET indexer_status = 'error', last_error = ?, last_error_at = NOW(), updated_at = NOW()
           WHERE chain_id = ?`,
          msg,
          chainId,
        );
      }

      // Push Prometheus metrics for error state
      const chainLabel = String(chainId);
      syncBlocksBehind.set({ chain_id: chainLabel }, 0);
      syncGapsOpen.set({ chain_id: chainLabel }, 0);
      syncIndexerStatus.set({ chain_id: chainLabel }, 0);

      return {
        chainId,
        chainName,
        lastBlock: cursorRow ? Number(cursorRow.last_block) : 0,
        latestFinalizedBlock: cursorRow
          ? Number(cursorRow.latest_finalized_block ?? 0n)
          : 0,
        chainHeadBlock: 0,
        blocksBehind: 0,
        status: 'error',
        gapCount: 0,
        lastUpdated: cursorRow?.updated_at ?? new Date(),
        lastError: msg,
      };
    }

    const lastBlock = cursorRow ? Number(cursorRow.last_block) : 0;
    const latestFinalized = cursorRow
      ? Number(cursorRow.latest_finalized_block ?? 0n)
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

    // Count open gaps via raw SQL
    const gapCountRows = await this.prisma.$queryRawUnsafe<
      Array<{ cnt: bigint }>
    >(
      `SELECT COUNT(*) AS cnt FROM sync_gaps
       WHERE chain_id = ? AND status IN ('detected', 'backfilling')`,
      chainId,
    );
    const gapCount = Number(gapCountRows[0]?.cnt ?? 0n);

    // Update sync cursor via raw SQL upsert
    if (status === 'error') {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO sync_cursors (chain_id, last_block, blocks_behind, indexer_status, last_error, last_error_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           blocks_behind = VALUES(blocks_behind),
           indexer_status = VALUES(indexer_status),
           last_error = VALUES(last_error),
           last_error_at = NOW(),
           updated_at = NOW()`,
        chainId,
        BigInt(0),
        blocksBehind,
        indexerStatus,
        'Indexer stale - no progress',
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO sync_cursors (chain_id, last_block, blocks_behind, indexer_status, last_error, last_error_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NOW())
         ON DUPLICATE KEY UPDATE
           blocks_behind = VALUES(blocks_behind),
           indexer_status = VALUES(indexer_status),
           last_error = NULL,
           last_error_at = NULL,
           updated_at = NOW()`,
        chainId,
        BigInt(0),
        blocksBehind,
        indexerStatus,
      );
    }

    // Update progress timestamp if we're advancing
    if (blocksBehind < this.DEGRADED_THRESHOLD) {
      await this.redis.setCache(
        progressKey,
        Date.now().toString(),
        600,
      );
    }

    // Push Prometheus metrics
    const chainLabel = String(chainId);
    syncBlocksBehind.set({ chain_id: chainLabel }, blocksBehind);
    syncGapsOpen.set({ chain_id: chainLabel }, gapCount);
    syncIndexerStatus.set(
      { chain_id: chainLabel },
      status === 'error' || indexerStatus === 'stale' ? 0 : 1,
    );

    return {
      chainId,
      chainName,
      lastBlock,
      latestFinalizedBlock: latestFinalized,
      chainHeadBlock,
      blocksBehind,
      status,
      gapCount,
      lastUpdated: cursorRow?.updated_at ?? new Date(),
      lastError: cursorRow?.last_error ?? null,
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
      } catch (error: any) {
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
