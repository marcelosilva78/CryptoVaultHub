import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const EXPLORER_MAP: Record<number, string> = {
  1: 'https://etherscan.io/tx',
  56: 'https://bscscan.com/tx',
  137: 'https://polygonscan.com/tx',
  42161: 'https://arbiscan.io/tx',
  10: 'https://optimistic.etherscan.io/tx',
  43114: 'https://snowtrace.io/tx',
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly chainIndexerUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    };
  }

  async getRecentTransactions(limit: number) {
    // 1. Fetch raw events from chain-indexer
    let events: any[] = [];
    try {
      const { data } = await axios.get(
        `${this.chainIndexerUrl}/events/recent`,
        { headers: this.headers, params: { limit }, timeout: 10000 },
      );
      events = Array.isArray(data?.events) ? data.events : [];
    } catch (err) {
      this.logger.warn(
        `Failed to fetch recent events: ${(err as Error).message}`,
      );
      return { transactions: [] };
    }

    if (events.length === 0) return { transactions: [] };

    // 2. Enrich with client names (batch — no N+1)
    const clientIds = [
      ...new Set(
        events
          .map((e: any) => e.clientId)
          .filter((id): id is number => id != null),
      ),
    ];
    const clients =
      clientIds.length > 0
        ? await this.prisma.client.findMany({
            where: { id: { in: clientIds.map(BigInt) } },
            select: { id: true, name: true },
          })
        : [];
    const clientMap = new Map(clients.map((c) => [Number(c.id), c.name]));

    // 3. Build enriched response
    return {
      transactions: events.map((e: any) => ({
        id: e.id,
        txHash: e.txHash,
        chainId: e.chainId,
        chainName: e.chainName ?? null,
        blockNumber: e.blockNumber,
        eventType: e.eventType,
        isInbound: e.isInbound ?? null,
        fromAddress: e.fromAddress ?? null,
        toAddress: e.toAddress ?? null,
        contractAddress: e.contractAddress ?? null,
        amount: e.amount ?? null,
        tokenSymbol: e.tokenSymbol ?? null,
        tokenDecimals: e.tokenDecimals ?? null,
        logIndex: e.logIndex ?? null,
        clientId: e.clientId ?? null,
        clientName: e.clientId != null ? (clientMap.get(e.clientId) ?? null) : null,
        walletId: e.walletId ?? null,
        walletLabel: e.walletId != null ? `Wallet #${e.walletId}` : null,
        rawData: e.rawData ?? null,
        processedAt: e.processedAt ?? null,
        explorerUrl:
          e.txHash != null && EXPLORER_MAP[e.chainId] != null
            ? `${EXPLORER_MAP[e.chainId]}/${e.txHash}`
            : null,
      })),
    };
  }
}
