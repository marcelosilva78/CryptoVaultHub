"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

/* ── Types ── */
interface ChainHealth {
  chainId: number;
  chainName: string;
  lastBlock: number;
  latestFinalizedBlock: number;
  chainHeadBlock: number;
  blocksBehind: number;
  status: "healthy" | "degraded" | "critical" | "error";
  gapCount: number;
  lastUpdated: string;
  lastError: string | null;
}

interface SyncGap {
  id: number;
  chainId: number;
  gapStartBlock: number;
  gapEndBlock: number;
  status: "detected" | "backfilling" | "resolved" | "failed";
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  detectedAt: string;
  resolvedAt: string | null;
}

/* ── Mock Data ── */
const mockChains: ChainHealth[] = [
  {
    chainId: 1,
    chainName: "Ethereum Mainnet",
    lastBlock: 19500000,
    latestFinalizedBlock: 19499936,
    chainHeadBlock: 19500003,
    blocksBehind: 3,
    status: "healthy",
    gapCount: 0,
    lastUpdated: new Date().toISOString(),
    lastError: null,
  },
  {
    chainId: 56,
    chainName: "BNB Smart Chain",
    lastBlock: 38900450,
    latestFinalizedBlock: 38900435,
    chainHeadBlock: 38900460,
    blocksBehind: 10,
    status: "degraded",
    gapCount: 2,
    lastUpdated: new Date().toISOString(),
    lastError: null,
  },
  {
    chainId: 137,
    chainName: "Polygon",
    lastBlock: 55000100,
    latestFinalizedBlock: 54999844,
    chainHeadBlock: 55000150,
    blocksBehind: 50,
    status: "degraded",
    gapCount: 1,
    lastUpdated: new Date().toISOString(),
    lastError: null,
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    lastBlock: 195000000,
    latestFinalizedBlock: 194999999,
    chainHeadBlock: 195000001,
    blocksBehind: 1,
    status: "healthy",
    gapCount: 0,
    lastUpdated: new Date().toISOString(),
    lastError: null,
  },
  {
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    lastBlock: 5800000,
    latestFinalizedBlock: 5799936,
    chainHeadBlock: 5800000,
    blocksBehind: 0,
    status: "healthy",
    gapCount: 0,
    lastUpdated: new Date().toISOString(),
    lastError: null,
  },
];

const mockGaps: SyncGap[] = [
  {
    id: 1,
    chainId: 56,
    gapStartBlock: 38899200,
    gapEndBlock: 38899350,
    status: "detected",
    attemptCount: 0,
    maxAttempts: 5,
    lastError: null,
    detectedAt: new Date(Date.now() - 3600000).toISOString(),
    resolvedAt: null,
  },
  {
    id: 2,
    chainId: 56,
    gapStartBlock: 38899800,
    gapEndBlock: 38899900,
    status: "backfilling",
    attemptCount: 1,
    maxAttempts: 5,
    lastError: null,
    detectedAt: new Date(Date.now() - 1800000).toISOString(),
    resolvedAt: null,
  },
  {
    id: 3,
    chainId: 137,
    gapStartBlock: 54999000,
    gapEndBlock: 54999100,
    status: "failed",
    attemptCount: 5,
    maxAttempts: 5,
    lastError: "RPC timeout after 30s",
    detectedAt: new Date(Date.now() - 7200000).toISOString(),
    resolvedAt: null,
  },
];

/* ── Gap Row ── */
function GapRow({
  gap,
  onRetry,
  retrying,
}: {
  gap: SyncGap;
  onRetry: (id: number) => void;
  retrying: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface-elevated/50 rounded-button text-caption">
      <div className="flex items-center gap-4">
        <span className="font-mono text-text-primary">
          {gap.gapStartBlock.toLocaleString()} - {gap.gapEndBlock.toLocaleString()}
        </span>
        <StatusBadge status={gap.status} />
        <span className="text-text-muted">
          Attempts: {gap.attemptCount}/{gap.maxAttempts}
        </span>
        {gap.lastError && (
          <span className="text-status-error truncate max-w-[200px]" title={gap.lastError}>
            {gap.lastError}
          </span>
        )}
      </div>
      {(gap.status === "detected" || gap.status === "failed") && (
        <button
          onClick={() => onRetry(gap.id)}
          disabled={retrying}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-button text-[11px] font-semibold font-display",
            "border border-border-default text-text-secondary",
            "hover:border-accent-primary hover:text-accent-primary",
            "transition-all duration-fast",
            retrying && "opacity-50 cursor-not-allowed"
          )}
        >
          <RotateCcw className={cn("w-3 h-3", retrying && "animate-spin")} />
          Retry
        </button>
      )}
    </div>
  );
}

/* ── Chain Card ── */
function ChainCard({
  chain,
  gaps,
  onRetryGap,
  retryingGapId,
}: {
  chain: ChainHealth;
  gaps: SyncGap[];
  onRetryGap: (id: number) => void;
  retryingGapId: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const chainGaps = gaps.filter((g) => g.chainId === chain.chainId);

  return (
    <div className="bg-surface-card border border-border-default rounded-card shadow-card transition-all duration-fast hover:border-accent-primary/20 group relative overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

      <div className="p-card-p">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold text-text-primary font-display">
              {chain.chainName}
            </span>
            <span className="text-micro text-text-muted font-mono">
              #{chain.chainId}
            </span>
          </div>
          <StatusBadge status={chain.status} />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <div className="text-micro text-text-muted uppercase tracking-wider font-display">
              Last Block
            </div>
            <div className="text-caption font-mono text-text-primary">
              {chain.lastBlock.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-micro text-text-muted uppercase tracking-wider font-display">
              Finalized
            </div>
            <div className="text-caption font-mono text-text-primary">
              {chain.latestFinalizedBlock.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-micro text-text-muted uppercase tracking-wider font-display">
              Blocks Behind
            </div>
            <div
              className={cn(
                "text-caption font-mono font-semibold",
                chain.blocksBehind <= 5
                  ? "text-status-success"
                  : chain.blocksBehind <= 50
                    ? "text-status-warning"
                    : "text-status-error"
              )}
            >
              {chain.blocksBehind}
            </div>
          </div>
          <div>
            <div className="text-micro text-text-muted uppercase tracking-wider font-display">
              Open Gaps
            </div>
            <div
              className={cn(
                "text-caption font-mono font-semibold",
                chain.gapCount === 0
                  ? "text-status-success"
                  : "text-status-warning"
              )}
            >
              {chain.gapCount}
            </div>
          </div>
        </div>

        {/* Error display */}
        {chain.lastError && (
          <div className="text-micro text-status-error bg-status-error/5 rounded-button px-2 py-1 mb-3 truncate">
            {chain.lastError}
          </div>
        )}

        {/* Expandable gap list */}
        {chainGaps.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary transition-colors duration-fast font-display"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              {chainGaps.length} gap{chainGaps.length > 1 ? "s" : ""}
            </button>

            {expanded && (
              <div className="mt-2 flex flex-col gap-1.5">
                {chainGaps.map((gap) => (
                  <GapRow
                    key={gap.id}
                    gap={gap}
                    onRetry={onRetryGap}
                    retrying={retryingGapId === gap.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Last updated */}
        <div className="text-micro text-text-muted mt-3 font-mono">
          Updated{" "}
          {new Date(chain.lastUpdated).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

/* ── API helper ── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ── Page ── */
export default function SyncHealthPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [chains, setChains] = useState<ChainHealth[]>(mockChains);
  const [gaps, setGaps] = useState<SyncGap[]>(mockGaps);
  const [retryingGapId, setRetryingGapId] = useState<number | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [healthData, gapsData] = await Promise.all([
        adminFetch("/sync-management/health"),
        adminFetch("/sync-management/gaps"),
      ]);
      if (Array.isArray(healthData)) setChains(healthData);
      if (Array.isArray(gapsData)) setGaps(gapsData);
    } catch (err: any) { console.error(err); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const handleRetryGap = useCallback(async (gapId: number) => {
    setRetryingGapId(gapId);
    try {
      await adminFetch(`/sync-management/gaps/${gapId}/retry`, { method: "POST" });
      const gapsData = await adminFetch("/sync-management/gaps");
      if (Array.isArray(gapsData)) setGaps(gapsData);
    } catch (err: any) { alert(err.message); }
    finally { setRetryingGapId(null); }
  }, []);

  // Compute overall health
  const overallStatus = chains.every((c) => c.status === "healthy")
    ? "healthy"
    : chains.some((c) => c.status === "error" || c.status === "critical")
      ? "critical"
      : "degraded";

  const totalBlocksBehind = chains.reduce((sum, c) => sum + c.blocksBehind, 0);
  const totalGaps = chains.reduce((sum, c) => sum + c.gapCount, 0);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] font-display">
            Chain Indexer Sync Health
          </div>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={overallStatus} />
            <span className="text-caption text-text-muted font-display">
              {chains.length} chains monitored
            </span>
            <span className="text-caption text-text-muted font-mono">
              {totalBlocksBehind} blocks behind
            </span>
            {totalGaps > 0 && (
              <span className="text-caption text-status-warning font-mono">
                {totalGaps} open gap{totalGaps > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex items-center gap-1.5 bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display",
            refreshing && "border-accent-primary text-accent-primary"
          )}
        >
          <RefreshCw
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              refreshing && "animate-spin"
            )}
          />
          Refresh
        </button>
      </div>

      {/* Chain cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {chains.map((chain) => (
          <ChainCard
            key={chain.chainId}
            chain={chain}
            gaps={gaps}
            onRetryGap={handleRetryGap}
            retryingGapId={retryingGapId}
          />
        ))}
      </div>
    </>
  );
}
