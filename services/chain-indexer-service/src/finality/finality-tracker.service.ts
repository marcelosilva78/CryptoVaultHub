import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkFinality(): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    await Promise.all(
      chains.map((chain) =>
        this.checkFinalityForChain(chain.id).catch((err) => {
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

    // Find unfinalized blocks that are now final
    const unfinalizedBlocks = await this.prisma.indexedBlock.findMany({
      where: {
        chainId,
        isFinalized: false,
        blockNumber: { lte: BigInt(finalizedBlock) },
      },
      orderBy: { blockNumber: 'asc' },
    });

    if (unfinalizedBlocks.length === 0) return 0;

    // Mark as finalized in batch
    const blockIds = unfinalizedBlocks.map((b) => b.id);
    await this.prisma.indexedBlock.updateMany({
      where: { id: { in: blockIds } },
      data: { isFinalized: true },
    });

    // Update sync cursor with latest finalized block
    await this.prisma.syncCursor.upsert({
      where: { chainId },
      update: { latestFinalizedBlock: BigInt(finalizedBlock) },
      create: {
        chainId,
        lastBlock: BigInt(currentBlock),
        latestFinalizedBlock: BigInt(finalizedBlock),
      },
    });

    // Trigger balance materialization for finalized blocks
    const maxFinalized = Number(
      unfinalizedBlocks[unfinalizedBlocks.length - 1].blockNumber,
    );
    await this.balanceMaterializer
      .materializeForChain(chainId, maxFinalized)
      .catch((err) => {
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
