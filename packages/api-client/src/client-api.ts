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
  Project,
} from './types';

export class ClientApiClient {
  private projectId: string | null = null;

  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  setProjectId(id: string | null) {
    this.projectId = id;
  }

  getProjectId(): string | null {
    return this.projectId;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
    if (this.projectId) {
      headers['X-Project-Id'] = this.projectId;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
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

  // ── Projects ─────────────────────────────────────────────

  async getProjects(): Promise<Project[]> {
    return this.request('GET', '/client/v1/projects');
  }

  async getProject(id: string): Promise<Project> {
    return this.request('GET', `/client/v1/projects/${id}`);
  }

  // ── Tokens & Health ──────────────────────────────────────

  async getTokens(chainId?: number): Promise<Token[]> {
    const qs = chainId ? `?chainId=${chainId}` : '';
    return this.request('GET', `/client/v1/tokens${qs}`);
  }

  async getHealth(): Promise<HealthStatus> {
    return this.request('GET', '/client/v1/health');
  }
}
