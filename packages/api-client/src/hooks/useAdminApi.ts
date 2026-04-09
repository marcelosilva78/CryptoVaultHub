/**
 * React Query hooks for Admin API endpoints.
 *
 * Each hook wraps TanStack Query's useQuery / useMutation to provide
 * cached, auto-refetching data for admin dashboard pages.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminApiClient } from '../admin-api';
import type {
  PaginationParams,
  CreateClientDto,
  UpdateClientDto,
  CreateTierDto,
  AlertsQuery,
  UpdateAlertDto,
} from '../types';

// ── Singleton / context helper ───────────────────────────
// In real apps this would come from React context. For now
// we expose a setter that apps call once at bootstrap.
let _adminApi: AdminApiClient | null = null;

export function setAdminApiClient(client: AdminApiClient) {
  _adminApi = client;
}

function api(): AdminApiClient {
  if (!_adminApi) throw new Error('@cvh/api-client: AdminApiClient not configured. Call setAdminApiClient() first.');
  return _adminApi;
}

// ── Query keys ───────────────────────────────────────────
export const adminKeys = {
  all: ['admin'] as const,
  clients: (params?: PaginationParams) => [...adminKeys.all, 'clients', params] as const,
  client: (id: number) => [...adminKeys.all, 'client', id] as const,
  tiers: () => [...adminKeys.all, 'tiers'] as const,
  chains: () => [...adminKeys.all, 'chains'] as const,
  tokens: (chainId?: number) => [...adminKeys.all, 'tokens', chainId] as const,
  alerts: (params?: AlertsQuery) => [...adminKeys.all, 'alerts', params] as const,
  health: () => [...adminKeys.all, 'health'] as const,
  queues: () => [...adminKeys.all, 'queues'] as const,
  gasTanks: () => [...adminKeys.all, 'gasTanks'] as const,
};

// ── Clients ──────────────────────────────────────────────

export function useClients(params?: PaginationParams) {
  return useQuery({
    queryKey: adminKeys.clients(params),
    queryFn: () => api().getClients(params),
    enabled: !!_adminApi,
  });
}

export function useClient(id: number) {
  return useQuery({
    queryKey: adminKeys.client(id),
    queryFn: () => api().getClient(id),
    enabled: !!_adminApi && id > 0,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClientDto) => api().createClient(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.clients() });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateClientDto }) => api().updateClient(id, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.clients() });
      qc.invalidateQueries({ queryKey: adminKeys.client(variables.id) });
    },
  });
}

// ── Tiers ────────────────────────────────────────────────

export function useTiers() {
  return useQuery({
    queryKey: adminKeys.tiers(),
    queryFn: () => api().getTiers(),
    enabled: !!_adminApi,
  });
}

export function useCreateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTierDto) => api().createTier(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.tiers() });
    },
  });
}

export function useCloneTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api().cloneTier(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.tiers() });
    },
  });
}

// ── Chains & Tokens ─────────────────────────────────────

export function useChains() {
  return useQuery({
    queryKey: adminKeys.chains(),
    queryFn: () => api().getChains(),
    enabled: !!_adminApi,
  });
}

export function useTokens(chainId?: number) {
  return useQuery({
    queryKey: adminKeys.tokens(chainId),
    queryFn: () => api().getTokens(chainId),
    enabled: !!_adminApi,
  });
}

// ── Compliance ───────────────────────────────────────────

export function useAlerts(params?: AlertsQuery) {
  return useQuery({
    queryKey: adminKeys.alerts(params),
    queryFn: () => api().getAlerts(params),
    enabled: !!_adminApi,
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAlertDto }) => api().updateAlert(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...adminKeys.all, 'alerts'] });
    },
  });
}

// ── Monitoring ───────────────────────────────────────────

export function useHealth() {
  return useQuery({
    queryKey: adminKeys.health(),
    queryFn: () => api().getHealth(),
    enabled: !!_adminApi,
    refetchInterval: 30_000, // poll every 30s
  });
}

export function useQueueStatus() {
  return useQuery({
    queryKey: adminKeys.queues(),
    queryFn: () => api().getQueueStatus(),
    enabled: !!_adminApi,
    refetchInterval: 15_000,
  });
}

export function useGasTanks() {
  return useQuery({
    queryKey: adminKeys.gasTanks(),
    queryFn: () => api().getGasTanks(),
    enabled: !!_adminApi,
  });
}
