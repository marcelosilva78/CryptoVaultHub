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
