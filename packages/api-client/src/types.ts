/**
 * Shared types for the API client SDK.
 * These augment @cvh/types with DTO shapes used in API requests.
 */

import type { PaginatedResponse, DepositStatus, WithdrawalStatus, CustodyMode, MonitoringMode, KytLevel } from '@cvh/types';

// ── Pagination ───────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// ── Admin: Clients ───────────────────────────────────────
export interface CreateClientDto {
  name: string;
  tierId: number;
  chainIds: number[];
  custodyMode?: CustodyMode;
  monitoringMode?: MonitoringMode;
  kytLevel?: KytLevel;
  dailyWithdrawalLimit?: string;
}

export interface UpdateClientDto {
  name?: string;
  tierId?: number;
  chainIds?: number[];
  custodyMode?: CustodyMode;
  monitoringMode?: MonitoringMode;
  kytLevel?: KytLevel;
  dailyWithdrawalLimit?: string;
  isActive?: boolean;
}

export interface ClientSummary {
  id: number;
  name: string;
  tier: string;
  chains: string[];
  forwarderCount: number;
  volume24h: string;
  totalBalance: string;
  status: 'active' | 'suspended' | 'disabled';
  createdAt: string;
}

export interface ClientDetail extends ClientSummary {
  custodyMode: string;
  monitoringMode: string;
  kytLevel: string;
  dailyWithdrawalLimit: string;
  wallets: WalletInfo[];
  gasTanks: GasTankInfo[];
}

export interface WalletInfo {
  chain: string;
  chainId: number;
  address: string;
  status: string;
  balances: { token: string; amount: string }[];
}

export interface GasTankInfo {
  chain: string;
  address: string;
  balance: string;
  threshold: string;
  burnRate: string;
  daysLeft: number;
  status: 'ok' | 'low' | 'critical';
}

// ── Admin: Tiers ─────────────────────────────────────────
export interface TierConfig {
  id: number;
  name: string;
  description: string;
  apiRateLimit: number;
  maxForwardersPerChain: number;
  maxActiveChains: number;
  monitoringMode: string;
  kytLevel: string;
  dailyWithdrawalLimit: string;
  isPreset: boolean;
  clientCount: number;
}

export interface CreateTierDto {
  name: string;
  description?: string;
  apiRateLimit: number;
  maxForwardersPerChain: number;
  maxActiveChains: number;
  monitoringMode: string;
  kytLevel: string;
  dailyWithdrawalLimit: string;
}

// ── Admin: Compliance ────────────────────────────────────
export interface AlertsQuery extends PaginationParams {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'open' | 'reviewing' | 'resolved' | 'dismissed';
}

export interface ComplianceAlert {
  id: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  address: string;
  matchType: string;
  clientName: string;
  clientId: number;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface UpdateAlertDto {
  status: 'reviewing' | 'resolved' | 'dismissed';
  notes?: string;
}

// ── Admin: Monitoring ────────────────────────────────────
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  services: ServiceHealth[];
  timestamp: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyP99: number;
  uptime: number;
}

export interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  completed24h: number;
}

// ── Admin: Chains & Tokens ───────────────────────────────
export interface ChainInfo {
  chainId: number;
  name: string;
  nativeCurrency: string;
  blockTime: string;
  confirmations: number;
  rpcHealth: string;
  lastBlock: number;
  lag: number;
  isActive: boolean;
}

export interface TokenInfo {
  id: number;
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  contractAddress: string | null;
  decimals: number;
  isNative: boolean;
  isActive: boolean;
  clientsUsing: number;
}

// ── Client: Deposits ─────────────────────────────────────
export interface DepositsQuery extends PaginationParams {
  chainId?: number;
  status?: DepositStatus;
  fromDate?: string;
  toDate?: string;
}

// ── Client: Withdrawals ──────────────────────────────────
export interface WithdrawalsQuery extends PaginationParams {
  chainId?: number;
  status?: WithdrawalStatus;
  fromDate?: string;
  toDate?: string;
}

// ── Client: Address Book ─────────────────────────────────
export interface AddAddressDto {
  address: string;
  label: string;
  chainId: number;
}

// ── Client: Webhooks ─────────────────────────────────────
export interface CreateWebhookDto {
  url: string;
  events: string[];
  secret?: string;
}

export interface UpdateWebhookDto {
  url?: string;
  events?: string[];
  isActive?: boolean;
}

export interface WebhookInfo {
  id: number;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  successRate: number;
  createdAt: string;
}

export interface WebhookDeliveryInfo {
  id: number;
  webhookId: number;
  eventType: string;
  httpStatus: number;
  latencyMs: number;
  attempts: number;
  maxAttempts: number;
  status: 'sent' | 'failed';
  createdAt: string;
}

// ── Client: Balances ─────────────────────────────────────
export interface BalanceInfo {
  chainId: number;
  chain: string;
  token: string;
  balance: string;
  usdValue: string;
}

// ── Flush Operations ────────────────────────────────────
export interface FlushOperation {
  id: string;
  operationUid: string;
  clientId: string;
  projectId: string;
  chainId: number;
  operationType: 'flush_tokens' | 'sweep_native';
  mode: 'manual' | 'automated' | 'batch';
  triggerType: 'user' | 'system' | 'scheduled';
  triggeredBy: string | null;
  isDryRun: boolean;
  status: 'pending' | 'queued' | 'processing' | 'succeeded' | 'failed' | 'partially_succeeded' | 'canceled';
  tokenId: string | null;
  walletId: string;
  totalAddresses: number;
  succeededCount: number;
  failedCount: number;
  totalAmount: string;
  succeededAmount: string;
  gasCostTotal: string;
  txHash: string | null;
  errorMessage: string | null;
  dryRunResult: Record<string, unknown> | null;
  filtersApplied: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface FlushItem {
  id: string;
  operationId: string;
  depositAddressId: string;
  address: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped';
  amountBefore: string | null;
  amountFlushed: string | null;
  txHash: string | null;
  gasCost: string | null;
  errorMessage: string | null;
}

// ── Address Groups ──────────────────────────────────────
export interface AddressGroup {
  id: string;
  groupUid: string;
  clientId: string;
  projectId: string;
  externalId: string | null;
  label: string | null;
  derivationSalt: string;
  computedAddress: string;
  status: 'active' | 'disabled';
  chains: { chainId: number; depositAddressId: string; isDeployed: boolean }[];
  createdAt: string;
}

// ── Deploy Traces ───────────────────────────────────────
export interface DeployTrace {
  id: string;
  clientId: string;
  projectId: string;
  chainId: number;
  resourceType: 'wallet' | 'forwarder' | 'factory' | 'token_contract';
  resourceId: string;
  address: string;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
  gasUsed: number | null;
  gasCostWei: string | null;
  correlationId: string | null;
  eventLogs: Record<string, unknown>[] | null;
  createdAt: string;
}

// ── Exports ─────────────────────────────────────────────
export interface ExportRequest {
  id: string;
  requestUid: string;
  exportType: string;
  format: 'csv' | 'xlsx' | 'json';
  filters: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  totalRows: number | null;
  fileSizeBytes: number | null;
  downloadCount: number;
  expiresAt: string | null;
  createdAt: string;
}

// ── RPC Management ──────────────────────────────────────
export interface RpcProvider {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  authMethod: string;
  isActive: boolean;
  nodes?: RpcNode[];
}

export interface RpcNode {
  id: string;
  providerId: string;
  chainId: number;
  endpointUrl: string;
  wsEndpointUrl: string | null;
  priority: number;
  weight: number;
  status: 'active' | 'draining' | 'standby' | 'unhealthy' | 'disabled';
  healthScore: number;
  maxRequestsPerSecond: number | null;
  maxRequestsPerMinute: number | null;
  isActive: boolean;
}

// ── Sync Management ─────────────────────────────────────
export interface SyncHealth {
  chainId: number;
  chainName: string;
  lastBlock: number;
  latestFinalizedBlock: number;
  blocksBehind: number;
  indexerStatus: 'syncing' | 'synced' | 'stale' | 'error';
  gapCount: number;
}

export interface SyncGap {
  id: string;
  chainId: number;
  gapStartBlock: number;
  gapEndBlock: number;
  status: 'detected' | 'backfilling' | 'resolved' | 'failed';
  attemptCount: number;
}

// ── Job Management ──────────────────────────────────────
export interface JobSummary {
  id: string;
  jobUid: string;
  queueName: string;
  jobType: string;
  priority: 'critical' | 'standard' | 'bulk';
  status: string;
  clientId: string | null;
  chainId: number | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
}

export interface QueueStats {
  totalJobs: number;
  processing: number;
  failed: number;
  deadLetterCount: number;
  avgDurationMs: number | null;
}

// ── Impersonation ───────────────────────────────────────
export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  targetClientId: string;
  targetProjectId: string | null;
  mode: 'read_only' | 'support' | 'full_operational';
  startedAt: string;
  endedAt: string | null;
}

// ── Webhook v2 ──────────────────────────────────────────
export interface WebhookDeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  status: 'success' | 'failed' | 'timeout' | 'error';
  responseStatus: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  timestamp: string;
}

export interface WebhookDeadLetter {
  id: string;
  deliveryId: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  lastError: string | null;
  totalAttempts: number;
  status: 'pending_review' | 'resent' | 'discarded';
  deadLetteredAt: string;
}

// ── Re-export core types for convenience ──────────
export type { PaginatedResponse, CustodyMode, MonitoringMode, KytLevel };
