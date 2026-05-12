import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

interface ListDepositsParams {
  page: number;
  limit: number;
  status?: string;
  chainId?: number;
  fromDate?: string;
  toDate?: string;
}

@Injectable()
export class DepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async list(clientId: number, params: ListDepositsParams) {
    const { page, limit, status, chainId, fromDate, toDate } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { clientId: BigInt(clientId) };
    if (status) where.status = status;
    if (chainId) where.chainId = chainId;
    if (fromDate || toDate) {
      where.detectedAt = {};
      if (fromDate) where.detectedAt.gte = new Date(fromDate);
      if (toDate) where.detectedAt.lte = new Date(toDate);
    }

    const [rows, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deposit.count({ where }),
    ]);

    const tokenIds = [...new Set(rows.map((r) => r.tokenId))];
    const tokens = tokenIds.length
      ? await this.prisma.token.findMany({ where: { id: { in: tokenIds } } })
      : [];
    const tokenMap = new Map(tokens.map((t) => [t.id.toString(), t]));

    // Resolve USD prices for every distinct token referenced in this page
    // of results. CoinGecko lookups are cached for 5min so the cost amortises
    // across requests/dashboard refreshes.
    const coingeckoIds = tokens
      .map((t) => t.coingeckoId)
      .filter((x): x is string => !!x);
    const prices = coingeckoIds.length
      ? await this.pricing.getPricesUsd(coingeckoIds)
      : {};

    const deposits = rows.map((r) => {
      const token = tokenMap.get(r.tokenId.toString());
      let amountUsd: string | null = null;
      let priceUsd: string | null = null;
      if (token?.coingeckoId) {
        const p = prices[token.coingeckoId];
        if (typeof p === 'number') {
          priceUsd = p.toString();
          const amt = Number(r.amount);
          if (Number.isFinite(amt)) amountUsd = (amt * p).toFixed(2);
        }
      }
      return {
        id: r.id.toString(),
        depositAddress: r.forwarderAddress,
        address: r.forwarderAddress,
        chainId: r.chainId,
        tokenId: Number(r.tokenId),
        tokenSymbol: token?.symbol ?? null,
        tokenAddress: token?.contractAddress ?? null,
        tokenDecimals: token?.decimals ?? null,
        amount: r.amount,
        amountRaw: r.amountRaw,
        amountUsd,
        priceUsd,
        status: r.status,
        txHash: r.txHash,
        blockNumber: r.blockNumber.toString(),
        fromAddress: r.fromAddress,
        confirmations: r.confirmations,
        requiredConfirmations: r.confirmationsRequired,
        sweepTxHash: r.sweepTxHash,
        externalId: r.externalId,
        detectedAt: r.detectedAt,
        confirmedAt: r.confirmedAt,
        sweptAt: r.sweptAt,
      };
    });

    return {
      deposits,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOne(clientId: number, id: string) {
    const numericId = /^\d+$/.test(id) ? BigInt(id) : null;
    const where = numericId !== null
      ? { id: numericId, clientId: BigInt(clientId) }
      : { externalId: id, clientId: BigInt(clientId) };

    const row = await this.prisma.deposit.findFirst({ where });
    if (!row) throw new NotFoundException(`Deposit ${id} not found`);

    const token = await this.prisma.token.findUnique({
      where: { id: row.tokenId },
    });

    return {
      id: row.id.toString(),
      depositAddress: row.forwarderAddress,
      address: row.forwarderAddress,
      chainId: row.chainId,
      tokenId: Number(row.tokenId),
      tokenSymbol: token?.symbol ?? null,
      tokenAddress: token?.contractAddress ?? null,
      tokenDecimals: token?.decimals ?? null,
      amount: row.amount,
      amountRaw: row.amountRaw,
      status: row.status,
      txHash: row.txHash,
      blockNumber: row.blockNumber.toString(),
      fromAddress: row.fromAddress,
      confirmations: row.confirmations,
      requiredConfirmations: row.confirmationsRequired,
      sweepTxHash: row.sweepTxHash,
      externalId: row.externalId,
      detectedAt: row.detectedAt,
      confirmedAt: row.confirmedAt,
      sweptAt: row.sweptAt,
    };
  }
}
