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

  /**
   * Materialize balances for a chain up to a given finalized block number.
   * Only processes events since the last materialized block (watermark).
   */
  async materializeForChain(
    chainId: number,
    upToBlock: number,
  ): Promise<number> {
    const watermark = await this.getWatermark(chainId);

    // Build the query with watermark filter when available
    let query: string;
    let queryParams: any[];

    if (watermark !== null) {
      // Incremental: only process events after the watermark
      query = `SELECT to_address, from_address, token_id, amount, client_id, project_id,
                      wallet_id, is_inbound, block_number
               FROM indexed_events
               WHERE chain_id = ?
                 AND block_number > ?
                 AND block_number <= ?
                 AND processed_at IS NOT NULL
                 AND event_type IN ('erc20_transfer', 'native_transfer')`;
      queryParams = [chainId, BigInt(watermark), BigInt(upToBlock)];
    } else {
      // First run: process everything up to upToBlock
      query = `SELECT to_address, from_address, token_id, amount, client_id, project_id,
                      wallet_id, is_inbound, block_number
               FROM indexed_events
               WHERE chain_id = ?
                 AND block_number <= ?
                 AND processed_at IS NOT NULL
                 AND event_type IN ('erc20_transfer', 'native_transfer')`;
      queryParams = [chainId, BigInt(upToBlock)];
    }

    // Get all finalized events that need balance computation via raw SQL
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
      // Even with no events, advance the watermark to avoid re-scanning empty ranges
      if (watermark === null || upToBlock > watermark) {
        await this.setWatermark(chainId, upToBlock);
      }
      return 0;
    }

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
    let updated = 0;
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
      updated++;
    }

    // Advance the watermark after successful materialization
    await this.setWatermark(chainId, upToBlock);

    this.logger.log(
      `Materialized ${updated} balances for chain ${chainId} up to block ${upToBlock}` +
        (watermark !== null ? ` (from block ${watermark + 1})` : ' (initial run)'),
    );

    return updated;
  }
}
