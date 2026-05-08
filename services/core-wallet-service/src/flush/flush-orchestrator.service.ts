import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface FlushItem {
  walletId: bigint;
  clientId: bigint;
  chainId: number;
  tokenId: bigint;
  forwarderAddress: string;
  amount: string;
}

interface FlushResult {
  totalItems: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  finalStatus: string;
  sweepJobIds: string[];
}

/**
 * Orchestrates batch flush operations across forwarder wallets.
 * Collects pending flush items and enqueues real sweep jobs on the cron-worker
 * 'sweep' BullMQ queue. The cron-worker SweepService picks up the job, signs
 * the flush tx via Key Vault, and submits it on-chain.
 */
@Injectable()
export class FlushOrchestratorService {
  private readonly logger = new Logger(FlushOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue('sweep') private readonly sweepQueue: Queue,
  ) {}

  /**
   * Execute a flush operation for a client on a specific chain.
   * Collects eligible deposits, then enqueues one immediate sweep job per
   * (clientId, chainId) pair. The actual on-chain flush is performed by the
   * cron-worker SweepService.
   */
  async executeFlush(
    clientId: number,
    chainId: number,
  ): Promise<FlushResult> {
    const items = await this.collectFlushItems(clientId, chainId);

    let succeededCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const sweepJobIds: string[] = [];

    // Group items by (chainId, clientId) — one sweep job covers all forwarders for that pair.
    const groupKeys = new Set<string>();
    for (const item of items) {
      try {
        const balance = BigInt(item.amount);
        if (balance <= 0n) {
          skippedCount++;
          continue;
        }

        const isLocked = await this.isForwarderLocked(item.chainId, item.forwarderAddress);
        if (isLocked) {
          skippedCount++;
          continue;
        }

        const groupKey = `${item.chainId}:${item.clientId}`;
        if (groupKeys.has(groupKey)) {
          succeededCount++;
          continue;
        }
        groupKeys.add(groupKey);

        const jobId = `flush-${item.chainId}-${item.clientId}-${Date.now()}`;
        await this.sweepQueue.add(
          'execute-sweep',
          { chainId: item.chainId, clientId: Number(item.clientId) },
          {
            jobId,
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );
        sweepJobIds.push(jobId);
        succeededCount++;

        this.logger.log(
          `Enqueued flush sweep job ${jobId} for client ${item.clientId} chain ${item.chainId}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Flush enqueue failed for forwarder ${item.forwarderAddress}: ${msg}`,
        );
        failedCount++;
      }
    }

    let finalStatus: string;
    if (failedCount === 0 && succeededCount > 0) {
      finalStatus = 'enqueued';
    } else if (succeededCount === 0 && failedCount > 0) {
      finalStatus = 'failed';
    } else if (succeededCount > 0 && failedCount > 0) {
      finalStatus = 'partially_enqueued';
    } else if (succeededCount === 0 && failedCount === 0) {
      finalStatus = 'canceled';
    } else {
      finalStatus = 'failed';
    }

    const result: FlushResult = {
      totalItems: items.length,
      succeededCount,
      failedCount,
      skippedCount,
      finalStatus,
      sweepJobIds,
    };

    this.logger.log(
      `Flush completed for client ${clientId}, chain ${chainId}: ${JSON.stringify(result)}`,
    );

    await this.redis.publishToStream('flush:enqueued', {
      clientId: clientId.toString(),
      chainId: chainId.toString(),
      totalItems: items.length.toString(),
      succeeded: succeededCount.toString(),
      failed: failedCount.toString(),
      skipped: skippedCount.toString(),
      sweepJobIds: sweepJobIds.join(','),
      finalStatus,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  private async collectFlushItems(
    clientId: number,
    chainId: number,
  ): Promise<FlushItem[]> {
    const deposits = await this.prisma.deposit.findMany({
      where: {
        clientId: BigInt(clientId),
        chainId,
        status: 'confirmed',
        sweepTxHash: null,
      },
    });

    return deposits.map((d) => ({
      walletId: d.clientId,
      clientId: d.clientId,
      chainId: d.chainId,
      tokenId: d.tokenId,
      forwarderAddress: d.forwarderAddress,
      amount: d.amountRaw,
    }));
  }

  private async isForwarderLocked(chainId: number, address: string): Promise<boolean> {
    const lockKey = `flush:lock:${chainId}:${address.toLowerCase()}`;
    const locked = await this.redis.getCache(lockKey);
    return locked !== null;
  }
}
