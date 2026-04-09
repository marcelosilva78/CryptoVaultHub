# Features Reference

Detailed reference for every feature in CryptoVaultHub, organized by functional category. For each feature: what it does, how it works under the hood, which services are involved, relevant configuration, and API endpoints.

---

## Table of Contents

- [Wallet Management](#wallet-management)
  - [Multi-Chain EVM Support](#multi-chain-evm-support)
  - [Smart Contract Wallet Creation](#smart-contract-wallet-creation)
  - [Deterministic Deposit Addresses](#deterministic-deposit-addresses)
  - [Forwarder Wallets and Auto-Sweep](#forwarder-wallets-and-auto-sweep)
  - [Gas Tank Management](#gas-tank-management)
  - [Multi-Tenant Client Management](#multi-tenant-client-management)
- [Transaction Processing](#transaction-processing)
  - [Real-Time Deposit Detection](#real-time-deposit-detection)
  - [Confirmation Tracking](#confirmation-tracking)
  - [Withdrawal Processing](#withdrawal-processing)
  - [Multi-Signature Security](#multi-signature-security)
  - [Batch Operations](#batch-operations)
  - [Transaction Traceability](#transaction-traceability)
- [Security](#security)
  - [HD Key Management](#hd-key-management)
  - [Envelope Encryption](#envelope-encryption)
  - [Shamirs Secret Sharing](#shamirs-secret-sharing)
  - [Custody Modes](#custody-modes)
  - [Network Isolation](#network-isolation)
  - [Inter-Service Authentication](#inter-service-authentication)
- [Authentication and Authorization](#authentication-and-authorization)
  - [JWT Session Management](#jwt-session-management)
  - [Two-Factor Authentication](#two-factor-authentication)
  - [API Key Management](#api-key-management)
  - [Role-Based Access Control](#role-based-access-control)
- [Compliance](#compliance)
  - [KYT and AML Screening](#kyt-and-aml-screening)
  - [Sanctions List Synchronization](#sanctions-list-synchronization)
  - [Compliance Alert Management](#compliance-alert-management)
- [Notifications](#notifications)
  - [Webhook Delivery](#webhook-delivery)
  - [Webhook Security](#webhook-security)
  - [Delivery Retry and DLQ](#delivery-retry-and-dlq)
- [Monitoring and Observability](#monitoring-and-observability)
  - [PostHog Business Events](#posthog-business-events)
  - [Prometheus Metrics](#prometheus-metrics)
  - [Structured Logging](#structured-logging)
  - [Distributed Tracing](#distributed-tracing)
- [Frontend](#frontend)
  - [Admin Panel](#admin-panel)
  - [Client Portal](#client-portal)
  - [Client Onboarding Wizard](#client-onboarding-wizard)
  - [API Client SDK](#api-client-sdk)

---

## Wallet Management

### Multi-Chain EVM Support

**Description**: CryptoVaultHub supports multiple EVM-compatible blockchains from a single deployment. The same smart contracts and HD-derived keys work across all chains because EVM address derivation is chain-agnostic.

**Supported Chains**: Ethereum, BSC (BNB Smart Chain), Polygon, Arbitrum, Optimism, Avalanche, Base.

**How It Works**: Each chain is registered via the Admin API with its chain ID, RPC endpoints, contract addresses, and confirmation requirements. The Chain Indexer Service subscribes to each chain's WebSocket for real-time block monitoring. The same derived private key produces identical addresses on all chains.

**Services Involved**: Admin API (chain registration), Core Wallet Service (chain-specific operations), Chain Indexer Service (per-chain block scanning), Cron Worker Service (per-chain sweeps).

**Configuration**: Add `RPC_<CHAIN>_HTTP` and `RPC_<CHAIN>_WS` environment variables for each chain.

**API Endpoints**:
- `POST /admin/chains` -- Register a new chain
- `GET /admin/chains` -- List all chains

---

### Smart Contract Wallet Creation

**Description**: Each client gets a 2-of-3 multisig hot wallet per chain, deployed as an EIP-1167 minimal proxy clone of the CvhWalletSimple implementation via the CvhWalletFactory.

**How It Works**:
1. Admin triggers wallet creation for a client on a specific chain.
2. Core Wallet Service requests key generation from Key Vault Service (3 keys: platform, client, backup).
3. Core Wallet Service calls `CvhWalletFactory.createWallet()` with the 3 signer addresses and a salt.
4. The factory deploys an EIP-1167 proxy pointing to the CvhWalletSimple implementation and calls `init()` with the 3 signers.
5. Wallet address is stored in `cvh_wallets.wallets`.

**Services Involved**: Core Wallet Service (orchestration), Key Vault Service (key generation), blockchain (contract deployment).

**Gas Cost**: Approximately 45,000 gas for proxy deployment (vs. 2M+ for full contract).

**API Endpoints**:
- `POST /wallets/create` -- Create wallet for client
- `GET /wallets/:clientId` -- List wallets for client
- `GET /wallets/:clientId/:chainId/balances` -- Get wallet balances

---

### Deterministic Deposit Addresses

**Description**: Deposit addresses are computed deterministically using CREATE2 before any gas is spent. The address is known in advance and can receive funds before the forwarder contract is deployed.

**How It Works**:
1. Client requests deposit address generation (single or batch up to 100).
2. Core Wallet Service calls `CvhForwarderFactory.computeForwarderAddress()` with parent (hot wallet), feeAddress (gas tank), and a salt.
3. The computed address is stored in `cvh_wallets.deposit_addresses` with `is_deployed = false`.
4. The address is immediately usable for receiving ETH and tokens.
5. Deployment happens lazily when ERC-20 flushing is needed.

**Services Involved**: Core Wallet Service (address computation), Chain Indexer Service (monitoring the address for deposits).

**Key Property**: `address = CREATE2(factory, keccak256(msg.sender, parent, feeAddress, salt), proxyBytecodeHash)` -- fully deterministic and predictable.

**API Endpoints**:
- `POST /deposit-addresses/generate` -- Generate single address
- `POST /deposit-addresses/batch` -- Generate up to 100 addresses
- `GET /deposit-addresses/:clientId` -- List deposit addresses

---

### Forwarder Wallets and Auto-Sweep

**Description**: CvhForwarder contracts automatically forward received ETH to the parent hot wallet. ERC-20 tokens are accumulated and swept by the Cron Worker Service.

**How It Works**:
- **ETH**: When ETH is sent to a deployed forwarder, the `receive()` function triggers `flush()`, which sends all ETH to the parent wallet. No manual intervention needed.
- **ERC-20**: Tokens remain in the forwarder until the Cron Worker calls `flushTokens(tokenAddress)` or `batchFlushERC20Tokens(tokenAddresses[])`. The gas tank (feeAddress) pays for the flush transaction.
- **Lazy Deployment**: If a forwarder receives ERC-20 tokens but is not yet deployed, the Cron Worker deploys it first via `CvhForwarderFactory.createForwarder()`, then flushes.

**Services Involved**: Cron Worker Service (sweep scheduling, forwarder deployment), Core Wallet Service (balance queries), blockchain (contract calls).

**Access Control**: Flush operations can be called by the parent wallet address or the feeAddress (gas tank) via the `onlyAllowedAddress` modifier.

---

### Gas Tank Management

**Description**: Each client has a Gas Tank (EOA) per chain that pays for forwarder deployments and token flush operations. Separating gas costs from the hot wallet simplifies accounting.

**How It Works**:
1. Gas tank key is derived via `POST /keys/derive-gas-tank` on the Key Vault Service using derivation path `m/44'/60'/1000'/chainId/clientIndex`.
2. The gas tank address is registered as the `feeAddress` for all forwarders belonging to that client on that chain.
3. The Cron Worker monitors gas tank balances and alerts when below threshold.
4. Gas tanks can be topped up from the hot wallet via multisig operation.

**Services Involved**: Key Vault Service (gas tank key derivation), Cron Worker Service (balance monitoring), Admin Panel (gas tank dashboard at `/gas-tanks`).

---

### Multi-Tenant Client Management

**Description**: CryptoVaultHub is a B2B platform supporting multiple client organizations, each with configurable tiers, custody modes, chain access, and token registries.

**How It Works**: Each client has a record in `cvh_admin.clients` with: name, custody mode (full_custody or co_sign), tier assignment, enabled chains, and status. Tiers define rate limits and resource quotas. Per-client overrides allow customization without creating new tiers.

**Services Involved**: Admin API (client CRUD), Auth Service (client-scoped API keys), Core Wallet Service (client-scoped operations).

**API Endpoints**:
- `POST /admin/clients` -- Create client
- `GET /admin/clients` -- List clients
- `POST /admin/tiers` -- Create tier

---

## Transaction Processing

### Real-Time Deposit Detection

**Description**: A dual-strategy system detects deposits to monitored addresses across all configured chains with minimal latency.

**How It Works**:
1. **WebSocket Strategy (Primary)**: The `RealtimeDetectorService` subscribes to `newHeads` events on each chain's WebSocket provider. On each new block, it scans for ERC-20 `Transfer(address,address,uint256)` events and native ETH transfers to any address in the monitored set.
2. **Polling Strategy (Fallback)**: If WebSocket is unavailable or disconnects, the service falls back to polling-based block scanning using the HTTP RPC endpoint.
3. **Detection**: When a deposit is detected, a `DetectedDeposit` event is published to a Redis Stream containing: chainId, txHash, blockNumber, fromAddress, toAddress, contractAddress (null for ETH), amount, clientId, walletId.

**Services Involved**: Chain Indexer Service (detection), Redis (event stream), Core Wallet Service (consumption).

**Monitored Address Set**: Loaded from `cvh_indexer.monitored_addresses` at startup and kept in memory as a Map for O(1) lookups.

**Configuration**: RPC endpoints configured via `RPC_<CHAIN>_HTTP` and `RPC_<CHAIN>_WS` environment variables.

---

### Confirmation Tracking

**Description**: After a deposit or withdrawal is detected/broadcasted, the system tracks block confirmations with reorg protection.

**How It Works**:
1. A BullMQ delayed job is created for each deposit/withdrawal in the `confirmation-tracker` queue.
2. The `ConfirmationTrackerService` worker checks the current block number against the transaction's block number.
3. At each milestone (1, 3, 6, 12 confirmations), it verifies the transaction receipt still exists (reorg protection) and publishes a webhook event.
4. If the receipt disappears between checks, the deposit is marked as reorged and the client is notified.
5. Status progression: `pending` -> `confirming` -> `confirmed`.

**Services Involved**: Chain Indexer Service (confirmation worker), Core Wallet Service (status updates), Notification Service (milestone webhooks).

**Milestones**: Configurable per chain via `confirmationsRequired` in `cvh_admin.chains`.

---

### Withdrawal Processing

**Description**: Withdrawals are created, validated, compliance-screened, signed, and submitted on-chain through a multi-step pipeline.

**How It Works**:
1. Client submits withdrawal request with destination address ID, amount, and idempotency key.
2. Core Wallet Service validates: destination is whitelisted (past 24h cooldown), idempotency key is unique, wallet balance is sufficient.
3. KYT screening runs on the destination address (if enabled).
4. Signing request sent to Key Vault over vault-net. Platform key signs the operation hash. In full custody mode, the client key also signs. In co-sign mode, the withdrawal waits for the client's signature.
5. Multisig transaction is submitted on-chain via `CvhWalletSimple.sendMultiSig()` or `sendMultiSigToken()`.
6. Confirmation tracking begins via BullMQ.

**Services Involved**: Client API (request intake), Core Wallet Service (orchestration, validation, submission), Key Vault Service (signing), Chain Indexer Service (confirmation), Notification Service (webhooks).

**API Endpoints**:
- `POST /withdrawals/create` -- Create withdrawal
- `GET /withdrawals/:clientId` -- List withdrawals

---

### Multi-Signature Security

**Description**: Every withdrawal from a CvhWalletSimple requires 2 of 3 signatures, enforced on-chain.

**How It Works**:
1. Three signers are set during wallet initialization: platformKey, clientKey, backupKey.
2. For each withdrawal, an `operationHash` is computed: `keccak256(networkId, toAddress, value, data, expireTime, sequenceId)`.
3. Signer 1 is `msg.sender` (the transaction submitter, typically the platform key via the gas tank).
4. Signer 2's signature is verified via `ecrecover` on the Ethereum-prefixed hash.
5. The contract verifies both signers are in the allowed set and are different from each other.

**Security Features**:
- **Sequence ID Window**: 10 slots, max increase of 10,000 per operation. Prevents replay.
- **Chain ID Binding**: `block.chainid` included in operation hash with type suffixes (`-ERC20`, `-Batch`).
- **Signature Malleability**: `s <= secp256k1n/2` enforced.
- **Operation Expiry**: `expireTime < block.timestamp` rejects stale operations.
- **Safe Mode**: Irrevocable lockdown restricting transfers to signer addresses only.

---

### Batch Operations

**Description**: Multiple batch mechanisms reduce gas costs and operational overhead.

**Batch Types**:
- `CvhWalletSimple.sendMultiSigBatch()`: Send ETH to up to 255 recipients in a single multisig transaction.
- `CvhForwarder.batchFlushERC20Tokens()`: Flush multiple ERC-20 tokens from a forwarder in one transaction.
- `CvhBatcher.batchTransfer()`: Owner-only. Distribute ETH to multiple addresses (standalone, not multisig).
- `CvhBatcher.batchTransferToken()`: Owner-only. Distribute ERC-20 tokens to multiple addresses (requires prior approval).
- `POST /deposit-addresses/batch`: Generate up to 100 deposit addresses in a single API call.

**Services Involved**: Core Wallet Service (batch address generation), Cron Worker Service (batch flush), blockchain (batch contract calls).

---

### Transaction Traceability

**Description**: Every transaction is tracked end-to-end with JSON artifacts, event capture, and correlated traces across all systems.

**How It Works**:
1. Each operation gets a unique trace ID that flows through all services.
2. PostHog captures every API request/response, blockchain event, and compliance action.
3. Loki receives structured JSON logs from all services with the trace ID.
4. Jaeger records distributed traces across service boundaries.
5. The Admin Panel's traceability page (`/traceability`) connects all three data sources via the shared trace ID.
6. JSON artifacts are stored at each stage: creation parameters, KYT screening results, signing details, broadcast receipt, confirmation milestones, webhook deliveries.

**Services Involved**: All services (via PostHog interceptor and Loki logging), Admin Panel (traceability UI).

**Database**: Traceability views in `database/011-traceability-views.sql` provide pre-built queries for common forensic scenarios.

---

## Security

### HD Key Management

**Description**: All cryptographic keys are derived from a single BIP-39 master seed using BIP-44 hierarchical deterministic derivation.

**Derivation Paths**:
```
Master Seed (256 bits, BIP-39 24 words)
  |
  +-> PBKDF2-HMAC-SHA512
  |
  +-> Master Key (BIP-32 root)
       |
       +-> m/44'/60'/(clientIndex*3+0)'/0/0  --> Platform Key
       +-> m/44'/60'/(clientIndex*3+1)'/0/0  --> Client Key
       +-> m/44'/60'/(clientIndex*3+2)'/0/0  --> Backup Key
       +-> m/44'/60'/1000'/chainId/clientIndex --> Gas Tank Key
```

**Services Involved**: Key Vault Service (sole custodian of all key material).

**API Endpoints**:
- `POST /keys/generate` -- Generate HD keys for a new client
- `POST /keys/derive-gas-tank` -- Derive gas tank key
- `GET /keys/:clientId/public` -- Get public keys (no private key exposure)
- `POST /keys/:clientId/sign` -- Sign a hash
- `POST /keys/:clientId/sign-batch` -- Sign multiple hashes

---

### Envelope Encryption

**Description**: Private keys are encrypted at rest using a two-layer envelope encryption scheme.

**Process**:
1. Generate random 256-bit DEK (Data Encryption Key) and 32-byte salt.
2. Derive KEK (Key Encryption Key) from `VAULT_MASTER_PASSWORD` via `pbkdf2Sync(password, salt, 600000, 32, 'sha512')`.
3. Encrypt private key with DEK using `aes-256-gcm`.
4. Wrap DEK with KEK using `aes-256-gcm`.
5. Zero DEK and KEK from memory (`.fill(0)`).
6. Store: ciphertext, IV, authTag, salt, encryptedDek in `cvh_keyvault.derived_keys`.

**Implementation**: `services/key-vault-service/src/encryption/encryption.service.ts`

**Configuration**: `VAULT_MASTER_PASSWORD` (master password), `KDF_ITERATIONS` (default: 600000).

---

### Shamirs Secret Sharing

**Description**: Each client's backup key is split into 5 shares using Shamir's Secret Sharing with a 3-of-5 reconstruction threshold.

**Share Distribution**:

| Share | Custodian | Storage |
|-------|-----------|---------|
| 1 | Client (primary contact) | Secure password manager |
| 2 | CVH Platform Admin | Hardware security module or secure vault |
| 3 | Cold Storage | Offline, encrypted USB in physical vault |
| 4 | Client (secondary contact) | Separate secure storage |
| 5 | Physical Vault | Bank safety deposit box |

**Services Involved**: Key Vault Service (split and reconstruct operations).

**API Endpoints**:
- `POST /shamir/:clientId/split` -- Split backup key into 5 shares
- `POST /shamir/:clientId/reconstruct` -- Reconstruct from 3+ shares
- `GET /shamir/:clientId/status` -- Check share status

---

### Custody Modes

**Description**: Each client is configured with a custody mode that determines signing behavior.

**Full Custody**: CVH controls both platform key and client key. Withdrawals are fully automated -- no client intervention required. Best for payment gateways wanting full automation.

**Co-Sign**: CVH controls platform key; client controls their own key. Both parties must sign every withdrawal. Client submits their signature via `POST /client/v1/co-sign/:operationId/sign`. Best for large exchanges wanting co-custody control.

**Client-Initiated (Planned)**: Client signs first, CVH auto-signs after validation. Not yet implemented.

---

### Network Isolation

**Description**: Four Docker networks enforce strict security boundaries.

- **vault-net** (internal: true): Zero internet access. Only Core Wallet Service and Key Vault Service. Private keys never leave this network.
- **internal-net** (internal: true): All NestJS services and Redis. No external access.
- **public-net**: Kong, Admin Panel, Client Portal. Internet-facing.
- **monitoring-net**: PostHog, Prometheus, Grafana, Loki, Jaeger. Bridges to internal-net for metric scraping.

---

### Inter-Service Authentication

**Description**: Internal service-to-service communication is authenticated using a shared secret with timing-safe comparison.

**Mechanism**: The `InternalServiceGuard` validates the `X-Internal-Service-Key` header on every request:
1. Extracts the header value.
2. Compares against `INTERNAL_SERVICE_KEY` env var using `crypto.timingSafeEqual()`.
3. Length check first (prevents timing leak on different-length strings).
4. Rejects with `401 Unauthorized` if missing or invalid.

**Applied To**: Key Vault Service (all controllers), Core Wallet Service, Notification Service.

**Implementation**: `services/key-vault-service/src/common/guards/internal-service.guard.ts` (identical copies in each service).

---

## Authentication and Authorization

### JWT Session Management

**Description**: Web users (admin and client portals) authenticate via JWT sessions.

**Flow**:
1. `POST /auth/login` with email + password.
2. If 2FA is not enabled: returns access token (default 15m TTL) and refresh token (default 7d TTL).
3. If 2FA is enabled: returns `requires2fa: true` with an opaque challenge token (2m TTL JWT).
4. Client submits TOTP code via `POST /auth/2fa/challenge` with the challenge token.
5. On success: returns access + refresh tokens.
6. Refresh: `POST /auth/refresh` with refresh token.
7. Logout: `POST /auth/logout` invalidates the session.

**Security**:
- Refresh tokens are SHA-256 hashed before storage in `cvh_auth.sessions`.
- Sessions track IP address, user agent, and expiry.
- Login attempts are tracked per IP and email with lockout after excessive failures.
- Challenge tokens are opaque JWTs (not user IDs) to prevent enumeration.

**Configuration**: `JWT_SECRET`, `JWT_EXPIRES_IN_SECONDS` (default: 900), `REFRESH_TOKEN_TTL_DAYS` (default: 7).

---

### Two-Factor Authentication

**Description**: TOTP-based 2FA (RFC 6238) is mandatory for admin users and configurable for client users.

**Flow**:
1. Setup: `POST /auth/2fa/setup` generates a TOTP secret and returns a `otpauth://` URI for QR code scanning.
2. Verify: `POST /auth/2fa/verify` with a code from the authenticator app enables 2FA.
3. Login: When 2FA is enabled, login returns a challenge token; client submits code via `POST /auth/2fa/challenge`.
4. Disable: `POST /auth/2fa/disable` requires both a valid TOTP code AND the user's password.

**Security**:
- TOTP secrets are encrypted at rest using AES-256-GCM.
- Per-operation random salt: each encryption uses a fresh 16-byte salt with scrypt key derivation.
- Format: `salt:iv:authTag:ciphertext` (all hex-encoded).
- TOTP window: 30 seconds with 1-step tolerance.
- TOTP attempt rate limiting prevents brute force.

**Configuration**: `TOTP_ENCRYPTION_KEY` (raw encryption key, used with scrypt for per-operation derivation).

---

### API Key Management

**Description**: Client integrations authenticate via API keys sent in the `X-API-Key` header.

**Features**:
- **Scopes**: `read`, `write`, `withdraw` -- controls which endpoints the key can access.
- **IP Allowlist**: JSON array of allowed IP addresses. Requests from other IPs are rejected.
- **Allowed Chains**: JSON array of chain IDs. Restricts key to specific chains.
- **Expiration**: Optional expiry date after which the key is invalid.
- **Label**: Human-readable name for identification.
- **Usage Tracking**: `last_used_at`, `last_used_ip`, `usage_count` updated on each use.

**Security**: Keys are SHA-256 hashed before storage. The plaintext key is returned only once at creation and cannot be retrieved again.

**API Endpoints**:
- `POST /auth/api-keys` -- Create key (requires super_admin, admin, or owner role)
- `GET /auth/api-keys` -- List keys (admin sees all, users see their own)
- `DELETE /auth/api-keys/:id` -- Revoke key
- `POST /auth/api-keys/validate` -- Validate key (internal use)

---

### Role-Based Access Control

**Description**: Two role hierarchies control access to admin and client operations.

**Admin Roles**:

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access to all admin operations |
| `admin` | CRUD on clients, tiers, chains, tokens, compliance |
| `viewer` | Read-only access to all admin data |

**Client Roles**:

| Role | Permissions |
|------|-------------|
| `owner` | Full access including API key management and security settings |
| `admin` | CRUD on wallets, addresses, webhooks |
| `viewer` | Read-only access to client data |

**Implementation**: `@AdminAuth()` decorator combines `AuthGuard('jwt')` with `RolesGuard`, checking the user's role from the JWT payload against the required roles.

---

## Compliance

### KYT and AML Screening

**Description**: Configurable Know Your Transaction (KYT) screening checks deposit source addresses and withdrawal destinations against international sanctions lists.

**How It Works**:
1. When a deposit is detected or withdrawal is created, the Core Wallet Service's `ComplianceService` checks the relevant address.
2. The address is compared against all entries in `cvh_compliance.sanctions_entries`.
3. Results are categorized: CLEAR (no match), HIT (exact match), POSSIBLE_MATCH (partial match).
4. HIT: Transaction is blocked and a compliance alert is created.
5. POSSIBLE_MATCH: Transaction is routed to the compliance review queue.
6. Results are stored in `cvh_compliance.screening_results`.

**Lists Screened**: OFAC SDN + Consolidated, EU sanctions, UN sanctions, UK OFSI.

**API Endpoints**:
- `POST /compliance/screen` -- Screen an address
- `GET /compliance/alerts` -- List compliance alerts
- `PATCH /compliance/alerts/:id` -- Update alert status
- `GET /compliance/screenings` -- List screening history

---

### Sanctions List Synchronization

**Description**: The Cron Worker Service automatically downloads and updates sanctions lists from official sources.

**How It Works**:
1. Daily scheduled job (`SanctionsListSyncService`) downloads XML feeds from OFAC, EU, UN, and UK OFSI.
2. Entries are parsed and upserted into `cvh_compliance.sanctions_entries`.
3. Stale entries (not present in the latest sync) are marked as removed.
4. Each sync is logged for audit purposes.

**Services Involved**: Cron Worker Service (sync execution), database (`cvh_compliance.sanctions_entries`).

---

### Compliance Alert Management

**Description**: When a screening produces a HIT or POSSIBLE_MATCH, a compliance alert is created for human review.

**Alert Workflow**:
1. Alert created with status `open`.
2. Compliance officer reviews in Admin Panel (`/compliance`).
3. Officer can: confirm as legitimate (resolve), escalate, or dismiss.
4. Status update via `PATCH /compliance/alerts/:id`.
5. All actions are logged in `cvh_admin.audit_logs`.

---

## Notifications

### Webhook Delivery

**Description**: Transaction lifecycle events are delivered to client-configured HTTP endpoints.

**Supported Events**:
- `deposit.pending` -- Deposit detected, 0 confirmations
- `deposit.confirming` -- Deposit at milestone confirmation (1, 3, 6)
- `deposit.confirmed` -- Deposit fully confirmed
- `deposit.swept` -- Tokens swept from forwarder to hot wallet
- `withdrawal.broadcasted` -- Withdrawal transaction submitted
- `withdrawal.confirming` -- Withdrawal at milestone confirmation
- `withdrawal.confirmed` -- Withdrawal fully confirmed

**API Endpoints**:
- `POST /webhooks` -- Create webhook endpoint
- `GET /webhooks/client/:clientId` -- List webhooks
- `PATCH /webhooks/:id` -- Update webhook
- `DELETE /webhooks/:id` -- Delete webhook
- `GET /webhooks/:id/deliveries` -- View delivery log
- `POST /webhooks/deliver` -- Trigger delivery (internal)

---

### Webhook Security

**Description**: Every webhook payload is signed to prevent tampering.

**Mechanism**:
1. A unique signing secret is generated for each webhook endpoint at creation time.
2. For each delivery, the payload is signed: `HMAC-SHA256(signingSecret, JSON.stringify(payload))`.
3. The signature is sent in the `X-CVH-Signature` header.
4. Clients must verify the signature before processing the payload.

---

### Delivery Retry and DLQ

**Description**: Failed webhook deliveries are retried with exponential backoff.

**Retry Policy**:
1. First delivery attempt immediately.
2. On HTTP error (non-2xx) or timeout: exponential backoff with jitter.
3. Each attempt is logged in `cvh_notifications.webhook_deliveries` with HTTP status, response body, and latency.
4. After exhausting retries: delivery is routed to the Dead Letter Queue (DLQ).
5. DLQ deliveries can be manually retried from the Admin Panel.

---

## Monitoring and Observability

### PostHog Business Events

**Description**: Self-hosted PostHog captures every business event for analytics and audit.

**Captured Events**:
- API requests and responses (via NestJS interceptor per service)
- Webhook deliveries (payload, status, response time)
- Blockchain events (deposits detected, sweeps executed, withdrawals confirmed)
- Compliance screenings (address, result, list matched)
- Admin actions (client management, tier changes, key generation)

**Services Involved**: All services (via `@cvh/posthog` package and interceptor), PostHog stack (web, worker, ClickHouse, Kafka, PostgreSQL).

**Access**: `http://localhost:8010`

---

### Prometheus Metrics

**Description**: Prometheus scrapes metrics from Kong and all NestJS services at 15-second intervals.

**Scrape Targets**: Kong Admin (`:8001`), Admin API (`:3001`), Client API (`:3002`), Auth Service (`:3003`), Core Wallet (`:3004`), Chain Indexer (`:3006`), Notification (`:3007`), Cron Worker (`:3008`).

**Configuration**: `infra/prometheus/prometheus.yml`

**Access**: `http://localhost:9090`

---

### Structured Logging

**Description**: All services emit structured JSON logs shipped to Loki for centralized log aggregation.

**Log Format**: JSON with fields: timestamp, level, service, message, trace_id, and context-specific data.

**Query Examples**:
```
{service="core-wallet"} | json | level="error"
{service="chain-indexer"} | json | event="deposit_detected"
{service="key-vault"} | json | action="sign"
```

**Access**: Via Grafana at `http://localhost:3000` with Loki data source.

---

### Distributed Tracing

**Description**: Jaeger provides end-to-end distributed traces across service boundaries via OTLP.

**Trace Correlation**: A single trace ID connects: API request -> Core Wallet processing -> Key Vault signing -> blockchain submission -> confirmation tracking -> webhook delivery. The same trace ID appears in PostHog events and Loki logs.

**Access**: `http://localhost:16686`

---

## Frontend

### Admin Panel

**Description**: Internal administration application for platform operators.

**Technology**: Next.js 14 (App Router), Tailwind CSS, shadcn/ui, Recharts, Framer Motion, `@cvh/api-client` with TanStack Query.

**Pages**: Dashboard, Clients (with detail view), Traceability, Tiers, Chains, Tokens, Compliance, Gas Tanks, Monitoring, Analytics (Operations and Compliance sub-pages), Login.

**Design**: Implements the CryptoVaultHub visual identity system with Vault Gold accent, dual-font system, dark/light mode, and data-driven visual components.

**Port**: 3010

---

### Client Portal

**Description**: Self-service application for client exchanges and payment gateways.

**Technology**: Same stack as Admin Panel.

**Pages**: Dashboard, Setup Wizard, Wallets, Deposit Addresses, Deposits, Withdrawals, Transactions, Webhooks, API Keys, Security, Settings, Login.

**Port**: 3011

---

### Client Onboarding Wizard

**Description**: A 7-step interactive setup wizard that guides new clients through their entire onboarding process with live blockchain interaction.

**Steps**:

| Step | Name | What Happens |
|------|------|-------------|
| 1 | Chain | Client selects which EVM chains to activate (Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Base) |
| 2 | Wallet | HD key generation, wallet creation, creation JSON artifact display, private key reveal (one-time) |
| 3 | Deposit | First deposit address generation, QR code display, deposit simulation |
| 4 | Withdrawal | Address whitelist configuration, 24h cooldown explanation, withdrawal limit setup |
| 5 | Deploy | Smart contract deployment with live status tracking (pending -> deploying -> confirming -> confirmed) |
| 6 | Test | Live balance monitoring with heartbeat indicator, test deposit verification |
| 7 | Complete | Setup summary, links to dashboard, webhooks, API keys |

**Visual Components**: Hexagonal step indicators with chain links, contract deployment pipeline with hexagonal spinners, QR code display, JSON artifact viewer with syntax highlighting, private key reveal with one-time view, live balance with digit slide animation.

**Implementation**: `apps/client/app/setup/page.tsx` (~1,569 lines).

---

### API Client SDK

**Description**: Type-safe API client shared across both frontend applications.

**Package**: `@cvh/api-client` (`packages/api-client/`)

**Features**:
- Type-safe API methods generated from `@cvh/types`
- TanStack Query (React Query v5) hooks for automatic caching, deduplication, and background refetching
- Separate entry points: `@cvh/api-client` (core client) and `@cvh/api-client/hooks` (React hooks)

**Usage**:
```typescript
import { useWallets, useDeposits } from '@cvh/api-client/hooks';

function WalletsPage() {
  const { data: wallets, isLoading } = useWallets(clientId);
  // ...
}
```
