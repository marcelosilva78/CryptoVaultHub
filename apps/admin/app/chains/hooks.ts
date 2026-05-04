"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import type { ChainsHealthResponse, ChainDetail, LifecycleAction } from "./types";

/* ─── Query Keys ───────────────────────────────────────────────── */
export const CHAINS_HEALTH_KEY = ["chains", "health"] as const;
const chainDetailKey = (chainId: number) => ["chains", chainId, "detail"] as const;

/* ─── useChainsHealth ──────────────────────────────────────────── */
export function useChainsHealth() {
  return useQuery<ChainsHealthResponse>({
    queryKey: CHAINS_HEALTH_KEY,
    queryFn: async () => {
      try {
        const data = await adminFetch("/chains/health");
        return {
          chains: data?.chains || [],
          updatedAt: new Date().toISOString(),
        };
      } catch (err) {
        // Fallback to basic chains list
        const fallback = await adminFetch("/chains");
        const list = Array.isArray(fallback)
          ? fallback
          : fallback?.chains ?? fallback?.data ?? [];
        return {
          chains: list.map((c: any) => ({
            chainId: c.chainId || c.id,
            name: c.name,
            shortName: c.shortName || c.symbol,
            symbol: c.symbol,
            status: c.status || (c.isActive ? "active" : "inactive"),
            blockTimeSeconds: c.blockTimeSeconds || null,
            health: {
              overall: "unknown" as const,
              lastBlock: null,
              blocksBehind: null,
              lastCheckedAt: null,
            },
            rpc: {
              totalNodes: 0,
              activeNodes: 0,
              healthyNodes: 0,
              avgLatencyMs: null,
              quotaStatus: "available",
            },
          })),
          updatedAt: new Date().toISOString(),
        };
      }
    },
    refetchInterval: 30_000,
  });
}

/* ─── useChainDetail ───────────────────────────────────────────── */
export function useChainDetail(chainId: number) {
  return useQuery<ChainDetail>({
    queryKey: chainDetailKey(chainId),
    queryFn: () => adminFetch(`/chains/${chainId}`),
    enabled: !!chainId,
  });
}

/* ─── useAddChain ──────────────────────────────────────────────── */
export function useAddChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminFetch("/chains", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAINS_HEALTH_KEY });
    },
  });
}

/* ─── useUpdateChain ───────────────────────────────────────────── */
export function useUpdateChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, body }: { chainId: number; body: Record<string, unknown> }) =>
      adminFetch(`/chains/${chainId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: CHAINS_HEALTH_KEY });
      qc.invalidateQueries({ queryKey: chainDetailKey(variables.chainId) });
    },
  });
}

/* ─── useDeleteChain ──────────────────────────────────────────── */
export function useDeleteChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId }: { chainId: number }) =>
      adminFetch(`/chains/${chainId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAINS_HEALTH_KEY });
    },
  });
}

/* ─── useChainLifecycle ────────────────────────────────────────── */
export function useChainLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      chainId,
      action,
      reason,
    }: {
      chainId: number;
      action: LifecycleAction;
      reason: string;
    }) =>
      adminFetch(`/chains/${chainId}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: CHAINS_HEALTH_KEY });
      qc.invalidateQueries({ queryKey: chainDetailKey(variables.chainId) });
    },
  });
}
