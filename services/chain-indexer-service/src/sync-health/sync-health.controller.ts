import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { SyncHealthService } from './sync-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Internal HTTP endpoints for the chain indexer.
 * Called by admin-api's SyncManagementService.
 */
@Controller()
export class SyncHealthController {
  constructor(
    private readonly syncHealthService: SyncHealthService,
    private readonly prisma: PrismaService,
    @InjectQueue('backfill') private readonly backfillQueue: Queue,
  ) {}

  @Get('sync-health')
  async getHealth() {
    const chains = await this.syncHealthService.getAllChainHealth();
    return { chains };
  }

  @Get('sync-gaps')
  async getGaps(
    @Query('chainId') chainId?: string,
    @Query('status') status?: string,
  ) {
    let sql =
      `SELECT id, chain_id, gap_start_block, gap_end_block, status,
              attempt_count, max_attempts, last_error, detected_at, resolved_at
       FROM sync_gaps WHERE 1=1`;
    const params: any[] = [];

    if (chainId) {
      sql += ' AND chain_id = ?';
      params.push(parseInt(chainId, 10));
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY detected_at DESC LIMIT 100';

    const gaps = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        chain_id: number;
        gap_start_block: bigint;
        gap_end_block: bigint;
        status: string;
        attempt_count: number;
        max_attempts: number;
        last_error: string | null;
        detected_at: Date;
        resolved_at: Date | null;
      }>
    >(sql, ...params);

    return {
      gaps: gaps.map((g: any) => ({
        id: Number(g.id),
        chainId: g.chain_id,
        gapStartBlock: Number(g.gap_start_block),
        gapEndBlock: Number(g.gap_end_block),
        status: g.status,
        attemptCount: g.attempt_count,
        maxAttempts: g.max_attempts,
        lastError: g.last_error,
        detectedAt: g.detected_at,
        resolvedAt: g.resolved_at,
      })),
    };
  }

  @Post('sync-gaps/:id/retry')
  async retryGap(@Param('id') id: string) {
    const gapId = parseInt(id, 10);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        chain_id: number;
        gap_start_block: bigint;
        gap_end_block: bigint;
      }>
    >(
      `SELECT id, chain_id, gap_start_block, gap_end_block
       FROM sync_gaps WHERE id = ? LIMIT 1`,
      gapId,
    );

    const gap = rows[0] ?? null;
    if (!gap) {
      return { error: `Gap ${gapId} not found` };
    }

    // Reset gap for retry
    await this.prisma.$executeRawUnsafe(
      `UPDATE sync_gaps
       SET status = 'detected', attempt_count = 0, last_error = NULL, resolved_at = NULL
       WHERE id = ?`,
      gapId,
    );

    // Enqueue backfill job
    await this.backfillQueue.add(
      'backfill-gap',
      {
        gapId,
        chainId: gap.chain_id,
        startBlock: Number(gap.gap_start_block),
        endBlock: Number(gap.gap_end_block),
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    return { message: `Backfill retry enqueued for gap ${gapId}` };
  }

  @Get('reorgs')
  async getReorgs(
    @Query('chainId') chainId?: string,
    @Query('limit') limit?: string,
  ) {
    let sql =
      `SELECT id, chain_id, reorg_at_block, old_block_hash, new_block_hash,
              depth, events_invalidated, balances_recalculated, detected_at, reindexed_at
       FROM reorg_log WHERE 1=1`;
    const params: any[] = [];

    if (chainId) {
      sql += ' AND chain_id = ?';
      params.push(parseInt(chainId, 10));
    }
    sql += ` ORDER BY detected_at DESC LIMIT ${limit ? parseInt(limit, 10) : 50}`;

    const reorgs = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        chain_id: number;
        reorg_at_block: bigint;
        old_block_hash: string | null;
        new_block_hash: string | null;
        depth: number;
        events_invalidated: number;
        balances_recalculated: number;
        detected_at: Date;
        reindexed_at: Date | null;
      }>
    >(sql, ...params);

    return {
      reorgs: reorgs.map((r: any) => ({
        id: Number(r.id),
        chainId: r.chain_id,
        reorgAtBlock: Number(r.reorg_at_block),
        oldBlockHash: r.old_block_hash,
        newBlockHash: r.new_block_hash,
        depth: r.depth,
        eventsInvalidated: r.events_invalidated,
        balancesRecalculated: r.balances_recalculated,
        detectedAt: r.detected_at,
        reindexedAt: r.reindexed_at,
      })),
    };
  }
}
