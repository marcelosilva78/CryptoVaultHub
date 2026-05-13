import { Injectable, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

/**
 * Date range parsing.
 *
 * The filter accepts either a bare YYYY-MM-DD (treated inclusively — fromDate
 * is start-of-day, toDate is end-of-day) or a full ISO-8601 timestamp (used
 * verbatim). Without this, `toDate=2026-05-12` would become 00:00:00Z and
 * silently exclude every deposit that arrived later on the same day — a
 * surprise that produces empty result sets the user can't debug.
 */
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseFromDate(s: string): Date {
  if (BARE_DATE_RE.test(s)) return new Date(`${s}T00:00:00.000Z`);
  return new Date(s);
}
function parseToDate(s: string): Date {
  if (BARE_DATE_RE.test(s)) return new Date(`${s}T23:59:59.999Z`);
  return new Date(s);
}

/**
 * Normalize the on-chain confirmation count for a deposit row.
 *
 * The stored `confirmations` column is written by the confirmation-tracker
 * as it polls. Two cases produce a stale value:
 *
 *   1. Polling-synth deposits: txHash is a `polling:<block>:<addr>` placeholder
 *      and the tracker skips them, so `confirmations` stays at 0 forever.
 *   2. Manually reconciled rows: when the post-deploy reconciler promotes a
 *      row to `swept` (or the gas-tank receipt reconciler does the same), it
 *      previously didn't backfill `confirmations`.
 *
 * For terminal-success statuses (`confirmed`, `swept`), the deposit by
 * definition reached confirmation depth — otherwise the sweep would not have
 * happened. So we surface `max(stored, required)` for those rows. For other
 * statuses we pass the raw value through.
 */
function effectiveConfirmations(
  status: string,
  stored: number,
  required: number,
): number {
  if (status === 'confirmed' || status === 'swept') {
    return Math.max(stored, required);
  }
  return stored;
}

/**
 * Coerce a stored deposit amount into a human-readable token-units string.
 *
 * Background: producers in this codebase disagree about what goes into
 * `deposits.amount`. The polling-synth path writes raw wei (because it reads
 * the balance delta directly), while the event-detection path writes humanized
 * units. We treat `amountRaw` as the single source of truth (the column is
 * documented as raw wei in the schema) and derive `amount` from it on the way
 * out. If `amountRaw` itself isn't a valid bigint, we fall back to the stored
 * `amount` rather than dying — the row is still useful for the rest of the UI.
 */
function humanizeAmount(amountRaw: string, fallback: string, decimals: number): string {
  try {
    return ethers.formatUnits(amountRaw, decimals);
  } catch {
    return fallback;
  }
}

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
      if (fromDate) where.detectedAt.gte = parseFromDate(fromDate);
      if (toDate) where.detectedAt.lte = parseToDate(toDate);
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
      const decimals = token?.decimals ?? 18;
      const humanAmount = humanizeAmount(r.amountRaw, r.amount, decimals);
      let amountUsd: string | null = null;
      let priceUsd: string | null = null;
      if (token?.coingeckoId) {
        const p = prices[token.coingeckoId];
        if (typeof p === 'number') {
          priceUsd = p.toString();
          const amt = Number(humanAmount);
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
        amount: humanAmount,
        amountRaw: r.amountRaw,
        amountUsd,
        priceUsd,
        status: r.status,
        txHash: r.txHash,
        blockNumber: r.blockNumber.toString(),
        fromAddress: r.fromAddress,
        confirmations: effectiveConfirmations(
          r.status,
          r.confirmations,
          r.confirmationsRequired,
        ),
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

    const decimals = token?.decimals ?? 18;
    const humanAmount = humanizeAmount(row.amountRaw, row.amount, decimals);

    return {
      id: row.id.toString(),
      depositAddress: row.forwarderAddress,
      address: row.forwarderAddress,
      chainId: row.chainId,
      tokenId: Number(row.tokenId),
      tokenSymbol: token?.symbol ?? null,
      tokenAddress: token?.contractAddress ?? null,
      tokenDecimals: token?.decimals ?? null,
      amount: humanAmount,
      amountRaw: row.amountRaw,
      status: row.status,
      txHash: row.txHash,
      blockNumber: row.blockNumber.toString(),
      fromAddress: row.fromAddress,
      confirmations: effectiveConfirmations(
        row.status,
        row.confirmations,
        row.confirmationsRequired,
      ),
      requiredConfirmations: row.confirmationsRequired,
      sweepTxHash: row.sweepTxHash,
      externalId: row.externalId,
      detectedAt: row.detectedAt,
      confirmedAt: row.confirmedAt,
      sweptAt: row.sweptAt,
    };
  }
}
