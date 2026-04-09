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
    const where: any = {};
    if (chainId) where.chainId = parseInt(chainId, 10);
    if (status) where.status = status;

    const gaps = await this.prisma.syncGap.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });

    return {
      gaps: gaps.map((g) => ({
        id: Number(g.id),
        chainId: g.chainId,
        gapStartBlock: Number(g.gapStartBlock),
        gapEndBlock: Number(g.gapEndBlock),
        status: g.status,
        attemptCount: g.attemptCount,
        maxAttempts: g.maxAttempts,
        lastError: g.lastError,
        detectedAt: g.detectedAt,
        resolvedAt: g.resolvedAt,
      })),
    };
  }

  @Post('sync-gaps/:id/retry')
  async retryGap(@Param('id') id: string) {
    const gapId = parseInt(id, 10);
    const gap = await this.prisma.syncGap.findUnique({
      where: { id: BigInt(gapId) },
    });

    if (!gap) {
      return { error: `Gap ${gapId} not found` };
    }

    // Reset gap for retry
    await this.prisma.syncGap.update({
      where: { id: BigInt(gapId) },
      data: {
        status: 'detected',
        attemptCount: 0,
        lastError: null,
        resolvedAt: null,
      },
    });

    // Enqueue backfill job
    await this.backfillQueue.add(
      'backfill-gap',
      {
        gapId,
        chainId: gap.chainId,
        startBlock: Number(gap.gapStartBlock),
        endBlock: Number(gap.gapEndBlock),
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
    const where: any = {};
    if (chainId) where.chainId = parseInt(chainId, 10);

    const reorgs = await this.prisma.reorgLog.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: limit ? parseInt(limit, 10) : 50,
    });

    return {
      reorgs: reorgs.map((r) => ({
        id: Number(r.id),
        chainId: r.chainId,
        reorgAtBlock: Number(r.reorgAtBlock),
        oldBlockHash: r.oldBlockHash,
        newBlockHash: r.newBlockHash,
        depth: r.depth,
        eventsInvalidated: r.eventsInvalidated,
        balancesRecalculated: r.balancesRecalculated,
        detectedAt: r.detectedAt,
        reindexedAt: r.reindexedAt,
      })),
    };
  }
}
