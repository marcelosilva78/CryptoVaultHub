# Architecture

## Service Topology

CryptoVaultHub is composed of 8 backend microservices, 3 frontend applications, and supporting infrastructure.

```
                     Internet / Clients
                          |
                 +--------v---------+
                 |  Load Balancer   |
                 +--------+---------+
                          |
              +-----------v-----------+
              |   Kong API Gateway    |        public-net
              |   Port 8000 / 8443   |
              |   Rate Limiting       |
              |   CORS / Auth Routing |
              +---+-----+-----+------+
                  |     |     |
       +----------+  +--+--+ +----------+
       |             |     |             |
+------v------+ +----v-----v---+ +------v------+
| Admin API   | | Client API   | | Auth Service|    internal-net
| :3001       | | :3002        | | :3003       |
| JWT Auth    | | API Key Auth | | JWT/TOTP/   |
| Admin CRUD  | | Client Ops   | | API Keys    |
+------+------+ +------+-------+ +-------------+
       |                |
       +-------+--------+
               |
       +-------v--------+
       |  Core Wallet   |                       internal-net
       |  Service :3004 |
       |  Wallets       |
       |  Deposits      |
       |  Withdrawals   |
       |  Compliance    |
       +--+---+---+---+-+
          |   |   |   |
    +-----+   |   |   +------+
    |         |   |          |
+---v---+ +---v---+  +------v-----+ +----------+
|Key    | |Chain  |  |Notification| |Cron/     |
|Vault  | |Indexer|  |Service     | |Worker    |
|:3005  | |:3006  |  |:3007       | |:3008     |
|vault- | |Block  |  |Webhooks    | |Sweeps    |
|net    | |Scan   |  |Email       | |Gas Mgmt  |
|mTLS   | |Detect |  |Retry/DLQ   | |OFAC Sync |
+-------+ +-------+  +------------+ +----------+

Frontend Applications (public-net):
+-------------+ +---------------+ +--------------+
| Admin Panel | | Client Portal | | BI Dashboard |
| :3010       | | :3011         | | :3012        |
| Next.js 14  | | Next.js 14    | | Next.js 14   |
+-------------+ +---------------+ +--------------+
```

## Docker Network Layout

Four isolated Docker networks enforce security boundaries:

```
+-----------------------------------------------------------------------+
|  public-net (bridge)                                                   |
|  External-facing services                                              |
|  [Kong :8000/:8443] [Admin Panel :3010] [Client Portal :3011]         |
|  [BI Dashboard :3012] [Grafana :3000]                                  |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  internal-net (bridge, internal: true)                                 |
|  No external access - inter-service communication only                 |
|  [Admin API :3001] [Client API :3002] [Auth Service :3003]            |
|  [Core Wallet :3004] [Chain Indexer :3006] [Notification :3007]       |
|  [Cron Worker :3008] [Redis :6379] [Kong] [PostHog Web] [Loki]       |
|  [Jaeger] [Prometheus]                                                 |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  vault-net (bridge, internal: true)                                    |
|  ZERO internet access - mTLS only                                      |
|  [Core Wallet Service] <--mTLS--> [Key Vault Service :3005]           |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  monitoring-net (bridge)                                               |
|  Observability stack                                                   |
|  [Prometheus :9090] [Grafana :3000] [Loki :3100] [Jaeger :16686]     |
|  [PostHog Web :8010] [PostHog Worker] [ClickHouse] [Kafka]           |
|  [Zookeeper] [PostHog Redis] [PostHog Postgres]                       |
+-----------------------------------------------------------------------+
```

The Key Vault Service exists ONLY on `vault-net`. It has zero connectivity to the internet, internal services, or monitoring. Only the Core Wallet Service bridges both `internal-net` and `vault-net`.

## Inter-Service Communication

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| Kong | Admin API, Client API, Auth Service | HTTP/REST | Request routing with rate limiting |
| Admin API / Client API | Core Wallet Service | HTTP/REST (internal-net) | Synchronous wallet operations |
| Core Wallet Service | Key Vault Service | HTTP/REST via mTLS (vault-net) | Key generation, signing |
| Core Wallet Service | Chain Indexer Service | Redis Streams | Deposit notifications, address monitoring |
| Core Wallet Service | Notification Service | BullMQ (Redis) | Queue webhook deliveries and emails |
| Cron Worker Service | Core Wallet Service | HTTP/REST (internal-net) | Execute sweeps, gas top-ups |
| All Services | PostHog | HTTP (internal-net) | Business event tracking |
| All Services | Loki | HTTP (internal-net) | Structured JSON log shipping |

## Data Flow: Deposit

```
User sends ETH/tokens to forwarder address
          |
          v
[1] Chain Indexer Service
    - Scans new blocks via WebSocket (newHeads) or polling
    - Detects Transfer events to monitored forwarder addresses
    - Publishes deposit event to Redis Stream
          |
          v
[2] Core Wallet Service
    - Receives deposit notification from Redis Stream
    - Records deposit in cvh_transactions database
    - Starts confirmation tracking (BullMQ delayed job)
    - Triggers KYT screening on source address (if enabled)
          |
          v
[3] Confirmation Tracking
    - BullMQ job checks confirmations block by block
    - Verifies tx receipt still exists (reorg protection)
    - Sends webhook at milestones: [1, 3, 6, 12] confirmations
    - Events: deposit.pending -> deposit.confirming -> deposit.confirmed
          |
          v
[4] If ETH: Already auto-forwarded by Forwarder receive()
    If ERC-20: Token sits in forwarder, awaiting sweep
          |
          v
[5] Cron Worker Service (sweep cycle, every N minutes)
    - Queries forwarders with pending ERC-20 balances
    - Gas Tank (feeAddress) calls flushTokens() or batchFlushERC20Tokens()
    - Token transferred from forwarder to hot wallet (CvhWalletSimple)
          |
          v
[6] Notification Service
    - Sends deposit.swept webhook to client endpoint
    - HMAC-SHA256 signature on payload
    - Exponential backoff retry on failure (up to DLQ)
```

## Data Flow: Withdrawal

```
Client submits withdrawal via POST /client/v1/withdrawals
          |
          v
[1] Client API
    - Validates request (whitelisted address, past cooldown, sufficient balance)
    - Creates withdrawal record (status: pending_kyt)
    - Forwards to Core Wallet Service
          |
          v
[2] KYT Screening (if enabled)
    - Core Wallet Service screens destination address
    - Checks against OFAC SDN, EU, UN, UK OFSI lists
    - CLEAR -> proceed | HIT -> block + alert | POSSIBLE_MATCH -> review queue
          |
          v
[3] Signing (via Key Vault Service over mTLS)
    - Core Wallet constructs operationHash
    - Key Vault signs with platformKey (signer 1)
    - For co-sign mode: waits for client signature via /co-sign/:id/sign
    - For full-custody: Key Vault also signs with clientKey (signer 2)
          |
          v
[4] On-Chain Submission
    - Core Wallet calls CvhWalletSimple.sendMultiSig() or sendMultiSigToken()
    - Transaction broadcasted to chain via RPC
    - Status: broadcasted
          |
          v
[5] Confirmation Tracking
    - Same BullMQ mechanism as deposits
    - Events: withdrawal.broadcasted -> withdrawal.confirming -> withdrawal.confirmed
    - Reorg protection: verifies receipt at each check
          |
          v
[6] Notification Service
    - Sends withdrawal.confirmed webhook
    - Updates final status in database
```

## Database Design

CryptoVaultHub uses 8 MySQL databases for domain separation:

```
+------------------+     +------------------+     +------------------+
|   cvh_auth       |     |   cvh_admin      |     |   cvh_keyvault   |
|                  |     |                  |     |                  |
| - users          |     | - clients        |     | - master_seeds   |
| - sessions       |     | - tiers          |     | - derived_keys   |
| - api_keys       |     | - tier_limits    |     | - shamir_shares  |
|                  |     | - chains         |     | - key_vault_audit|
|                  |     | - audit_logs     |     |                  |
+------------------+     +------------------+     +------------------+

+------------------+     +------------------+     +------------------+
|   cvh_wallets    |     | cvh_transactions |     | cvh_compliance   |
|                  |     |                  |     |                  |
| - wallets        |     | - transactions   |     | - sanctions_lists|
| - addresses      |     | - withdrawal_    |     | - screening_     |
| - labels         |     |   requests       |     |   results        |
| - balances       |     | - deposits       |     | - alerts         |
| - tokens         |     |                  |     |                  |
| - forwarder_     |     |                  |     |                  |
|   contracts      |     |                  |     |                  |
+------------------+     +------------------+     +------------------+

+------------------+     +------------------+
| cvh_notifications|     |   cvh_indexer    |
|                  |     |                  |
| - webhooks       |     | - sync_cursors   |
| - webhook_       |     | - indexed_blocks |
|   deliveries     |     | - chain_configs  |
| - email_logs     |     |                  |
+------------------+     +------------------+
```

### Key Relationships

- `cvh_admin.clients` is the central entity -- referenced by wallets, transactions, API keys, etc.
- `cvh_auth.api_keys.client_id` links API keys to clients
- `cvh_wallets.wallets` holds one hot wallet per client per chain
- `cvh_wallets.forwarder_contracts` tracks forwarder deployment status (computed vs deployed)
- `cvh_transactions.deposits` links to the forwarder address that received the deposit
- `cvh_keyvault` is accessed ONLY by Key Vault Service -- no cross-database joins

### Character Set

All databases use `utf8mb4` with `utf8mb4_unicode_ci` collation for full Unicode support.

## Monorepo Structure

The project uses Turborepo for build orchestration with npm workspaces:

```
Workspaces:
  contracts        -> Hardhat project (Solidity)
  packages/*       -> Shared libraries (types, utils, config, posthog)
  services/*       -> NestJS microservices (8 services)
  apps/*           -> Next.js applications (3 frontends)

Build Pipeline (turbo.json):
  build   -> depends on ^build (topological order), outputs dist/ and .next/
  dev     -> no cache, persistent (watch mode)
  lint    -> depends on ^build
  test    -> depends on ^build, outputs coverage/
  clean   -> no cache
```

## External Dependencies

| Dependency | Purpose | Notes |
|-----------|---------|-------|
| MySQL 8+ | Primary database | External cluster, not in docker-compose |
| Tatum.io / GetBlock.io | RPC node providers | Primary blockchain access |
| OFAC / EU / UN / UK | Sanctions lists | Daily XML sync via Cron Worker |

## Scalability Considerations

- **Stateless Services**: All NestJS services are stateless; scale horizontally behind Kong
- **Redis as Backbone**: BullMQ queues and Redis Streams decouple producers from consumers
- **Multicall3 Batching**: Single RPC call queries 500+ balances, reducing RPC costs
- **EIP-1167 Proxies**: Forwarder deployment costs approximately 45,000 gas (vs. full contract deployment)
- **Lazy Deployment**: Forwarder addresses are computed (free) and deployed only when needed for ERC-20 flushing
