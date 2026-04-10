import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

interface ReorgResult {
  detected: boolean;
  depth: number;
  reorgFromBlock?: number;
}

/**
 * Detects chain reorganizations by comparing stored block hashes
 * with canonical chain block hashes, walking backwards from the tip.
 */
@Injectable()
export class ReorgDetectorService {
  private readonly logger = new Logger(ReorgDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Check for a reorg on the given chain starting from the latest known block.
   * Walks backwards comparing stored hashes to canonical hashes.
   */
  async checkForReorg(
    chainId: number,
    maxDepth: number = 64,
  ): Promise<ReorgResult> {
    const cursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });
    if (!cursor) {
      return { detected: false, depth: 0 };
    }

    const provider = await this.evmProvider.getProvider(chainId);
    const startBlock = Number(cursor.lastBlock);
    let depth = 0;

    for (let i = 0; i < maxDepth; i++) {
      const checkBlock = startBlock - i;
      if (checkBlock < 0) break;

      depth++;

      // Get stored block hash from cache or DB
      const storedBlock = await this.getStoredBlockHash(chainId, checkBlock);
      if (!storedBlock) {
        depth--;
        break;
      }

      // Get canonical block from chain
      const canonicalBlock = await provider.getBlock(checkBlock);
      if (!canonicalBlock) {
        depth--;
        break;
      }

      // Compare hashes
      if (storedBlock === canonicalBlock.hash) {
        // Found the common ancestor — blocks above this were reorged
        if (i > 0) {
          const reorgFromBlock = checkBlock + 1;
          this.logger.warn(
            `Reorg detected on chain ${chainId}: depth ${i}, reorg from block ${reorgFromBlock}`,
          );

          await this.publishReorgEvent(chainId, reorgFromBlock, depth);

          return {
            detected: true,
            depth: i,
            reorgFromBlock,
          };
        }
        // i === 0 means the tip matches, no reorg
        return { detected: false, depth: 0 };
      }
    }

    // Walked maxDepth without finding common ancestor — deep reorg
    this.logger.error(
      `Deep reorg on chain ${chainId}: no common ancestor found within ${maxDepth} blocks`,
    );

    return {
      detected: true,
      depth,
      reorgFromBlock: startBlock - maxDepth + 1,
    };
  }

  /**
   * Get stored block hash from Redis cache or DB.
   */
  private async getStoredBlockHash(
    chainId: number,
    blockNumber: number,
  ): Promise<string | null> {
    const cacheKey = `block:${chainId}:${blockNumber}:hash`;
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;
    return null;
  }

  /**
   * Publish a reorg detection event.
   */
  private async publishReorgEvent(
    chainId: number,
    reorgFromBlock: number,
    depth: number,
  ): Promise<void> {
    await this.redis.publishToStream('chain:reorg', {
      chainId: chainId.toString(),
      reorgFromBlock: reorgFromBlock.toString(),
      depth: depth.toString(),
      detectedAt: new Date().toISOString(),
    });
  }
}
