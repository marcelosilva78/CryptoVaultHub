/**
 * Shared types for the API client SDK.
 * These augment @cvh/types with DTO shapes used in API requests.
 */

import type { PaginatedResponse, DepositStatus, WithdrawalStatus } from '@cvh/types';

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
  custodyMode?: 'full_custody' | 'co_sign' | 'client_initiated';
  monitoringMode?: 'realtime' | 'polling' | 'hybrid';
  kytLevel?: 'off' | 'basic' | 'full';
  dailyWithdrawalLimit?: string;
}

export interface UpdateClientDto {
  name?: string;
  tierId?: number;
  chainIds?: number[];
  custodyMode?: 'full_custody' | 'co_sign' | 'client_initiated';
  monitoringMode?: 'realtime' | 'polling' | 'hybrid';
  kytLevel?: 'off' | 'basic' | 'full';
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

// ── Re-export PaginatedResponse for convenience ──────────
export type { PaginatedResponse };
