# Phase 3+4: Frontend Chains & RPC Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Chains page from raw useState/useEffect to React Query with component decomposition, and enhance the RPC Providers page with health scores and quota progress bars.

**Architecture:** Both pages already work functionally. Phase 3 decomposes the monolithic chains/page.tsx (~500 lines) into focused sub-components using `useQuery`/`useMutation` wrapping the existing `adminFetch()` helper (30s polling via `refetchInterval`). Phase 4 adds health/quota visuals to the RPC Providers page and removes the hardcoded CHAINS_FALLBACK. The two pages are independent and can be built in parallel.

**Tech Stack:** Next.js 14 (App Router), React 18, @tanstack/react-query 5.x, Tailwind CSS 3.x, Lucide React icons

**Design Spec:** `docs/superpowers/specs/2026-04-13-chains-feature-evolution-design.md` sections 7.1-7.4

---

## Dependency Graph

```
Task 1 (Chains hooks + types) ──► Task 2 (Chains page decomposition)
Task 3 (RPC Providers enhancement) ── independent
```

**Parallel:** Tasks 1 and 3 are independent — run simultaneously. Task 2 depends on Task 1.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/admin/app/chains/hooks.ts` | React Query hooks wrapping adminFetch for chains endpoints |
| `apps/admin/app/chains/types.ts` | ChainHealth, ChainDetail, lifecycle types |
| `apps/admin/app/chains/components/chain-stat-cards.tsx` | 4 KPI stat cards with auto-refresh indicator |
| `apps/admin/app/chains/components/chain-table.tsx` | Health data table with expandable rows |
| `apps/admin/app/chains/components/chain-detail-panel.tsx` | Expandable row detail with 4-column metrics |
| `apps/admin/app/chains/components/lifecycle-modal.tsx` | Drain/Deactivate/Archive/Reactivate modals |
| `apps/admin/app/chains/components/add-chain-modal.tsx` | Add chain form |
| `apps/admin/app/chains/components/edit-chain-modal.tsx` | Edit chain form |

### Modified Files
| File | Change |
|------|--------|
| `apps/admin/app/chains/page.tsx` | Slim down to composition of sub-components via hooks |
| `apps/admin/app/rpc-providers/page.tsx` | Add health score display, quota progress bars, remove CHAINS_FALLBACK |

---

## Task 1: Chains Hooks & Types

**Files:**
- Create: `apps/admin/app/chains/types.ts`
- Create: `apps/admin/app/chains/hooks.ts`

- [ ] **Step 1: Create types.ts with all chain interfaces**

Extract types from the current `page.tsx` and enhance with Phase 2 fields:

```typescript
// apps/admin/app/chains/types.ts

export interface ChainHealth {
  chainId: number;
  name: string;
  shortName: string;
  symbol: string;
  status: "active" | "draining" | "inactive" | "archived";
  blockTimeSeconds: number | null;
  health: {
    overall: "healthy" | "degraded" | "critical" | "error" | "unknown";
    lastBlock: number | null;
    blocksBehind: number | null;
    lastCheckedAt: string | null;
    staleSince: string | null;
  };
  rpc: {
    totalNodes: number;
    activeNodes: number;
    healthyNodes: number;
    avgLatencyMs: number | null;
    quotaStatus: "available" | "approaching" | "daily_exhausted" | "monthly_exhausted";
  };
  operations: {
    pendingDeposits: number;
    pendingWithdrawals: number;
    pendingFlushes: number;
  };
}

export interface ChainDetail {
  chain: Record<string, any>;
  dependencies: {
    rpcNodes: { total: number; active: number };
    clients: { total: number };
    tokens: { total: number };
    wallets: number | { total: number };
    depositAddresses: { total: number; deployed: number };
    deposits: { total: number; pending: number };
    withdrawals: { total: number; pending: number };
    flushOperations: { total: number; pending: number };
    gasTanks: number | { total: number };
  };
  canTransitionTo: string[];
}

export interface ChainsHealthResponse {
  chains: ChainHealth[];
  updatedAt: string;
}

export type LifecycleAction = "drain" | "deactivate" | "archive" | "reactivate";
```

- [ ] **Step 2: Create hooks.ts with React Query hooks**

```typescript
// apps/admin/app/chains/hooks.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import type { ChainsHealthResponse, ChainDetail, LifecycleAction } from "./types";

const CHAIN_KEYS = {
  health: ["chains", "health"] as const,
  detail: (chainId: number) => ["chains", "detail", chainId] as const,
  list: ["chains", "list"] as const,
};

export function useChainsHealth() {
  return useQuery<ChainsHealthResponse>({
    queryKey: CHAIN_KEYS.health,
    queryFn: () => adminFetch("/chains/health"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useChainDetail(chainId: number | null) {
  return useQuery<ChainDetail>({
    queryKey: CHAIN_KEYS.detail(chainId!),
    queryFn: () => adminFetch(`/chains/${chainId}`),
    enabled: chainId !== null,
  });
}

export function useAddChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminFetch("/chains", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAIN_KEYS.health });
      qc.invalidateQueries({ queryKey: CHAIN_KEYS.list });
    },
  });
}

export function useUpdateChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, data }: { chainId: number; data: Record<string, unknown> }) =>
      adminFetch(`/chains/${chainId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_r, { chainId }) => {
      qc.invalidateQueries({ queryKey: CHAIN_KEYS.health });
      qc.invalidateQueries({ queryKey: CHAIN_KEYS.detail(chainId) });
    },
  });
}

export function useChainLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, action, reason }: { chainId: number; action: LifecycleAction; reason: string }) =>
      adminFetch(`/chains/${chainId}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: (_r, { chainId }) => {
      qc.invalidateQueries({ queryKey: CHAIN_KEYS.health });
      qc.invalidateQueries({ queryKey: CHAIN_KEYS.detail(chainId) });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/chains/types.ts apps/admin/app/chains/hooks.ts
git commit -m "feat(chains): add React Query hooks and typed interfaces for chains page"
```

---

## Task 2: Chains Page Component Decomposition

**Files:**
- Create: `apps/admin/app/chains/components/chain-stat-cards.tsx`
- Create: `apps/admin/app/chains/components/chain-table.tsx`
- Create: `apps/admin/app/chains/components/chain-detail-panel.tsx`
- Create: `apps/admin/app/chains/components/lifecycle-modal.tsx`
- Create: `apps/admin/app/chains/components/add-chain-modal.tsx`
- Create: `apps/admin/app/chains/components/edit-chain-modal.tsx`
- Modify: `apps/admin/app/chains/page.tsx`

**Depends on:** Task 1

- [ ] **Step 1: Create chain-stat-cards.tsx**

Extract the 4 stat cards and add auto-refresh indicator ("Updated Xs ago"):

```typescript
// apps/admin/app/chains/components/chain-stat-cards.tsx
"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { ChainHealth } from "../types";

interface Props {
  chains: ChainHealth[];
  updatedAt: string | undefined;
  isRefetching: boolean;
}

export function ChainStatCards({ chains, updatedAt, isRefetching }: Props) {
  const [ago, setAgo] = useState("");

  useEffect(() => {
    if (!updatedAt) return;
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
      setAgo(s < 5 ? "just now" : `${s}s ago`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [updatedAt]);

  const active = chains.filter((c) => c.status === "active" || c.status === "draining").length;
  const healthy = chains.filter((c) => c.health.overall === "healthy").length;
  const degraded = chains.filter((c) => c.health.overall === "degraded").length;
  const critical = chains.filter((c) => c.health.overall === "critical" || c.health.overall === "error").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-caption text-text-muted font-display">
        <RefreshCw className={`w-3 h-3 ${isRefetching ? "animate-spin text-accent-primary" : ""}`} />
        <span>Updated {ago || "—"}</span>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Chains" value={active} variant="accent" />
        <StatCard label="Healthy" value={healthy} variant="success" />
        <StatCard label="Degraded" value={degraded} variant="warning" />
        <StatCard label="Critical" value={critical} variant="error" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create chain-detail-panel.tsx**

Extract the `ChainDetailPanel` component from page.tsx. Replace raw `useEffect`+`adminFetch` with `useChainDetail` hook:

```typescript
// apps/admin/app/chains/components/chain-detail-panel.tsx
"use client";

import { Loader2, Pencil, Pause, Square, Archive, Play, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChainDetail } from "../hooks";

interface Props {
  chainId: number;
  onAction: (action: string) => void;
}

export function ChainDetailPanel({ chainId, onAction }: Props) {
  const { data: detail, isLoading } = useChainDetail(chainId);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-6 bg-surface-raised/30 border-t-2 border-accent-primary/30">
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading details...
          </div>
        </td>
      </tr>
    );
  }

  if (!detail) return null;

  const d = detail.dependencies;
  const c = detail.chain;
  const transitions = detail.canTransitionTo || [];

  // COPY THE FULL JSX from the current ChainDetailPanel in page.tsx (lines 136-227)
  // The JSX is identical — only the data fetching changed (useChainDetail instead of useEffect)
  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-surface-raised/50 border-t-2 border-accent-primary/30 px-6 py-4">
          {/* Action buttons */}
          <div className="flex gap-2 justify-end mb-4">
            <button onClick={() => onAction("edit")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-accent-primary border border-accent-primary/30 rounded-button hover:bg-accent-primary/10 transition-all duration-fast">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            {transitions.includes("drain") && (
              <button onClick={() => onAction("drain")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-warning border border-status-warning/30 rounded-button hover:bg-status-warning/10 transition-all duration-fast">
                <Pause className="w-3.5 h-3.5" /> Drain
              </button>
            )}
            {transitions.includes("deactivate") && (
              <button onClick={() => onAction("deactivate")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-error border border-status-error/30 rounded-button hover:bg-status-error/10 transition-all duration-fast">
                <Square className="w-3.5 h-3.5" /> Deactivate
              </button>
            )}
            {transitions.includes("archive") && (
              <button onClick={() => onAction("archive")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-text-muted border border-border-subtle rounded-button hover:bg-surface-hover transition-all duration-fast">
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {transitions.includes("reactivate") && (
              <button onClick={() => onAction("reactivate")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-success border border-status-success/30 rounded-button hover:bg-status-success/10 transition-all duration-fast">
                <Play className="w-3.5 h-3.5" /> Reactivate
              </button>
            )}
            {c.explorerUrl && (
              <a href={c.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display text-text-muted hover:text-accent-primary transition-all duration-fast">
                <ExternalLink className="w-3.5 h-3.5" /> Explorer
              </a>
            )}
          </div>

          {/* 4-column metrics grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Operations</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Clients</span><span className="text-text-primary font-semibold">{d.clients.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Wallets</span><span className="text-text-primary font-semibold">{typeof d.wallets === 'object' ? d.wallets.total || 0 : d.wallets}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Addresses</span><span className="text-text-primary font-semibold">{d.depositAddresses.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Deployed</span><span className="text-status-success font-semibold">{d.depositAddresses.deployed.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Transactions</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Deposits</span><span className="text-text-primary font-semibold">{d.deposits.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className={cn("font-semibold", d.deposits.pending > 0 ? "text-status-warning" : "text-text-primary")}>{d.deposits.pending} pending</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Withdrawals</span><span className="text-text-primary font-semibold">{d.withdrawals.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Flushes</span><span className="text-text-primary font-semibold">{d.flushOperations.total.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">RPC Nodes</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Total</span><span className="text-text-primary font-semibold">{d.rpcNodes.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Active</span><span className="text-status-success font-semibold">{d.rpcNodes.active}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Tokens</span><span className="text-text-primary font-semibold">{d.tokens.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Gas Tanks</span><span className="text-text-primary font-semibold">{typeof d.gasTanks === 'object' ? d.gasTanks.total || 0 : d.gasTanks}</span></div>
              </div>
            </div>
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Configuration</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Confirmations</span><span className="text-text-primary font-semibold">{c.confirmationsRequired || c.confirmationsDefault}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Finality</span><span className="text-text-primary font-semibold">{c.finalityThreshold || 32} blocks</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Gas Strategy</span><span className="text-text-primary font-semibold uppercase">{c.gasPriceStrategy || "eip1559"}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Testnet</span><span className="text-text-primary font-semibold">{c.isTestnet ? "Yes" : "No"}</span></div>
              </div>
            </div>
          </div>

          {/* Bottom info bar */}
          <div className="bg-surface-card border border-border-default rounded-card px-4 py-2.5 flex items-center justify-between text-caption text-text-muted font-display">
            <span>Created: <strong className="text-text-primary">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</strong></span>
            {c.statusReason && <span>Reason: <strong className="text-text-primary">{c.statusReason}</strong></span>}
          </div>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Create lifecycle-modal.tsx**

Extract the `LifecycleModal` component. Replace raw `adminFetch` with `useChainLifecycle` mutation hook:

The component should:
- Accept `chain: ChainHealth`, `action: LifecycleAction`, `onClose`, `onDone` props
- Use `useChainLifecycle()` mutation
- Keep the exact same UI (yellow for drain, red for deactivate/archive, green for reactivate)
- Type-to-confirm for deactivate/archive (type chain name in uppercase)
- Reason field with min 10 chars

Read the current `LifecycleModal` from `apps/admin/app/chains/page.tsx` (around line 436) and extract it, replacing `adminFetch` with `useChainLifecycle().mutateAsync()`.

- [ ] **Step 4: Create add-chain-modal.tsx**

Extract the `AddChainModal` component. Replace `adminFetch` with `useAddChain` mutation hook.

Read the current `AddChainModal` from `apps/admin/app/chains/page.tsx` (around line 230) and extract it.

- [ ] **Step 5: Create edit-chain-modal.tsx**

Extract the `EditChainModal` component. Replace `adminFetch` calls with `useChainDetail` and `useUpdateChain` hooks.

Read the current `EditChainModal` from `apps/admin/app/chains/page.tsx` (around line 316) and extract it.

- [ ] **Step 6: Create chain-table.tsx**

Extract the health table including the inline helper components (`ChainHexAvatar`, `HealthBadge`, `StatusBadge`, `LagBadge`, `formatBlock`). The table renders rows with expandable `ChainDetailPanel`.

This component receives `chains: ChainHealth[]` and callbacks for actions (edit, lifecycle).

- [ ] **Step 7: Rewrite page.tsx as slim composition**

Replace the monolithic `page.tsx` with a slim ~60-line component that composes the sub-components:

```typescript
// apps/admin/app/chains/page.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useChainsHealth } from "./hooks";
import { ChainStatCards } from "./components/chain-stat-cards";
import { ChainTable } from "./components/chain-table";
import { AddChainModal } from "./components/add-chain-modal";
import { EditChainModal } from "./components/edit-chain-modal";
import { LifecycleModal } from "./components/lifecycle-modal";
import type { ChainHealth, LifecycleAction } from "./types";

export default function ChainsPage() {
  const { data, isLoading, isRefetching, error } = useChainsHealth();
  const [addModal, setAddModal] = useState(false);
  const [editChain, setEditChain] = useState<ChainHealth | null>(null);
  const [lifecycleState, setLifecycleState] = useState<{
    chain: ChainHealth;
    action: LifecycleAction;
  } | null>(null);

  const chains = data?.chains ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-heading text-text-primary">Blockchain Networks</h1>
        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-all duration-fast"
        >
          <Plus className="w-4 h-4" /> Add Chain
        </button>
      </div>

      <ChainStatCards
        chains={chains}
        updatedAt={data?.updatedAt}
        isRefetching={isRefetching}
      />

      {error && (
        <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-card px-4 py-3 font-display">
          Failed to load chains: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      <ChainTable
        chains={chains}
        loading={isLoading}
        onEdit={setEditChain}
        onLifecycle={(chain, action) => setLifecycleState({ chain, action })}
      />

      {addModal && (
        <AddChainModal onClose={() => setAddModal(false)} />
      )}
      {editChain && (
        <EditChainModal chain={editChain} onClose={() => setEditChain(null)} />
      )}
      {lifecycleState && (
        <LifecycleModal
          chain={lifecycleState.chain}
          action={lifecycleState.action}
          onClose={() => setLifecycleState(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Verify the page loads and works**

```bash
cd apps/admin && npx next build
```

Check for TypeScript errors. If any, fix them.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/app/chains/
git commit -m "refactor(chains): decompose page into sub-components with React Query

Split monolithic 500-line page.tsx into 6 focused components:
chain-stat-cards, chain-table, chain-detail-panel, lifecycle-modal,
add-chain-modal, edit-chain-modal. Migrated from raw useState/useEffect
to useQuery (30s refetchInterval) and useMutation with automatic
cache invalidation. Added auto-refresh indicator."
```

---

## Task 3: RPC Providers Health & Quota Enhancement

**Files:**
- Modify: `apps/admin/app/rpc-providers/page.tsx`

**Independent of Tasks 1-2**

- [ ] **Step 1: Read the current RPC Providers page**

Read `apps/admin/app/rpc-providers/page.tsx` thoroughly to understand the current structure before making changes.

- [ ] **Step 2: Remove CHAINS_FALLBACK reliance**

The page currently has a `CHAINS_FALLBACK` array as fallback when the API fails. The chains API is reliable after Phase 1-2 work. Remove `CHAINS_FALLBACK` and just use an empty array as fallback:

```typescript
// Remove the CHAINS_FALLBACK constant entirely
// Change the useEffect fallback from CHAINS_FALLBACK to []
```

- [ ] **Step 3: Add health score display to node rows**

In the node row rendering section, add a health score cell with color coding:

```typescript
function HealthScoreCell({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-text-muted">—</span>;
  const color = score >= 70 ? "text-status-success" : score >= 40 ? "text-status-warning" : "text-status-error";
  return <span className={cn("font-mono font-semibold", color)}>{score.toFixed(0)}</span>;
}
```

Add this cell to each node row in the table.

- [ ] **Step 4: Add quota progress bar component**

```typescript
function QuotaProgressBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  if (!limit) return null;
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct >= 100 ? "bg-status-error" : pct >= 80 ? "bg-status-warning" : "bg-status-success";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-micro text-text-muted">
        <span>{label}</span>
        <span>{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-fast", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add quota status badge to node rows**

```typescript
function QuotaStatusBadge({ status }: { status: string | undefined }) {
  if (!status || status === "available") return <Badge variant="success" dot>Available</Badge>;
  if (status === "approaching") return <Badge variant="warning" dot>Approaching</Badge>;
  if (status === "daily_exhausted") return <Badge variant="error" dot>Daily Exhausted</Badge>;
  if (status === "monthly_exhausted") return <Badge variant="error" dot>Monthly Exhausted</Badge>;
  return <Badge variant="neutral" dot>{status}</Badge>;
}
```

- [ ] **Step 6: Update stat cards to use real health data**

Change the "Healthy Nodes" stat card to derive from `healthScore >= 70` instead of just `isActive`. Add a "Quota Warnings" card counting nodes with `approaching` or exhausted status:

```typescript
const healthyCount = nodes.filter((n) => (n.healthScore ?? 0) >= 70).length;
const quotaWarnings = nodes.filter((n) => n.quotaStatus && n.quotaStatus !== "available").length;
```

Update the stat cards grid to include:
```typescript
<StatCard label="Healthy Nodes" value={healthyCount} variant="success" />
<StatCard label="Quota Warnings" value={quotaWarnings} variant={quotaWarnings > 0 ? "warning" : "neutral"} />
```

- [ ] **Step 7: Integrate into node expanded rows**

When a provider is expanded showing individual nodes, add the health score, quota status badge, and quota progress bars for each node. The node data already has `healthScore`, `quotaStatus`, `maxRequestsPerDay`, `maxRequestsPerMonth` fields from the API (added in Phase 1).

- [ ] **Step 8: Commit**

```bash
git add apps/admin/app/rpc-providers/page.tsx
git commit -m "feat(rpc-providers): add health scores, quota progress bars, remove CHAINS_FALLBACK

Node rows now display health score (color-coded), quota status badge
(Available/Approaching/Exhausted), and daily/monthly quota progress bars.
Stat cards use real healthScore >= 70 threshold. Removed hardcoded
CHAINS_FALLBACK constant."
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Chains page loads without errors
- [ ] KPI cards show correct Active/Healthy/Degraded/Critical counts
- [ ] Auto-refresh indicator shows "Updated Xs ago" and updates every 5s
- [ ] Table data refreshes every 30s (check network tab)
- [ ] Expanding a chain row shows detail panel with 4-column metrics
- [ ] Add Chain modal creates a new chain and refreshes the table
- [ ] Edit Chain modal loads current values and saves changes
- [ ] Lifecycle modals (drain/deactivate/archive/reactivate) work correctly
- [ ] RPC Providers page loads without CHAINS_FALLBACK
- [ ] Node rows show health score with color coding
- [ ] Quota progress bars render correctly
- [ ] Quota status badges display correct state
- [ ] "Healthy Nodes" stat card uses healthScore >= 70 threshold
- [ ] "Quota Warnings" card shows correct count
- [ ] `npx next build` succeeds with no TypeScript errors
