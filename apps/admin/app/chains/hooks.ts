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
