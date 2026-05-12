"use client";

import { useEffect, useState, useCallback } from "react";
import { clientFetch } from "@/lib/api";

interface ApiBalance {
  tokenId: number;
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  isNative: boolean;
  balanceRaw: string;
  balanceFormatted: string;
  priceUsd: string | null;
  valueUsd: string | null;
}

interface BalancesResponse {
  success: boolean;
  depositAddressId: number;
  address: string;
  chainId: number;
  isDeployed: boolean;
  balances: ApiBalance[];
  totalUsd: string | null;
  fetchedAt: string;
}

interface BalanceMatrixProps {
  depositAddressId: number;
  /** Auto-refresh interval in ms. Defaults to 10s. Set to 0 to disable. */
  refreshMs?: number;
  /** Fires after every successful fetch — used by the card to flip the
   *  status badge when a previously empty address receives funds. */
  onFetched?: (balances: ApiBalance[]) => void;
}

/**
 * On-chain balance grid for a single deposit address.
 *
 * Hits POST /client/v1/deposit-addresses/:id/balances which does a Multicall3
 * batch (native + default ERC20s) and returns fresh, uncached numbers.
 *
 * Auto-refreshes every 10s by default so the UI reflects the lazy-deploy
 * lifecycle in near-real-time: once the forwarder is deployed and swept,
 * balances drop back to zero within one refresh tick.
 *
 * Polling pauses when the document is hidden (tab in background) to avoid
 * burning RPC quota for nobody.
 */
export function BalanceMatrix({
  depositAddressId,
  refreshMs = 10_000,
  onFetched,
}: BalanceMatrixProps) {
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await clientFetch<BalancesResponse>(
        `/v1/deposit-addresses/${depositAddressId}/balances`,
        { method: "POST" },
      );
      setData(res);
      setLastFetched(new Date());
      setError(null);
      onFetched?.(res.balances ?? []);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch balances");
    } finally {
      setLoading(false);
    }
  }, [depositAddressId, onFetched]);

  useEffect(() => {
    fetchOnce();
    if (refreshMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(fetchOnce, refreshMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (typeof document !== "undefined" && document.hidden) {
      // Don't start polling until the tab becomes visible.
    } else {
      start();
    }

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
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOnce, refreshMs]);

  if (loading && !data) {
    return (
      <div className="text-caption text-text-muted font-display py-2">
        Loading balances…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-caption text-status-error font-display py-2">
        {error}
      </div>
    );
  }

  const balances = data?.balances ?? [];
  const nonZero = balances.filter((b) => b.balanceRaw !== "0");
  const visible = nonZero.length > 0 ? nonZero : balances;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
          On-chain balances
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-pill bg-accent-primary animate-pulse" />
          <span className="text-[9px] text-text-muted font-display">
            {lastFetched
              ? `Refreshed ${lastFetched.toLocaleTimeString()}`
              : "Refreshing…"}
          </span>
        </div>
      </div>

      <div className="rounded-input border border-border-subtle bg-surface-input overflow-hidden">
        <table className="w-full text-caption font-display">
          <thead>
            <tr className="bg-surface-elevated border-b border-border-subtle">
              <th className="text-left text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                Token
              </th>
              <th className="text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                Balance
              </th>
              <th className="text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                USD
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr
                key={`${b.tokenId}-${b.contractAddress}`}
                className="border-b border-border-subtle last:border-b-0"
              >
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-text-primary">
                      {b.symbol}
                    </span>
                    {b.isNative && (
                      <span className="text-[9px] uppercase tracking-[0.08em] text-text-muted">
                        native
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-text-muted truncate max-w-[180px]">
                    {b.name}
                  </div>
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono">
                  <span
                    className={
                      b.balanceRaw !== "0"
                        ? "text-text-primary"
                        : "text-text-muted"
                    }
                  >
                    {formatBalance(b.balanceFormatted)}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono">
                  <span className="text-text-muted">
                    {b.valueUsd ? `$${b.valueUsd}` : "—"}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-2.5 py-3 text-center text-text-muted text-caption font-display"
                >
                  No default tokens configured for this chain.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.totalUsd && (
        <div className="flex justify-end mt-1.5">
          <span className="text-caption font-semibold font-display">
            Total: <span className="font-mono">${data.totalUsd}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function formatBalance(s: string): string {
  if (!s) return "0";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 1000) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
