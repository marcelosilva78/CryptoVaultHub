import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Detects gaps in the indexed block sequence for a chain.
 * Uses a SQL-based approach to avoid loading all block numbers into memory,
 * which would cause OOM on mature chains with millions of blocks.
 */
@Injectable()
export class GapDetectorService {
  private readonly logger = new Logger(GapDetectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect gaps in the indexed block sequence for a given chain.
   * Returns up to 100 gaps to avoid processing too many at once.
   */
  async detectGaps(
    chainId: number,
  ): Promise<{ gapStart: number; gapEnd: number }[]> {
    const cursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });
    if (!cursor) return [];

    const lastBlock = Number(cursor.lastBlock);

    // SQL-based gap detection using self-join
    const gaps = await this.prisma.$queryRawUnsafe<
      Array<{ gap_start: bigint; gap_end: bigint }>
    >(
      `SELECT
         b1.block_number + 1 AS gap_start,
         MIN(b2.block_number) - 1 AS gap_end
       FROM indexed_blocks b1
       LEFT JOIN indexed_blocks b2
         ON b2.chain_id = b1.chain_id AND b2.block_number > b1.block_number
       WHERE b1.chain_id = ?
         AND b1.block_number < ?
       GROUP BY b1.block_number
       HAVING MIN(b2.block_number) > b1.block_number + 1
       ORDER BY gap_start
       LIMIT 100`,
      chainId,
      lastBlock,
    );

    const result = gaps.map((g) => ({
      gapStart: Number(g.gap_start),
      gapEnd: Number(g.gap_end),
    }));

    if (result.length > 0) {
      this.logger.warn(
        `Detected ${result.length} gaps for chain ${chainId}, first gap: ${result[0].gapStart}-${result[0].gapEnd}`,
      );
    }

    return result;
  }
}
