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
  RpcProvider,
  RpcNode,
  SyncHealth,
  SyncGap,
  JobSummary,
  QueueStats,
  ExportRequest,
  ImpersonationSession,
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

  // ── RPC Management ──────────────────────────────────────

  async getRpcProviders(): Promise<RpcProvider[]> {
    return this.request('GET', '/admin/rpc-providers');
  }

  async createRpcProvider(data: any): Promise<RpcProvider> {
    return this.request('POST', '/admin/rpc-providers', data);
  }

  async updateRpcProvider(id: string, data: any): Promise<RpcProvider> {
    return this.request('PATCH', `/admin/rpc-providers/${id}`, data);
  }

  async getRpcNodes(providerId: string): Promise<RpcNode[]> {
    return this.request('GET', `/admin/rpc-providers/${providerId}/nodes`);
  }

  async createRpcNode(providerId: string, data: any): Promise<RpcNode> {
    return this.request('POST', `/admin/rpc-providers/${providerId}/nodes`, data);
  }

  async updateRpcNode(nodeId: string, data: any): Promise<RpcNode> {
    return this.request('PATCH', `/admin/rpc-providers/nodes/${nodeId}`, data);
  }

  async updateRpcNodeStatus(nodeId: string, status: string): Promise<RpcNode> {
    return this.request('PATCH', `/admin/rpc-providers/nodes/${nodeId}/status`, { status });
  }

  async getRpcHealth(): Promise<any> {
    return this.request('GET', '/admin/rpc-providers/health');
  }

  // ── Sync Management ─────────────────────────────────────

  async getSyncHealth(): Promise<SyncHealth[]> {
    return this.request('GET', '/admin/sync-management/health');
  }

  async getSyncGaps(): Promise<SyncGap[]> {
    return this.request('GET', '/admin/sync-management/gaps');
  }

  async retrySyncGap(gapId: string): Promise<void> {
    return this.request('POST', `/admin/sync-management/gaps/${gapId}/retry`);
  }

  async getReorgs(): Promise<any[]> {
    return this.request('GET', '/admin/sync-management/reorgs');
  }

  // ── Job Management ──────────────────────────────────────

  async getJobs(params?: any): Promise<{ data: JobSummary[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.queueName) qs.set('queueName', params.queueName);
    if (params?.status) qs.set('status', params.status);
    if (params?.priority) qs.set('priority', params.priority);
    const query = qs.toString();
    return this.request('GET', `/admin/job-management/jobs${query ? `?${query}` : ''}`);
  }

  async getJob(id: string): Promise<any> {
    return this.request('GET', `/admin/job-management/jobs/${id}`);
  }

  async retryJob(id: string): Promise<void> {
    return this.request('POST', `/admin/job-management/jobs/${id}/retry`);
  }

  async cancelJob(id: string): Promise<void> {
    return this.request('POST', `/admin/job-management/jobs/${id}/cancel`);
  }

  async getJobStats(): Promise<QueueStats> {
    return this.request('GET', '/admin/job-management/jobs/stats');
  }

  async getDeadLetterJobs(): Promise<any[]> {
    return this.request('GET', '/admin/job-management/dead-letter');
  }

  async reprocessDeadLetterJob(id: string): Promise<void> {
    return this.request('POST', `/admin/job-management/dead-letter/${id}/reprocess`);
  }

  async discardDeadLetterJob(id: string, notes?: string): Promise<void> {
    return this.request('POST', `/admin/job-management/dead-letter/${id}/discard`, notes !== undefined ? { notes } : undefined);
  }

  // ── Export Management ───────────────────────────────────

  async createAdminExport(data: any): Promise<ExportRequest> {
    return this.request('POST', '/admin/exports', data);
  }

  async getAdminExports(params?: any): Promise<{ data: ExportRequest[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/admin/exports${query ? `?${query}` : ''}`);
  }

  async getAdminExport(id: string): Promise<ExportRequest> {
    return this.request('GET', `/admin/exports/${id}`);
  }

  async downloadAdminExport(id: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/admin/exports/${id}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Admin API error ${res.status}: ${text || res.statusText}`);
    }
    return res.blob();
  }

  // ── Impersonation ───────────────────────────────────────

  async startImpersonation(data: { targetClientId: string; targetProjectId?: string; mode: string }): Promise<ImpersonationSession> {
    return this.request('POST', '/admin/impersonation/start', data);
  }

  async endImpersonation(): Promise<void> {
    return this.request('POST', '/admin/impersonation/end');
  }

  // ── Tiers (additional) ───────────────────────────────────

  async updateTier(id: number, data: any): Promise<any> {
    return this.request('PATCH', `/admin/tiers/${id}`, data);
  }

  // ── Clients (additional) ─────────────────────────────────

  async generateClientKeys(id: number): Promise<any> {
    return this.request('POST', `/admin/clients/${id}/generate-keys`);
  }

  // ── Chains (additional) ──────────────────────────────────

  async createChain(data: any): Promise<any> {
    return this.request('POST', '/admin/chains', data);
  }

  async deleteChain(id: number): Promise<any> {
    return this.request('DELETE', `/admin/chains/${id}`);
  }

  // ── Tokens (additional) ──────────────────────────────────

  async createToken(data: any): Promise<any> {
    return this.request('POST', '/admin/tokens', data);
  }

  // ── Jobs (additional) ────────────────────────────────────

  async batchRetryJobs(jobIds: string[]): Promise<any> {
    return this.request('POST', '/admin/job-management/jobs/batch-retry', { jobIds });
  }
}
