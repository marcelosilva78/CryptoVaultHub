import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Detects missing block ranges (gaps) per chain by comparing sync_cursors.last_block
 * against indexed_blocks. Runs every 60 seconds.
 */
@Injectable()
export class GapDetectorService implements OnModuleInit {
  private readonly logger = new Logger(GapDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('backfill') private readonly backfillQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Run initial gap detection on startup
    await this.detectGaps();
  }

  /**
   * Periodic gap detection across all active chains.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async detectGaps(): Promise<void> {
    const cursors = await this.prisma.syncCursor.findMany();

    for (const cursor of cursors) {
      try {
        await this.detectGapsForChain(cursor.chainId, Number(cursor.lastBlock));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Gap detection failed for chain ${cursor.chainId}: ${msg}`,
        );
      }
    }
  }

  /**
   * Detect gaps for a single chain by finding missing block numbers in indexed_blocks.
   */
  async detectGapsForChain(
    chainId: number,
    lastBlock: number,
  ): Promise<void> {
    // Find the earliest indexed block for this chain
    const earliest = await this.prisma.indexedBlock.findFirst({
      where: { chainId },
      orderBy: { blockNumber: 'asc' },
      select: { blockNumber: true },
    });

    if (!earliest) {
      // No indexed blocks yet — entire range is a gap
      if (lastBlock > 0) {
        await this.createGapIfNotExists(chainId, 0, lastBlock);
      }
      return;
    }

    const startBlock = Number(earliest.blockNumber);

    // Query for all indexed block numbers in range
    const indexedBlocks = await this.prisma.indexedBlock.findMany({
      where: {
        chainId,
        blockNumber: {
          gte: BigInt(startBlock),
          lte: BigInt(lastBlock),
        },
      },
      select: { blockNumber: true },
      orderBy: { blockNumber: 'asc' },
    });

    const indexedSet = new Set(
      indexedBlocks.map((b) => Number(b.blockNumber)),
    );

    // Find missing ranges
    let gapStart: number | null = null;

    for (let block = startBlock; block <= lastBlock; block++) {
      if (!indexedSet.has(block)) {
        if (gapStart === null) {
          gapStart = block;
        }
      } else {
        if (gapStart !== null) {
          await this.createGapIfNotExists(chainId, gapStart, block - 1);
          gapStart = null;
        }
      }
    }

    // Handle trailing gap
    if (gapStart !== null) {
      await this.createGapIfNotExists(chainId, gapStart, lastBlock);
    }
  }

  /**
   * Create a sync_gaps record if no overlapping unresolved gap exists,
   * then enqueue backfill job.
   */
  private async createGapIfNotExists(
    chainId: number,
    gapStartBlock: number,
    gapEndBlock: number,
  ): Promise<void> {
    // Check for existing unresolved gap that overlaps
    const existing = await this.prisma.syncGap.findFirst({
      where: {
        chainId,
        status: { in: ['detected', 'backfilling'] },
        gapStartBlock: { lte: BigInt(gapEndBlock) },
        gapEndBlock: { gte: BigInt(gapStartBlock) },
      },
    });

    if (existing) return;

    const gap = await this.prisma.syncGap.create({
      data: {
        chainId,
        gapStartBlock: BigInt(gapStartBlock),
        gapEndBlock: BigInt(gapEndBlock),
        status: 'detected',
      },
    });

    this.logger.warn(
      `Gap detected on chain ${chainId}: blocks ${gapStartBlock}-${gapEndBlock}`,
    );

    // Enqueue backfill job
    await this.backfillQueue.add(
      'backfill-gap',
      {
        gapId: Number(gap.id),
        chainId,
        startBlock: gapStartBlock,
        endBlock: gapEndBlock,
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }
}
