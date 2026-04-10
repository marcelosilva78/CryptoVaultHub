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

// v2 types used by hooks
import type {
  RpcProvider,
  RpcNode,
  SyncHealth,
  SyncGap,
  JobSummary,
  QueueStats,
  ExportRequest,
  ImpersonationSession,
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
  rpcProviders: () => [...adminKeys.all, 'rpcProviders'] as const,
  rpcNodes: (providerId: string) => [...adminKeys.all, 'rpcNodes', providerId] as const,
  rpcHealth: () => [...adminKeys.all, 'rpcHealth'] as const,
  syncHealth: () => [...adminKeys.all, 'syncHealth'] as const,
  syncGaps: () => [...adminKeys.all, 'syncGaps'] as const,
  reorgs: () => [...adminKeys.all, 'reorgs'] as const,
  jobs: (params?: any) => [...adminKeys.all, 'jobs', params] as const,
  job: (id: string) => [...adminKeys.all, 'job', id] as const,
  jobStats: () => [...adminKeys.all, 'jobStats'] as const,
  deadLetterJobs: () => [...adminKeys.all, 'deadLetterJobs'] as const,
  adminExports: (params?: any) => [...adminKeys.all, 'adminExports', params] as const,
  adminExport: (id: string) => [...adminKeys.all, 'adminExport', id] as const,
  impersonation: () => [...adminKeys.all, 'impersonation'] as const,
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

// ── RPC Management ──────────────────────────────────────

export function useRpcProviders() {
  return useQuery({
    queryKey: adminKeys.rpcProviders(),
    queryFn: () => api().getRpcProviders(),
    enabled: !!_adminApi,
  });
}

export function useCreateRpcProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api().createRpcProvider(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.rpcProviders() });
    },
  });
}

export function useUpdateRpcProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api().updateRpcProvider(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.rpcProviders() });
    },
  });
}

export function useRpcNodes(providerId: string) {
  return useQuery({
    queryKey: adminKeys.rpcNodes(providerId),
    queryFn: () => api().getRpcNodes(providerId),
    enabled: !!_adminApi && !!providerId,
  });
}

export function useCreateRpcNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, data }: { providerId: string; data: any }) =>
      api().createRpcNode(providerId, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.rpcNodes(variables.providerId) });
      qc.invalidateQueries({ queryKey: adminKeys.rpcProviders() });
    },
  });
}

export function useUpdateRpcNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, data }: { nodeId: string; data: any }) =>
      api().updateRpcNode(nodeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...adminKeys.all, 'rpcNodes'] });
      qc.invalidateQueries({ queryKey: adminKeys.rpcProviders() });
    },
  });
}

export function useUpdateRpcNodeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, status }: { nodeId: string; status: string }) =>
      api().updateRpcNodeStatus(nodeId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...adminKeys.all, 'rpcNodes'] });
      qc.invalidateQueries({ queryKey: adminKeys.rpcHealth() });
    },
  });
}

export function useRpcHealth() {
  return useQuery({
    queryKey: adminKeys.rpcHealth(),
    queryFn: () => api().getRpcHealth(),
    enabled: !!_adminApi,
    refetchInterval: 30_000,
  });
}

// ── Sync Management ─────────────────────────────────────

export function useSyncHealth() {
  return useQuery({
    queryKey: adminKeys.syncHealth(),
    queryFn: () => api().getSyncHealth(),
    enabled: !!_adminApi,
    refetchInterval: 15_000,
  });
}

export function useSyncGaps() {
  return useQuery({
    queryKey: adminKeys.syncGaps(),
    queryFn: () => api().getSyncGaps(),
    enabled: !!_adminApi,
  });
}

export function useRetrySyncGap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gapId: string) => api().retrySyncGap(gapId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.syncGaps() });
      qc.invalidateQueries({ queryKey: adminKeys.syncHealth() });
    },
  });
}

export function useReorgs() {
  return useQuery({
    queryKey: adminKeys.reorgs(),
    queryFn: () => api().getReorgs(),
    enabled: !!_adminApi,
  });
}

// ── Job Management ──────────────────────────────────────

export function useJobs(params?: any) {
  return useQuery({
    queryKey: adminKeys.jobs(params),
    queryFn: () => api().getJobs(params),
    enabled: !!_adminApi,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: adminKeys.job(id),
    queryFn: () => api().getJob(id),
    enabled: !!_adminApi && !!id,
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api().retryJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...adminKeys.all, 'jobs'] });
      qc.invalidateQueries({ queryKey: adminKeys.jobStats() });
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api().cancelJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...adminKeys.all, 'jobs'] });
      qc.invalidateQueries({ queryKey: adminKeys.jobStats() });
    },
  });
}

export function useJobStats() {
  return useQuery({
    queryKey: adminKeys.jobStats(),
    queryFn: () => api().getJobStats(),
    enabled: !!_adminApi,
    refetchInterval: 15_000,
  });
}

export function useDeadLetterJobs() {
  return useQuery({
    queryKey: adminKeys.deadLetterJobs(),
    queryFn: () => api().getDeadLetterJobs(),
    enabled: !!_adminApi,
  });
}

export function useReprocessDeadLetterJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api().reprocessDeadLetterJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.deadLetterJobs() });
      qc.invalidateQueries({ queryKey: adminKeys.jobStats() });
    },
  });
}

export function useDiscardDeadLetterJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api().discardDeadLetterJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.deadLetterJobs() });
      qc.invalidateQueries({ queryKey: adminKeys.jobStats() });
    },
  });
}

// ── Export Management ───────────────────────────────────

export function useAdminExports(params?: any) {
  return useQuery({
    queryKey: adminKeys.adminExports(params),
    queryFn: () => api().getAdminExports(params),
    enabled: !!_adminApi,
  });
}

export function useAdminExport(id: string) {
  return useQuery({
    queryKey: adminKeys.adminExport(id),
    queryFn: () => api().getAdminExport(id),
    enabled: !!_adminApi && !!id,
  });
}

export function useCreateAdminExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api().createAdminExport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...adminKeys.all, 'adminExports'] });
    },
  });
}

export function useDownloadAdminExport() {
  return useMutation({
    mutationFn: (id: string) => api().downloadAdminExport(id),
  });
}

// ── Impersonation ───────────────────────────────────────

export function useStartImpersonation() {
  return useMutation({
    mutationFn: (data: { targetClientId: string; targetProjectId?: string; mode: string }) =>
      api().startImpersonation(data),
  });
}

export function useEndImpersonation() {
  return useMutation({
    mutationFn: () => api().endImpersonation(),
  });
}
