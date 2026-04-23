import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface GapRange {
  gapStart: number;
  gapEnd: number;
}

@Injectable()
export class GapDetectorService {
  private readonly logger = new Logger(GapDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue('backfill') private readonly backfillQueue: Queue,
  ) {}

  /**
   * Run every 5 minutes. Only checks chains with monitored addresses.
   */
  @Cron('0 */5 * * * *')
  async detectAllGaps(): Promise<void> {
    // Only process chains that have monitored addresses
    const activeChains = await this.prisma.$queryRaw<Array<{ chain_id: number }>>`
      SELECT DISTINCT ma.chain_id
      FROM monitored_addresses ma
      WHERE ma.is_active = 1
    `;

    for (const { chain_id: chainId } of activeChains) {
      try {
        await this.detectAndEnqueueGaps(chainId);
      } catch (err) {
        this.logger.error(`Gap detection failed for chain ${chainId}: ${err}`);
      }
    }
  }

  /**
   * Detect gaps for a single chain and enqueue backfill jobs.
   */
  async detectAndEnqueueGaps(chainId: number): Promise<number> {
    const cursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });
    if (!cursor || cursor.lastBlock <= 0) return 0;

    // Find the earliest monitored address start_block for this chain
    const earliest = await this.prisma.monitoredAddress.findFirst({
      where: { chainId, isActive: true },
      orderBy: { startBlock: 'asc' },
      select: { startBlock: true },
    });
    if (!earliest) return 0;

    const startBlock = Number(earliest.startBlock);
    const endBlock = Number(cursor.lastBlock);

    if (startBlock >= endBlock) return 0;

    // Find blocks in range that are NOT in indexed_blocks and NOT in Redis scanned set
    // We check in batches of 1000 to avoid huge queries
    let gapsFound = 0;
    const BATCH_SIZE = 1000;

    for (let batchStart = startBlock; batchStart < endBlock; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock);

      // Get indexed blocks in this range
      const indexedBlocks = await this.prisma.indexedBlock.findMany({
        where: {
          chainId,
          blockNumber: {
            gte: BigInt(batchStart),
            lte: BigInt(batchEnd),
          },
        },
        select: { blockNumber: true },
      });

      const indexedSet = new Set(indexedBlocks.map(b => Number(b.blockNumber)));

      // Check Redis scanned set for blocks that were scanned but had no events
      const scannedKey = `scanned:${chainId}`;

      // Find missing blocks (not indexed AND not in Redis scanned set)
      const missingBlocks: number[] = [];
      for (let bn = batchStart; bn <= batchEnd; bn++) {
        if (indexedSet.has(bn)) continue;
        // Check Redis
        const wasScanned = await this.redis.getCache(`${scannedKey}:${bn}`);
        if (wasScanned) continue;
        missingBlocks.push(bn);
      }

      if (missingBlocks.length === 0) continue;

      // Coalesce consecutive missing blocks into gap ranges
      const gaps = this.coalesceGaps(missingBlocks);

      for (const gap of gaps) {
        // Check if this gap already exists and is pending/backfilling
        const existing = await this.prisma.syncGap.findFirst({
          where: {
            chainId,
            gapStartBlock: BigInt(gap.gapStart),
            gapEndBlock: BigInt(gap.gapEnd),
            status: { in: ['detected', 'backfilling'] },
          },
        });
        if (existing) continue;

        // Insert gap record
        const syncGap = await this.prisma.syncGap.create({
          data: {
            chainId,
            gapStartBlock: BigInt(gap.gapStart),
            gapEndBlock: BigInt(gap.gapEnd),
            status: 'detected',
          },
        });

        // Enqueue backfill job
        await this.backfillQueue.add(
          'backfill-gap',
          {
            gapId: Number(syncGap.id),
            chainId,
            startBlock: gap.gapStart,
            endBlock: gap.gapEnd,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );

        gapsFound++;
        this.logger.log(
          `Gap detected on chain ${chainId}: blocks ${gap.gapStart}-${gap.gapEnd} (${gap.gapEnd - gap.gapStart + 1} blocks) — backfill job enqueued`,
        );
      }
    }

    return gapsFound;
  }

  /**
   * Coalesce an array of block numbers into contiguous gap ranges.
   */
  private coalesceGaps(blocks: number[]): GapRange[] {
    if (blocks.length === 0) return [];
    blocks.sort((a, b) => a - b);

    const ranges: GapRange[] = [];
    let start = blocks[0];
    let end = blocks[0];

    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i] === end + 1) {
        end = blocks[i];
      } else {
        ranges.push({ gapStart: start, gapEnd: end });
        start = blocks[i];
        end = blocks[i];
      }
    }
    ranges.push({ gapStart: start, gapEnd: end });

    return ranges;
  }
}
