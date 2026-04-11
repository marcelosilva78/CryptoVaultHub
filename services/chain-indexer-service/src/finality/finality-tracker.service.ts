import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { BalanceMaterializerService } from '../balance/balance-materializer.service';

/**
 * Per-chain finality thresholds.
 * Number of confirmations required before a block is considered finalized.
 */
const FINALITY_THRESHOLDS: Record<number, number> = {
  1: 64,      // Ethereum Mainnet
  11155111: 64, // Ethereum Sepolia
  56: 15,     // BSC
  97: 15,     // BSC Testnet
  137: 256,   // Polygon
  80001: 256, // Polygon Mumbai
  80002: 256, // Polygon Amoy
  42161: 1,   // Arbitrum One
  421614: 1,  // Arbitrum Sepolia
  10: 1,      // Optimism
  11155420: 1, // Optimism Sepolia
  8453: 1,    // Base
  84532: 1,   // Base Sepolia
  43114: 1,   // Avalanche
  43113: 1,   // Avalanche Fuji
};

const DEFAULT_FINALITY_THRESHOLD = 32;

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
   * Check finality for all active chains every 30 seconds.
   * Called by a scheduler (setInterval or @nestjs/schedule) in the module.
   */
  async checkFinality(): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    await Promise.all(
      chains.map((chain) =>
        this.checkFinalityForChain(chain.id).catch((err: any) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Finality check failed for chain ${chain.id}: ${msg}`,
          );
        }),
      ),
    );
  }

  /**
   * Mark blocks as finalized for a single chain.
   */
  async checkFinalityForChain(chainId: number): Promise<number> {
    const provider = await this.evmProvider.getProvider(chainId);
    const currentBlock = await provider.getBlockNumber();
    const threshold =
      FINALITY_THRESHOLDS[chainId] ?? DEFAULT_FINALITY_THRESHOLD;
    const finalizedBlock = currentBlock - threshold;

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
