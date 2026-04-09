import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

/**
 * Detects chain reorganizations by comparing each new block's parent_hash
 * against the stored previous block hash. On mismatch, walks back to find
 * the fork point, logs in reorg_log, and deletes affected indexed_events.
 */
@Injectable()
export class ReorgDetectorService {
  private readonly logger = new Logger(ReorgDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Check if a new block's parent matches our stored previous block.
   * Returns the reorg depth (0 = no reorg).
   */
  async checkForReorg(
    chainId: number,
    blockNumber: number,
    parentHash: string,
  ): Promise<number> {
    // Get the stored block at blockNumber - 1
    const previousStored = await this.prisma.indexedBlock.findUnique({
      where: {
        uq_chain_block: {
          chainId,
          blockNumber: BigInt(blockNumber - 1),
        },
      },
    });

    if (!previousStored) {
      // No previous block stored, can't detect reorg
      return 0;
    }

    if (previousStored.blockHash === parentHash) {
      // No reorg — parent hash matches
      return 0;
    }

    // Reorg detected! Walk back to find fork point
    this.logger.warn(
      `Reorg detected on chain ${chainId} at block ${blockNumber}: ` +
        `expected parent ${previousStored.blockHash}, got ${parentHash}`,
    );

    const depth = await this.findForkDepth(chainId, blockNumber);
    await this.handleReorg(
      chainId,
      blockNumber,
      depth,
      previousStored.blockHash,
      parentHash,
    );

    return depth;
  }

  /**
   * Walk backwards from blockNumber to find the fork point.
   */
  private async findForkDepth(
    chainId: number,
    blockNumber: number,
  ): Promise<number> {
    const provider = await this.evmProvider.getProvider(chainId);
    let depth = 1;
    const maxDepth = 128; // Safety limit

    for (
      let checkBlock = blockNumber - 1;
      checkBlock > 0 && depth < maxDepth;
      checkBlock--, depth++
    ) {
      const storedBlock = await this.prisma.indexedBlock.findUnique({
        where: {
          uq_chain_block: {
            chainId,
            blockNumber: BigInt(checkBlock),
          },
        },
      });

      if (!storedBlock) break;

      // Fetch the canonical block from the chain
      const canonicalBlock = await provider.getBlock(checkBlock);
      if (!canonicalBlock) break;

      if (storedBlock.blockHash === canonicalBlock.hash) {
        // Found the fork point
        return depth;
      }
    }

    return depth;
  }

  /**
   * Handle a reorg: log it, delete affected events, and remove stale blocks.
   */
  private async handleReorg(
    chainId: number,
    reorgAtBlock: number,
    depth: number,
    oldBlockHash: string,
    newParentHash: string,
  ): Promise<void> {
    const forkBlock = reorgAtBlock - depth;

    // Delete affected indexed events
    const deleteResult = await this.prisma.indexedEvent.deleteMany({
      where: {
        chainId,
        blockNumber: { gt: BigInt(forkBlock) },
      },
    });

    // Delete affected indexed blocks
    const deletedBlocks = await this.prisma.indexedBlock.deleteMany({
      where: {
        chainId,
        blockNumber: { gt: BigInt(forkBlock) },
      },
    });

    // Log the reorg
    await this.prisma.reorgLog.create({
      data: {
        chainId,
        reorgAtBlock: BigInt(reorgAtBlock),
        oldBlockHash,
        newBlockHash: newParentHash,
        depth,
        eventsInvalidated: deleteResult.count,
        balancesRecalculated: 0, // Will be updated when balances are recalculated
      },
    });

    this.logger.warn(
      `Reorg handled on chain ${chainId}: depth=${depth}, ` +
        `invalidated ${deleteResult.count} events, ` +
        `removed ${deletedBlocks.count} blocks from block ${forkBlock + 1}`,
    );
  }

  /**
   * Mark a reorg as reindexed (called after blocks are re-processed).
   */
  async markReindexed(reorgId: bigint, balancesRecalculated: number): Promise<void> {
    await this.prisma.reorgLog.update({
      where: { id: reorgId },
      data: {
        reindexedAt: new Date(),
        balancesRecalculated,
      },
    });
  }
}
