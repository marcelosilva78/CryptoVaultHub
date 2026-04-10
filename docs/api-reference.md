# CryptoVaultHub v2 -- API Reference

All APIs are accessed through the Kong API Gateway on port 8000 (HTTP) or 8443 (HTTPS).

---

## Admin API (port 3001)

Base path: `/admin`
Authentication: **JWT Bearer token** (`Authorization: Bearer <token>`)
Rate limit: 50 req/s (Kong)

### Client Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/admin/clients` | Create a new client organization | super_admin, admin |
| `GET` | `/admin/clients` | List all clients (paginated, filterable by status/search) | all admin roles |
| `GET` | `/admin/clients/:id` | Get a single client by ID | all admin roles |
| `PATCH` | `/admin/clients/:id` | Update client (name, status, tier, custody mode, KYT settings) | super_admin, admin |
| `POST` | `/admin/clients/:id/generate-keys` | Trigger HD key generation for a client across all active chains | super_admin, admin |

### Chain Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/admin/chains` | Register a new EVM blockchain network | super_admin, admin |
| `GET` | `/admin/chains` | List all configured chains | all admin roles |

### Token Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/admin/tokens` | Add an ERC-20 token to the registry | super_admin, admin |
| `GET` | `/admin/tokens` | List all registered tokens across all chains | all admin roles |

### Tier Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/admin/tiers` | Create a new service tier | super_admin, admin |
| `GET` | `/admin/tiers` | List all tiers (preset + custom) | all admin roles |
| `PATCH` | `/admin/tiers/:id` | Update a tier's settings | super_admin, admin |
| `POST` | `/admin/tiers/:id/clone` | Clone an existing tier | super_admin, admin |

### Compliance Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/admin/compliance/alerts` | List KYT/AML compliance alerts (paginated, filterable) | all admin roles |
| `PATCH` | `/admin/compliance/alerts/:id` | Update alert status (acknowledge, escalate, resolve, dismiss) | super_admin, admin |

### Monitoring

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/admin/monitoring/health` | System health status for all services + infrastructure | all admin roles |
| `GET` | `/admin/monitoring/queues` | BullMQ queue status (depth, workers, failed jobs) | all admin roles |
| `GET` | `/admin/gas-tanks` | Gas tank balances across all active chains | all admin roles |

### Project Management (NEW in v2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/admin/projects` | Create a project for a client | super_admin, admin |
| `GET` | `/admin/projects` | List all projects (filterable by client_id) | all admin roles |
| `GET` | `/admin/projects/:id` | Get project details | all admin roles |
| `PATCH` | `/admin/projects/:id` | Update project settings | super_admin, admin |
| `DELETE` | `/admin/projects/:id` | Deactivate a project | super_admin, admin |

### Job Management (NEW in v2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/admin/jobs` | List jobs (paginated, filterable by status/queue/chain) | all admin roles |
| `GET` | `/admin/jobs/:id` | Get job details including attempts and logs | all admin roles |
| `POST` | `/admin/jobs/:id/retry` | Retry a failed/dead-letter job | super_admin, admin |
| `POST` | `/admin/jobs/:id/cancel` | Cancel a pending/queued job | super_admin, admin |
| `POST` | `/admin/jobs/batch-retry` | Batch retry multiple failed jobs | super_admin, admin |
| `GET` | `/admin/jobs/dead-letter` | List dead-letter queue entries | all admin roles |
| `POST` | `/admin/jobs/dead-letter/:id/reprocess` | Move dead-letter job back to queue | super_admin, admin |

### RPC Management (NEW in v2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/admin/rpc/providers` | List all configured RPC providers per chain | all admin roles |
| `POST` | `/admin/rpc/providers` | Add a new RPC provider | super_admin, admin |
| `PATCH` | `/admin/rpc/providers/:id` | Update provider config (URL, priority, weight, rate limit) | super_admin, admin |
| `DELETE` | `/admin/rpc/providers/:id` | Remove an RPC provider | super_admin, admin |
| `GET` | `/admin/rpc/health` | RPC provider health status with latency metrics | all admin roles |

### Sync Management (NEW in v2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/admin/sync/status` | Indexer sync status per chain (current block, head block, lag) | all admin roles |
| `GET` | `/admin/sync/gaps` | List detected block gaps per chain | all admin roles |
| `POST` | `/admin/sync/backfill` | Trigger backfill for a block range on a chain | super_admin, admin |
| `GET` | `/admin/sync/health` | Sync health dashboard (severity levels, alerts) | all admin roles |

### Export Management (NEW in v2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/admin/exports` | Request a data export (deposits, withdrawals, clients, etc.) | super_admin, admin |
| `GET` | `/admin/exports` | List export requests | all admin roles |
| `GET` | `/admin/exports/:id` | Get export status and download URL | all admin roles |
| `GET` | `/admin/exports/:id/download` | Download export file | super_admin, admin |

---

## Client API (port 3002)

Base path: `/client/v1`
Authentication: **API Key** (`X-API-Key: cvh_live_xxx`)
Rate limit: 100 req/s (Kong, per-client limits via tier)

### Wallets

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `GET` | `/client/v1/wallets` | List all wallets for the client | read |
| `GET` | `/client/v1/wallets/:chainId/balances` | Get token balances for a chain's hot wallet | read |

### Deposits

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/wallets/:chainId/deposit-address` | Generate a single deposit address (CREATE2) | write |
| `POST` | `/client/v1/wallets/:chainId/deposit-addresses/batch` | Batch generate deposit addresses (1-100) | write |
| `GET` | `/client/v1/deposit-addresses` | List all deposit addresses (paginated) | read |
| `GET` | `/client/v1/deposits` | List deposits (paginated, filterable by status/chain/date) | read |
| `GET` | `/client/v1/deposits/:id` | Get deposit details | read |

### Withdrawals

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/withdrawals` | Create a withdrawal request (idempotent via idempotencyKey) | write |
| `GET` | `/client/v1/withdrawals` | List withdrawals (paginated, filterable by status/chain/date) | read |
| `GET` | `/client/v1/withdrawals/:id` | Get withdrawal details | read |

### Address Book

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/addresses` | Add a whitelisted address (24-hour cooldown) | write |
| `GET` | `/client/v1/addresses` | List whitelisted addresses (paginated, filterable by chain) | read |
| `PATCH` | `/client/v1/addresses/:id` | Update address label/notes | write |
| `DELETE` | `/client/v1/addresses/:id` | Disable a whitelisted address (soft delete) | write |

### Webhooks

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/webhooks` | Create a webhook endpoint | write |
| `GET` | `/client/v1/webhooks` | List webhook endpoints | read |
| `PATCH` | `/client/v1/webhooks/:id` | Update webhook URL/events/active status | write |
| `DELETE` | `/client/v1/webhooks/:id` | Delete a webhook endpoint | write |
| `POST` | `/client/v1/webhooks/:id/test` | Send a test ping to a webhook | write |
| `GET` | `/client/v1/webhooks/:id/deliveries` | List delivery attempts for a webhook | read |
| `POST` | `/client/v1/webhooks/deliveries/:id/retry` | Retry a failed delivery | write |

### API Keys

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/auth/api-keys` | Create an API key (via auth-service) | JWT (super_admin, admin, owner) |
| `GET` | `/auth/api-keys` | List API keys for the client | JWT |
| `DELETE` | `/auth/api-keys/:id` | Revoke an API key | JWT (super_admin, admin, owner) |

### Co-Sign

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/co-sign/pending` | List pending co-sign operations | read |
| `POST` | `/client/v1/co-sign/:operationId/sign` | Submit a co-signature (ECDSA hex) | write |

### Projects (NEW in v2)

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/projects` | Create a project | write |
| `GET` | `/client/v1/projects` | List projects | read |
| `GET` | `/client/v1/projects/:id` | Get project details | read |
| `PATCH` | `/client/v1/projects/:id` | Update project | write |

### Flush Operations (NEW in v2)

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/flush/tokens` | Flush ERC-20 tokens from forwarder(s) to hot wallet | write |
| `POST` | `/client/v1/flush/native` | Sweep native currency from forwarder(s) | write |
| `POST` | `/client/v1/flush/batch` | Batch flush multiple forwarders | write |
| `POST` | `/client/v1/flush/dry-run` | Simulate a flush (estimate gas, check balances) | read |
| `GET` | `/client/v1/flush/:id` | Get flush operation status | read |
| `GET` | `/client/v1/flush` | List flush operations (paginated) | read |

### Deploy Traces (NEW in v2)

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `GET` | `/client/v1/deploy-traces` | List forwarder deployment traces | read |
| `GET` | `/client/v1/deploy-traces/:id` | Get deployment trace details (tx hash, gas, block) | read |

### Address Groups (NEW in v2)

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/address-groups` | Create an address group (multi-chain deterministic) | write |
| `GET` | `/client/v1/address-groups` | List address groups | read |
| `GET` | `/client/v1/address-groups/:id` | Get address group with per-chain provisioning status | read |
| `POST` | `/client/v1/address-groups/:id/provision` | Provision the address on additional chains | write |

### Exports (NEW in v2)

| Method | Path | Description | Scope |
|--------|------|-------------|-------|
| `POST` | `/client/v1/exports` | Request a data export (deposits, withdrawals, addresses) | write |
| `GET` | `/client/v1/exports` | List export requests | read |
| `GET` | `/client/v1/exports/:id` | Get export status and download URL | read |

---

## Auth Service (port 3003)

Base path: `/auth`
Rate limit: 10 req/s (Kong)

### Session Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/auth/login` | Login with email + password (+ optional TOTP code) | None |
| `POST` | `/auth/2fa/challenge` | Complete 2FA with challenge token + TOTP code | None (challenge token) |
| `POST` | `/auth/refresh` | Refresh an access token using a refresh token | None (refresh token) |
| `POST` | `/auth/logout` | Invalidate a refresh token (destroy session) | None (refresh token) |

### Two-Factor Authentication

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/auth/2fa/setup` | Generate TOTP secret + QR code URI | JWT |
| `POST` | `/auth/2fa/verify` | Verify TOTP code to enable 2FA | JWT |
| `POST` | `/auth/2fa/disable` | Disable 2FA (requires password + TOTP code) | JWT |

### API Key Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/auth/api-keys` | Create an API key for a client | JWT (super_admin, admin, owner) |
| `GET` | `/auth/api-keys` | List API keys | JWT |
| `DELETE` | `/auth/api-keys/:id` | Revoke an API key | JWT (super_admin, admin, owner) |
| `POST` | `/auth/api-keys/validate` | Validate an API key (internal, called by client-api) | None (internal) |

### Impersonation (NEW in v2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/auth/impersonate` | Start an impersonation session (read_only or full) | JWT (super_admin only) |
| `POST` | `/auth/impersonate/end` | End impersonation, return to original session | JWT (impersonated) |

---

## RPC Gateway (port 3009) -- Internal Only (NEW in v2)

Not exposed through Kong. Accessed only by internal services on `internal-net`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/rpc/:chainId/call` | Proxy an RPC call to the best available provider for the chain |
| `GET` | `/rpc/:chainId/block-number` | Get the latest block number for a chain |
| `GET` | `/rpc/health` | Health status of all RPC providers |

---

## Health Endpoints

Every service exposes a health check at `GET /health` (used by Docker healthcheck):

| Service | URL | Interval |
|---------|-----|----------|
| admin-api | `http://localhost:3001/health` | 30s |
| client-api | `http://localhost:3002/health` | 30s |
| auth-service | `http://localhost:3003/health` | 30s |
| core-wallet-service | `http://localhost:3004/health` | 30s |
| key-vault-service | `http://localhost:3005/health` | 30s |
| chain-indexer-service | `http://localhost:3006/health` | 30s |
| notification-service | `http://localhost:3007/health` | 30s |
| cron-worker-service | `http://localhost:3008/health` | 30s |

---

## Webhook Event Types

Events emitted to client webhook endpoints:

| Event | Trigger |
|-------|---------|
| `deposit.detected` | Deposit transaction seen on-chain (pending confirmation) |
| `deposit.confirmed` | Deposit reached required confirmations |
| `deposit.swept` | Deposited funds swept to hot wallet |
| `withdrawal.submitted` | Withdrawal transaction broadcast to network |
| `withdrawal.confirmed` | Withdrawal confirmed on-chain |
| `withdrawal.failed` | Withdrawal transaction failed |
| `forwarder.deployed` | Forwarder contract deployed on-chain |
| `test.ping` | Manual test webhook delivery |

Wildcard subscriptions: `deposit.*`, `withdrawal.*`, `*` (all events).

---

## Common Response Format

All endpoints return a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

Error responses:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error",
  "error": "Bad Request"
}
```
