"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clientFetch } from "@/lib/api";
import {
  TransactionRow,
  type DepositRow,
} from "@/components/dashboard/transaction-row";

interface ApiDeposit {
  id: string;
  depositAddress: string;
  fromAddress: string;
  chainId: number;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  tokenDecimals: number | null;
  amount: string;
  amountUsd?: string | null;
  status: string;
  txHash: string;
  sweepTxHash: string | null;
  blockNumber: string;
  confirmations: number;
  requiredConfirmations: number;
  externalId: string | null;
  detectedAt: string;
  confirmedAt: string | null;
  sweptAt: string | null;
}

const chainNames: Record<number, string> = {
  1: "ETH",
  10: "OP",
  56: "BSC",
  137: "POL",
  8453: "BASE",
  42161: "ARB",
  43114: "AVAX",
  11155111: "SEP",
  97: "TBSC",
};

interface RecentTransactionsProps {
  /** How many rows to load. Defaults to 12. */
  limit?: number;
  /** Auto-refresh interval in ms. Defaults to 15s. Set to 0 to disable. */
  refreshMs?: number;
}

/**
 * Recent Transactions widget for the dashboard.
 *
 * Pulls the most recent deposits from /v1/deposits and renders each as a
 * collapsible <TransactionRow>. Auto-refreshes every 15s (visibility-aware
 * so background tabs don't burn the API).
 */
export function RecentTransactions({
  limit = 12,
  refreshMs = 15_000,
}: RecentTransactionsProps) {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await clientFetch<{
          success: boolean;
          deposits: ApiDeposit[];
        }>(`/v1/deposits?limit=${limit}`);
        if (cancelled) return;
        const deposits = res.deposits ?? [];
        setRows(
          deposits.map((d) => ({
            id: d.id,
            depositAddress: d.depositAddress,
            fromAddress: d.fromAddress,
            chainId: d.chainId,
            chainName: chainNames[d.chainId] ?? `${d.chainId}`,
            tokenSymbol: d.tokenSymbol,
            tokenAddress: d.tokenAddress,
            tokenDecimals: d.tokenDecimals,
            amount: d.amount,
            amountUsd: d.amountUsd ?? null,
            status: d.status,
            txHash: d.txHash,
            sweepTxHash: d.sweepTxHash,
            blockNumber: d.blockNumber,
            confirmations: d.confirmations ?? 0,
            requiredConfirmations: d.requiredConfirmations ?? 0,
            externalId: d.externalId,
            detectedAt:
              typeof d.detectedAt === "string"
                ? d.detectedAt
                : new Date(d.detectedAt as any).toISOString(),
            confirmedAt:
              d.confirmedAt && typeof d.confirmedAt === "string"
                ? d.confirmedAt
                : d.confirmedAt
                  ? new Date(d.confirmedAt as any).toISOString()
                  : null,
            sweptAt:
              d.sweptAt && typeof d.sweptAt === "string"
                ? d.sweptAt
                : d.sweptAt
                  ? new Date(d.sweptAt as any).toISOString()
                  : null,
          })),
        );
        setLastFetched(new Date());
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load deposits");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOnce();

    if (refreshMs <= 0) return () => { cancelled = true; };

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(fetchOnce, refreshMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    if (typeof document === "undefined" || !document.hidden) start();

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        fetchOnce();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [limit, refreshMs]);

  return (
    <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-card-p py-4 border-b border-border-subtle">
        <div className="text-subheading font-display flex items-center gap-2">
          <span className="w-2 h-2 rounded-pill bg-accent-primary animate-pulse" />
          Recent Transactions
        </div>
        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="text-[10px] text-text-muted font-display">
              Refreshed {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <Link
            href="/deposits"
            className="text-accent-primary text-micro font-semibold font-display no-underline hover:underline"
          >
            View all deposits →
          </Link>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="px-card-p py-8 text-center text-text-muted font-display text-caption">
          Loading recent transactions…
        </div>
      ) : error && rows.length === 0 ? (
        <div className="px-card-p py-8 text-center text-status-error font-display text-caption">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-card-p py-8 text-center text-text-muted font-display text-caption">
          No deposits yet — they'll appear here once detected on-chain.
        </div>
      ) : (
        <div>
          {rows.map((r) => (
            <TransactionRow key={r.id} deposit={r} />
          ))}
        </div>
      )}
    </div>
  );
}
