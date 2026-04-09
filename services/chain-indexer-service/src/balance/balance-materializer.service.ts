import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Computes materialized balances by summing inbound/outbound events
 * per (address, token) for finalized blocks.
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
    // Get all finalized events that need balance computation
    const events = await this.prisma.indexedEvent.findMany({
      where: {
        chainId,
        blockNumber: { lte: BigInt(upToBlock) },
        processedAt: { not: null },
        eventType: { in: ['erc20_transfer', 'native_transfer'] },
      },
      select: {
        toAddress: true,
        fromAddress: true,
        tokenId: true,
        amount: true,
        clientId: true,
        projectId: true,
        walletId: true,
        isInbound: true,
        blockNumber: true,
      },
    });

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

      const amount = BigInt(event.amount.toString());

      // Process inbound (to_address receives)
      if (event.toAddress && event.isInbound) {
        const key = `${event.toAddress.toLowerCase()}:${event.tokenId ?? 'native'}`;
        const existing = balanceMap.get(key);
        if (existing) {
          existing.netAmount += amount;
          if (event.blockNumber > existing.lastBlock) {
            existing.lastBlock = event.blockNumber;
          }
        } else {
          balanceMap.set(key, {
            address: event.toAddress.toLowerCase(),
            tokenId: event.tokenId,
            clientId: event.clientId!,
            projectId: event.projectId,
            walletId: event.walletId,
            netAmount: amount,
            lastBlock: event.blockNumber,
          });
        }
      }

      // Process outbound (from_address sends)
      if (event.fromAddress && !event.isInbound) {
        const key = `${event.fromAddress.toLowerCase()}:${event.tokenId ?? 'native'}`;
        const existing = balanceMap.get(key);
        if (existing) {
          existing.netAmount -= amount;
          if (event.blockNumber > existing.lastBlock) {
            existing.lastBlock = event.blockNumber;
          }
        } else if (event.clientId) {
          balanceMap.set(key, {
            address: event.fromAddress.toLowerCase(),
            tokenId: event.tokenId,
            clientId: event.clientId,
            projectId: event.projectId,
            walletId: event.walletId,
            netAmount: -amount,
            lastBlock: event.blockNumber,
          });
        }
      }
    }

    // Upsert materialized balances
    let updated = 0;
    for (const entry of balanceMap.values()) {
      if (!entry.clientId) continue;

      await this.prisma.materializedBalance.upsert({
        where: {
          uq_chain_addr_token: {
            chainId,
            address: entry.address,
            tokenId: entry.tokenId,
          },
        },
        update: {
          balance: new Prisma.Decimal(entry.netAmount.toString()),
          lastUpdatedBlock: entry.lastBlock,
          lastUpdatedAt: new Date(),
        },
        create: {
          chainId,
          address: entry.address,
          tokenId: entry.tokenId,
          clientId: entry.clientId,
          projectId: entry.projectId ?? BigInt(0),
          walletId: entry.walletId,
          balance: new Prisma.Decimal(entry.netAmount.toString()),
          lastUpdatedBlock: entry.lastBlock,
          lastUpdatedAt: new Date(),
        },
      });
      updated++;
    }

    this.logger.log(
      `Materialized ${updated} balances for chain ${chainId} up to block ${upToBlock}`,
    );

    return updated;
  }
}
