# CryptoVaultHub — Design Specification

**Date**: 2026-04-08
**Status**: Approved
**Author**: Claude + Marcelo
**Mockups**: `mockups/admin-panel.html`, `mockups/client-panel.html`

---

## 1. Overview

CryptoVaultHub (CVH) is an enterprise-grade, self-hosted EVM cryptocurrency wallet management platform. It enables businesses (exchanges, payment gateways) to manage wallets, deposit addresses, sweeps, and withdrawals via API and web interfaces, with full compliance (KYT/OFAC), multi-chain support, and end-to-end traceability.

### Core Value Proposition

- **B2B Multi-tenant**: Each client (exchange, gateway) gets isolated wallets, deposit addresses, and configurations
- **Self-hosted, no third-party wallet APIs**: Direct RPC node communication, self-managed smart contracts, self-hosted compliance screening
- **Enterprise security**: Air-gapped Key Vault, 2-of-3 multisig on-chain, HD wallets with Shamir backup
- **Full observability**: PostHog for business events, Prometheus/Grafana for infra, Loki for logs, Jaeger for traces

### Target Clients

1. **Cryptocurrency Exchanges**: Generate deposit addresses for end-users, sweep funds to hot wallet, process withdrawals
2. **Payment Gateways**: Accept crypto payments, forward to merchant wallet, webhook notifications on confirmations
3. **Custody Providers**: Manage wallets with co-signing capabilities

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend APIs** | NestJS (TypeScript) |
| **Frontend** | Next.js 14+ (App Router), Tailwind CSS, shadcn/ui |
| **Database** | MySQL 8+ (existing cluster) |
| **Cache/Queues** | Redis 7 + BullMQ |
| **Blockchain** | ethers.js v6 or viem, Hardhat (smart contracts) |
| **Smart Contracts** | Solidity 0.8.20+ (adapted from BitGo eth-multisig-v4) |
| **API Gateway** | Kong (self-hosted) |
| **Observability** | PostHog (self-hosted), Prometheus, Grafana, Loki, Jaeger |
| **Infrastructure** | Docker + docker-compose (all services containerized) |
| **Monorepo** | Turborepo |

---

## 3. Architecture

### 3.1 Service Topology

```
                          ┌──────────────────────┐
                          │   Load Balancer       │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │   API Gateway (Kong)  │
                          │  Rate Limiting · Auth  │
                          └──┬────┬────┬────┬────┘
                             │    │    │    │
              ┌──────────────┘    │    │    └──────────────┐
              │                   │    │                    │
     ┌────────▼───────┐ ┌───────▼────▼──────┐   ┌───────▼────────┐
     │  Admin API      │ │  Client API        │   │  Auth Service   │
     │  (NestJS)       │ │  (NestJS)          │   │  (NestJS)       │
     │  Port 3001      │ │  Port 3002         │   │  Port 3003      │
     └───────┬─────────┘ └───────┬────────────┘   └────────────────┘
             │                    │
     ┌───────▼────────────────────▼────────────┐
     │         Core Wallet Service              │
     │         (NestJS) Port 3004               │
     └──┬──────────┬──────────┬────────────────┘
        │          │          │
  ┌─────▼────┐ ┌──▼────────┐ ┌▼──────────────┐  ┌──────────────┐
  │Key Vault  │ │Chain      │ │Notification   │  │Cron/Worker   │
  │Service    │ │Indexer    │ │Service        │  │Service       │
  │Port 3005  │ │Service    │ │Port 3007      │  │Port 3008     │
  │(vault-net)│ │Port 3006  │ └───────────────┘  └──────────────┘
  └───────────┘ └───────────┘
```

### 3.2 Docker Networks

| Network | Purpose | Services |
|---------|---------|----------|
| `public-net` | External access | Kong, Admin Web, Client Web, BI Dashboard |
| `internal-net` | Inter-service communication | All NestJS services |
| `vault-net` | Isolated key management | Core Wallet Service ↔ Key Vault Service (mTLS) |
| `monitoring-net` | Observability stack | PostHog, Prometheus, Grafana, Loki, Jaeger |

**Key Vault Service** has ZERO internet access — only `vault-net` connectivity.

### 3.3 Docker Services (Complete)

```
docker-compose.yml
│
│── Application Services
├── api-gateway (Kong)              — port 8000/8443
├── admin-api                       — internal 3001
├── client-api                      — internal 3002
├── auth-service                    — internal 3003
├── core-wallet-service             — internal 3004
├── key-vault-service               — vault-net only, 3005
├── chain-indexer-service           — internal 3006
├── notification-service            — internal 3007
├── cron-worker-service             — internal 3008
│
│── Frontend Services
├── admin-web (Next.js)             — port 3010
├── client-web (Next.js)            — port 3011
├── bi-dashboard (Next.js)          — port 3012
│
│── Infrastructure
├── redis                           — internal 6379
│
│── Observability
├── prometheus                      — port 9090
├── grafana                         — port 3000
├── loki                            — port 3100
├── jaeger                          — port 16686
│
│── PostHog Stack
├── posthog-web                     — port 8010
├── posthog-worker
├── posthog-plugins
├── clickhouse
├── kafka
├── zookeeper
├── posthog-redis
└── posthog-postgres
```

**MySQL**: External (Marcelo's existing cluster), not in docker-compose.

### 3.4 Inter-Service Communication

| From → To | Protocol | Purpose |
|-----------|----------|---------|
| Gateway → APIs | HTTP/REST | Request routing |
| Admin/Client API → Core | HTTP/REST (internal) | Sync operations |
| Core → Key Vault | HTTP/REST via mTLS | Signing, key generation |
| Core ↔ Chain Indexer | Redis Streams | Deposit notifications, address monitoring |
| Core → Notification Svc | BullMQ (Redis) | Queue webhooks and emails |
| Cron/Worker → Core | HTTP/REST (internal) | Execute sweeps, forwards |

### 3.5 MySQL Databases

| Database | Domain |
|----------|--------|
| `cvh_auth` | users, api_keys, roles, sessions |
| `cvh_wallets` | wallets, addresses, labels, balances, tokens, forwarder_contracts |
| `cvh_transactions` | transactions, withdrawal_requests, deposits |
| `cvh_compliance` | sanctions_lists, screening_results, alerts |
| `cvh_notifications` | webhooks, webhook_deliveries, email_logs |
| `cvh_admin` | clients, tiers, tier_limits, chains, audit_logs |
| `cvh_indexer` | sync_cursors, indexed_blocks, chain_configs |
| `cvh_keyvault` | master_seeds, derived_keys, shamir_shares, key_vault_audit |

---

## 4. Smart Contracts

Based on BitGo eth-multisig-v4, adapted as CryptoVaultHub contracts.

### 4.1 Contracts

| Contract | Purpose | Based On |
|----------|---------|----------|
| `CvhWalletSimple.sol` | 2-of-3 multisig hot wallet | WalletSimple.sol |
| `CvhForwarder.sol` | Deposit address with auto-forward ETH + feeAddress | ForwarderV4.sol |
| `CvhWalletFactory.sol` | CREATE2 factory for wallet proxies | WalletFactory.sol |
| `CvhForwarderFactory.sol` | CREATE2 factory for forwarder proxies | ForwarderFactoryV4.sol |
| `CvhBatcher.sol` | Batch ETH/token distribution | Batcher.sol |

### 4.2 CvhWalletSimple — 2-of-3 Multisig

- 3 signers: `platformKey`, `clientKey`, `backupKey`
- Synchronous 2-of-2 signing: msg.sender (signer 1) + ecrecover (signer 2)
- Operations: `sendMultiSig()` (native), `sendMultiSigToken()` (ERC-20), `sendMultiSigBatch()`
- Replay protection: Sequence ID window (10 slots, max increase 10000)
- Cross-chain protection: Network ID in operation hash
- Safe mode: Irrevocable, restricts withdrawals to signer addresses only
- NFT support: IERC721Receiver + ERC1155Holder

### 4.3 CvhForwarder — Deposit Address Contract

- `init(parentAddress, feeAddress, autoFlush721, autoFlush1155)`
- Auto-flush ETH: `receive()` → immediately sends to parent wallet
- Manual flush ERC-20: `flushTokens(token)` / `batchFlushERC20Tokens(tokens[])`
- Callable by: parent (all operations) + feeAddress (flush operations only)
- Immutable: parent and feeAddress set once in init()

### 4.4 Factories — CREATE2 + EIP-1167 Minimal Proxy

- Deterministic addresses via CREATE2: address known before deployment
- Minimal proxy (EIP-1167): ~45 bytes runtime, ~45,000 gas to deploy
- Lazy deployment: compute address, share with user, deploy only when needed
- Salt binding: `finalSalt = keccak256(parent + feeAddress + userSalt)`

### 4.5 Deposit Flow

1. User deposits ETH → Forwarder `receive()` auto-forwards to hot wallet
2. User deposits ERC-20 → Token sits in Forwarder → Chain Indexer detects Transfer event
3. Cron/Worker executes `flushTokens()` via Gas Tank (feeAddress) → Token arrives at hot wallet
4. Balance updated in DB → Webhook sent to client

### 4.6 Withdrawal Flow

1. Client requests withdrawal via API
2. KYT screening (if enabled) — checks destination against OFAC/EU/UN
3. Key Vault signs operationHash with platformKey
4. Contract `sendMultiSig()` / `sendMultiSigToken()` executed
5. Confirmation tracked → Webhook sent to client

---

## 5. Key Management

### 5.1 Key Vault Service

- Runs in isolated Docker network (`vault-net`) with ZERO internet access
- Communication only via mTLS with Core Wallet Service
- Stateless: no intermediate state stored between requests

### 5.2 Key Model (per client)

| Key | Controller | Purpose |
|-----|-----------|---------|
| **Platform Key** | CryptoVaultHub | Signs as signer 1 of multisig. Never leaves Key Vault. |
| **Client Key** | Client or CVH | Signs as signer 2. Mode-dependent (see custody modes). |
| **Backup Key** | Shared (Shamir) | Emergency recovery. Split into 5 shares (3-of-5 threshold). |

### 5.3 HD Wallet Derivation (BIP-32/39/44)

```
Master Seed (256 bits, BIP-39 24 words)
  → PBKDF2-HMAC-SHA512
  → Master Key (BIP-32 root)

Derivation paths:
  m/44'/60'/(clientIndex*3+0)'/0/0  → Platform Key
  m/44'/60'/(clientIndex*3+1)'/0/0  → Client Key
  m/44'/60'/(clientIndex*3+2)'/0/0  → Backup Key
  m/44'/60'/1000'/chainId/clientIndex → Gas Tank

Note: Same key works on ALL EVM chains (same address on ETH, BSC, Polygon, etc.)
```

### 5.4 Envelope Encryption

- **DEK** (Data Encryption Key): Random 256-bit, encrypts private key with AES-256-GCM
- **KEK** (Key Encryption Key): Derived from master password via PBKDF2 (100,000 iterations)
- Keys NEVER stored in plaintext on disk or database
- Decrypted only in memory, zeroed immediately after use

### 5.5 Shamir's Secret Sharing (Backup Key)

- Split into 5 shares, threshold 3-of-5
- Share distribution: client primary, admin, cold storage, client secondary, physical vault
- Each share individually encrypted with different passwords
- Recovery: any 3 shares reconstruct the backup key

### 5.6 Custody Modes (configurable per client)

| Mode | Description | Use Case |
|------|-------------|----------|
| **Full Custody** | CVH controls platform + client keys. Automatic signing. | Payment gateways wanting full automation |
| **Co-Sign** | CVH controls platform key, client controls client key. Both must sign. | Large exchanges wanting co-custody |
| **Client-Initiated** | Client signs first with client key, CVH auto-signs with platform key after validation. | Exchanges wanting to initiate from their backend |

---

## 6. Blockchain Integration

### 6.1 Multi-Chain Support

| Chain | Chain ID | Native | Default Tokens |
|-------|----------|--------|----------------|
| Ethereum | 1 | ETH | USDT, USDC, DAI, WBTC, WETH, LINK |
| BSC | 56 | BNB | USDT, USDC, BUSD, BTCB, WBNB |
| Polygon | 137 | MATIC | USDT, USDC, WETH, WMATIC, DAI |
| Arbitrum | 42161 | ETH | USDT, USDC, ARB, WETH, DAI |
| Optimism | 10 | ETH | USDT, USDC, OP, WETH, DAI |
| Avalanche C-Chain | 43114 | AVAX | USDT, USDC, WAVAX, WETH |
| Base | 8453 | ETH | USDC, WETH, DAI, cbETH |

New chains: configuration change, not code change. Deploy contracts + add chain config.

### 6.2 Token Registry

- Dynamic token management: add/remove tokens via Admin API
- Auto-validation: calls `symbol()`, `decimals()`, `name()` on-chain when adding
- Per-client token enablement: `client_tokens` table controls which tokens each client uses
- Default tokens pre-configured per chain

### 6.3 RPC Node Management

- Primary: Tatum.io, GetBlock.io (with custom HTTP providers for API key injection)
- Fallback: additional providers per chain
- Health monitoring: block height staleness, latency, error rate
- Circuit breaker pattern: route away from unhealthy endpoints
- Rate limiting: Bottleneck library (per-provider limits)

### 6.4 Wallet Monitoring (3 Modes)

| Mode | Mechanism | Latency | RPC Cost |
|------|-----------|---------|----------|
| **Realtime** | WebSocket `newHeads` + `eth_getLogs` | ~3-12s | Higher |
| **Polling** | Cron every X seconds + Multicall3 batch queries | Configurable | Lower |
| **Hybrid** (recommended) | Realtime detection + polling reconciliation | ~3-12s + safety net | Medium |

- **Multicall3**: Single RPC call to query 500+ balances (deployed at same address on all EVM chains: `0xcA11bde05977b3631167028862bE2a173976CA11`)
- **Deep Reconciliation**: Daily cron (3am UTC) verifies all on-chain balances vs. database
- Configurable per client via `client_chain_config`

### 6.5 Confirmation Tracking

- BullMQ delayed jobs track confirmations block by block
- Reorg protection: verifies tx receipt still exists at each check
- Configurable webhook milestones per client: `[1, 3, 6, 12]`
- Webhook events: `deposit.pending` → `deposit.confirming` → `deposit.confirmed`
- If reorg detected: `deposit.reverted` + critical alert

### 6.6 Sweep/Consolidation (Cron)

- Runs every N minutes (configurable per client per chain)
- Native currency: already auto-forwarded by Forwarder `receive()`
- ERC-20 tokens: Gas Tank (feeAddress) executes `flushTokens()` or `batchFlushERC20Tokens()`
- Gas Tank monitoring: alerts when balance below threshold, optional auto-topup
- Batch operations: group multiple forwarder flushes when possible

---

## 7. Compliance (KYT)

### 7.1 Sanctions Lists (self-managed)

| List | Source | Format | Update Frequency |
|------|--------|--------|-----------------|
| OFAC SDN | treasury.gov | XML (`sdn_advanced.xml`) | Daily poll |
| OFAC Consolidated | treasury.gov | XML (`cons_advanced.xml`) | Daily poll |
| EU Sanctions | data.europa.eu | XML | Daily poll |
| UN Consolidated | un.org | XML | Daily poll |
| UK OFSI | gov.uk | XML | Daily poll |

### 7.2 Screening

- **Pre-transaction** (outbound): Screen destination address before withdrawal
- **Post-transaction** (inbound): Screen source address after deposit detection
- **Address matching**: Exact match (case-insensitive for ETH addresses)
- **Actions**: CLEAR → allow, HIT → block + alert + quarantine, POSSIBLE_MATCH → review

### 7.3 KYT Levels

| Level | Features |
|-------|----------|
| **Off** | No screening |
| **Basic** | OFAC SDN address screening only |
| **Full** | All lists + N-hop tracing (1-3 hops) + pattern detection |

---

## 8. Observability & Traceability

### 8.1 PostHog (Business Events)

Complete event taxonomy tracking ALL interactions:

- **API requests**: Every request/response with full payload, headers, timing
- **Webhooks**: Every delivery attempt with payload, response, HTTP status
- **Blockchain events**: Deposits, sweeps, withdrawals, failures
- **Compliance**: Screenings, alerts, resolutions
- **Admin actions**: Client management, tier changes, token additions

All events correlated via `trace_id` shared with Loki and Jaeger.

### 8.2 Infrastructure Monitoring

- **Prometheus + Grafana**: CPU, memory, latency, queue depths, RPC health
- **Loki**: Structured JSON logs from all services
- **Jaeger**: Distributed traces across services

### 8.3 Support Resolution

PostHog enables complete audit trails for any support case:
- Track any deposit from detection → confirmation → sweep → webhook
- Track any withdrawal from request → KYT → signing → confirmation → webhook
- View exact webhook payloads sent and responses received
- View exact API requests from clients

---

## 9. API Gateway & Multi-Tenant

### 9.1 Kong Gateway

- Plugins: key-auth, rate-limiting, request-size, ip-restriction, cors, http-log, prometheus
- Dynamic rate limiting synced from tier configuration
- API key management with scopes: `read`, `write`, `withdraw`

### 9.2 Tier System

Pre-configured tiers (Starter, Business, Enterprise) that can be:
1. Selected as-is for a client
2. Customized (any field) and saved with a new name
3. Applied to multiple clients

Customizable fields: rate limits (global + per-endpoint), resource limits (forwarders, chains, webhooks), financial limits (daily/single withdrawal), monitoring mode, KYT level.

### 9.3 Client API

Full REST API under `/client/v1/`:
- Wallets, Deposit Addresses (single + batch), Deposits, Withdrawals
- Address Book (whitelist with 24h cooldown)
- Webhooks (CRUD + test + delivery log + retry)
- Tokens, Transactions, Co-Sign, Health

---

## 10. Web Interfaces

### 10.1 Monorepo Structure

```
apps/admin/      → Admin Panel (port 3010)
apps/client/     → Client Portal (port 3011)
apps/bi-dashboard/ → BI Dashboard (port 3012)
packages/ui/     → Shared shadcn/ui components
packages/api-client/ → Type-safe API SDK
packages/hooks/  → Shared React hooks
packages/types/  → Shared TypeScript types
packages/utils/  → Formatters, helpers
```

### 10.2 Admin Panel

**Audience**: CVH internal team. Auth: email/password + mandatory 2FA.

**Modules**:
- Dashboard: KPIs, alerts, real-time transactions
- Clients: CRUD, detail with tabs (overview, forwarders, transactions, security, webhooks, API usage, audit)
- Chains: RPC config, health monitoring, contract addresses
- Tokens: Global registry, add/remove, per-client enablement
- Tiers: Pre-configured + customizable tiers, per-endpoint rate limits
- Compliance: KYT alerts, screening history, sanctions list sync status
- Monitoring: Service health, queue depths, RPC status
- Gas Management: Tank balances, burn rate, projections, manual top-up
- Audit Log: All admin actions (PostHog-powered)

### 10.3 Client Portal

**Audience**: Client team (exchange/gateway operators). Auth: email/password + 2FA. RBAC: owner, admin, viewer.

**Modules**:
- Dashboard: Balances by chain/token, volume trends, recent activity
- Wallets: Hot wallet details per chain
- Deposit Addresses: Generate (single + batch), list, export CSV
- Deposits: List with filters, real-time confirmation progress
- Withdrawals: New withdrawal (to whitelisted address), history
- Address Book: Whitelist management with cooldown
- Forwarders: Smart contract status, manual sweep
- Webhooks: CRUD, event selection, HMAC secret, delivery log, retry
- API Keys: Create, scopes, IP allowlist, revoke
- Notifications: Email rules (threshold-based alerts, daily reports)
- Security: Custody mode, 2FA, Shamir share status, Safe Mode

### 10.4 BI Dashboard

**Audience**: CVH business/management team + clients with BI-enabled tier.

**Dashboards**: Overview, Revenue, Volume Analytics, Client Analytics, Operations, Compliance, Infrastructure, Gas Cost, Reports (CSV/PDF export).

**Data Sources**: MySQL (transactional), PostHog/ClickHouse (events), Prometheus (metrics).

---

## 11. Address Book (Whitelisted Addresses)

- Clients register destination addresses with labels before using for withdrawals
- 24-hour cooldown after registration before address can be used
- 2FA required to add or remove addresses
- Soft delete preserves history
- Each withdrawal must reference a whitelisted address ID

---

## 12. Gas Tank Management

- One Gas Tank (EOA wallet) per client per chain
- Funds gas costs for: forwarder deployment, token flushes, sweeps
- Monitoring: balance check every block, alerts at configurable thresholds
- Auto-topup: optional, from hot wallet (requires multisig)
- Metrics: daily gas cost, cost per operation, days until depletion

---

## 13. Security Summary

| Layer | Mechanism |
|-------|-----------|
| Key storage | AES-256-GCM envelope encryption, PBKDF2 KEK derivation |
| Key isolation | Air-gapped Docker network, mTLS only |
| Transaction auth | 2-of-3 on-chain multisig |
| API auth | API keys (SHA-256 hashed), JWT for web sessions |
| Rate limiting | Multi-level: global, per-tenant, per-endpoint, per-IP |
| KYT/AML | OFAC/EU/UN sanctions screening, configurable per client |
| Backup/Recovery | Shamir's Secret Sharing (3-of-5) |
| Audit trail | PostHog captures every event, append-only key_vault_audit |
| Network | Kong gateway, IP allowlisting, CORS, bot detection |
| 2FA | Required for admin, configurable for client portal |
