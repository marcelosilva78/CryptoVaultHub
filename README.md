# CryptoVaultHub

**Enterprise-grade, self-hosted EVM cryptocurrency wallet management platform.**

CryptoVaultHub is a B2B multi-tenant platform purpose-built for cryptocurrency exchanges, payment gateways, and custody providers who need full control over their key management infrastructure. It eliminates dependence on third-party custody APIs by providing a complete, self-hosted solution spanning smart contract wallets, HD key derivation, deposit detection, KYT/AML compliance screening, and a modern admin/client portal -- all orchestrated through a microservices architecture with defense-in-depth security. If you operate an exchange or payment service and need deterministic deposit addresses, automated token sweeping, 2-of-3 multisig withdrawals, and real-time deposit detection with full audit traceability, CryptoVaultHub is designed for exactly that.

---

## Table of Contents

- [The Problem We Solve](#the-problem-we-solve)
- [Key Features](#key-features)
- [v2 -- New Features](#v2----new-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Services](#services)
- [Frontend Applications](#frontend-applications)
- [Smart Contracts](#smart-contracts)
- [Database Schema](#database-schema)
- [Security](#security)
- [Visual Identity](#visual-identity)
- [Quick Start](#quick-start)
- [Smart Contract Deployment](#smart-contract-deployment)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [API Documentation (Swagger)](#api-documentation-swagger)
- [Screenshots](#screenshots)
- [License](#license)
- [Contributing](#contributing)

---

## The Problem We Solve

### Pain Points of Crypto Custody

Running a cryptocurrency exchange or payment gateway means managing thousands of deposit addresses, processing withdrawals with multiple signers, tracking confirmations across multiple EVM chains, complying with evolving sanctions regulations, and doing all of this without ever losing a single private key. The operational complexity is enormous.

Most teams face the same set of problems:

- **Third-party custody lock-in**: Services like Fireblocks and BitGo charge per-transaction fees, control your keys on their infrastructure, and can change pricing or terms at any time. You are renting access to your own funds.
- **Key management fragility**: Rolling your own key management usually means a single encrypted file, no proper key derivation hierarchy, no separation between signing and application logic, and no recovery mechanism when a key custodian is unavailable.
- **Deposit address sprawl**: Generating thousands of unique deposit addresses per client per chain without a deterministic system leads to address tracking nightmares, orphaned funds, and manual reconciliation.
- **Compliance afterthought**: Sanctions screening is bolted on after the fact, with no integration into the deposit/withdrawal flow, leading to missed screenings or blocked legitimate transactions.
- **No unified view**: Operators juggle multiple block explorers, RPC dashboards, separate compliance tools, and spreadsheets to piece together what happened to a single transaction.

### What CryptoVaultHub Does Differently

CryptoVaultHub is a single, self-hosted platform that solves all of these problems in one cohesive system:

- **You own your keys**: All private keys are generated, encrypted, and stored on your infrastructure. The Key Vault Service runs in an air-gapped Docker network with zero internet access.
- **Deterministic deposit addresses**: CREATE2 + EIP-1167 minimal proxies give you predictable addresses before deployment. Generate thousands of addresses for free (no gas), deploy only when needed.
- **Integrated compliance**: Every deposit and withdrawal flows through configurable KYT screening (OFAC SDN, EU, UN, UK OFSI) before processing. Alerts go to a review queue with full audit trail.
- **Complete traceability**: Every transaction -- from the moment a deposit hits the mempool to the final webhook delivery -- is tracked with JSON artifacts, PostHog events, structured logs, and distributed traces. One trace ID connects everything.
- **Multi-chain from day one**: Deploy the same smart contracts on Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, and Base. The same derived key works on all chains (EVM address derivation is chain-agnostic).

---

## Key Features

### Self-Hosted EVM Wallet Management

Run the entire custody stack on your own infrastructure. No third-party API keys for key management, no per-transaction fees, no vendor lock-in. Every component -- from the Kong API gateway to the Key Vault -- runs in your Docker environment under your full control.

### Multi-Chain Support

Supports Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, and Base out of the box. Adding a new EVM chain requires deploying the 5 smart contracts and registering the chain via the Admin API. Since EVM address derivation is chain-agnostic, the same HD-derived keys produce the same addresses across all chains.

### Smart Contract Wallet System

Each client gets a 2-of-3 multisig hot wallet (CvhWalletSimple) deployed via CREATE2 deterministic addressing through EIP-1167 minimal proxy clones. This means wallet addresses are known before deployment, deployment costs approximately 45,000 gas (vs. 2M+ for full contract deployment), and all wallets share the same audited implementation contract.

### Forwarder Wallets (Automatic Deposit Sweeping)

Deposit addresses are CvhForwarder proxy clones that automatically forward received ETH to the client's hot wallet via the `receive()` function. ERC-20 tokens are held until the Cron Worker calls `flushTokens()` or `batchFlushERC20Tokens()`. Forwarder addresses are computed (free) before deployment and deployed on demand only when ERC-20 flushing is needed.

### Multi-Signature Security

Every withdrawal requires 2 of 3 signatures on-chain. The three signers are: the platform key (controlled by CryptoVaultHub), the client key (controlled by the client in co-sign mode, or by CVH in full-custody mode), and the backup key (split via Shamir's Secret Sharing). Replay protection uses a sequence ID window with chain ID binding, and signature malleability is prevented by enforcing `s <= secp256k1n/2`.

### HD Key Management

All keys are derived from a single BIP-39 master seed using BIP-44 hierarchical deterministic derivation. Private keys are encrypted at rest using AES-256-GCM envelope encryption with a PBKDF2-derived KEK (600,000 iterations, SHA-512). The master seed backup is split into 5 shares using Shamir's Secret Sharing with a 3-of-5 reconstruction threshold. All key operations happen exclusively in the air-gapped Key Vault Service.

### Client Onboarding Wizard

A 7-step interactive setup wizard in the Client Portal guides new clients through their entire onboarding process: (1) Chain Selection, (2) Wallet Creation, (3) First Deposit simulation, (4) Withdrawal Configuration, (5) Smart Contract Deployment with live blockchain status tracking, (6) Test Transaction with real-time balance updates, and (7) Completion. The wizard includes live contract deployment status, QR code display, JSON artifact viewers, and private key reveal components.

### Complete Transaction Traceability

Every transaction is tracked end-to-end with JSON artifacts at each stage: creation, KYT screening, signing, broadcast, confirmation milestones, and webhook delivery. The Admin Panel's traceability view connects PostHog business events, Loki structured logs, and Jaeger distributed traces via a shared trace ID, enabling complete forensic reconstruction of any operation.

### KYT/AML Compliance

Configurable sanctions screening checks deposit source addresses and withdrawal destinations against OFAC SDN + Consolidated, EU, UN, and UK OFSI lists. The Cron Worker Service syncs sanctions lists daily from official XML sources. Screening results are categorized as CLEAR, HIT, or POSSIBLE_MATCH, with hits blocking the transaction and possible matches routed to a compliance review queue.

### Real-Time Deposit Detection

A dual-strategy deposit detection system combines WebSocket subscriptions (`newHeads` events) for real-time detection with polling-based block scanning as a fallback. The Chain Indexer Service monitors deposit addresses across all configured chains, publishes deposit events to Redis Streams, and hands off to the confirmation tracker (BullMQ) which verifies receipts at milestone confirmations (1, 3, 6, 12) with reorg protection.

### Webhook Notifications with Retry System

All transaction lifecycle events (deposit.pending, deposit.confirming, deposit.confirmed, deposit.swept, withdrawal.broadcasted, withdrawal.confirmed) are delivered to client-configured webhook endpoints. Each payload is signed with HMAC-SHA256 using a per-endpoint secret. Failed deliveries are retried with exponential backoff and jitter, with persistent failures routed to a Dead Letter Queue (DLQ).

### Admin Panel with Analytics

The Admin Panel (port 3010) provides comprehensive platform management: client CRUD with custody mode configuration, tier management with rate limit and resource controls, chain and token registry, compliance alert review, gas tank monitoring, service health dashboards, and an integrated analytics section with operations and compliance dashboards built with Recharts.

### Client Portal

The Client Portal (port 3011) gives each client self-service access to their wallets, deposit addresses, deposits, withdrawals, webhooks, API keys, security settings (2FA), and the onboarding setup wizard. Clients can generate deposit addresses (single or batch up to 100), manage their address whitelist (with 24-hour cooldown), and configure webhook endpoints with delivery log inspection.

### API Gateway

Kong 3.6 runs in declarative (DB-less) mode, providing centralized request routing, multi-level rate limiting (global per-service and per-tenant via Redis-backed counters), CORS restriction to known origins (`localhost:3010`, `localhost:3011`, `admin.cryptovaulthub.com`, `portal.cryptovaulthub.com`), request size limiting (1 MB), and TLS termination.

### Full Observability Stack

Self-hosted PostHog captures every API request, webhook delivery, blockchain event, and compliance action via NestJS interceptors. Prometheus (v2.50.0) scrapes metrics from Kong and all NestJS services at 15-second intervals. Grafana (10.3.0) provides dashboards with Prometheus and Loki data sources. Loki (2.9.0) aggregates structured JSON logs from all services. Jaeger (1.54) provides distributed tracing via OTLP. All events share trace IDs for end-to-end correlation.

---

## v2 -- New Features

CryptoVaultHub v2 introduces 14 major features across infrastructure resilience, operational tooling, and client self-service capabilities. Each feature was designed for production-grade reliability with full audit traceability.

### 1. Multi-Project Scoping

Clients can organize their wallets, deposit addresses, and transaction history across multiple isolated projects within a single organization. Each project maintains its own chain configuration, API keys, and webhook endpoints, enabling separation between production, staging, and development environments -- or between distinct business lines (e.g., exchange vs. payment gateway).

![Client Portal -- Project Selector Dropdown](docs/screenshots/v2-project-selector.png)

### 2. RPC Provider Management

A dedicated RPC provider registry replaces hardcoded RPC URLs. Admins register multiple endpoints per chain with automatic health monitoring, latency tracking, and failover. Each provider is health-checked on a configurable interval, and the system automatically routes requests to the healthiest available node. Dead nodes are deprioritized and re-tested periodically for recovery.

![Admin Panel -- RPC Providers Management](docs/screenshots/v2-rpc-providers.png)

### 3. Resilient Job Queue Dashboard

Full visibility into the BullMQ job queue system across all 8 queues (polling-detector, deposit-detection, withdrawal-processing, forwarder-deploy, sweep, webhook-delivery, sanctions-sync, gas-tank-monitor). The Jobs Dashboard shows real-time active/waiting/completed/failed counts, per-job progress tracking, attempt history, and Dead Letter Queue (DLQ) management with manual retry controls.

![Admin Panel -- Jobs Dashboard](docs/screenshots/v2-jobs-dashboard.png)

### 4. Chain Indexer v2 -- Sync Health Dashboard

Per-chain synchronization health monitoring with blocks-behind counters, gap detection (missing blocks in the scan history), reorg event tracking, and sync progress visualization. Each chain card shows the last processed block, average block time, and indexer performance. Stalled chains (RPC unreachable) and degraded chains (falling behind) are highlighted with amber/red indicators for immediate operator attention.

![Admin Panel -- Sync Health Dashboard](docs/screenshots/v2-sync-health.png)

### 5. Webhook Retry System with Delivery History

Complete webhook delivery audit trail with per-attempt timeline visualization. Each delivery shows the HTTP status code, response time, response body, and retry scheduling with exponential backoff and jitter. Failed deliveries progress through configurable retry attempts (default: 5) before landing in the DLQ. Operators can manually retry any delivery or inspect the full attempt history for debugging endpoint connectivity issues.

![Client Portal -- Webhook Delivery History](docs/screenshots/v2-webhook-delivery.png)

### 6. Flush Operations UI

Self-service flush operations for clients to sweep ERC-20 tokens and native currency from forwarder deposit addresses to their hot wallet. The interface shows pending flushes with token-level detail, gas cost estimation (using `batchFlushERC20Tokens` for multi-token efficiency), and a real-time status tracker for in-progress operations. Supports both single-forwarder and batch flush across multiple addresses.

![Client Portal -- Flush Operations](docs/screenshots/v2-flush-operations.png)

### 7. Deploy Traceability with Enhanced JSON Viewer

A redesigned JSON artifact viewer (v2) for transaction traceability, featuring syntax-highlighted JSON with line numbers, collapsible sections, full-text search with match navigation, copy-to-clipboard, and raw view toggle. Each transaction lifecycle stage (detected, screened, confirming, confirmed, swept) produces a JSON artifact that can be inspected in detail. The viewer integrates with PostHog events, Loki logs, and Jaeger traces via shared trace IDs.

![Admin Panel -- Enhanced JSON Viewer v2](docs/screenshots/v2-json-viewer.png)

### 8. Multi-Chain Address Groups

Address groups bundle the same CREATE2 deterministic deposit address across multiple EVM chains under a single logical entity. Since EVM address derivation is chain-agnostic, the same salt produces the same forwarder address on all chains. Each group shows deployment status per chain (computed vs. deployed), total received value, and deposit count. Clients can generate multi-chain address groups in a single operation.

![Client Portal -- Multi-Chain Address Groups](docs/screenshots/v2-address-groups.png)

### 9. Export System

Clients can export transaction history, deposit records, withdrawal logs, address data, and compliance screening results in multiple formats (CSV, JSON, XLSX, PDF). Exports are generated asynchronously as background jobs with configurable date ranges, chain filters, and field selection. Completed exports are stored with download links and retention policies. Designed for accounting reconciliation and compliance reporting.

![Client Portal -- Exports](docs/screenshots/v2-exports.png)

### 10. Admin Impersonation

Super admins can impersonate any client organization to view the platform exactly as the client sees it, without requiring client credentials. A persistent red banner indicates active impersonation mode, and all actions performed during impersonation are logged to the audit trail with both the admin identity and the impersonated client identity. Impersonation sessions are time-limited and can be exited at any time.

![Admin Panel -- Client Impersonation Mode](docs/screenshots/v2-impersonation.png)

### 11. Additional v2 Improvements

- **10 new MySQL databases**: `cvh_jobs` for queue state persistence and `cvh_exports` for export metadata, adding to the original 8 databases for a total of 10.
- **Redis Streams expansion**: New streams for job lifecycle events (`jobs:created`, `jobs:completed`, `jobs:failed`) and export progress tracking.
- **Prisma 5.22 transactions**: Key generation operations wrapped in Prisma transactions to prevent race conditions during concurrent wallet creation.
- **Rate limit per-project**: Project-scoped rate limiting via Kong, allowing different projects under the same client to have independent rate limit quotas.

---

## Architecture

### High-Level Architecture Diagram

```
                              Internet / Clients
                                     |
                            +--------v---------+
                            |  Load Balancer   |
                            +--------+---------+
                                     |
                  +------------------v-------------------+
                  |        Kong API Gateway              |     public-net
                  |        Port 8000 / 8443              |
                  |   Rate Limiting | CORS | Size Limit  |
                  +---+--------+--------+--------+-------+
                      |        |        |        |
           +----------+   +---+---+  +-+----+   +----------+
           |               |       |  |      |              |
   +-------v------+ +-----v------++ +v------v-----+ +------v-------+
   | Admin API    | | Client API  | | Auth Service | | Admin Panel  |
   | :3001        | | :3002       | | :3003        | | :3010        |
   | JWT Auth     | | API Key     | | JWT / TOTP   | | Next.js 14   |
   | Admin CRUD   | | Auth        | | API Keys     | +------+-------+
   +------+-------+ | Client Ops  | | RBAC         |        |
          |          +------+------+ +-----+--------+ +------v-------+
          |                 |              |          | Client Portal|
          +--------+--------+              |          | :3011        |
                   |                       |          | Next.js 14   |
           +-------v--------+             |          +--------------+
           |  Core Wallet   |<------------+
           |  Service :3004 |                        internal-net
           |  Wallets       |
           |  Deposits      |
           |  Withdrawals   |
           |  Compliance    |
           +--+---+---+--+-+
              |   |   |  |
        +-----+   |   |  +-------+
        |         |   |          |
   +----v--+ +---v---++ +-------v----+ +-----------+
   |Key    | |Chain   | |Notification| |Cron/Worker|
   |Vault  | |Indexer | |Service     | |Service    |
   |:3005  | |:3006   | |:3007       | |:3008      |
   |       | |        | |            | |           |
   |vault- | |WS+Poll | |Webhooks    | |Sweeps     |
   |net    | |Block   | |Email       | |Gas Mgmt   |
   |ONLY   | |Scan    | |HMAC-SHA256 | |OFAC Sync  |
   +-------+ +--------+ |Retry/DLQ  | |Fwd Deploy |
                         +------------+ +-----------+
```

### Network Isolation

CryptoVaultHub uses four Docker networks to enforce strict security boundaries:

| Network | Type | Purpose | Services |
|---------|------|---------|----------|
| `public-net` | Bridge | External access | Kong, Admin Panel, Client Portal |
| `internal-net` | Bridge, internal | Inter-service communication (no external access) | All NestJS services, Redis, Kong, PostHog Web, Loki, Jaeger, Prometheus |
| `vault-net` | Bridge, internal | Isolated key management (zero internet access) | Core Wallet Service <-> Key Vault Service only |
| `monitoring-net` | Bridge | Observability stack | PostHog, Prometheus, Grafana, Loki, Jaeger, ClickHouse, Kafka, Zookeeper |

The Key Vault Service exists ONLY on `vault-net`. It has zero connectivity to the internet, internal services, or monitoring. Only the Core Wallet Service bridges both `internal-net` and `vault-net`, serving as the sole gateway to key material.

### Data Flow: Deposits

```
User sends ETH/tokens to forwarder address
          |
          v
[1] Chain Indexer Service
    - WebSocket (newHeads) or polling detects Transfer events
    - Publishes deposit event to Redis Stream
          |
          v
[2] Core Wallet Service
    - Records deposit in cvh_transactions
    - Starts confirmation tracking (BullMQ delayed job)
    - Triggers KYT screening on source address
          |
          v
[3] Confirmation Tracking
    - Verifies tx receipt at milestones: [1, 3, 6, 12]
    - Reorg protection: checks receipt still exists
    - Events: deposit.pending -> deposit.confirming -> deposit.confirmed
          |
          v
[4] Auto-Sweep
    - ETH: auto-forwarded by Forwarder receive()
    - ERC-20: Cron Worker calls flushTokens() via Gas Tank
          |
          v
[5] Notification Service
    - Sends deposit.swept webhook (HMAC-SHA256 signed)
    - Exponential backoff retry on failure (up to DLQ)
```

### Data Flow: Withdrawals

```
Client submits POST /client/v1/withdrawals
          |
          v
[1] Validation
    - Whitelisted address check (24h cooldown)
    - Idempotency key verification
    - Sufficient balance check
          |
          v
[2] KYT Screening
    - OFAC SDN, EU, UN, UK OFSI check on destination
    - CLEAR -> proceed | HIT -> block | POSSIBLE_MATCH -> review queue
          |
          v
[3] Signing (via Key Vault over vault-net)
    - Platform key signs as signer 1
    - Full custody: client key auto-signs as signer 2
    - Co-sign: waits for client signature via /co-sign/:id/sign
          |
          v
[4] On-Chain Submission
    - CvhWalletSimple.sendMultiSig() or sendMultiSigToken()
    - Transaction broadcasted via RPC
          |
          v
[5] Confirmation + Notification
    - Same BullMQ tracking as deposits
    - withdrawal.broadcasted -> withdrawal.confirming -> withdrawal.confirmed
```

---

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Runtime | Node.js | >= 20 | Server-side JavaScript runtime for all services |
| Framework | NestJS | 10.3 | Backend microservices framework (8 services) |
| Frontend | Next.js 14 | 14.x | App Router, React Server Components for Admin Panel and Client Portal |
| UI Components | shadcn/ui + Tailwind CSS | -- | Component library with custom design tokens and semantic theming |
| Charts | Recharts | -- | Analytics dashboards in Admin Panel |
| API Client | @cvh/api-client + TanStack Query | v5 | Type-safe API client SDK with React Query hooks for both frontends |
| Database | MySQL | 8.0+ | External cluster, 10 separate databases for domain isolation |
| ORM | Prisma | 5.22 | Type-safe database access with transactions, one schema per service |
| Cache / Queue | Redis 7 + BullMQ | 7.x | Job queues, Redis Streams, rate limiting state, caching |
| Blockchain | ethers.js | v6 | EVM interaction, contract calls, transaction signing |
| Smart Contracts | Solidity | 0.8.27 | Adapted from BitGo eth-multisig-v4 (EIP-1167, CREATE2) |
| Build Tool | Hardhat | -- | Contract compilation (optimizer: 1000 runs, Cancun EVM), testing, deployment |
| API Gateway | Kong | 3.6 | Declarative DB-less mode, rate limiting, CORS, request size limiting |
| Monitoring - Metrics | Prometheus | v2.50.0 | Metrics collection from Kong and all NestJS services (15s scrape) |
| Monitoring - Dashboards | Grafana | 10.3.0 | Visualization for Prometheus metrics and Loki logs |
| Monitoring - Logs | Loki | 2.9.0 | Structured JSON log aggregation from all services |
| Monitoring - Traces | Jaeger | 1.54 | Distributed tracing via OTLP (port 4318) |
| Analytics | PostHog (self-hosted) | latest | Business event tracking, API request/response capture |
| Analytics Backend | ClickHouse + Kafka | 23.12 / 3.6 | PostHog analytics storage and event streaming |
| Authentication | JWT + bcryptjs + otplib | -- | Access/refresh tokens, password hashing, TOTP 2FA |
| Encryption | Node.js crypto (native) | -- | AES-256-GCM, PBKDF2-SHA512, scrypt, HMAC-SHA256 |
| Animation | Framer Motion | -- | Frontend micro-interactions, wizard transitions |
| Typography | Outfit + JetBrains Mono | -- | Dual-font system (display + monospace for blockchain data) |
| Monorepo | Turborepo + npm workspaces | v2.3+ | Build orchestration, dependency management |
| Infrastructure | Docker + docker-compose | 3.9 | Containerization with 4 isolated networks |

---

## Services

### Admin API (Port 3001)

The administrative backend for platform operators. Provides CRUD operations for client organizations (with custody mode, tier assignment, and chain configuration), tier management (rate limits and resource quotas with cloning support), chain registry (EVM chains with contract addresses and confirmation requirements), token registry (ERC-20 tokens in the global catalog), compliance management (KYT alert review and status updates), and monitoring endpoints (service health, queue depths, gas tank balances). Authenticated via JWT with role-based access control (super_admin, admin, viewer).

**Key endpoints**: `POST /admin/clients`, `GET /admin/clients`, `POST /admin/tiers`, `POST /admin/chains`, `POST /admin/tokens`, `GET /admin/compliance/alerts`, `PATCH /admin/compliance/alerts/:id`, `GET /admin/monitoring/health`

### Client API (Port 3002)

The integration API for client exchanges and payment gateways. Exposes wallet operations, deposit address generation (single or batch up to 100 via CREATE2), deposit listing with filters (status, chain, date range), withdrawal creation (to whitelisted addresses with idempotency keys), address book management (whitelist with 24-hour cooldown), webhook CRUD with test delivery and delivery log inspection, and co-sign operations for co-custody mode clients. Authenticated via API key (`X-API-Key` header) with scope-based authorization (read, write, withdraw).

**Key endpoints**: `GET /client/v1/wallets`, `POST /client/v1/deposit-addresses`, `POST /client/v1/deposit-addresses/batch`, `GET /client/v1/deposits`, `POST /client/v1/withdrawals`, `POST /client/v1/address-book`, `POST /client/v1/webhooks`, `POST /client/v1/co-sign/:id/sign`

### Auth Service (Port 3003)

Handles all authentication and authorization for the platform. Manages JWT session lifecycle (login with optional TOTP, refresh with SHA-256 hashed refresh tokens, logout with session invalidation), TOTP-based two-factor authentication (setup with QR code, verify, disable with password confirmation, opaque challenge tokens for 2FA flow), API key management (creation with scopes, IP allowlists, chain restrictions, expiration; SHA-256 hashed storage; usage tracking), and role-based access control. Rate limited to 10 requests/second via Kong. Tracks login attempts per IP and email with lockout. TOTP secrets are encrypted at rest using AES-256-GCM with per-operation random salt via scrypt key derivation.

**Key endpoints**: `POST /auth/login`, `POST /auth/2fa/challenge`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/2fa/setup`, `POST /auth/2fa/verify`, `POST /auth/2fa/disable`, `POST /auth/api-keys`, `GET /auth/api-keys`, `DELETE /auth/api-keys/:id`, `POST /auth/api-keys/validate`

### Core Wallet Service (Port 3004)

The central orchestration service for all wallet and transaction operations. Manages the wallet lifecycle (creation via CvhWalletFactory with CREATE2), deposit address generation and tracking (computed vs. deployed forwarder status), balance queries (via Multicall3 batching for efficiency), withdrawal processing (whitelisted address validation, idempotency, balance verification), and compliance screening integration. Bridges `internal-net` and `vault-net` to communicate with the Key Vault Service. Publishes deposit events via Redis Streams and queues webhook deliveries via BullMQ.

**Key endpoints**: `POST /wallets/create`, `GET /wallets/:clientId`, `GET /wallets/:clientId/:chainId/balances`, `POST /deposit-addresses/generate`, `POST /deposit-addresses/batch`, `GET /deposit-addresses/:clientId`, `POST /withdrawals/create`, `GET /withdrawals/:clientId`, `POST /compliance/screen`, `GET /compliance/alerts`, `PATCH /compliance/alerts/:id`

### Key Vault Service (Port 3005)

The isolated cryptographic service that is the sole custodian of all private key material. Runs exclusively on `vault-net` with zero internet access. Handles HD key generation (BIP-32/39/44 derivation of platform, client, and backup keys per client), gas tank key derivation (per client per chain), transaction signing (single and batch hash signing), and Shamir's Secret Sharing (3-of-5 split and reconstruction of backup keys). All operations are authenticated via `InternalServiceGuard` (timing-safe comparison of `X-Internal-Service-Key` header). Private keys are encrypted with AES-256-GCM envelope encryption using a PBKDF2-derived KEK (600,000 iterations, SHA-512). All operations are logged to an append-only `key_vault_audit` table.

**Key endpoints**: `POST /keys/generate`, `POST /keys/derive-gas-tank`, `GET /keys/:clientId/public`, `POST /keys/:clientId/sign`, `POST /keys/:clientId/sign-batch`, `GET /shamir/:clientId/status`, `POST /shamir/:clientId/split`, `POST /shamir/:clientId/reconstruct`

### Chain Indexer Service (Port 3006)

Monitors all configured EVM chains for deposits to monitored addresses. Uses a dual detection strategy: WebSocket subscriptions (`newHeads` + Transfer event filtering) for real-time detection, and polling-based block scanning as a reliable fallback. Detected deposits are published to Redis Streams for consumption by the Core Wallet Service. Manages confirmation tracking via BullMQ, verifying transaction receipts at configurable milestones (1, 3, 6, 12 confirmations) with reorg protection (receipt existence verification at each check). Maintains sync cursors per chain in `cvh_indexer.sync_cursors`.

### Notification Service (Port 3007)

Manages webhook endpoint registration and event delivery. Supports CRUD operations on webhook configurations per client, test delivery to verify endpoint connectivity, delivery log inspection with HTTP status codes and response times, and retry of failed deliveries. All webhook payloads are signed with HMAC-SHA256 using a per-endpoint signing secret generated at creation time. The signature is sent in the `X-CVH-Signature` header. Failed deliveries are retried with exponential backoff and jitter, with persistent failures routed to a Dead Letter Queue (DLQ). Authenticated internally via `InternalServiceGuard`.

**Key endpoints**: `POST /webhooks`, `GET /webhooks/client/:clientId`, `PATCH /webhooks/:id`, `DELETE /webhooks/:id`, `GET /webhooks/:id/deliveries`, `POST /webhooks/deliver`

### Cron Worker Service (Port 3008)

Executes scheduled background operations: ERC-20 token sweeping (queries forwarders with pending balances and calls `flushTokens()` or `batchFlushERC20Tokens()` via the Gas Tank), gas tank balance monitoring and top-up, forwarder deployment (deploys computed-but-undeployed forwarders when ERC-20 flushing is needed), and sanctions list synchronization (daily XML sync from OFAC, EU, UN, UK OFSI sources into `cvh_compliance.sanctions_entries`). Communicates with the Core Wallet Service via HTTP/REST on `internal-net`.

---

## Frontend Applications

### Admin Panel (Port 3010)

Internal administration application built with Next.js 14 (App Router), Tailwind CSS, shadcn/ui, and Recharts. Uses the `@cvh/api-client` SDK with TanStack Query for type-safe API integration.

**Pages**:

| Page | Path | Description |
|------|------|-------------|
| Login | `/login` | JWT authentication with TOTP 2FA support |
| Dashboard | `/` | Total custody balance (Vault Meter), deposit/withdrawal volume charts, client overview |
| Clients | `/clients` | Client list with CRUD, custody mode, tier assignment |
| Client Detail | `/clients/[id]` | Individual client wallets, addresses, transaction history, compliance status |
| Traceability | `/traceability` | End-to-end transaction forensics with JSON artifacts, trace ID correlation |
| Tiers | `/tiers` | Rate limit and resource tier management with cloning |
| Chains | `/chains` | EVM chain registry with contract addresses and RPC configuration |
| Tokens | `/tokens` | Global ERC-20 token catalog management |
| Compliance | `/compliance` | KYT alert review queue, screening history, sanction list status |
| Gas Tanks | `/gas-tanks` | Per-client per-chain gas tank balance monitoring and top-up |
| Monitoring | `/monitoring` | Service health, queue depths, RPC node status |
| Analytics - Operations | `/analytics/operations` | Deposit/withdrawal volumes, success rates, processing times |
| Analytics - Compliance | `/analytics/compliance` | Screening volumes, hit rates, alert resolution times |
| **RPC Providers** (v2) | `/rpc-providers` | RPC endpoint registry with health scores, latency, and failover |
| **Jobs Dashboard** (v2) | `/jobs` | BullMQ queue monitoring with retry controls and DLQ management |
| **Sync Health** (v2) | `/sync-health` | Per-chain indexer synchronization status with gap detection |
| **Impersonation** (v2) | `/clients/[id]/impersonate` | View platform as a specific client with full audit logging |

### Client Portal (Port 3011)

Self-service application for client exchanges and payment gateways. Built with the same stack as the Admin Panel.

**Pages**:

| Page | Path | Description |
|------|------|-------------|
| Login | `/login` | JWT authentication with optional TOTP 2FA |
| Dashboard | `/` | Client-scoped balance overview, recent activity |
| Setup Wizard | `/setup` | 7-step onboarding: Chain, Wallet, Deposit, Withdrawal, Deploy, Test, Complete |
| Wallets | `/wallets` | Hot wallet listing with balances per chain |
| Deposit Addresses | `/addresses` | Generate and manage forwarder deposit addresses |
| Deposits | `/deposits` | Deposit history with status tracking and filters |
| Withdrawals | `/withdrawals` | Create withdrawals, view history and confirmation status |
| Transactions | `/transactions` | Unified transaction view (deposits + withdrawals) |
| Webhooks | `/webhooks` | CRUD webhook endpoints, test delivery, view delivery logs |
| API Keys | `/api-keys` | Create, list, and revoke API keys with scope management |
| Security | `/security` | Two-factor authentication setup and management |
| Settings | `/settings` | Account and organization settings |
| **Flush Operations** (v2) | `/flush` | Self-service ERC-20/native token flush from forwarders |
| **Address Groups** (v2) | `/address-groups` | Multi-chain deposit address groups with CREATE2 |
| **Exports** (v2) | `/exports` | Export transaction/address/compliance data (CSV, JSON, XLSX, PDF) |
| **Project Selector** (v2) | Header component | Switch between isolated projects within the organization |

---

## Smart Contracts

All contracts are compiled with Solidity 0.8.27, optimizer enabled (1000 runs), targeting the Cancun EVM version. Adapted from BitGo's eth-multisig-v4.

### CvhWalletSimple

2-of-3 multisig hot wallet. Three signers are set at initialization (immutable). Every withdrawal requires `msg.sender` as signer 1 and a second signer verified via `ecrecover`. Features include: sequence ID window (10 slots, max increase 10,000) for replay protection, `block.chainid` binding with network ID suffixes (`-ERC20`, `-Batch`) for cross-chain and cross-type replay prevention, signature malleability protection (`s <= secp256k1n/2`), safe mode (irrevocable, restricts transfers to signer addresses), operation expiry, ERC-721 and ERC-1155 receiving, batch ETH transfers (up to 255 recipients), and `ReentrancyGuard` protection.

**Source**: `contracts/contracts/CvhWalletSimple.sol`

### CvhForwarder

Deposit address proxy that auto-forwards ETH to the parent wallet via `receive()` -> `flush()`. Holds ERC-20 tokens until `flushTokens()` or `batchFlushERC20Tokens()` is called by the parent or fee address. Supports ERC-721 and ERC-1155 auto-forwarding (configurable). The `callFromParent()` function allows the parent wallet to execute arbitrary calls through the forwarder. If ETH exists at the address before initialization, it is flushed during `init()`.

**Source**: `contracts/contracts/CvhForwarder.sol`

### CvhWalletFactory

Factory for deploying CvhWalletSimple clones using CREATE2 + EIP-1167 minimal proxy. `createWallet()` deploys and initializes in a single transaction. `computeWalletAddress()` predicts the address before deployment. Salt is bound to the allowed signers: `keccak256(allowedSigners, salt)`.

**Source**: `contracts/contracts/CvhWalletFactory.sol`

### CvhForwarderFactory

Factory for deploying CvhForwarder clones using CREATE2 + EIP-1167 minimal proxy. `createForwarder()` deploys and initializes in a single transaction. `computeForwarderAddress()` enables deterministic address computation before deployment (lazy deployment). Salt is bound to parent and fee address: `keccak256(parent, feeAddress, salt)`.

**Source**: `contracts/contracts/CvhForwarderFactory.sol`

### CvhBatcher

Batch transfer contract for distributing ETH or ERC-20 tokens to multiple recipients in a single transaction. Configurable gas limit per transfer (default: 30,000) and batch size limit (default: 255). Excess ETH is refunded. Uses `Ownable2Step` for two-step ownership transfer. Owner can recover stuck ETH.

**Source**: `contracts/contracts/CvhBatcher.sol`

### Supporting Contracts

- **CloneFactory** (`contracts/contracts/CloneFactory.sol`): Internal library implementing EIP-1167 minimal proxy deployment via CREATE2 inline assembly.
- **TransferHelper** (`contracts/contracts/TransferHelper.sol`): Safe ERC-20 transfer library handling both standard and non-standard (no return value) tokens.

---

## Database Schema

CryptoVaultHub uses 10 separate MySQL databases for strict domain isolation (8 original + 2 added in v2 for jobs and exports). All databases use `utf8mb4` with `utf8mb4_unicode_ci` collation. Each service uses Prisma ORM with its own schema pointing to the relevant database.

```
+------------------+     +------------------+     +------------------+
|   cvh_auth       |     |   cvh_admin      |     |   cvh_keyvault   |
|                  |     |                  |     |                  |
| - users          |     | - clients        |     | - master_seeds   |
| - sessions       |     | - tiers          |     | - derived_keys   |
| - api_keys       |     | - client_tier_   |     | - shamir_shares  |
|                  |     |   overrides      |     | - key_vault_audit|
|                  |     | - chains         |     |                  |
|                  |     | - tokens         |     |                  |
|                  |     | - client_tokens  |     |                  |
|                  |     | - client_chain_  |     |                  |
|                  |     |   config         |     |                  |
|                  |     | - audit_logs     |     |                  |
+------------------+     +------------------+     +------------------+

+------------------+     +------------------+     +------------------+
|   cvh_wallets    |     | cvh_transactions |     | cvh_compliance   |
|                  |     |                  |     |                  |
| - wallets        |     | - deposits       |     | - sanctions_     |
| - deposit_       |     | - withdrawals    |     |   entries        |
|   addresses      |     |                  |     | - screening_     |
| - whitelisted_   |     |                  |     |   results        |
|   addresses      |     |                  |     | - compliance_    |
|                  |     |                  |     |   alerts         |
+------------------+     +------------------+     +------------------+

+------------------+     +------------------+
| cvh_notifications|     |   cvh_indexer    |
|                  |     |                  |
| - webhooks       |     | - sync_cursors   |
| - webhook_       |     | - monitored_     |
|   deliveries     |     |   addresses      |
| - email_logs     |     |                  |
+------------------+     +------------------+
```

### Key Relationships

- `cvh_admin.clients` is the central entity, referenced by wallets, transactions, API keys, and compliance records across all databases.
- `cvh_auth.api_keys.client_id` links API keys to clients for scope-based authorization.
- `cvh_wallets.wallets` holds one hot wallet per client per chain.
- `cvh_wallets.deposit_addresses` tracks forwarder deployment status via an `is_deployed` flag (computed vs. deployed).
- `cvh_transactions.deposits` links to the forwarder address that received the deposit.
- `cvh_keyvault` is accessed ONLY by the Key Vault Service -- no cross-database joins are permitted.

### Migration Scripts

Located in `database/`:

| Script | Purpose |
|--------|---------|
| `000-create-databases.sql` | Creates all 8 databases |
| `001-cvh-auth.sql` | Auth tables (users, sessions, api_keys) |
| `002-cvh-keyvault.sql` | Key vault tables (master_seeds, derived_keys, shamir_shares, key_vault_audit) |
| `003-cvh-admin.sql` | Admin tables (clients, tiers, chains, tokens, audit_logs) |
| `004-cvh-wallets.sql` | Wallet tables (wallets, deposit_addresses, whitelisted_addresses) |
| `005-cvh-transactions.sql` | Transaction tables (deposits, withdrawals) |
| `006-cvh-compliance.sql` | Compliance tables (sanctions_entries, screening_results, compliance_alerts) |
| `007-cvh-notifications.sql` | Notification tables (webhooks, webhook_deliveries, email_logs) |
| `008-cvh-indexer.sql` | Indexer tables (sync_cursors, monitored_addresses) |
| `009-seed-data.sql` | Initial seed data |
| `010-performance-indexes.sql` | Performance optimization indexes |
| `011-traceability-views.sql` | Views for transaction traceability queries |
| `012-schema-fixes.sql` | Schema corrections and updates |

---

## Security

CryptoVaultHub implements defense-in-depth security across all layers.

| Layer | Mechanism | Details |
|-------|-----------|---------|
| Network Isolation | `vault-net` Docker network | Key Vault has zero internet access. Only Core Wallet bridges `internal-net` and `vault-net`. `internal-net` is marked `internal: true` (no external access). |
| Encryption at Rest | AES-256-GCM envelope encryption | Two-layer scheme: PBKDF2-derived KEK wraps a random DEK, which encrypts the private key. Per-key random 32-byte salt. |
| Key Derivation | PBKDF2-HMAC-SHA512 | 600,000 iterations per OWASP 2024 recommendation. Configurable via `KDF_ITERATIONS` environment variable. |
| Key Backup | Shamir's Secret Sharing | 3-of-5 threshold. Each share individually encrypted. Distributed across 5 custodians (client contacts, platform admin, cold storage, physical vault). |
| Inter-Service Auth | InternalServiceGuard | Shared secret in `X-Internal-Service-Key` header validated via `crypto.timingSafeEqual()` to prevent timing attacks. Applied globally to Key Vault, Core Wallet, and Notification Service controllers. |
| API Key Security | SHA-256 hashing | Plaintext key shown only once at creation. Stored as SHA-256 hash. Scoped (read/write/withdraw), IP-restricted, chain-restricted, with expiration. Usage tracking (count, last used IP/time). |
| TOTP Encryption | AES-256-GCM + scrypt | TOTP secrets encrypted with per-operation random salt. Key derived via scrypt from `TOTP_ENCRYPTION_KEY`. |
| Password Security | bcryptjs | Password hashing with salt rounds for user authentication. |
| Rate Limiting | Kong + Redis | Multi-level: Admin API 50/s, Client API 100/s, Auth Service 10/s. Redis-backed for distributed consistency. Per-tenant and per-endpoint limits via tier system. 1 MB request size limit. |
| CORS | Kong global plugin | Restricted to known origins: `localhost:3010`, `localhost:3011`, `admin.cryptovaulthub.com`, `portal.cryptovaulthub.com`. |
| Input Validation | class-validator (NestJS DTOs) | All API inputs validated via decorator-based DTOs. Ethereum address format validation. |
| On-Chain Security | CvhWalletSimple | 2-of-3 multisig, sequence ID replay protection, chain ID binding, signature malleability prevention (`s <= secp256k1n/2`), operation expiry, `ReentrancyGuard`, irrevocable safe mode. |
| Contract Admin | Ownable2Step (CvhBatcher) | Two-step ownership transfer prevents accidental ownership loss. |
| Login Protection | Rate limiting + lockout | Login attempts tracked per IP and email. TOTP attempt rate limiting. Opaque challenge tokens (not user IDs) in 2FA flow. |
| Session Management | SHA-256 hashed refresh tokens | Stored in `cvh_auth.sessions` with IP, user agent, and expiry tracking. |
| Webhook Integrity | HMAC-SHA256 | Per-endpoint signing secret. Signature in `X-CVH-Signature` header. |
| Redis Auth | `requirepass` | Redis password authentication configured via `REDIS_PASSWORD` environment variable. |
| Audit Trail | PostHog + key_vault_audit | Every API request, blockchain event, compliance action, and key operation is recorded. Correlated via trace ID across PostHog, Loki, and Jaeger. |
| Memory Safety | Explicit zeroing | DEK, KEK, and plaintext key buffers are `.fill(0)` after use in the encryption service. |
| 2FA Enforcement | Mandatory for admins | TOTP 2FA is mandatory for admin users. Configurable for client users. Password confirmation required to disable 2FA. |

---

## Visual Identity

CryptoVaultHub has a comprehensive visual identity system documented in [docs/identity/cryptovaulthub-visual-identity.md](docs/identity/cryptovaulthub-visual-identity.md). The design philosophy draws inspiration from Binance (data-dense dark-first design, single accent color), Linear (typography hierarchy), and Stripe Dashboard (editorial data presentation).

### Core Principles

- **Vault Gold (#E2A828)**: The single accent color. Used for primary buttons, active navigation, links, badges, chart accents, focus indicators, and progress bars. Everything else is neutral.
- **Dual-Font System**: Outfit (geometric, display) for all interface text -- titles, labels, navigation, buttons. JetBrains Mono (monospace) exclusively for blockchain data -- addresses, hashes, keys, JSON, crypto amounts.
- **Dark/Light Mode**: Dark mode is the default. Depth is achieved through 4 surface layers (page, card, elevated, hover) rather than shadows. Shadows are reserved for floating elements only (modals, dropdowns, tooltips).
- **Hexagonal Motif**: Chain avatars use hexagonal clip-path instead of circles, reinforcing the blockchain DNA of the product.
- **Topological Texture**: A subtle blockchain-inspired network pattern (nodes and connections) at 3% opacity covers the background as a structural watermark.

### Conceptual Visual Components

- **Vault Meter**: Semicircular gauge showing total custody balance as a proportion of historical maximum, with a multi-segment gold-toned chain composition bar.
- **Wallet LED**: 8px pulsing circle indicator (green/amber/red) on each wallet card showing real-time status.
- **Blockchain Steps**: Hexagonal step indicators connected by chain links for the 7-step onboarding wizard, with completed/active/future states.
- **Contract Deployment Pipeline**: Industrial forge metaphor with hexagonal spinners, confirmation progress bars, and live transaction hash display.
- **Live Balance**: Heartbeat-style balance display with digit slide animation on value changes and a 5-second pulse indicator showing live monitoring status.

---

## Quick Start

### Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | >= 20.0.0 | Required for all services and build tools |
| npm | >= 10 | Included with Node.js 20 |
| Docker | >= 24 | For containerized infrastructure |
| docker-compose | >= 2.20 | For orchestration |
| MySQL | 8.0+ | External cluster (not in docker-compose) |
| Git | >= 2.30 | For cloning the repository |

### 1. Clone and Install

```bash
git clone <repo-url> CryptoVaultHub
cd CryptoVaultHub
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# MySQL
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=cvh_admin
MYSQL_PASSWORD=<your-strong-password>

# Redis
REDIS_PASSWORD=<your-redis-password>

# Key Vault (CRITICAL -- use 64+ character high-entropy password)
VAULT_MASTER_PASSWORD=<your-vault-master-password>

# Inter-service authentication
INTERNAL_SERVICE_KEY=<random-256-bit-string>

# JWT / Auth
JWT_SECRET=<random-256-bit-string>
JWT_EXPIRES_IN_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=7
TOTP_ENCRYPTION_KEY=<64-char-hex-string>

# RPC Endpoints (add for each chain)
RPC_ETH_HTTP=https://eth-mainnet.gateway.tatum.io/
RPC_ETH_WS=wss://eth-mainnet.gateway.tatum.io/ws
RPC_BSC_HTTP=https://bsc-mainnet.gateway.tatum.io/
RPC_BSC_WS=wss://bsc-mainnet.gateway.tatum.io/ws
RPC_POLYGON_HTTP=https://polygon-mainnet.gateway.tatum.io/
TATUM_API_KEY=<your-tatum-api-key>

# PostHog
POSTHOG_HOST=http://posthog-web:8000
POSTHOG_API_KEY=phc_your_key_here

# Monitoring
GRAFANA_PASSWORD=<your-grafana-password>
```

### 3. Database Setup

```bash
# Create all 8 databases
mysql -h <host> -u root -p < database/000-create-databases.sql

# Run all migration scripts in order
mysql -h <host> -u root -p < database/001-cvh-auth.sql
mysql -h <host> -u root -p < database/002-cvh-keyvault.sql
mysql -h <host> -u root -p < database/003-cvh-admin.sql
mysql -h <host> -u root -p < database/004-cvh-wallets.sql
mysql -h <host> -u root -p < database/005-cvh-transactions.sql
mysql -h <host> -u root -p < database/006-cvh-compliance.sql
mysql -h <host> -u root -p < database/007-cvh-notifications.sql
mysql -h <host> -u root -p < database/008-cvh-indexer.sql
mysql -h <host> -u root -p < database/009-seed-data.sql
mysql -h <host> -u root -p < database/010-performance-indexes.sql
mysql -h <host> -u root -p < database/011-traceability-views.sql
mysql -h <host> -u root -p < database/012-schema-fixes.sql

# Or use the migration script
bash database/migrate.sh
```

Create the application database user:

```sql
CREATE USER 'cvh_admin'@'%' IDENTIFIED BY 'your-strong-password';
GRANT ALL PRIVILEGES ON cvh_auth.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_keyvault.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_admin.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_wallets.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_transactions.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_compliance.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_notifications.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_indexer.* TO 'cvh_admin'@'%';
FLUSH PRIVILEGES;
```

### 4. Start Infrastructure

```bash
docker compose up -d
```

This starts Redis, Kong, Prometheus, Grafana, Loki, Jaeger, and the full PostHog stack.

### 5. Build and Run Services

```bash
# Build all packages first
npx turbo build

# Start all services in development mode (watch mode)
npx turbo dev
```

### 6. Verify Health

```bash
# Check each service health endpoint
curl http://localhost:3001/health  # Admin API
curl http://localhost:3002/health  # Client API
curl http://localhost:3003/health  # Auth Service
curl http://localhost:3004/health  # Core Wallet Service
curl http://localhost:3005/health  # Key Vault Service
curl http://localhost:3006/health  # Chain Indexer Service
curl http://localhost:3007/health  # Notification Service
curl http://localhost:3008/health  # Cron Worker Service

# Check Kong gateway
curl http://localhost:8000/auth/health

# Check monitoring
curl http://localhost:9090/-/healthy   # Prometheus
curl http://localhost:3000/api/health  # Grafana
curl http://localhost:3100/ready       # Loki
```

---

## Smart Contract Deployment

```bash
cd contracts

# Compile all contracts
npx hardhat compile

# Deploy to each target chain
npx hardhat run scripts/deploy.ts --network ethereum
npx hardhat run scripts/deploy.ts --network bsc
npx hardhat run scripts/deploy.ts --network polygon
# ... repeat for each chain
```

The deploy script deploys in dependency order:
1. `CvhWalletSimple` (implementation)
2. `CvhForwarder` (implementation)
3. `CvhWalletFactory` (references wallet implementation)
4. `CvhForwarderFactory` (references forwarder implementation)
5. `CvhBatcher` (standalone)

After deployment, register contract addresses via the Admin API:

```bash
curl -X POST http://localhost:8000/admin/chains \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ethereum",
    "symbol": "ETH",
    "chainId": 1,
    "rpcUrl": "https://eth-mainnet.gateway.tatum.io/",
    "confirmationsRequired": 12
  }'
```

---

## Project Structure

```
CryptoVaultHub/
+-- contracts/                  # Solidity smart contracts (Hardhat)
|   +-- contracts/              # CvhWalletSimple, CvhForwarder, Factories, Batcher
|   +-- scripts/                # Deployment scripts
|   +-- test/                   # Contract tests (Hardhat + ethers.js v6)
+-- packages/                   # Shared packages
|   +-- api-client/             # Type-safe API client SDK (@cvh/api-client)
|   +-- config/                 # Shared configuration
|   +-- posthog/                # PostHog client wrapper (@cvh/posthog)
|   +-- types/                  # Shared TypeScript types (@cvh/types)
|   +-- utils/                  # Formatters, helpers (@cvh/utils)
+-- services/                   # NestJS microservices
|   +-- admin-api/              # Administrative API (Port 3001)
|   +-- client-api/             # Client integration API (Port 3002)
|   +-- auth-service/           # JWT, API keys, RBAC, TOTP 2FA (Port 3003)
|   +-- core-wallet-service/    # Wallet lifecycle, deposits, withdrawals (Port 3004)
|   +-- key-vault-service/      # HD keygen, signing, encryption (Port 3005)
|   +-- chain-indexer-service/  # Block scanning, deposit detection (Port 3006)
|   +-- notification-service/   # Webhooks, email delivery (Port 3007)
|   +-- cron-worker-service/    # Sweeps, gas management, OFAC sync (Port 3008)
+-- apps/                       # Next.js frontend applications
|   +-- admin/                  # Admin Panel (Port 3010) -- includes Analytics
|   +-- client/                 # Client Portal (Port 3011) -- includes Setup Wizard
+-- database/                   # SQL migration scripts (12 scripts + migrate.sh)
+-- infra/                      # Infrastructure configuration
|   +-- docker/                 # Dockerfiles (NestJS, Next.js -- multi-stage builds)
|   +-- kong/                   # Kong declarative config (kong.yml)
|   +-- prometheus/             # Prometheus scrape config
|   +-- grafana/                # Grafana provisioning
+-- docs/                       # Documentation
|   +-- api/                    # Admin API and Client API endpoint reference
|   +-- identity/               # Visual identity system
|   +-- screenshots/            # UI screenshots (PNG) and HTML mockups (v1 + v2)
|   +-- database/               # Database documentation
|   +-- superpowers/            # Implementation plans and architecture decisions
+-- docker-compose.yml          # Full orchestration (4 networks, 20+ containers)
+-- turbo.json                  # Turborepo pipeline config
+-- package.json                # Root workspace config (npm workspaces)
```

---

## Documentation

| Document | Path | Description |
|----------|------|-------------|
| Architecture | [docs/architecture.md](docs/architecture.md) | Service topology, data flows, database design, network layout |
| Deployment Guide | [docs/deployment.md](docs/deployment.md) | Full setup, environment variables, infrastructure, production checklist |
| Features Reference | [docs/features.md](docs/features.md) | Detailed feature descriptions, configuration, API endpoints |
| Security | [docs/security.md](docs/security.md) | Key management, encryption, custody modes, network isolation |
| Smart Contracts | [docs/smart-contracts.md](docs/smart-contracts.md) | Contract interfaces, CREATE2, forwarder lifecycle, gas optimization |
| Admin API Reference | [docs/api/admin-api.md](docs/api/admin-api.md) | Admin API endpoint documentation |
| Client API Reference | [docs/api/client-api.md](docs/api/client-api.md) | Client API endpoint documentation |
| Visual Identity | [docs/identity/cryptovaulthub-visual-identity.md](docs/identity/cryptovaulthub-visual-identity.md) | Design system, tokens, component specifications |
| Database Schema | [docs/database-schema.md](docs/database-schema.md) | All 10 databases, table definitions, relationships |
| Flush Operations (v2) | [docs/flush-operations.md](docs/flush-operations.md) | Flush/sweep guide, gas tank lifecycle, batch operations |
| Queue System (v2) | [docs/queue-system.md](docs/queue-system.md) | BullMQ queues, Redis Streams, job lifecycle, DLQ handling |
| Webhook System (v2) | [docs/webhook-system.md](docs/webhook-system.md) | Webhook configuration, HMAC signing, retry strategy, delivery logs |
| Chain Indexer (v2) | [docs/indexer.md](docs/indexer.md) | Hybrid polling + WebSocket indexer, gap detection, reconciliation |
| Multi-Chain Addresses (v2) | [docs/multi-chain-addresses.md](docs/multi-chain-addresses.md) | CREATE2 deterministic addressing, address groups, cross-chain identity |
| Operations Guide (v2) | [docs/operations.md](docs/operations.md) | Operational runbooks, monitoring, alerting, troubleshooting |
| Rollout Checklist (v2) | [docs/rollout-checklist.md](docs/rollout-checklist.md) | v2 migration checklist, feature flags, rollback procedures |

---

## API Documentation (Swagger)

CryptoVaultHub provides comprehensive, interactive API documentation following the **OpenAPI 3.0 specification** via Swagger UI. Both the Admin API and Client API have fully documented endpoints with detailed descriptions, request/response examples, authentication schemes, and error code references.

### Client API Documentation (`/api/docs`)

The Client API Swagger page documents all 18 endpoints across 7 categories, with:

- **API Key authentication** (`X-API-Key` header) with scope-based access control (read/write/withdraw)
- **Detailed endpoint descriptions** including the full deposit address generation flow (CREATE2, forwarder lifecycle), withdrawal status lifecycle (9 states), and webhook HMAC-SHA256 signature verification code
- **Multiple request examples** per endpoint (ETH withdrawal, USDT on BSC, batch deposit generation)
- **Complete request/response schemas** with field-level descriptions, types, constraints, and enums
- **Error code reference** (400-500) with descriptions for each scenario
- **Webhook events table** with all 7 event types and their descriptions
- **Supported chains table** (Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Base)

![CryptoVaultHub Client API — Swagger Documentation](docs/screenshots/client-api-swagger.png)

### Admin API Documentation (`/api/docs`)

The Admin API Swagger page documents all 17 endpoints across 6 categories:

- **JWT Bearer authentication** with role-based access (super_admin, admin, viewer)
- **Client management** with custody mode and KYT level configuration
- **Chain and token registry** management
- **Tier configuration** with rate limits, resource quotas, and compliance levels
- **Compliance alert** lifecycle management
- **System monitoring** with health checks, queue status, and gas tank balances

### Accessing Swagger UI

| Service | URL | Authentication |
|---------|-----|----------------|
| Admin API | `http://localhost:3001/api/docs` | JWT Bearer Token |
| Client API | `http://localhost:3002/api/docs` | API Key (X-API-Key) |

> **Tip:** Both Swagger UIs support persistent authorization — enter your credentials once and they persist across page reloads. Use the "Try it out" feature to test endpoints directly from the documentation page.

---

## Screenshots

The Admin Panel and Client Portal have been designed with the CryptoVaultHub visual identity, implementing the dual-font system (Outfit + JetBrains Mono), semantic design tokens, dark/light mode theming, hexagonal chain avatars, and all conceptual visual components described in the identity document.

### Admin Panel

#### Dashboard (Dark Mode)
![Admin Dashboard - Dark Mode](docs/screenshots/admin-dashboard-dark.png)

#### Dashboard (Light Mode)
![Admin Dashboard - Light Mode](docs/screenshots/admin-dashboard-light.png)

#### Traceability (Dark Mode)
![Admin Traceability - Dark Mode](docs/screenshots/admin-traceability-dark.png)

#### Traceability (Light Mode)
![Admin Traceability - Light Mode](docs/screenshots/admin-traceability-light.png)

#### Analytics (Dark Mode)
![Admin Analytics - Dark Mode](docs/screenshots/admin-analytics-dark.png)

#### Analytics (Light Mode)
![Admin Analytics - Light Mode](docs/screenshots/admin-analytics-light.png)

#### Clients (Dark Mode)
![Admin Clients - Dark Mode](docs/screenshots/admin-clients-dark.png)

#### Clients (Light Mode)
![Admin Clients - Light Mode](docs/screenshots/admin-clients-light.png)

#### Login (Dark Mode)
![Admin Login - Dark Mode](docs/screenshots/admin-login-dark.png)

#### Login (Light Mode)
![Admin Login - Light Mode](docs/screenshots/admin-login-light.png)

### Admin Panel -- v2 Pages

#### RPC Providers Management
![Admin RPC Providers](docs/screenshots/v2-rpc-providers.png)

#### Jobs Dashboard
![Admin Jobs Dashboard](docs/screenshots/v2-jobs-dashboard.png)

#### Sync Health Dashboard
![Admin Sync Health](docs/screenshots/v2-sync-health.png)

#### Client Impersonation Mode
![Admin Impersonation](docs/screenshots/v2-impersonation.png)

#### Enhanced JSON Viewer v2
![Admin JSON Viewer](docs/screenshots/v2-json-viewer.png)

### Client Portal

#### Dashboard (Dark Mode)
![Client Dashboard - Dark Mode](docs/screenshots/client-dashboard-dark.png)

#### Dashboard (Light Mode)
![Client Dashboard - Light Mode](docs/screenshots/client-dashboard-light.png)

#### Transactions (Dark Mode)
![Client Transactions - Dark Mode](docs/screenshots/client-transactions-dark.png)

#### Transactions (Light Mode)
![Client Transactions - Light Mode](docs/screenshots/client-transactions-light.png)

#### Setup Wizard (Dark Mode)
![Client Setup Wizard - Dark Mode](docs/screenshots/client-setup-wizard-dark.png)

#### Setup Wizard (Light Mode)
![Client Setup Wizard - Light Mode](docs/screenshots/client-setup-wizard-light.png)

#### Wallets (Dark Mode)
![Client Wallets - Dark Mode](docs/screenshots/client-wallets-dark.png)

#### Wallets (Light Mode)
![Client Wallets - Light Mode](docs/screenshots/client-wallets-light.png)

#### Login (Dark Mode)
![Client Login - Dark Mode](docs/screenshots/client-login-dark.png)

#### Login (Light Mode)
![Client Login - Light Mode](docs/screenshots/client-login-light.png)

### Client Portal -- v2 Pages

#### Project Selector
![Client Project Selector](docs/screenshots/v2-project-selector.png)

#### Flush Operations
![Client Flush Operations](docs/screenshots/v2-flush-operations.png)

#### Multi-Chain Address Groups
![Client Address Groups](docs/screenshots/v2-address-groups.png)

#### Exports
![Client Exports](docs/screenshots/v2-exports.png)

#### Webhook Delivery History
![Client Webhook Delivery](docs/screenshots/v2-webhook-delivery.png)

---

## Service Ports Summary

| Service | Port | Network | Auth Method |
|---------|------|---------|-------------|
| Kong Proxy | 8000 / 8443 | public-net, internal-net | -- |
| Admin API | 3001 | internal-net, public-net | JWT (via Kong) |
| Client API | 3002 | internal-net, public-net | API Key (via Kong) |
| Auth Service | 3003 | internal-net | Rate limited (10/s) |
| Core Wallet | 3004 | internal-net, vault-net | InternalServiceGuard |
| Key Vault | 3005 | vault-net ONLY | InternalServiceGuard |
| Chain Indexer | 3006 | internal-net | InternalServiceGuard |
| Notification | 3007 | internal-net | InternalServiceGuard |
| Cron Worker | 3008 | internal-net | -- |
| Admin Panel | 3010 | public-net | JWT session |
| Client Portal | 3011 | public-net | JWT session |
| Redis | 6379 | internal-net | requirepass |
| Prometheus | 9090 | monitoring-net, internal-net | -- |
| Grafana | 3000 | monitoring-net | admin / password |
| Loki | 3100 | monitoring-net, internal-net | -- |
| Jaeger | 16686 / 4318 | monitoring-net, internal-net | -- |
| PostHog | 8010 | monitoring-net, internal-net | -- |

---

## Production Checklist

- [ ] Set strong `VAULT_MASTER_PASSWORD` (64+ characters, high entropy)
- [ ] Set strong `JWT_SECRET` (256-bit random)
- [ ] Set strong `INTERNAL_SERVICE_KEY` (256-bit random)
- [ ] Set strong `TOTP_ENCRYPTION_KEY` (64-character hex string)
- [ ] Set strong `REDIS_PASSWORD`
- [ ] Configure real RPC endpoints with API keys for all target chains
- [ ] Set up MySQL cluster with replication and backups
- [ ] Configure TLS certificates for Kong (port 8443)
- [ ] Deploy smart contracts to all target chains
- [ ] Register chain and token configurations via Admin API
- [ ] Create initial admin user and enable 2FA
- [ ] Configure Grafana dashboards and alert rules
- [ ] Set up log retention policies in Loki
- [ ] Configure PostHog data retention
- [ ] Set up external backup for Redis AOF, MySQL dumps, and Shamir shares
- [ ] Load-test rate limiting configuration per tier
- [ ] Verify Key Vault has zero internet access: `docker exec key-vault-service ping -c 1 google.com` (should fail)
- [ ] Set up DNS and load balancer for Kong

---

## License

MIT

---

## Contributing

### Getting Started

1. Fork the repository and create a feature branch from `main`.
2. Install dependencies: `npm install`
3. Build all packages: `npx turbo build`
4. Start development: `npx turbo dev`

### Guidelines

- All backend code is TypeScript (strict mode).
- Follow existing NestJS patterns: controllers, services, modules, DTOs with class-validator.
- Smart contract changes require corresponding Hardhat tests.
- Frontend changes must support both dark and light modes.
- Use semantic design tokens from the visual identity system -- never hardcode colors.
- All API endpoints must have corresponding DTO validation.
- Security-sensitive changes (encryption, key management, authentication) require thorough review.

### Testing

```bash
# Run smart contract tests
cd contracts && npx hardhat test

# Run all service tests
npx turbo test

# Run linting
npx turbo lint
```
