/**
 * React Query hooks for Client API endpoints.
 *
 * Each hook wraps TanStack Query's useQuery / useMutation to provide
 * cached, auto-refetching data for client dashboard pages.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientApiClient } from '../client-api';
import type { WithdrawRequest } from '@cvh/types';
import type {
  PaginationParams,
  DepositsQuery,
  WithdrawalsQuery,
  AddAddressDto,
  CreateWebhookDto,
  UpdateWebhookDto,
} from '../types';

// ── Singleton / context helper ───────────────────────────
let _clientApi: ClientApiClient | null = null;

export function setClientApiClient(client: ClientApiClient) {
  _clientApi = client;
}

function api(): ClientApiClient {
  if (!_clientApi) throw new Error('@cvh/api-client: ClientApiClient not configured. Call setClientApiClient() first.');
  return _clientApi;
}

// ── Query keys ───────────────────────────────────────────
export const clientKeys = {
  all: ['client'] as const,
  wallets: () => [...clientKeys.all, 'wallets'] as const,
  balances: (chainId: number) => [...clientKeys.all, 'balances', chainId] as const,
  depositAddresses: (params?: PaginationParams) => [...clientKeys.all, 'depositAddresses', params] as const,
  deposits: (params?: DepositsQuery) => [...clientKeys.all, 'deposits', params] as const,
  deposit: (id: number) => [...clientKeys.all, 'deposit', id] as const,
  withdrawals: (params?: WithdrawalsQuery) => [...clientKeys.all, 'withdrawals', params] as const,
  addresses: () => [...clientKeys.all, 'addresses'] as const,
  webhooks: () => [...clientKeys.all, 'webhooks'] as const,
  deliveries: (webhookId: number) => [...clientKeys.all, 'deliveries', webhookId] as const,
  tokens: (chainId?: number) => [...clientKeys.all, 'tokens', chainId] as const,
  health: () => [...clientKeys.all, 'health'] as const,
};

// ── Wallets ──────────────────────────────────────────────

export function useWallets() {
  return useQuery({
    queryKey: clientKeys.wallets(),
    queryFn: () => api().getWallets(),
    enabled: !!_clientApi,
  });
}

export function useBalances(chainId: number) {
  return useQuery({
    queryKey: clientKeys.balances(chainId),
    queryFn: () => api().getBalances(chainId),
    enabled: !!_clientApi && chainId > 0,
  });
}

// ── Deposit Addresses ────────────────────────────────────

export function useGenerateDepositAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, data }: { chainId: number; data: { externalId: string; label?: string } }) =>
      api().generateDepositAddress(chainId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.depositAddresses() });
    },
  });
}

export function useGenerateBatchAddresses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, addresses }: { chainId: number; addresses: Array<{ externalId: string; label?: string }> }) =>
      api().generateBatchAddresses(chainId, addresses),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.depositAddresses() });
    },
  });
}

export function useDepositAddresses(params?: PaginationParams) {
  return useQuery({
    queryKey: clientKeys.depositAddresses(params),
    queryFn: () => api().getDepositAddresses(params),
    enabled: !!_clientApi,
  });
}

// ── Deposits ─────────────────────────────────────────────

export function useDeposits(params?: DepositsQuery) {
  return useQuery({
    queryKey: clientKeys.deposits(params),
    queryFn: () => api().getDeposits(params),
    enabled: !!_clientApi,
  });
}

export function useDeposit(id: number) {
  return useQuery({
    queryKey: clientKeys.deposit(id),
    queryFn: () => api().getDeposit(id),
    enabled: !!_clientApi && id > 0,
  });
}

// ── Withdrawals ──────────────────────────────────────────

export function useCreateWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WithdrawRequest) => api().createWithdrawal(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.withdrawals() });
      qc.invalidateQueries({ queryKey: clientKeys.wallets() });
    },
  });
}

export function useWithdrawals(params?: WithdrawalsQuery) {
  return useQuery({
    queryKey: clientKeys.withdrawals(params),
    queryFn: () => api().getWithdrawals(params),
    enabled: !!_clientApi,
  });
}

// ── Address Book ─────────────────────────────────────────

export function useAddressBook() {
  return useQuery({
    queryKey: clientKeys.addresses(),
    queryFn: () => api().getAddresses(),
    enabled: !!_clientApi,
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddAddressDto) => api().addAddress(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.addresses() });
    },
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { label: string } }) => api().updateAddress(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.addresses() });
    },
  });
}

export function useRemoveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api().removeAddress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.addresses() });
    },
  });
}

// ── Webhooks ─────────────────────────────────────────────

export function useWebhooks() {
  return useQuery({
    queryKey: clientKeys.webhooks(),
    queryFn: () => api().getWebhooks(),
    enabled: !!_clientApi,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWebhookDto) => api().createWebhook(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.webhooks() });
    },
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateWebhookDto }) => api().updateWebhook(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.webhooks() });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api().deleteWebhook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientKeys.webhooks() });
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: number) => api().testWebhook(id),
  });
}

export function useWebhookDeliveries(webhookId: number) {
  return useQuery({
    queryKey: clientKeys.deliveries(webhookId),
    queryFn: () => api().getDeliveries(webhookId),
    enabled: !!_clientApi && webhookId > 0,
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: number) => api().retryDelivery(deliveryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...clientKeys.all, 'deliveries'] });
    },
  });
}

// ── Tokens & Health ──────────────────────────────────────

export function useClientTokens(chainId?: number) {
  return useQuery({
    queryKey: clientKeys.tokens(chainId),
    queryFn: () => api().getTokens(chainId),
    enabled: !!_clientApi,
  });
}

export function useClientHealth() {
  return useQuery({
    queryKey: clientKeys.health(),
    queryFn: () => api().getHealth(),
    enabled: !!_clientApi,
    refetchInterval: 30_000,
  });
}
