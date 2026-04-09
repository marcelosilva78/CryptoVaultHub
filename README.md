# CryptoVaultHub

Enterprise-grade, self-hosted EVM cryptocurrency wallet management platform for exchanges, payment gateways, and custody providers.

## Features

- **Multi-Chain EVM Support**: Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Base
- **Smart Contract Wallets**: 2-of-3 multisig adapted from BitGo eth-multisig-v4
- **Deposit Address Generation**: CREATE2 deterministic addresses with lazy deployment via EIP-1167 minimal proxies
- **Auto-Sweep**: Automatic ETH forwarding and scheduled ERC-20 token consolidation from forwarders to hot wallet
- **KYT/Compliance**: OFAC SDN, EU, UN, UK OFSI sanctions screening with configurable levels (off, basic, full)
- **Multi-Tenant**: B2B platform with configurable tiers and per-endpoint rate limits
- **Full Observability**: PostHog business events, Prometheus + Grafana metrics, Loki logs, Jaeger distributed traces
- **3 Custody Modes**: Full custody, co-sign, and client-initiated signing
- **Envelope Encryption**: AES-256-GCM with PBKDF2-derived KEK for all private keys
- **Shamir's Secret Sharing**: 3-of-5 threshold backup key recovery

## Architecture

```
                          +-----------------------+
                          |   Load Balancer        |
                          +----------+------------+
                                     |
                          +----------v------------+
                          |   API Gateway (Kong)   |
                          |  Rate Limiting / Auth   |
                          +--+----+----+----+-----+
                             |    |    |    |
              +--------------+    |    |    +--------------+
              |                   |    |                   |
     +--------v--------+ +-------v----v-------+  +--------v--------+
     |  Admin API       | |  Client API        |  |  Auth Service    |
     |  (NestJS)        | |  (NestJS)          |  |  (NestJS)        |
     |  Port 3001       | |  Port 3002         |  |  Port 3003       |
     +-------+----------+ +-------+------------+  +-----------------+
             |                    |
     +-------v--------------------v---------------+
     |         Core Wallet Service                 |
     |         (NestJS) Port 3004                  |
     +--+-----------+------------+----------------+
        |           |            |
  +-----v-----+ +--v---------+ +v--------------+  +--------------+
  |Key Vault   | |Chain       | |Notification   |  |Cron/Worker   |
  |Service     | |Indexer     | |Service        |  |Service       |
  |Port 3005   | |Service     | |Port 3007      |  |Port 3008     |
  |(vault-net) | |Port 3006   | +---------------+  +--------------+
  +------------+ +------------+

  +-------------+  +---------------+  +--------------+
  |Admin Panel  |  |Client Portal  |  |BI Dashboard  |
  |Port 3010    |  |Port 3011      |  |Port 3012     |
  +-------------+  +---------------+  +--------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS (TypeScript) |
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui, Recharts |
| Database | MySQL 8+ (external cluster, 8 databases) |
| Cache/Queue | Redis 7, BullMQ |
| Blockchain | ethers.js v6, Hardhat, Solidity 0.8.27 |
| Smart Contracts | Adapted from BitGo eth-multisig-v4 (EIP-1167 proxies, CREATE2) |
| API Gateway | Kong 3.6 (declarative mode) |
| Observability | PostHog (self-hosted), Prometheus, Grafana, Loki, Jaeger |
| Infrastructure | Docker, docker-compose, Turborepo |

## Project Structure

```
CryptoVaultHub/
+-- contracts/                  # Solidity smart contracts (Hardhat)
|   +-- contracts/              # CvhWalletSimple, CvhForwarder, Factories, Batcher
|   +-- scripts/                # Deployment scripts
|   +-- test/                   # Contract tests
+-- packages/                   # Shared packages
|   +-- config/                 # Shared configuration
|   +-- posthog/                # PostHog client wrapper (@cvh/posthog)
|   +-- types/                  # Shared TypeScript types
|   +-- utils/                  # Formatters, helpers
+-- services/                   # NestJS microservices
|   +-- admin-api/              # Administrative API (JWT auth)
|   +-- client-api/             # Client integration API (API key auth)
|   +-- auth-service/           # JWT, API keys, RBAC, 2FA (TOTP)
|   +-- core-wallet-service/    # Wallet lifecycle, deposits, withdrawals
|   +-- key-vault-service/      # HD keygen, signing, encryption (air-gapped)
|   +-- chain-indexer-service/  # Block scanning, deposit detection
|   +-- notification-service/   # Webhooks, email delivery
|   +-- cron-worker-service/    # Sweeps, gas management, OFAC sync
+-- apps/                       # Next.js frontend applications
|   +-- admin/                  # Admin Panel (port 3010)
|   +-- client/                 # Client Portal (port 3011)
|   +-- bi-dashboard/           # BI Dashboard (port 3012)
+-- database/                   # SQL migration scripts
|   +-- 000-create-databases.sql
|   +-- 001-cvh-auth.sql
+-- infra/                      # Infrastructure configuration
|   +-- docker/                 # Dockerfiles (NestJS, Next.js)
|   +-- kong/                   # Kong declarative config (kong.yml)
|   +-- prometheus/             # Prometheus scrape config
|   +-- grafana/                # Grafana provisioning
+-- docker-compose.yml          # All services orchestration
+-- turbo.json                  # Turborepo pipeline config
+-- package.json                # Root workspace config
```

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker & docker-compose
- MySQL 8+ cluster (external)
- Redis (provided via Docker)

### Setup

```bash
# 1. Clone the repo
git clone <repo-url> && cd CryptoVaultHub

# 2. Copy environment config
cp .env.example .env
# Edit .env with your MySQL credentials, RPC endpoints, and secrets

# 3. Run database migrations
mysql -u root -p < database/000-create-databases.sql
mysql -u root -p < database/001-cvh-auth.sql

# 4. Install dependencies
npm install

# 5. Build all packages
npx turbo build

# 6. Start infrastructure (Redis, Kong, monitoring, PostHog)
docker compose up -d

# 7. Start all services in development mode
npx turbo dev
```

### Smart Contract Deployment

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.ts --network <chain>
```

The deploy script deploys all 5 contracts in order:
1. `CvhWalletSimple` (implementation)
2. `CvhForwarder` (implementation)
3. `CvhWalletFactory` (references wallet implementation)
4. `CvhForwarderFactory` (references forwarder implementation)
5. `CvhBatcher`

## Services

| Service | Port | Description |
|---------|------|-------------|
| Admin API | 3001 | Administrative API for platform management (JWT auth) |
| Client API | 3002 | Client integration API for exchanges/gateways (API key auth) |
| Auth Service | 3003 | JWT sessions, API key management, RBAC, TOTP 2FA |
| Core Wallet | 3004 | Wallet lifecycle, deposit addresses, withdrawals, compliance |
| Key Vault | 3005 | HD key generation, signing, envelope encryption (air-gapped) |
| Chain Indexer | 3006 | Block scanning, deposit detection, token registry |
| Notifications | 3007 | Webhook delivery with HMAC-SHA256, email, retry/DLQ |
| Cron Worker | 3008 | Scheduled sweeps, gas management, OFAC list sync |

## Frontend Apps

| App | Port | Description |
|-----|------|-------------|
| Admin Panel | 3010 | Internal administration (clients, chains, tokens, tiers, compliance, monitoring) |
| Client Portal | 3011 | Client self-service (wallets, deposits, withdrawals, webhooks, API keys) |
| BI Dashboard | 3012 | Business intelligence (volume analytics, revenue, operations, compliance) |

## API Overview

### Admin API (`/admin/`)

- **Clients**: CRUD client organizations, generate keys, manage custody mode
- **Tiers**: Create/update/clone rate-limit and resource tiers
- **Chains**: Add/list supported EVM chains
- **Tokens**: Add/list ERC-20 tokens in the global registry
- **Compliance**: List/update KYT alerts, manage sanctions screening
- **Monitoring**: Service health, queue status, gas tank balances

### Client API (`/client/v1/`)

- **Wallets**: List hot wallets, get balances per chain
- **Deposit Addresses**: Generate single or batch (up to 100) CREATE2 addresses
- **Deposits**: List with filters (status, chain, date range), get by ID
- **Withdrawals**: Create (to whitelisted address), list, get by ID
- **Address Book**: Whitelist management with 24h cooldown
- **Webhooks**: CRUD, test delivery, view delivery log, retry failed
- **Co-Sign**: List pending operations, submit signatures (for co-sign custody mode)
- **Health**: Service health check, token listing

### Auth Service (`/auth/`)

- **Sessions**: Login (with optional TOTP), refresh, logout
- **2FA**: Setup, verify, disable TOTP
- **API Keys**: Create (with scopes and IP allowlist), list, revoke, validate

Full API documentation: [docs/api/](docs/api/)

## Security

| Layer | Mechanism |
|-------|-----------|
| Key Storage | AES-256-GCM envelope encryption, PBKDF2-derived KEK (100k iterations, SHA-512) |
| Key Isolation | Air-gapped Docker network (`vault-net`), mTLS communication only |
| Transaction Auth | 2-of-3 on-chain multisig with replay protection (sequence ID window) |
| API Auth | API keys (SHA-256 hashed, scoped: read/write/withdraw) + JWT for web sessions |
| Rate Limiting | Multi-level via Kong: global, per-tenant, per-endpoint |
| KYT/AML | OFAC SDN + Consolidated, EU, UN, UK OFSI sanctions screening |
| Backup/Recovery | Shamir's Secret Sharing (3-of-5 threshold) for backup keys |
| Audit Trail | PostHog captures every API request, webhook delivery, and blockchain event |
| Network | Kong gateway with IP allowlisting, CORS, request size limiting |
| 2FA | TOTP-based, mandatory for admin users, configurable for clients |

## Docker Networks

| Network | Purpose | Services |
|---------|---------|----------|
| `public-net` | External access | Kong, Admin Panel, Client Portal, BI Dashboard |
| `internal-net` | Inter-service communication | All NestJS services, Redis |
| `vault-net` | Isolated key management | Core Wallet <-> Key Vault only (mTLS) |
| `monitoring-net` | Observability stack | PostHog, Prometheus, Grafana, Loki, Jaeger |

## Documentation

- [API Documentation](docs/api/) -- Admin API and Client API endpoint reference
- [Architecture](docs/architecture.md) -- Service topology, data flows, database design
- [Deployment Guide](docs/deployment.md) -- Full setup, environment variables, infrastructure
- [Security](docs/security.md) -- Key management, encryption, custody modes, network isolation
- [Smart Contracts](docs/smart-contracts.md) -- Contract interfaces, CREATE2, forwarder lifecycle

## License

Proprietary -- All rights reserved.
