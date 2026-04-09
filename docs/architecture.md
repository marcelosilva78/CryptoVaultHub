# Architecture

## Service Topology

CryptoVaultHub is composed of 8 backend microservices, 2 frontend applications, supporting infrastructure, and a full observability stack -- orchestrated via docker-compose with 4 isolated Docker networks.

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
                  |   Admin: 50/s | Client: 100/s        |
                  |   Auth: 10/s  | Max body: 1MB        |
                  +---+--------+--------+--------+-------+
                      |        |        |        |
           +----------+   +---+---+  +-+----+   +----------+
           |               |       |  |      |              |
   +-------v------+ +-----v------++ +v------v-----+ +------v-------+
   | Admin API    | | Client API  | | Auth Service | | Admin Panel  |
   | :3001        | | :3002       | | :3003        | | :3010        |
   | JWT Auth     | | API Key     | | JWT / TOTP   | | Next.js 14   |
   | Admin CRUD   | | Auth        | | API Keys     | +------+-------+
   | Clients,     | | Wallets,    | | RBAC         |        |
   | Tiers,       | | Deposits,   | | Login lockout| +------v-------+
   | Chains,      | | Withdrawals,| +-----+--------+ | Client Portal|
   | Tokens,      | | Addresses,  |       |          | :3011        |
   | Compliance,  | | Webhooks,   |       |          | Next.js 14   |
   | Monitoring   | | Co-Sign     |       |          | Setup Wizard |
   +------+-------+ +------+------+       |          +--------------+
          |                 |              |
          +--------+--------+--------------+
                   |
           +-------v--------+
           |  Core Wallet   |                        internal-net
           |  Service :3004 |
           |  Wallets       |
           |  Deposits      |
           |  Withdrawals   |
           |  Compliance    |
           |  Balance Query |
           +--+---+---+--+-+
              |   |   |  |
        +-----+   |   |  +-------+
        |         |   |          |
   +----v--+ +---v---++ +-------v----+ +-----------+
   |Key    | |Chain   | |Notification| |Cron/Worker|
   |Vault  | |Indexer | |Service     | |Service    |
   |:3005  | |:3006   | |:3007       | |:3008      |
   |       | |        | |            | |           |
   |HD Key | |WS+Poll | |Webhooks    | |ERC-20     |
   |Gen    | |Deposit | |HMAC-SHA256 | |Sweeps     |
   |Sign   | |Detect  | |Email       | |Gas Tank   |
   |Shamir | |Confirm | |Retry/DLQ   | |Fwd Deploy |
   |Encrypt| |Track   | |            | |OFAC Sync  |
   |       | |Reorg   | |            | |           |
   |vault- | |Protect | |            | |           |
   |net    | |        | |            | |           |
   |ONLY   | |        | |            | |           |
   +-------+ +--------+ +------------+ +-----------+
```

## Docker Network Layout

Four isolated Docker networks enforce strict security boundaries:

```
+-----------------------------------------------------------------------+
|  public-net (bridge)                                                   |
|  External-facing services                                              |
|  [Kong :8000/:8443] [Admin Panel :3010] [Client Portal :3011]         |
|  [Admin API :3001]  [Client API :3002]                                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  internal-net (bridge, internal: true)                                 |
|  No external access -- inter-service communication only                |
|  [Admin API :3001] [Client API :3002] [Auth Service :3003]            |
|  [Core Wallet :3004] [Chain Indexer :3006] [Notification :3007]       |
|  [Cron Worker :3008] [Redis :6379] [Kong]                             |
|  [PostHog Web] [Loki] [Jaeger] [Prometheus]                           |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  vault-net (bridge, internal: true)                                    |
|  ZERO internet access -- shared secret + network isolation             |
|  [Core Wallet Service] <--INTERNAL_SERVICE_KEY--> [Key Vault :3005]   |
|  Only Core Wallet Service bridges internal-net and vault-net           |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  monitoring-net (bridge)                                               |
|  Observability stack                                                   |
|  [Prometheus :9090] [Grafana :3000] [Loki :3100] [Jaeger :16686]     |
|  [PostHog Web :8010] [PostHog Worker] [ClickHouse] [Kafka]           |
|  [Zookeeper] [PostHog Redis] [PostHog Postgres]                       |
+-----------------------------------------------------------------------+
```

### Key Security Properties

1. **Key Vault has ZERO internet access**: `vault-net` is an internal Docker bridge network. The Key Vault container has no route to the internet, no route to Redis, no route to any service other than Core Wallet.
2. **internal-net is internal**: Marked `internal: true` in docker-compose, meaning no external access is possible. All NestJS service-to-service communication happens here.
3. **Core Wallet is the sole bridge**: Only the Core Wallet Service exists on both `internal-net` and `vault-net`, serving as the single gateway to key material.
4. **Monitoring is separated**: Observability stack runs on its own network, with select bridges to `internal-net` for metric scraping and log collection.

### Verification

To verify Key Vault network isolation from inside the container:

```bash
docker exec key-vault-service ping -c 1 google.com          # Should FAIL
docker exec key-vault-service ping -c 1 admin-api           # Should FAIL
docker exec key-vault-service ping -c 1 redis               # Should FAIL
docker exec key-vault-service ping -c 1 core-wallet-service # Should SUCCEED
```

## Inter-Service Communication

| From | To | Protocol | Network | Purpose |
|------|----|----------|---------|---------|
| Kong | Admin API, Client API, Auth Service | HTTP/REST | public-net -> internal-net | Request routing with rate limiting |
| Admin API / Client API | Auth Service | HTTP/REST | internal-net | Token validation, API key validation |
| Admin API / Client API | Core Wallet Service | HTTP/REST | internal-net | Synchronous wallet and transaction operations |
| Core Wallet Service | Key Vault Service | HTTP/REST via InternalServiceGuard | vault-net | Key generation, signing, Shamir operations |
| Core Wallet Service | Chain Indexer Service | Redis Streams | internal-net | Deposit notifications, address monitoring |
| Core Wallet Service | Notification Service | BullMQ (Redis) | internal-net | Queue webhook deliveries and emails |
| Cron Worker Service | Core Wallet Service | HTTP/REST | internal-net | Execute sweeps, gas top-ups, forwarder deployments |
| Cron Worker Service | Blockchain | JSON-RPC (ethers.js) | external | Contract calls for sweeps and deployments |
| Chain Indexer Service | Blockchain | JSON-RPC + WebSocket | external | Block scanning, Transfer event detection |
| All Services | PostHog | HTTP | internal-net | Business event tracking via NestJS interceptor |
| All Services | Loki | HTTP | internal-net | Structured JSON log shipping |
| All Services | Jaeger | OTLP (port 4318) | internal-net | Distributed trace export |
| All Services | Prometheus | HTTP (scrape) | monitoring-net -> internal-net | Metric collection (15s interval) |

### Inter-Service Authentication

Communication between Core Wallet Service and Key Vault Service (and other internal services such as Notification Service) is authenticated using a shared secret (`INTERNAL_SERVICE_KEY`):

1. The calling service includes the secret in the `X-Internal-Service-Key` HTTP header.
2. The receiving service validates the header using `InternalServiceGuard`, which performs a timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks.
3. If the key is missing, has a different length, or does not match, the request is rejected with `401 Unauthorized`.
4. Docker network isolation (`vault-net`) ensures only the Core Wallet Service can reach the Key Vault.

Implementation: `services/key-vault-service/src/common/guards/internal-service.guard.ts` (identical copies in core-wallet-service and notification-service).

## Data Flow: Deposit

```
User sends ETH/tokens to forwarder address (0xDeterministic...)
          |
          v
[1] Chain Indexer Service (RealtimeDetectorService)
    - Subscribes to new blocks via WebSocket (newHeads) per chain
    - On each new block: scans for ERC-20 Transfer events to monitored addresses
    - Also detects native ETH transfers via transaction receipts
    - Fallback: polling-based block scanning if WebSocket is unavailable
    - Publishes DetectedDeposit to Redis Stream:
      { chainId, txHash, blockNumber, fromAddress, toAddress,
        contractAddress, amount, clientId, walletId }
          |
          v
[2] Core Wallet Service
    - Consumes deposit events from Redis Stream
    - Records deposit in cvh_transactions.deposits
    - Starts confirmation tracking via BullMQ delayed job
    - If KYT enabled: triggers compliance screening on source address
      (OFAC SDN, EU, UN, UK OFSI via ComplianceService)
          |
          v
[3] Confirmation Tracking (ConfirmationTrackerService, BullMQ)
    - Worker processes confirmation jobs
    - Checks current block vs. deposit block
    - Verifies tx receipt still exists at each check (reorg protection)
    - Publishes webhook events at milestones: [1, 3, 6, 12] confirmations
    - Status progression: deposit.pending -> deposit.confirming -> deposit.confirmed
    - If receipt disappears: marks deposit as reorged
          |
          v
[4] Auto-Sweep
    - If ETH: already auto-forwarded by CvhForwarder.receive() -> flush()
    - If ERC-20: token sits in forwarder, awaiting sweep
          |
          v
[5] Cron Worker Service (Sweep cycle)
    - Queries forwarders with pending ERC-20 balances
    - Gas Tank (feeAddress) calls flushTokens() or batchFlushERC20Tokens()
    - If forwarder not yet deployed: deploys via CvhForwarderFactory.createForwarder()
    - Token transferred from forwarder to hot wallet (CvhWalletSimple)
          |
          v
[6] Notification Service
    - BullMQ job triggers webhook delivery
    - Signs payload with HMAC-SHA256 using per-endpoint secret
    - Sends POST to client's webhook URL with X-CVH-Signature header
    - On failure: exponential backoff retry with jitter
    - Persistent failures: routed to Dead Letter Queue (DLQ)
    - Delivery logged in cvh_notifications.webhook_deliveries
```

## Data Flow: Withdrawal

```
Client submits withdrawal via POST /client/v1/withdrawals
          |
          v
[1] Client API
    - Validates API key (scope: withdraw) via Auth Service
    - Validates request DTO (class-validator)
    - Forwards to Core Wallet Service
          |
          v
[2] Core Wallet Service - Validation
    - Checks destination is in whitelisted_addresses (past 24h cooldown)
    - Checks idempotency key (prevents duplicate withdrawals)
    - Verifies wallet balance >= withdrawal amount (via Multicall3 or RPC)
    - Creates withdrawal record (status: pending_kyt)
          |
          v
[3] KYT Screening (if enabled)
    - ComplianceService screens destination address
    - Checks against OFAC SDN + Consolidated, EU, UN, UK OFSI lists
    - CLEAR -> proceed (status: pending_signing)
    - HIT -> block + create compliance alert (status: blocked)
    - POSSIBLE_MATCH -> route to review queue (status: pending_review)
          |
          v
[4] Signing (via Key Vault Service over vault-net)
    - Core Wallet constructs operationHash:
      keccak256(networkId, toAddress, value, data, expireTime, sequenceId)
    - Sends hash to Key Vault via POST /keys/:clientId/sign
    - Key Vault decrypts platformKey, signs hash, returns signature
    - Full custody: Key Vault also signs with clientKey (signer 2)
    - Co-sign: returns status pending_co_sign; waits for client
      to submit their signature via POST /client/v1/co-sign/:id/sign
          |
          v
[5] On-Chain Submission
    - Core Wallet calls CvhWalletSimple.sendMultiSig() or sendMultiSigToken()
    - Transaction broadcasted to chain via RPC
    - Status: broadcasted
          |
          v
[6] Confirmation Tracking
    - Same BullMQ mechanism as deposits
    - Verifies receipt at milestone confirmations
    - Status: withdrawal.broadcasted -> withdrawal.confirming -> withdrawal.confirmed
    - Reorg protection: verifies receipt still exists at each check
          |
          v
[7] Notification Service
    - Sends withdrawal.confirmed webhook to client endpoint
    - HMAC-SHA256 signed payload
    - Updates final status in cvh_transactions.withdrawals
```

## Database Design

CryptoVaultHub uses 8 MySQL databases for strict domain separation. Each service accesses only its relevant database(s) via Prisma ORM with its own schema.

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

- `cvh_admin.clients` is the central entity -- referenced by wallets, transactions, API keys, compliance records, and webhooks across all databases.
- `cvh_auth.api_keys.client_id` links API keys to clients for scope-based authorization.
- `cvh_wallets.wallets` holds one hot wallet per client per chain, containing the on-chain wallet address and contract references.
- `cvh_wallets.deposit_addresses` tracks forwarder deployment status via an `is_deployed` flag -- addresses are first computed (free, no gas) and deployed on demand.
- `cvh_transactions.deposits` links to the forwarder deposit address that received the deposit, including chain ID, block number, confirmation count.
- `cvh_keyvault` is accessed ONLY by the Key Vault Service -- no cross-database joins are permitted. Contains encrypted private keys, Shamir shares, and an append-only audit log.
- `cvh_indexer.sync_cursors` tracks the last processed block number per chain, enabling resumable block scanning after restarts.

### Character Set

All databases use `utf8mb4` with `utf8mb4_unicode_ci` collation for full Unicode support.

### Migration Scripts

12 SQL migration scripts in `database/` create the schema in order. The `database/migrate.sh` script runs them sequentially. Additional scripts provide seed data (`009`), performance indexes (`010`), traceability views (`011`), and schema corrections (`012`).

## Monorepo Structure

The project uses Turborepo for build orchestration with npm workspaces:

```
Workspaces:
  contracts        -> Hardhat project (Solidity 0.8.27)
  packages/*       -> Shared libraries
                      - api-client: Type-safe API client SDK with TanStack Query hooks
                      - config: Shared configuration
                      - posthog: PostHog client wrapper (@cvh/posthog)
                      - types: Shared TypeScript types (@cvh/types)
                      - utils: Formatters, helpers (@cvh/utils)
  services/*       -> NestJS microservices (8 services)
  apps/*           -> Next.js 14 applications (2 frontends)

Build Pipeline (turbo.json):
  build   -> depends on ^build (topological order), outputs dist/ and .next/
  dev     -> no cache, persistent (watch mode)
  lint    -> depends on ^build
  test    -> depends on ^build, outputs coverage/
  clean   -> no cache
```

## Client Onboarding Flow

The Client Portal includes a 7-step interactive setup wizard (`apps/client/app/setup/page.tsx`) that guides new clients through their entire onboarding:

```
Step 1: Chain Selection
  +-> Client selects which EVM chains to activate
  |   (Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Base)
  |
Step 2: Wallet Creation
  +-> System generates HD keys (via Key Vault)
  |   Displays wallet addresses, creation JSON artifact
  |   Shows private key reveal component (one-time view)
  |
Step 3: First Deposit
  +-> Generates first deposit address (CREATE2 forwarder)
  |   Displays QR code for deposit address
  |   Simulates/demonstrates deposit flow
  |
Step 4: Withdrawal Configuration
  +-> Configures address whitelist
  |   Explains 24-hour cooldown
  |   Sets up withdrawal limits
  |
Step 5: Smart Contract Deployment
  +-> Deploys CvhWalletFactory, CvhForwarderFactory
  |   Shows live deployment pipeline:
  |   Pending -> Deploying -> Confirming (X/12) -> Confirmed
  |   Displays contract addresses with explorer links
  |
Step 6: Test Transaction
  +-> Live balance monitoring with heartbeat indicator
  |   Test deposit verification
  |   Confirmation tracking display
  |
Step 7: Complete
  +-> Summary of all configured resources
  +-> Links to dashboard, webhooks, API keys
```

The wizard features blockchain-themed visual components: hexagonal step indicators connected by chain links, live contract deployment status with hexagonal spinners, QR code display, JSON artifact viewers with syntax highlighting and copy/download, private key reveal with one-time view warning, and live balance display with digit slide animation.

## Visual Identity System

CryptoVaultHub implements a comprehensive visual identity documented in `docs/identity/cryptovaulthub-visual-identity.md`. The design system is not an afterthought -- it is a core part of the product's identity.

### Core Design Decisions

- **Single accent color**: Vault Gold (#E2A828) against neutral scales. No rainbow category colors.
- **Dual-font system**: Outfit (display, geometric) for interface text; JetBrains Mono (monospace) for blockchain data. The font switch signals "this is data from the chain" vs. "this is the interface speaking."
- **Dark-first**: Dark mode is the default. Depth via surface layers (4 levels: page, card, elevated, hover), not shadows.
- **Data-driven richness**: Visual richness comes from live data (balances updating, confirmations counting, statuses transitioning) -- not decorative illustrations.

### Design Token Categories

- **Surfaces**: page, sidebar, card, elevated, hover, input (separate values for dark/light mode)
- **Text**: primary, secondary, muted (separate values for dark/light mode)
- **Accent**: primary (#E2A828), hover, subtle, glow, text
- **Status**: success (green), error (red), warning (amber) -- only for functional feedback
- **Borders**: default, strong, accent
- **Radius**: card (8px), button (8px), input (6px), badge (6px), modal (12px)
- **Typography**: heading (20px), stat (28px), body (13px), code (12px), display (32px)

All values are defined as semantic Tailwind CSS tokens in `tailwind.config`. No hardcoded values in components.

## External Dependencies

| Dependency | Purpose | Notes |
|-----------|---------|-------|
| MySQL 8+ | Primary database | External cluster, not in docker-compose |
| Tatum.io / GetBlock.io | RPC node providers | Primary blockchain access, requires API key |
| OFAC / EU / UN / UK OFSI | Sanctions lists | Daily XML sync via Cron Worker Service |

## Scalability Considerations

- **Stateless Services**: All NestJS services are stateless; scale horizontally behind Kong. No in-memory session state.
- **Redis as Backbone**: BullMQ queues and Redis Streams decouple producers from consumers. Redis handles rate limiting state, job queues, and inter-service messaging.
- **Multicall3 Batching**: Single RPC call queries 500+ balances, dramatically reducing RPC costs for balance monitoring.
- **EIP-1167 Proxies**: Forwarder deployment costs approximately 45,000 gas (vs. 2M+ for full contract deployment). All forwarders share one implementation contract.
- **Lazy Deployment**: Forwarder addresses are computed (free) via `computeForwarderAddress(deployer, parent, feeAddress, salt)` using CREATE2 and deployed only when needed for ERC-20 flushing. ETH can be received at the address before the contract exists.
- **Per-Service Databases**: 8 separate MySQL databases prevent cross-service coupling and enable independent scaling. Each service uses its own Prisma schema.
- **API Client SDK**: The `@cvh/api-client` package with TanStack Query hooks provides type-safe API access with automatic caching, deduplication, and background refetching for both frontend applications.
