import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface FlushItem {
  walletId: bigint;
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
}

/**
 * Orchestrates batch flush operations across forwarder wallets.
 * Collects pending flush items, groups by chain/token, and executes.
 */
@Injectable()
export class FlushOrchestratorService {
  private readonly logger = new Logger(FlushOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Execute a flush operation for a client on a specific chain.
   */
  async executeFlush(
    clientId: number,
    chainId: number,
  ): Promise<FlushResult> {
    const items = await this.collectFlushItems(clientId, chainId);

    let succeededCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      try {
        // Skip items with zero balance or locked forwarders
        const balance = BigInt(item.amount);
        if (balance <= 0n) {
          skippedCount++;
          continue;
        }

        const isLocked = await this.isForwarderLocked(item.forwarderAddress);
        if (isLocked) {
          skippedCount++;
          continue;
        }

        await this.flushItem(item);
        succeededCount++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Flush failed for forwarder ${item.forwarderAddress}: ${msg}`,
        );
        failedCount++;
      }
    }

    // Determine final status based on actual outcomes
    let finalStatus: string;
    if (failedCount === 0 && succeededCount > 0) {
      finalStatus = 'succeeded';
    } else if (succeededCount === 0 && failedCount > 0) {
      finalStatus = 'failed';
    } else if (succeededCount > 0 && failedCount > 0) {
      finalStatus = 'partially_succeeded';
    } else if (succeededCount === 0 && failedCount === 0) {
      finalStatus = 'canceled'; // all items were skipped (zero balance or locked)
    } else {
      finalStatus = 'failed';
    }

    const result: FlushResult = {
      totalItems: items.length,
      succeededCount,
      failedCount,
      skippedCount,
      finalStatus,
    };

    this.logger.log(
      `Flush completed for client ${clientId}, chain ${chainId}: ${JSON.stringify(result)}`,
    );

    // Publish result event
    await this.redis.publishToStream('flush:completed', {
      clientId: clientId.toString(),
      chainId: chainId.toString(),
      totalItems: items.length.toString(),
      succeeded: succeededCount.toString(),
      failed: failedCount.toString(),
      skipped: skippedCount.toString(),
      finalStatus,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Collect items eligible for flushing.
   */
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
      chainId: d.chainId,
      tokenId: d.tokenId,
      forwarderAddress: d.forwarderAddress,
      amount: d.amountRaw,
    }));
  }

  /**
   * Check if a forwarder address is currently locked (e.g., pending sweep).
   */
  private async isForwarderLocked(address: string): Promise<boolean> {
    const lockKey = `flush:lock:${address}`;
    const locked = await this.redis.getCache(lockKey);
    return locked !== null;
  }

  /**
   * Execute flush for a single item.
   */
  private async flushItem(item: FlushItem): Promise<void> {
    // Lock the forwarder during flush
    const lockKey = `flush:lock:${item.forwarderAddress}`;
    await this.redis.setCache(lockKey, '1', 300); // 5 minute lock

    try {
      // Record flush intent (actual on-chain tx handled by signing service)
      await this.redis.publishToStream('flush:execute', {
        forwarderAddress: item.forwarderAddress,
        chainId: item.chainId.toString(),
        tokenId: item.tokenId.toString(),
        amount: item.amount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Release lock on failure
      await this.redis.setCache(lockKey, '', 0);
      throw error;
    }
  }
}
