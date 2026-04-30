import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';
import { RedisService } from '../redis/redis.service';

interface BackfillJobData {
  gapId: number;
  chainId: number;
  startBlock: number;
  endBlock: number;
}

const BATCH_SIZE = 100;
/** Max number of blocks to process concurrently within a batch (prevents RPC flooding) */
const BATCH_CONCURRENCY = 5;

/**
 * BullMQ worker for gap recovery: processes gap ranges in batches of 100 blocks.
 * Uses BlockProcessorService for each block.
 * Updates sync_gaps status through the lifecycle.
 */
@Processor('backfill')
@Injectable()
export class BackfillWorker extends WorkerHost {
  private readonly logger = new Logger(BackfillWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockProcessor: BlockProcessorService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<BackfillJobData>): Promise<void> {
    const { gapId, chainId, startBlock, endBlock } = job.data;

    this.logger.log(
      `Backfilling gap ${gapId}: chain ${chainId}, blocks ${startBlock}-${endBlock}`,
    );

    // Fetch gap via raw SQL (sync_gaps model not in generated Prisma client)
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        status: string;
        attempt_count: number;
        max_attempts: number;
      }>
    >(
      `SELECT id, status, attempt_count, max_attempts FROM sync_gaps WHERE id = ? LIMIT 1`,
      gapId,
    );
    const gap = rows[0] ?? null;

    if (!gap) {
      this.logger.warn(`Gap ${gapId} not found, skipping`);
      return;
    }

    if (gap.status === 'resolved') {
      this.logger.log(`Gap ${gapId} already resolved, skipping`);
      return;
    }

    if (gap.attempt_count >= gap.max_attempts) {
      this.logger.warn(
        `Gap ${gapId} exceeded max attempts (${gap.max_attempts}), marking failed`,
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE sync_gaps SET status = 'failed' WHERE id = ?`,
        gapId,
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE sync_gaps
       SET status = 'backfilling', attempt_count = attempt_count + 1, backfill_job_id = ?
       WHERE id = ?`,
      BigInt(job.id ?? 0),
      gapId,
    );

    try {
      // Process in batches
      for (
        let batchStart = startBlock;
        batchStart <= endBlock;
        batchStart += BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock);

        // Process blocks in small sub-batches to avoid flooding the RPC provider.
        // Each sub-batch runs BATCH_CONCURRENCY blocks in parallel.
        const blockNumbers: number[] = [];
        for (let block = batchStart; block <= batchEnd; block++) {
          blockNumbers.push(block);
        }

        for (let i = 0; i < blockNumbers.length; i += BATCH_CONCURRENCY) {
          const subBatch = blockNumbers.slice(i, i + BATCH_CONCURRENCY);
          await Promise.all(
            subBatch.map((block) =>
              this.blockProcessor.processBlock(chainId, block)
                .then(async () => {
                  // Mark block as scanned in Redis (prevents gap detector from re-detecting empty blocks)
                  await this.redis.setCache(
                    `scanned:${chainId}:${block}`,
                    '1',
                    86400, // 24h TTL
                  );
                })
                .catch((err: any) => {
                  this.logger.warn(
                    `Failed to process block ${block} during backfill: ${err.message}`,
                  );
                }),
            ),
          );
        }

        // Update job progress
        const progress = Math.round(
          ((batchEnd - startBlock + 1) / (endBlock - startBlock + 1)) * 100,
        );
        await job.updateProgress(progress);
      }

      // Mark gap as resolved
      await this.prisma.$executeRawUnsafe(
        `UPDATE sync_gaps SET status = 'resolved', resolved_at = NOW() WHERE id = ?`,
        gapId,
      );

      this.logger.log(
        `Gap ${gapId} resolved: chain ${chainId}, blocks ${startBlock}-${endBlock}`,
      );
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);

      await this.prisma.$executeRawUnsafe(
        `UPDATE sync_gaps SET status = 'failed', last_error = ? WHERE id = ?`,
        msg,
        gapId,
      );

      this.logger.error(`Backfill failed for gap ${gapId}: ${msg}`);
      throw error;
    }
  }
}
