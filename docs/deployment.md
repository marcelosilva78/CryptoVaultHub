# Deployment Guide

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | >= 20.0.0 | Required for all services and build tools |
| npm | >= 10 | Included with Node.js 20 |
| Docker | >= 24 | For containerized infrastructure |
| docker-compose | >= 2.20 | For orchestration |
| MySQL | 8.0+ | External cluster (not in docker-compose) |
| Git | >= 2.30 | For cloning the repository |

## 1. Clone and Install

```bash
git clone <repo-url> CryptoVaultHub
cd CryptoVaultHub
npm install
```

## 2. Environment Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

### Environment Variables Reference

#### MySQL

| Variable | Description | Example |
|----------|-------------|---------|
| `MYSQL_HOST` | MySQL server hostname | `host.docker.internal` |
| `MYSQL_PORT` | MySQL server port | `3306` |
| `MYSQL_USER` | MySQL user with access to all cvh_* databases | `cvh_admin` |
| `MYSQL_PASSWORD` | MySQL user password | `changeme` |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (for migrations) | `changeme` |

#### Redis

| Variable | Description | Example |
|----------|-------------|---------|
| `REDIS_HOST` | Redis hostname (Docker service name) | `redis` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis authentication password | `changeme` |

#### Key Vault

| Variable | Description | Example |
|----------|-------------|---------|
| `VAULT_MASTER_PASSWORD` | Master password for KEK derivation (PBKDF2). CRITICAL -- use a strong, unique password. | `changeme-use-strong-password` |
| `KDF_ITERATIONS` | PBKDF2 iteration count (default: 600000). OWASP 2024 recommends 600,000+ for SHA-512. | `600000` |
| `INTERNAL_SERVICE_KEY` | Shared secret for inter-service authentication (Key Vault, Core Wallet, Notification). Used in `X-Internal-Service-Key` header with timing-safe comparison. | `random-secret-256bit` |

#### RPC Endpoints

| Variable | Description | Example |
|----------|-------------|---------|
| `RPC_ETH_HTTP` | Ethereum HTTP RPC endpoint | `https://eth-mainnet.gateway.tatum.io/` |
| `RPC_ETH_WS` | Ethereum WebSocket RPC endpoint | `wss://eth-mainnet.gateway.tatum.io/ws` |
| `RPC_BSC_HTTP` | BSC HTTP RPC endpoint | `https://bsc-mainnet.gateway.tatum.io/` |
| `RPC_BSC_WS` | BSC WebSocket RPC endpoint | `wss://bsc-mainnet.gateway.tatum.io/ws` |
| `RPC_POLYGON_HTTP` | Polygon HTTP RPC endpoint | `https://polygon-mainnet.gateway.tatum.io/` |
| `TATUM_API_KEY` | Tatum.io API key for authenticated RPC access | `your-tatum-api-key` |

Add additional `RPC_<CHAIN>_HTTP` and `RPC_<CHAIN>_WS` variables for each chain (Arbitrum, Optimism, Avalanche, Base).

#### PostHog

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTHOG_HOST` | PostHog server URL | `http://posthog-web:8000` |
| `POSTHOG_API_KEY` | PostHog project API key | `phc_your_key_here` |

#### Kong

| Variable | Description | Example |
|----------|-------------|---------|
| `KONG_ADMIN_URL` | Kong Admin API URL | `http://api-gateway:8001` |

#### JWT / Auth (set in Auth Service)

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for signing JWT tokens | `your-jwt-secret-256bit` |
| `JWT_EXPIRES_IN_SECONDS` | Access token TTL in seconds (default: 900) | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token TTL in days (default: 7) | `7` |
| `TOTP_ENCRYPTION_KEY` | AES encryption key for TOTP secrets at rest. CRITICAL -- use a strong, unique key. | `random-secret-key` |

#### Service URLs (internal networking)

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTH_SERVICE_URL` | Auth Service internal URL | `http://auth-service:3003` |
| `CORE_WALLET_URL` | Core Wallet Service internal URL | `http://core-wallet-service:3004` |
| `KEY_VAULT_URL` | Key Vault Service internal URL (vault-net) | `https://key-vault-service:3005` |
| `CHAIN_INDEXER_URL` | Chain Indexer Service internal URL | `http://chain-indexer-service:3006` |
| `NOTIFICATION_URL` | Notification Service internal URL | `http://notification-service:3007` |

## 3. Database Setup

CryptoVaultHub uses 8 separate MySQL databases. Run the migration scripts against your MySQL cluster:

```bash
# Create all 8 databases
mysql -h <host> -u root -p < database/000-create-databases.sql

# Create auth tables (users, sessions, api_keys)
mysql -h <host> -u root -p < database/001-cvh-auth.sql
```

The 8 databases created:

| Database | Purpose |
|----------|---------|
| `cvh_auth` | Users, sessions, API keys |
| `cvh_keyvault` | Master seeds, derived keys, Shamir shares |
| `cvh_admin` | Clients, tiers, chains, audit logs |
| `cvh_wallets` | Wallets, deposit addresses, whitelisted addresses |
| `cvh_transactions` | Deposits, withdrawals |
| `cvh_compliance` | Sanctions entries, screening results, compliance alerts |
| `cvh_notifications` | Webhooks, webhook deliveries, email logs |
| `cvh_indexer` | Sync cursors, monitored addresses |

Each service uses Prisma ORM with its own schema pointing to the relevant database.

### Create Application User

```sql
CREATE USER 'cvh_admin'@'%' IDENTIFIED BY 'your-strong-password';

-- Grant access to all CVH databases
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

## 4. Docker Compose

Start all infrastructure services:

```bash
docker compose up -d
```

This starts:

**Infrastructure**:
- `redis` -- Redis 7 (Alpine) with AOF persistence, 512MB max memory
- `api-gateway` -- Kong 3.6 in declarative (DB-less) mode

**Observability**:
- `prometheus` -- Prometheus v2.50.0 (port 9090)
- `grafana` -- Grafana 10.3.0 (port 3000, default password: `admin`)
- `loki` -- Loki 2.9.0 (port 3100)
- `jaeger` -- Jaeger All-in-One 1.54 (UI: port 16686, OTLP: port 4318)

**PostHog Stack**:
- `posthog-web` -- PostHog (port 8010)
- `posthog-worker` -- Celery worker with scheduler
- `posthog-postgres` -- PostgreSQL 16 for PostHog
- `posthog-redis` -- Redis for PostHog
- `clickhouse` -- ClickHouse 23.12 for analytics
- `kafka` -- Kafka 3.6 for event streaming
- `zookeeper` -- Zookeeper 3.9 for Kafka

### Docker Volumes

| Volume | Service | Purpose |
|--------|---------|---------|
| `redis-data` | redis | Persistent Redis data |
| `prometheus-data` | prometheus | Metrics storage |
| `grafana-data` | grafana | Dashboard definitions |
| `posthog-pg-data` | posthog-postgres | PostHog database |
| `clickhouse-data` | clickhouse | PostHog analytics data |

## 5. Build and Run Services

### Development Mode

```bash
# Build all packages first
npx turbo build

# Start all services in watch mode
npx turbo dev
```

### Production Build

```bash
# Build everything
npx turbo build

# Start individual services
cd services/admin-api && node dist/main.js
cd services/client-api && node dist/main.js
# ... etc
```

### Docker Build (Production)

Use the provided Dockerfiles in `infra/docker/`:

```bash
# Build NestJS service
docker build \
  -f infra/docker/Dockerfile.nestjs \
  --build-arg SERVICE_PATH=services/admin-api \
  -t cvh-admin-api .

# Build Next.js app
docker build \
  -f infra/docker/Dockerfile.nextjs \
  --build-arg APP_PATH=apps/admin \
  -t cvh-admin-panel .
```

Both Dockerfiles use multi-stage builds with:
- Node.js 20 Alpine base image
- Non-root user (`nestjs` or `nextjs`)
- Minimal final image (only built artifacts and dependencies)

## 6. Kong API Gateway Configuration

Kong runs in declarative (DB-less) mode using the config file at `infra/kong/kong.yml`.

### Current Routes

| Service | Path Prefix | Internal URL | Rate Limit |
|---------|------------|--------------|------------|
| Admin API | `/admin` | `http://admin-api:3001` | 50 req/s |
| Client API | `/client` | `http://client-api:3002` | 100 req/s |
| Auth Service | `/auth` | `http://auth-service:3003` | Default |

### Global Plugins

- **CORS**: Allow all origins, methods: GET/POST/PATCH/DELETE/OPTIONS, headers: Content-Type/Authorization/X-API-Key
- **Request Size Limiting**: 1 MB maximum payload
- **Rate Limiting**: Per-service, backed by Redis

### Customizing Rate Limits

Edit `infra/kong/kong.yml` and restart Kong:

```bash
docker compose restart api-gateway
```

For dynamic rate limiting synced with the tier system, the Admin API updates Kong via the Admin API (port 8001).

## 7. Smart Contract Deployment

Deploy contracts to each target chain:

```bash
cd contracts

# Compile contracts
npx hardhat compile

# Deploy to a specific network
npx hardhat run scripts/deploy.ts --network ethereum
npx hardhat run scripts/deploy.ts --network bsc
npx hardhat run scripts/deploy.ts --network polygon
# ... repeat for each chain
```

### Adding Network Configurations

Edit `contracts/hardhat.config.ts` to add production networks:

```typescript
networks: {
  ethereum: {
    url: process.env.RPC_ETH_HTTP,
    chainId: 1,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY],
  },
  bsc: {
    url: process.env.RPC_BSC_HTTP,
    chainId: 56,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY],
  },
  polygon: {
    url: process.env.RPC_POLYGON_HTTP,
    chainId: 137,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY],
  },
  // Add more chains as needed
}
```

### Deployment Order

The deploy script deploys in the correct dependency order:
1. `CvhWalletSimple` -- Implementation contract
2. `CvhForwarder` -- Implementation contract
3. `CvhWalletFactory` -- References CvhWalletSimple implementation
4. `CvhForwarderFactory` -- References CvhForwarder implementation
5. `CvhBatcher` -- Standalone batch transfer contract

After deployment, register the contract addresses in the Admin API:
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

### Compiler Settings

- Solidity: 0.8.27
- Optimizer: Enabled, 1000 runs
- EVM Version: Cancun
- TypeChain target: ethers-v6

## 8. PostHog Setup

PostHog is self-hosted via docker-compose. After starting:

1. Access PostHog at `http://localhost:8010`
2. Create an organization and project
3. Copy the project API key
4. Set `POSTHOG_API_KEY` in your `.env` file
5. Restart services to begin event ingestion

The `@cvh/posthog` shared package (`packages/posthog/`) wraps `posthog-node` and is used by all services via the PostHog interceptor.

Events are captured for:
- Every API request/response (via NestJS interceptor)
- Webhook deliveries
- Blockchain events (deposits, sweeps, withdrawals)
- Compliance screenings
- Admin actions

## 9. Monitoring Setup

### Prometheus

Configuration: `infra/prometheus/prometheus.yml`

Scrape targets (15s interval):
- Kong Admin API (`:8001`)
- Admin API (`:3001`)
- Client API (`:3002`)
- Core Wallet Service (`:3004`)
- Chain Indexer Service (`:3006`)
- Notification Service (`:3007`)

Access: `http://localhost:9090`

### Grafana

Access: `http://localhost:3000` (admin / admin)

After first login:
1. Add Prometheus data source: `http://prometheus:9090`
2. Add Loki data source: `http://loki:3100`
3. Import or create dashboards for:
   - Service health and latency
   - Queue depths (BullMQ)
   - RPC node health
   - Gas tank balances
   - Deposit/withdrawal volumes

### Loki

All services emit structured JSON logs that are shipped to Loki at `http://loki:3100`.

Query logs in Grafana using LogQL:
```
{service="admin-api"} |= "error"
{service="core-wallet"} | json | level="error"
```

### Jaeger

Access: `http://localhost:16686`

Distributed traces flow across services via OTLP (port 4318). Trace IDs are correlated with PostHog events and Loki logs for end-to-end debugging.

## 10. Service Ports Summary

| Service | Internal Port | External Port | Network |
|---------|--------------|---------------|---------|
| Kong Proxy | 8000 | 8000 | public-net, internal-net |
| Kong Proxy (TLS) | 8443 | 8443 | public-net, internal-net |
| Kong Admin | 8001 | 8001 | public-net, internal-net |
| Admin API | 3001 | -- | internal-net |
| Client API | 3002 | -- | internal-net |
| Auth Service | 3003 | -- | internal-net |
| Core Wallet | 3004 | -- | internal-net, vault-net |
| Key Vault | 3005 | -- | vault-net only |
| Chain Indexer | 3006 | -- | internal-net |
| Notification | 3007 | -- | internal-net |
| Cron Worker | 3008 | -- | internal-net |
| Admin Panel | 3010 | 3010 | public-net |
| Client Portal | 3011 | 3011 | public-net |
| Redis | 6379 | -- | internal-net |
| Prometheus | 9090 | 9090 | monitoring-net, internal-net |
| Grafana | 3000 | 3000 | monitoring-net, public-net |
| Loki | 3100 | 3100 | monitoring-net, internal-net |
| Jaeger | 16686/4318 | 16686/4318 | monitoring-net, internal-net |
| PostHog | 8000 | 8010 | monitoring-net, internal-net |

## 11. Production Checklist

- [ ] Set strong `VAULT_MASTER_PASSWORD` (32+ characters, high entropy)
- [ ] Set strong `JWT_SECRET` (256-bit random)
- [ ] Configure real RPC endpoints with API keys for all target chains
- [ ] Set up MySQL cluster with replication and backups
- [ ] Configure TLS certificates for Kong (port 8443)
- [ ] Set a strong, random `INTERNAL_SERVICE_KEY` for Key Vault <-> Core Wallet authentication
- [ ] (Planned) Generate mTLS certificates for Key Vault <-> Core Wallet communication
- [ ] Deploy smart contracts to all target chains
- [ ] Register chain and token configurations via Admin API
- [ ] Create initial admin user and enable 2FA
- [ ] Configure Grafana dashboards and alert rules
- [ ] Set up log retention policies in Loki
- [ ] Configure PostHog data retention
- [ ] Set up external backup for Redis AOF, MySQL dumps, and Shamir shares
- [ ] Load-test rate limiting configuration per tier
- [ ] Verify Key Vault has zero internet access (test from container)
- [ ] Set up DNS and load balancer for Kong
