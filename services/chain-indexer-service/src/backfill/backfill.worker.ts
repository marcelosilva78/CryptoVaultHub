import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';

interface BackfillJobData {
  gapId: number;
  chainId: number;
  startBlock: number;
  endBlock: number;
}

const BATCH_SIZE = 100;

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
  ) {
    super();
  }

  async process(job: Job<BackfillJobData>): Promise<void> {
    const { gapId, chainId, startBlock, endBlock } = job.data;

    this.logger.log(
      `Backfilling gap ${gapId}: chain ${chainId}, blocks ${startBlock}-${endBlock}`,
    );

    // Update gap status to backfilling
    const gap = await this.prisma.syncGap.findUnique({
      where: { id: BigInt(gapId) },
    });

    if (!gap) {
      this.logger.warn(`Gap ${gapId} not found, skipping`);
      return;
    }

    if (gap.status === 'resolved') {
      this.logger.log(`Gap ${gapId} already resolved, skipping`);
      return;
    }

    if (gap.attemptCount >= gap.maxAttempts) {
      this.logger.warn(
        `Gap ${gapId} exceeded max attempts (${gap.maxAttempts}), marking failed`,
      );
      await this.prisma.syncGap.update({
        where: { id: BigInt(gapId) },
        data: { status: 'failed' },
      });
      return;
    }

    await this.prisma.syncGap.update({
      where: { id: BigInt(gapId) },
      data: {
        status: 'backfilling',
        attemptCount: gap.attemptCount + 1,
        backfillJobId: BigInt(job.id ?? 0),
      },
    });

    try {
      // Process in batches
      for (
        let batchStart = startBlock;
        batchStart <= endBlock;
        batchStart += BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock);

        const promises: Promise<any>[] = [];
        for (let block = batchStart; block <= batchEnd; block++) {
          promises.push(
            this.blockProcessor.processBlock(chainId, block).catch((err) => {
              this.logger.warn(
                `Failed to process block ${block} during backfill: ${err.message}`,
              );
            }),
          );
        }

        await Promise.all(promises);

        // Update job progress
        const progress = Math.round(
          ((batchEnd - startBlock + 1) / (endBlock - startBlock + 1)) * 100,
        );
        await job.updateProgress(progress);
      }

      // Mark gap as resolved
      await this.prisma.syncGap.update({
        where: { id: BigInt(gapId) },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
        },
      });

      this.logger.log(
        `Gap ${gapId} resolved: chain ${chainId}, blocks ${startBlock}-${endBlock}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await this.prisma.syncGap.update({
        where: { id: BigInt(gapId) },
        data: {
          status: 'failed',
          lastError: msg,
        },
      });

      this.logger.error(`Backfill failed for gap ${gapId}: ${msg}`);
      throw error;
    }
  }
}
