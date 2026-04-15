// API client classes
export { AdminApiClient } from './admin-api';
export { ClientApiClient, type ClientAuthMode } from './client-api';
export { AuthApiClient } from './auth-api';

// DTO types
export type {
  PaginationParams,
  CreateClientDto,
  UpdateClientDto,
  ClientSummary,
  ClientDetail,
  WalletInfo,
  GasTankInfo,
  TierConfig,
  CreateTierDto,
  AlertsQuery,
  ComplianceAlert,
  UpdateAlertDto,
  HealthStatus,
  ServiceHealth,
  QueueStatus,
  ChainInfo,
  TokenInfo,
  DepositsQuery,
  WithdrawalsQuery,
  AddAddressDto,
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookInfo,
  WebhookDeliveryInfo,
  BalanceInfo,
  // v2 types
  FlushOperation,
  FlushItem,
  AddressGroup,
  DeployTrace,
  ExportRequest,
  RpcProvider,
  RpcNode,
  SyncHealth,
  SyncGap,
  JobSummary,
  QueueStats,
  ImpersonationSession,
  WebhookDeliveryAttempt,
  WebhookDeadLetter,
} from './types';

// Auth types
export type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from './auth-api';
