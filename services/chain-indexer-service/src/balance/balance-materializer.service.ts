import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Computes materialized balances by summing inbound/outbound events
 * per (address, token) for finalized blocks.
 *
 * NOTE: Uses raw SQL because indexed_events and materialized_balances models
 * are not yet reflected in the generated Prisma client. Run `prisma generate`
 * after schema migrations to re-enable typed ORM access.
 */
@Injectable()
export class BalanceMaterializerService {
  private readonly logger = new Logger(BalanceMaterializerService.name);

  /**
   * Materialize balances for a chain up to a given finalized block number.
   */
  constructor(private readonly prisma: PrismaService) {}

  async materializeForChain(
    chainId: number,
    upToBlock: number,
  ): Promise<number> {
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
    >(
      `SELECT to_address, from_address, token_id, amount, client_id, project_id,
              wallet_id, is_inbound, block_number
       FROM indexed_events
       WHERE chain_id = ?
         AND block_number <= ?
         AND processed_at IS NOT NULL
         AND event_type IN ('erc20_transfer', 'native_transfer')`,
      chainId,
      BigInt(upToBlock),
    );

    if (events.length === 0) return 0;

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
           balance = VALUES(balance),
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

    this.logger.log(
      `Materialized ${updated} balances for chain ${chainId} up to block ${upToBlock}`,
    );

    return updated;
  }
}
