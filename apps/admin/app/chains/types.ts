/* ─── Chain Health (list endpoint) ──────────────────────────────── */
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
  };
  rpc: {
    totalNodes: number;
    activeNodes: number;
    healthyNodes: number;
    avgLatencyMs: number | null;
    quotaStatus: string;
  };
}

/* ─── Chain Detail (single endpoint) ───────────────────────────── */
export interface ChainDetail {
  chain: any;
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

/* ─── Chains Health Response ───────────────────────────────────── */
export interface ChainsHealthResponse {
  chains: ChainHealth[];
  updatedAt?: string;
}

/* ─── Lifecycle Action ─────────────────────────────────────────── */
export type LifecycleAction = "drain" | "deactivate" | "archive" | "reactivate";
