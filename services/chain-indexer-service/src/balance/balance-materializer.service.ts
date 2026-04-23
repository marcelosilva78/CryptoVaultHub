import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Computes materialized balances by summing inbound/outbound events
 * per (address, token) for finalized blocks.
 *
 * NOTE: Uses raw SQL because indexed_events and materialized_balances models
 * are not yet reflected in the generated Prisma client. Run `prisma generate`
 * after schema migrations to re-enable typed ORM access.
 *
 * Tracks a per-chain watermark (last_materialized_block) in Redis to avoid
 * full table scans on every invocation. On first run (no watermark), processes
 * all events once, then only processes incremental deltas.
 */
@Injectable()
export class BalanceMaterializerService {
  private readonly logger = new Logger(BalanceMaterializerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Redis key for the per-chain materialization watermark.
   */
  private watermarkKey(chainId: number): string {
    return `balance:watermark:${chainId}`;
  }

  /**
   * Get the last materialized block for a chain from Redis.
   * Returns null on first run (no watermark yet), triggering a full initial scan.
   */
  private async getWatermark(chainId: number): Promise<number | null> {
    const cached = await this.redis.getCache(this.watermarkKey(chainId));
    if (cached !== null) {
      return parseInt(cached, 10);
    }
    return null;
  }

  /**
   * Update the watermark after successful materialization.
   * Stored in Redis without TTL so it persists across restarts (until Redis flush).
   */
  private async setWatermark(chainId: number, blockNumber: number): Promise<void> {
    await this.redis.setCache(this.watermarkKey(chainId), blockNumber.toString());
  }

  /** Batch size for cursor-based pagination through indexed_events. */
  private static readonly BATCH_SIZE = 1000;

  /**
   * Materialize balances for a chain up to a given finalized block number.
   * Uses cursor-based pagination (LIMIT + ORDER BY) to process events in
   * fixed-size batches, avoiding memory spikes and long-running queries
   * when the gap between watermark and upToBlock is large.
   */
  async materializeForChain(
    chainId: number,
    upToBlock: number,
  ): Promise<number> {
    let currentWatermark = await this.getWatermark(chainId);
    let totalUpdated = 0;
    let totalEventsProcessed = 0;

    while (true) {
      // Build the query with watermark filter when available
      let query: string;
      let queryParams: any[];

      if (currentWatermark !== null) {
        // Incremental: only process events after the watermark
        query = `SELECT to_address, from_address, token_id, amount, client_id, project_id,
                        wallet_id, is_inbound, block_number
                 FROM indexed_events
                 WHERE chain_id = ?
                   AND block_number > ?
                   AND block_number <= ?
                   AND processed_at IS NOT NULL
                   AND event_type IN ('erc20_transfer', 'native_transfer')
                 ORDER BY block_number ASC, log_index ASC
                 LIMIT ?`;
        queryParams = [chainId, BigInt(currentWatermark), BigInt(upToBlock), BalanceMaterializerService.BATCH_SIZE];
      } else {
        // First run: process everything up to upToBlock
        query = `SELECT to_address, from_address, token_id, amount, client_id, project_id,
                        wallet_id, is_inbound, block_number
                 FROM indexed_events
                 WHERE chain_id = ?
                   AND block_number <= ?
                   AND processed_at IS NOT NULL
                   AND event_type IN ('erc20_transfer', 'native_transfer')
                 ORDER BY block_number ASC, log_index ASC
                 LIMIT ?`;
        queryParams = [chainId, BigInt(upToBlock), BalanceMaterializerService.BATCH_SIZE];
      }

      // Fetch the next batch of finalized events via raw SQL
      const events = await this.prisma.$queryRawUnsafe<
        Array<{
          to_address: string | null;
          from_address: string | null;
          token_id: bigint | null;
          amount: string | null;
          client_id: bigint | null;
          project_id: bigint | null;
          wallet_id: bigint | null;
          is_inbound: boolean | null;
          block_number: bigint;
        }>
      >(query, ...queryParams);

      if (events.length === 0) {
        // No events in this range — advance watermark to avoid re-scanning
        if (currentWatermark === null || upToBlock > currentWatermark) {
          await this.setWatermark(chainId, upToBlock);
        }
        break;
      }

      // Track the highest block_number in this batch for the cursor advance
      let batchMaxBlock = events[0].block_number;

      // Group events by (address, tokenId) to compute net balance changes
      const balanceMap = new Map<
        string,
        {
          address: string;
          tokenId: bigint | null;
          clientId: bigint;
          projectId: bigint | null;
          walletId: bigint | null;
          netAmount: bigint;
          lastBlock: bigint;
        }
      >();

      for (const event of events) {
        if (event.block_number > batchMaxBlock) {
          batchMaxBlock = event.block_number;
        }

        if (!event.amount) continue;

        const amount = BigInt(event.amount);

        // Process inbound (to_address receives)
        if (event.to_address && event.is_inbound) {
          const key = `${event.to_address.toLowerCase()}:${event.token_id ?? 'native'}`;
          const existing = balanceMap.get(key);
          if (existing) {
            existing.netAmount += amount;
            if (event.block_number > existing.lastBlock) {
              existing.lastBlock = event.block_number;
            }
          } else {
            balanceMap.set(key, {
              address: event.to_address.toLowerCase(),
              tokenId: event.token_id,
              clientId: event.client_id!,
              projectId: event.project_id,
              walletId: event.wallet_id,
              netAmount: amount,
              lastBlock: event.block_number,
            });
          }
        }

        // Process outbound (from_address sends)
        if (event.from_address && !event.is_inbound) {
          const key = `${event.from_address.toLowerCase()}:${event.token_id ?? 'native'}`;
          const existing = balanceMap.get(key);
          if (existing) {
            existing.netAmount -= amount;
            if (event.block_number > existing.lastBlock) {
              existing.lastBlock = event.block_number;
            }
          } else if (event.client_id) {
            balanceMap.set(key, {
              address: event.from_address.toLowerCase(),
              tokenId: event.token_id,
              clientId: event.client_id,
              projectId: event.project_id,
              walletId: event.wallet_id,
              netAmount: -amount,
              lastBlock: event.block_number,
            });
          }
        }
      }

      // Upsert materialized balances via raw SQL
      let batchUpdated = 0;
      for (const entry of balanceMap.values()) {
        if (!entry.clientId) continue;

        await this.prisma.$executeRawUnsafe(
          `INSERT INTO materialized_balances
             (chain_id, address, token_id, client_id, project_id, wallet_id, balance, last_updated_block, last_updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             balance = balance + VALUES(balance),
             last_updated_block = VALUES(last_updated_block),
             last_updated_at = NOW()`,
          chainId,
          entry.address,
          entry.tokenId,
          entry.clientId,
          entry.projectId ?? BigInt(0),
          entry.walletId,
          entry.netAmount.toString(),
          entry.lastBlock,
        );
        batchUpdated++;
      }

      // Advance the watermark to the highest block in this batch
      const newWatermark = Number(batchMaxBlock);
      await this.setWatermark(chainId, newWatermark);
      currentWatermark = newWatermark;

      totalUpdated += batchUpdated;
      totalEventsProcessed += events.length;

      this.logger.debug(
        `Batch complete: ${events.length} events, ${batchUpdated} balances upserted, ` +
          `watermark advanced to block ${newWatermark}`,
      );

      // If fewer than BATCH_SIZE results, we've caught up — no more pages
      if (events.length < BalanceMaterializerService.BATCH_SIZE) break;
    }

    if (totalEventsProcessed > 0) {
      this.logger.log(
        `Materialized ${totalUpdated} balances from ${totalEventsProcessed} events ` +
          `for chain ${chainId} up to block ${upToBlock}`,
      );
    }

    return totalUpdated;
  }
}
