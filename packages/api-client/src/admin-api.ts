/**
 * Type-safe wrapper for Admin API endpoints (port 3001).
 *
 * Provides methods for managing clients, tiers, chains, tokens,
 * compliance alerts, and monitoring.
 */

import type {
  PaginatedResponse,
} from '@cvh/types';

import type {
  PaginationParams,
  CreateClientDto,
  UpdateClientDto,
  ClientSummary,
  ClientDetail,
  TierConfig,
  CreateTierDto,
  ChainInfo,
  TokenInfo,
  AlertsQuery,
  ComplianceAlert,
  UpdateAlertDto,
  HealthStatus,
  QueueStatus,
  GasTankInfo,
} from './types';

export class AdminApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Admin API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  // ── Clients ──────────────────────────────────────────────

  async getClients(params?: PaginationParams): Promise<PaginatedResponse<ClientSummary>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/admin/clients${query ? `?${query}` : ''}`);
  }

  async getClient(id: number): Promise<ClientDetail> {
    return this.request('GET', `/admin/clients/${id}`);
  }

  async createClient(data: CreateClientDto): Promise<ClientDetail> {
    return this.request('POST', '/admin/clients', data);
  }

  async updateClient(id: number, data: UpdateClientDto): Promise<ClientDetail> {
    return this.request('PATCH', `/admin/clients/${id}`, data);
  }

  // ── Tiers ────────────────────────────────────────────────

  async getTiers(): Promise<TierConfig[]> {
    return this.request('GET', '/admin/tiers');
  }

  async createTier(data: CreateTierDto): Promise<TierConfig> {
    return this.request('POST', '/admin/tiers', data);
  }

  async cloneTier(id: number, name: string): Promise<TierConfig> {
    return this.request('POST', `/admin/tiers/${id}/clone`, { name });
  }

  // ── Chains & Tokens ─────────────────────────────────────

  async getChains(): Promise<ChainInfo[]> {
    return this.request('GET', '/admin/chains');
  }

  async getTokens(chainId?: number): Promise<TokenInfo[]> {
    const qs = chainId ? `?chainId=${chainId}` : '';
    return this.request('GET', `/admin/tokens${qs}`);
  }

  // ── Compliance ───────────────────────────────────────────

  async getAlerts(params?: AlertsQuery): Promise<PaginatedResponse<ComplianceAlert>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return this.request('GET', `/admin/compliance/alerts${query ? `?${query}` : ''}`);
  }

  async updateAlert(id: number, data: UpdateAlertDto): Promise<ComplianceAlert> {
    return this.request('PATCH', `/admin/compliance/alerts/${id}`, data);
  }

  // ── Monitoring ───────────────────────────────────────────

  async getHealth(): Promise<HealthStatus> {
    return this.request('GET', '/admin/health');
  }

  async getQueueStatus(): Promise<QueueStatus[]> {
    return this.request('GET', '/admin/queues');
  }

  async getGasTanks(): Promise<GasTankInfo[]> {
    return this.request('GET', '/admin/gas-tanks');
  }
}
