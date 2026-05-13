import { Injectable, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

/**
 * Pull the last indexed block per chain from cvh_indexer.sync_cursors. The
 * indexer keeps this column up-to-date after every poll cycle (~30s), so
 * it lags the chain head by at most one tick — precise enough for live
 * confirmation counts. Cross-DB raw SQL because Prisma's model points at
 * cvh_wallets; the MySQL user already has SELECT on cvh_indexer.
 *
 * Returns a Map<chainId, lastBlock>. Chains without a cursor row (early
 * boot / never-indexed) are simply absent from the result; callers should
 * treat null as "head unknown, fall back to stored confirmations".
 */
async function fetchIndexerHeads(
  prisma: PrismaService,
  chainIds: number[],
): Promise<Map<number, bigint>> {
  if (chainIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    Array<{ chain_id: number; last_block: bigint }>
  >`
    SELECT chain_id, last_block
    FROM cvh_indexer.sync_cursors
    WHERE chain_id IN (${Prisma.join(chainIds)})
  `;
  const out = new Map<number, bigint>();
  for (const r of rows) out.set(r.chain_id, r.last_block);
  return out;
}

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
 * Surface the live on-chain confirmation count for a deposit row.
 *
 * The stored `confirmations` column is unreliable because:
 *   1. The confirmation-tracker stops polling once status reaches a terminal
 *      state (confirmed → swept), so the column freezes at whatever was
 *      written then.
 *   2. Polling-synth deposits never get tracker updates at all (the tracker
 *      skips rows whose tx_hash starts with "polling:") so the column stays
 *      at 0 forever.
 *   3. Manually reconciled rows had no backfill until recently.
 *
 * The truth is on-chain: confirmations = current_head - block_number, where
 * current_head is the chain's latest block. We use the indexer's last
 * indexed block (cvh_indexer.sync_cursors.last_block) as the head — that's
 * what the rest of the system relies on, and it lags real-time by at most
 * one poll cycle (~30s), which is plenty precise for "how confirmed is
 * this deposit?".
 *
 * Returned value:
 *   - 0 when blockNumber > currentBlock (shouldn't happen; defensive).
 *   - currentBlock - blockNumber when known.
 *   - As a floor, max(required, stored) for confirmed/swept rows (their
 *     mere existence in terminal state proves they reached confirmation
 *     depth at least once; protects against indexer lag making swept rows
 *     look unconfirmed).
 *   - Stored value when the indexer's last_block isn't known (early boot).
 */
function effectiveConfirmations(
  status: string,
  stored: number,
  required: number,
  blockNumber: bigint,
  indexerHead: bigint | null,
): number {
  if (indexerHead === null) {
    // No indexer cursor yet — fall back to old behaviour.
    if (status === 'confirmed' || status === 'swept') {
      return Math.max(stored, required);
    }
    return stored;
  }
  const diff = indexerHead - blockNumber;
  const live = diff > 0n ? Number(diff) : 0;
  if (status === 'confirmed' || status === 'swept') {
    // Floor at required so a swept row never shows fewer than its threshold —
    // even if the indexer is briefly behind the chain head.
    return Math.max(live, required);
  }
  return live;
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

    // Indexer head per chain — used to compute live confirmations dynamically
    // (currentBlock - blockNumber) instead of capping at requiredConfirmations.
    const chainIdsInPage = [...new Set(rows.map((r) => r.chainId))];
    const indexerHeads = await fetchIndexerHeads(this.prisma, chainIdsInPage);

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
          r.blockNumber,
          indexerHeads.get(r.chainId) ?? null,
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

    const [token, heads] = await Promise.all([
      this.prisma.token.findUnique({ where: { id: row.tokenId } }),
      fetchIndexerHeads(this.prisma, [row.chainId]),
    ]);
    const indexerHead = heads.get(row.chainId) ?? null;

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
        row.blockNumber,
        indexerHead,
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
