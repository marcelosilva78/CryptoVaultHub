import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { BalanceMaterializerService } from '../balance/balance-materializer.service';

/**
 * Marks blocks as finalized once they exceed the per-chain finality threshold.
 * Triggers balance materialization for newly finalized blocks.
 */
@Injectable()
export class FinalityTrackerService {
  private readonly logger = new Logger(FinalityTrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly balanceMaterializer: BalanceMaterializerService,
  ) {}

  /**
   * Check finality for chains that have monitored addresses every 30 seconds.
   * Reads finality_threshold from the DB chains table instead of a hardcoded map.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkFinality(): Promise<void> {
    // Only process chains with monitored addresses, reading threshold from DB
    const activeChains = await this.prisma.$queryRaw<
      Array<{ chain_id: number; finality_threshold: number }>
    >`
      SELECT DISTINCT c.chain_id, c.finality_threshold
      FROM chains c
      INNER JOIN monitored_addresses ma ON ma.chain_id = c.chain_id AND ma.is_active = 1
      WHERE c.is_active = 1
    `;

    for (const chain of activeChains) {
      try {
        await this.checkFinalityForChain(chain.chain_id, chain.finality_threshold);
      } catch (err) {
        this.logger.error(
          `Finality check failed for chain ${chain.chain_id}: ${err}`,
        );
      }
    }
  }

  /**
   * Mark blocks as finalized for a single chain.
   */
  async checkFinalityForChain(chainId: number, finalityThreshold: number): Promise<number> {
    const provider = await this.evmProvider.getProvider(chainId);
    const currentBlock = await provider.getBlockNumber();
    const finalizedBlock = currentBlock - finalityThreshold;

    if (finalizedBlock <= 0) return 0;

    // Find unfinalized blocks that are now final using raw SQL
    const unfinalizedBlocks = await this.prisma.$queryRawUnsafe<
      Array<{ id: bigint; block_number: bigint }>
    >(
      `SELECT id, block_number FROM indexed_blocks
       WHERE chain_id = ? AND is_finalized = 0 AND block_number <= ?
       ORDER BY block_number ASC`,
      chainId,
      BigInt(finalizedBlock),
    );

    if (unfinalizedBlocks.length === 0) return 0;

    // Mark as finalized in batch via raw SQL
    const blockIds = unfinalizedBlocks.map((b: { id: bigint; block_number: bigint }) => b.id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE indexed_blocks SET is_finalized = 1
       WHERE id IN (${blockIds.map(() => '?').join(',')})`,
      ...blockIds,
    );

    // Update sync cursor with latest finalized block via raw SQL upsert
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO sync_cursors (chain_id, last_block, latest_finalized_block, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE latest_finalized_block = VALUES(latest_finalized_block), updated_at = NOW()`,
      chainId,
      BigInt(currentBlock),
      BigInt(finalizedBlock),
    );

    // Trigger balance materialization for finalized blocks
    const maxFinalized = Number(
      unfinalizedBlocks[unfinalizedBlocks.length - 1].block_number,
    );
    await this.balanceMaterializer
      .materializeForChain(chainId, maxFinalized)
      .catch((err: any) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Balance materialization failed for chain ${chainId}: ${msg}`,
        );
      });

    this.logger.log(
      `Chain ${chainId}: ${unfinalizedBlocks.length} blocks finalized up to ${finalizedBlock}`,
    );

    return unfinalizedBlocks.length;
  }
}
