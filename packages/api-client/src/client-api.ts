/**
 * Type-safe wrapper for Client API endpoints (port 3002).
 *
 * Provides methods for managing wallets, deposits, withdrawals,
 * address book, webhooks, and tokens.
 */

import type {
  PaginatedResponse,
  Wallet,
  DepositAddress,
  Deposit,
  Withdrawal,
  WhitelistedAddress,
  WithdrawRequest,
  WithdrawResponse,
  GenerateAddressResponse,
  Token,
} from '@cvh/types';

import type {
  PaginationParams,
  DepositsQuery,
  WithdrawalsQuery,
  AddAddressDto,
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookInfo,
  WebhookDeliveryInfo,
  BalanceInfo,
  HealthStatus,
  FlushOperation,
  FlushItem,
  AddressGroup,
  DeployTrace,
  ExportRequest,
  WebhookDeliveryAttempt,
  WebhookDeadLetter,
} from './types';

export class ClientApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Client API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  // ── Wallets ──────────────────────────────────────────────

  async getWallets(): Promise<Wallet[]> {
    return this.request('GET', '/client/v1/wallets');
  }

  async getBalances(chainId: number): Promise<BalanceInfo[]> {
    return this.request('GET', `/client/v1/wallets/balances?chainId=${chainId}`);
  }

  // ── Deposit Addresses ────────────────────────────────────

  async generateDepositAddress(
    chainId: number,
    data: { externalId: string; label?: string },
  ): Promise<GenerateAddressResponse> {
    return this.request('POST', `/client/v1/chains/${chainId}/addresses`, data);
  }

  async generateBatchAddresses(
    chainId: number,
    addresses: Array<{ externalId: string; label?: string }>,
  ): Promise<GenerateAddressResponse[]> {
    return this.request('POST', `/client/v1/chains/${chainId}/addresses/batch`, { addresses });
  }

  async getDepositAddresses(params?: PaginationParams): Promise<PaginatedResponse<DepositAddress>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v1/addresses${query ? `?${query}` : ''}`);
  }

  // ── Deposits ─────────────────────────────────────────────

  async getDeposits(params?: DepositsQuery): Promise<PaginatedResponse<Deposit>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.chainId) qs.set('chainId', String(params.chainId));
    if (params?.status) qs.set('status', params.status);
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    const query = qs.toString();
    return this.request('GET', `/client/v1/deposits${query ? `?${query}` : ''}`);
  }

  async getDeposit(id: number): Promise<Deposit> {
    return this.request('GET', `/client/v1/deposits/${id}`);
  }

  // ── Withdrawals ──────────────────────────────────────────

  async createWithdrawal(data: WithdrawRequest): Promise<WithdrawResponse> {
    return this.request('POST', '/client/v1/withdrawals', data);
  }

  async getWithdrawals(params?: WithdrawalsQuery): Promise<PaginatedResponse<Withdrawal>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.chainId) qs.set('chainId', String(params.chainId));
    if (params?.status) qs.set('status', params.status);
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    const query = qs.toString();
    return this.request('GET', `/client/v1/withdrawals${query ? `?${query}` : ''}`);
  }

  // ── Address Book ─────────────────────────────────────────

  async addAddress(data: AddAddressDto): Promise<WhitelistedAddress> {
    return this.request('POST', '/client/v1/address-book', data);
  }

  async getAddresses(): Promise<WhitelistedAddress[]> {
    return this.request('GET', '/client/v1/address-book');
  }

  async updateAddress(id: number, data: { label: string }): Promise<WhitelistedAddress> {
    return this.request('PATCH', `/client/v1/address-book/${id}`, data);
  }

  async removeAddress(id: number): Promise<void> {
    return this.request('DELETE', `/client/v1/address-book/${id}`);
  }

  // ── Webhooks ─────────────────────────────────────────────

  async createWebhook(data: CreateWebhookDto): Promise<WebhookInfo> {
    return this.request('POST', '/client/v1/webhooks', data);
  }

  async getWebhooks(): Promise<WebhookInfo[]> {
    return this.request('GET', '/client/v1/webhooks');
  }

  async updateWebhook(id: number, data: UpdateWebhookDto): Promise<WebhookInfo> {
    return this.request('PATCH', `/client/v1/webhooks/${id}`, data);
  }

  async deleteWebhook(id: number): Promise<void> {
    return this.request('DELETE', `/client/v1/webhooks/${id}`);
  }

  async testWebhook(id: number): Promise<{ delivered: boolean; httpStatus: number }> {
    return this.request('POST', `/client/v1/webhooks/${id}/test`);
  }

  async getDeliveries(webhookId: number): Promise<WebhookDeliveryInfo[]> {
    return this.request('GET', `/client/v1/webhooks/${webhookId}/deliveries`);
  }

  async retryDelivery(deliveryId: number): Promise<WebhookDeliveryInfo> {
    return this.request('POST', `/client/v1/webhook-deliveries/${deliveryId}/retry`);
  }

  // ── Tokens & Health ──────────────────────────────────────

  async getTokens(chainId?: number): Promise<Token[]> {
    const qs = chainId ? `?chainId=${chainId}` : '';
    return this.request('GET', `/client/v1/tokens${qs}`);
  }

  async getHealth(): Promise<HealthStatus> {
    return this.request('GET', '/client/v1/health');
  }

  // ── Flush Operations ────────────────────────────────────

  async flushTokens(data: { chainId: number; addresses: string[]; tokenId: string; walletId: string }): Promise<FlushOperation> {
    return this.request('POST', '/client/v2/flush/tokens', data);
  }

  async sweepNative(data: { chainId: number; addresses: string[]; walletId: string }): Promise<FlushOperation> {
    return this.request('POST', '/client/v2/flush/sweep-native', data);
  }

  async flushDryRun(data: { chainId: number; addresses: string[]; tokenId?: string; walletId: string; operationType: string }): Promise<FlushOperation> {
    return this.request('POST', '/client/v2/flush/dry-run', data);
  }

  async getFlushOperations(params?: { page?: number; limit?: number }): Promise<{ data: FlushOperation[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v2/flush${query ? `?${query}` : ''}`);
  }

  async getFlushOperation(id: string): Promise<FlushOperation & { items: FlushItem[] }> {
    return this.request('GET', `/client/v2/flush/${id}`);
  }

  async cancelFlushOperation(id: string): Promise<void> {
    return this.request('POST', `/client/v2/flush/${id}/cancel`);
  }

  // ── Address Groups ──────────────────────────────────────

  async createAddressGroup(data: { externalId?: string; label?: string }): Promise<AddressGroup> {
    return this.request('POST', '/client/v2/address-groups', data);
  }

  async provisionAddressGroup(id: string, data: { chainIds: number[] }): Promise<AddressGroup> {
    return this.request('POST', `/client/v2/address-groups/${id}/provision`, data);
  }

  async getAddressGroups(params?: { page?: number; limit?: number }): Promise<{ data: AddressGroup[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v2/address-groups${query ? `?${query}` : ''}`);
  }

  async getAddressGroup(id: string): Promise<AddressGroup> {
    return this.request('GET', `/client/v2/address-groups/${id}`);
  }

  // ── Deploy Traces ───────────────────────────────────────

  async getDeployTraces(params?: { page?: number; limit?: number }): Promise<{ data: DeployTrace[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v2/deploy-traces${query ? `?${query}` : ''}`);
  }

  async getDeployTrace(id: string): Promise<DeployTrace> {
    return this.request('GET', `/client/v2/deploy-traces/${id}`);
  }

  // ── Exports ─────────────────────────────────────────────

  async createExport(data: { exportType: string; format: string; filters: Record<string, unknown> }): Promise<ExportRequest> {
    return this.request('POST', '/client/v2/exports', data);
  }

  async getExports(params?: { page?: number; limit?: number }): Promise<{ data: ExportRequest[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v2/exports${query ? `?${query}` : ''}`);
  }

  async getExport(id: string): Promise<ExportRequest> {
    return this.request('GET', `/client/v2/exports/${id}`);
  }

  async downloadExport(id: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/client/v2/exports/${id}/download`, {
      method: 'GET',
      headers: {
        'X-API-Key': this.apiKey,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Client API error ${res.status}: ${text || res.statusText}`);
    }
    return res.blob();
  }

  // ── Webhook v2 ──────────────────────────────────────────

  async getWebhookDeliveryDetail(deliveryId: string): Promise<{ delivery: any; attempts: WebhookDeliveryAttempt[] }> {
    return this.request('GET', `/client/v2/webhook-deliveries/${deliveryId}`);
  }

  async resendWebhookDelivery(deliveryId: string): Promise<void> {
    return this.request('POST', `/client/v2/webhook-deliveries/${deliveryId}/resend`);
  }

  async getWebhookDeadLetters(params?: { page?: number; limit?: number }): Promise<{ data: WebhookDeadLetter[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v2/webhook-dead-letters${query ? `?${query}` : ''}`);
  }
}
