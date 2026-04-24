# Deployment Guide

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | >= 20.0.0 | Required for all services and build tools |
| npm | >= 10 | Included with Node.js 20 |
| Docker | >= 24 | For containerized infrastructure |
| docker-compose | >= 2.20 | For orchestration (compose V2) |
| MySQL | 8.0+ | External cluster (not in docker-compose) |
| Git | >= 2.30 | For cloning the repository |

### Optional

| Requirement | Purpose |
|------------|---------|
| Tatum.io API key | Authenticated RPC access for EVM chains |
| GetBlock.io API key | Alternative RPC provider |
| TLS certificates | HTTPS termination on Kong (port 8443) |

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
| `MYSQL_ROOT_PASSWORD` | MySQL root password (for running migration scripts) | `changeme` |

#### Redis

| Variable | Description | Example |
|----------|-------------|---------|
| `REDIS_HOST` | Redis hostname (Docker service name) | `redis` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis authentication password. Used by all services and Kong rate limiting. | `changeme` |

#### Key Vault

| Variable | Description | Example |
|----------|-------------|---------|
| `VAULT_MASTER_PASSWORD` | Master password for KEK derivation via PBKDF2-HMAC-SHA512. **CRITICAL** -- use a strong, unique password (64+ characters). This password protects ALL private keys in the system. | `your-64-char-high-entropy-password` |
| `KDF_ITERATIONS` | PBKDF2 iteration count. Default: 600000. OWASP 2024 recommends 600,000+ for PBKDF2-SHA512. Set in Key Vault Service `.env`. | `600000` |
| `INTERNAL_SERVICE_KEY` | Shared secret for inter-service authentication. Used in `X-Internal-Service-Key` header with timing-safe comparison. Applied to Key Vault, Core Wallet, and Notification Service. | `random-256-bit-string` |

#### JWT / Auth

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for signing JWT access tokens. Must be 256-bit (32 bytes) or stronger. | `your-jwt-secret-256bit` |
| `JWT_EXPIRES_IN_SECONDS` | Access token TTL in seconds. Default: 900 (15 minutes). | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token TTL in days. Default: 7. Stored as SHA-256 hash in `cvh_auth.sessions`. | `7` |
| `TOTP_ENCRYPTION_KEY` | AES encryption key for TOTP secrets at rest. Used with scrypt for per-operation key derivation. **CRITICAL** -- use a strong, unique key. | `64-char-hex-string` |

#### RPC Endpoints

| Variable | Description | Example |
|----------|-------------|---------|
| `RPC_ETH_HTTP` | Ethereum HTTP RPC endpoint | `https://eth-mainnet.gateway.tatum.io/` |
| `RPC_ETH_WS` | Ethereum WebSocket RPC endpoint (for real-time deposit detection) | `wss://eth-mainnet.gateway.tatum.io/ws` |
| `RPC_BSC_HTTP` | BSC HTTP RPC endpoint | `https://bsc-mainnet.gateway.tatum.io/` |
| `RPC_BSC_WS` | BSC WebSocket RPC endpoint | `wss://bsc-mainnet.gateway.tatum.io/ws` |
| `RPC_POLYGON_HTTP` | Polygon HTTP RPC endpoint | `https://polygon-mainnet.gateway.tatum.io/` |
| `TATUM_API_KEY` | Tatum.io API key for authenticated RPC access | `your-tatum-api-key` |

Add additional `RPC_<CHAIN>_HTTP` and `RPC_<CHAIN>_WS` variables for each chain (Arbitrum, Optimism, Avalanche, Base).

#### PostHog

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTHOG_HOST` | PostHog server URL (Docker service name) | `http://posthog-web:8000` |
| `POSTHOG_API_KEY` | PostHog project API key (created after first PostHog login) | `phc_your_key_here` |

#### Monitoring

| Variable | Description | Example |
|----------|-------------|---------|
| `GRAFANA_PASSWORD` | Grafana admin panel password. Default: `changeme`. | `your-grafana-password` |

#### Kong

| Variable | Description | Example |
|----------|-------------|---------|
| `KONG_ADMIN_URL` | Kong Admin API URL (for dynamic configuration) | `http://api-gateway:8001` |

#### Service Environment Variables (set per service in docker-compose.yml)

Each NestJS service receives the following environment variables via docker-compose:

| Variable | Services | Description |
|----------|----------|-------------|
| `NODE_ENV` | All | Environment mode (`production`, `development`) |
| `PORT` | All | Service listening port (3001-3008) |
| `MYSQL_HOST` | All | MySQL hostname |
| `MYSQL_PORT` | All | MySQL port |
| `MYSQL_USER` | All | MySQL user |
| `MYSQL_PASSWORD` | All | MySQL password |
| `REDIS_HOST` | All | Redis hostname (set to `redis` in Docker) |
| `REDIS_PORT` | All | Redis port (6379) |
| `REDIS_PASSWORD` | All | Redis password |
| `INTERNAL_SERVICE_KEY` | All backend | Inter-service auth key |
| `JWT_SECRET` | Auth Service | JWT signing secret |
| `JWT_EXPIRES_IN_SECONDS` | Auth Service | Access token TTL |
| `REFRESH_TOKEN_TTL_DAYS` | Auth Service | Refresh token TTL |
| `TOTP_ENCRYPTION_KEY` | Auth Service | TOTP secret encryption key |
| `VAULT_MASTER_PASSWORD` | Key Vault | Master password for KEK derivation |
| `RPC_ETH_HTTP` | Chain Indexer | Ethereum HTTP RPC |
| `RPC_ETH_WS` | Chain Indexer | Ethereum WebSocket RPC |
| `RPC_BSC_HTTP` | Chain Indexer | BSC HTTP RPC |
| `RPC_BSC_WS` | Chain Indexer | BSC WebSocket RPC |
| `RPC_POLYGON_HTTP` | Chain Indexer | Polygon HTTP RPC |
| `TATUM_API_KEY` | Chain Indexer | Tatum API key |

## 3. Database Setup

CryptoVaultHub uses 10 separate MySQL databases with 42 migrations (000-041). Run the migration scripts against your MySQL cluster:

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

# Or use the automated migration script:
bash database/migrate.sh
```

The 10 databases created:

| Database | Purpose | Accessed By |
|----------|---------|-------------|
| `cvh_auth` | Users, sessions, API keys | Auth Service |
| `cvh_keyvault` | Master seeds, derived keys, Shamir shares, audit log | Key Vault Service ONLY |
| `cvh_admin` | Clients, tiers, chains, tokens, audit logs, knowledge base, project contracts | Admin API, Client API, Core Wallet |
| `cvh_wallets` | Wallets, deposit addresses, whitelisted addresses | Core Wallet Service |
| `cvh_transactions` | Deposits, withdrawals, co-sign operations | Core Wallet Service |
| `cvh_compliance` | Sanctions entries, screening results, compliance alerts | Core Wallet Service, Cron Worker |
| `cvh_notifications` | Webhooks, webhook deliveries, email logs | Notification Service |
| `cvh_indexer` | Sync cursors, monitored addresses | Chain Indexer Service |
| `cvh_jobs` | Job queue state, dead letter, retry tracking | Cron Worker Service |
| `cvh_exports` | Export requests and file references | Admin API, Client API |

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
GRANT ALL PRIVILEGES ON cvh_jobs.* TO 'cvh_admin'@'%';
GRANT ALL PRIVILEGES ON cvh_exports.* TO 'cvh_admin'@'%';

FLUSH PRIVILEGES;
```

## 4. Docker Compose

Start all infrastructure services:

```bash
docker compose up -d
```

This starts the following containers organized across 4 Docker networks:

### Infrastructure

| Container | Image | Port | Network | Purpose |
|-----------|-------|------|---------|---------|
| `redis` | redis:7-alpine | 6379 (internal) | internal-net | Job queues (BullMQ), Redis Streams, rate limiting state, caching. AOF persistence, 512MB max memory, LRU eviction. Password-authenticated via `REDIS_PASSWORD`. |
| `api-gateway` | kong:3.6 | 8000, 8443 | public-net, internal-net | API gateway in declarative (DB-less) mode. Kong Admin listens on 127.0.0.1:8001 only. |

### Application Services

| Container | Port | Network | Notes |
|-----------|------|---------|-------|
| `admin-api` | 3001 | internal-net, public-net | Admin API service |
| `client-api` | 3002 | internal-net, public-net | Client API service |
| `auth-service` | 3003 | internal-net | Auth service |
| `core-wallet-service` | 3004 | internal-net, vault-net | Bridges internal and vault networks |
| `key-vault-service` | 3005 | vault-net ONLY | Zero internet access |
| `chain-indexer-service` | 3006 | internal-net | Blockchain monitoring |
| `notification-service` | 3007 | internal-net | Webhook delivery |
| `cron-worker-service` | 3008 | internal-net | Background jobs |

### Frontend Applications

| Container | Port | Network | Notes |
|-----------|------|---------|-------|
| `admin` | 3010 (maps to internal 3000) | public-net | Admin Panel (Next.js 14) |
| `client` | 3011 (maps to internal 3000) | public-net | Client Portal (Next.js 14) |

### Observability

| Container | Image | Port | Network | Purpose |
|-----------|-------|------|---------|---------|
| `prometheus` | prom/prometheus:v2.50.0 | 9090 | monitoring-net, internal-net | Metrics collection (15s scrape interval) |
| `grafana` | grafana/grafana:10.3.0 | 3000 | monitoring-net | Dashboards (default password: `GRAFANA_PASSWORD`) |
| `loki` | grafana/loki:2.9.0 | 3100 | monitoring-net, internal-net | Log aggregation |
| `jaeger` | jaegertracing/all-in-one:1.54 | 16686, 4318 | monitoring-net, internal-net | Distributed tracing (UI: 16686, OTLP: 4318) |

### PostHog Stack

| Container | Image | Port | Network | Purpose |
|-----------|-------|------|---------|---------|
| `posthog-web` | posthog/posthog:latest | 8010 (maps to 8000) | monitoring-net, internal-net | PostHog web interface and API |
| `posthog-worker` | posthog/posthog:latest | -- | monitoring-net | Celery worker with scheduler |
| `posthog-postgres` | postgres:16-alpine | -- | monitoring-net | PostHog database |
| `posthog-redis` | redis:7-alpine | -- | monitoring-net | PostHog Redis (separate from app Redis) |
| `clickhouse` | clickhouse/clickhouse-server:23.12 | -- | monitoring-net | PostHog analytics data |
| `kafka` | bitnami/kafka:3.6 | -- | monitoring-net | PostHog event streaming |
| `zookeeper` | bitnami/zookeeper:3.9 | -- | monitoring-net | Kafka coordination |

### Docker Volumes

| Volume | Service | Purpose |
|--------|---------|---------|
| `redis-data` | redis | Persistent Redis data (AOF) |
| `prometheus-data` | prometheus | Metrics time-series storage |
| `grafana-data` | grafana | Dashboard definitions and data sources |
| `posthog-pg-data` | posthog-postgres | PostHog PostgreSQL data |
| `clickhouse-data` | clickhouse | PostHog ClickHouse analytics data |

### Health Checks

All services include Docker health checks:

```bash
# Verify all containers are healthy
docker compose ps

# Expected: all containers show "healthy" status
```

Individual health check commands used in docker-compose:

| Service | Health Check |
|---------|-------------|
| Redis | `redis-cli -a <password> ping` (10s interval) |
| Kong | `kong health` (10s interval) |
| All NestJS services | `wget --spider -q http://localhost:<port>/health` (30s interval) |
| Frontend apps | `wget --spider -q http://localhost:3000/` (30s interval) |
| Prometheus | `wget --spider -q http://localhost:9090/-/healthy` (30s interval) |
| Grafana | `wget --spider -q http://localhost:3000/api/health` (30s interval) |
| Loki | `wget --spider -q http://localhost:3100/ready` (30s interval) |

## 5. Build and Run Services

### Development Mode

```bash
# Build all packages first (required for shared dependencies)
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
cd services/auth-service && node dist/main.js
cd services/core-wallet-service && node dist/main.js
cd services/key-vault-service && node dist/main.js
cd services/chain-indexer-service && node dist/main.js
cd services/notification-service && node dist/main.js
cd services/cron-worker-service && node dist/main.js
```

### Docker Build (Production)

Use the provided multi-stage Dockerfiles in `infra/docker/`:

```bash
# Build a NestJS service
docker build \
  -f infra/docker/Dockerfile.nestjs \
  --build-arg SERVICE_PATH=services/admin-api \
  --build-arg PORT=3001 \
  -t cvh-admin-api .

# Build a Next.js frontend app
docker build \
  -f infra/docker/Dockerfile.nextjs \
  --build-arg APP_PATH=apps/admin \
  -t cvh-admin-panel .
```

Both Dockerfiles use multi-stage builds with:
- Node.js 20 Alpine base image
- Non-root user (`nestjs` or `nextjs`) for security
- Minimal final image (only built artifacts and production dependencies)

### Frontend App Deployment

The frontend applications (Admin Panel and Client Portal) are Next.js 14 apps using the App Router:

```bash
# Build frontend apps
cd apps/admin && npm run build
cd apps/client && npm run build

# Start in production
cd apps/admin && npm start   # Listens on port 3000 (mapped to 3010)
cd apps/client && npm start  # Listens on port 3000 (mapped to 3011)
```

In Docker, the Next.js apps listen on port 3000 internally, which is mapped to 3010 (admin) and 3011 (client) externally via docker-compose port mapping.

## 6. Kong API Gateway Configuration

Kong runs in declarative (DB-less) mode using the config file at `infra/kong/kong.yml`.

### Current Routes

| Service | Path Prefix | Internal URL | Rate Limit |
|---------|------------|--------------|------------|
| Admin API | `/admin` | `http://admin-api:3001` | 50 req/s |
| Client API | `/client` | `http://client-api:3002` | 100 req/s |
| Auth Service | `/auth` | `http://auth-service:3003` | 10 req/s |

### Global Plugins

| Plugin | Configuration |
|--------|---------------|
| CORS | Origins: `localhost:3010`, `localhost:3011`, `admin.cryptovaulthub.com`, `portal.cryptovaulthub.com`. Methods: GET, POST, PATCH, DELETE, OPTIONS. Headers: Content-Type, Authorization, X-API-Key. |
| Request Size Limiting | 1 MB maximum payload |
| Rate Limiting (per service) | Redis-backed (`policy: redis`, `redis_host: redis`) |

### Customizing Rate Limits

Edit `infra/kong/kong.yml` and restart Kong:

```bash
docker compose restart api-gateway
```

For dynamic rate limiting synced with the tier system, the Admin API can update Kong via the Kong Admin API (listening on `127.0.0.1:8001`).

### Adding Production Origins

Update the CORS plugin origins in `infra/kong/kong.yml`:

```yaml
plugins:
  - name: cors
    config:
      origins:
        - "https://admin.yourdomain.com"
        - "https://portal.yourdomain.com"
```

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
  // Add Arbitrum, Optimism, Avalanche, Base as needed
}
```

### Deployment Order

The deploy script deploys in the correct dependency order:
1. `CvhWalletSimple` -- Implementation contract
2. `CvhForwarder` -- Implementation contract
3. `CvhWalletFactory` -- References CvhWalletSimple implementation address
4. `CvhForwarderFactory` -- References CvhForwarder implementation address
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

Contract addresses are stored in `cvh_admin.chains` with columns: `wallet_factory_address`, `forwarder_factory_address`, `wallet_impl_address`, `forwarder_impl_address`.

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

The `@cvh/posthog` shared package (`packages/posthog/`) wraps `posthog-node` and is used by all services via a NestJS interceptor.

Events are captured for:
- Every API request/response (via NestJS interceptor in each service)
- Webhook deliveries (payload, status, response time)
- Blockchain events (deposits detected, sweeps executed, withdrawals confirmed)
- Compliance screenings (source/destination, result, list matched)
- Admin actions (client creation, tier changes, key generation)
- Key Vault operations (logged separately to `key_vault_audit` table)

## 9. Monitoring Setup

### Prometheus

Configuration: `infra/prometheus/prometheus.yml`

Scrape targets (15s interval):
- Kong Admin API (`:8001`)
- Admin API (`:3001`)
- Client API (`:3002`)
- Auth Service (`:3003`)
- Core Wallet Service (`:3004`)
- Chain Indexer Service (`:3006`)
- Notification Service (`:3007`)
- Cron Worker Service (`:3008`)

Access: `http://localhost:9090`

### Grafana

Access: `http://localhost:3000` (admin / `GRAFANA_PASSWORD`)

After first login:
1. Add Prometheus data source: `http://prometheus:9090`
2. Add Loki data source: `http://loki:3100`
3. Import or create dashboards for:
   - Service health and latency
   - Queue depths (BullMQ)
   - RPC node health and response times
   - Gas tank balances per client per chain
   - Deposit/withdrawal volumes and success rates

### Loki

All services emit structured JSON logs that are shipped to Loki at `http://loki:3100`.

Query logs in Grafana using LogQL:

```
{service="admin-api"} |= "error"
{service="core-wallet"} | json | level="error"
{service="key-vault"} | json | action="sign"
{service="chain-indexer"} | json | event="deposit_detected"
```

### Jaeger

Access: `http://localhost:16686`

Distributed traces flow across services via OTLP (port 4318). Trace IDs are correlated with PostHog events and Loki logs for end-to-end debugging. A single trace ID connects: API request -> Core Wallet processing -> Key Vault signing -> blockchain submission -> webhook delivery.

## 10. Service Health Verification

After starting all services, verify health:

```bash
# Infrastructure
docker compose ps                                    # All containers "healthy"
curl -s http://localhost:9090/-/healthy               # Prometheus
curl -s http://localhost:3000/api/health              # Grafana
curl -s http://localhost:3100/ready                   # Loki

# Application services
curl -s http://localhost:3001/health | jq             # Admin API
curl -s http://localhost:3002/health | jq             # Client API
curl -s http://localhost:3003/health | jq             # Auth Service
curl -s http://localhost:3004/health | jq             # Core Wallet
curl -s http://localhost:3005/health | jq             # Key Vault
curl -s http://localhost:3006/health | jq             # Chain Indexer
curl -s http://localhost:3007/health | jq             # Notification
curl -s http://localhost:3008/health | jq             # Cron Worker

# Via Kong gateway
curl -s http://localhost:8000/admin/health | jq       # Admin API via Kong
curl -s http://localhost:8000/client/health | jq      # Client API via Kong
curl -s http://localhost:8000/auth/health | jq        # Auth Service via Kong

# Frontend apps
curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/  # Admin Panel
curl -s -o /dev/null -w "%{http_code}" http://localhost:3011/  # Client Portal

# Key Vault isolation verification
docker exec key-vault-service ping -c 1 google.com            # Should FAIL
docker exec key-vault-service ping -c 1 redis                 # Should FAIL
docker exec key-vault-service ping -c 1 core-wallet-service   # Should SUCCEED
```

Each health endpoint returns JSON:

```json
{
  "status": "ok",
  "timestamp": "2026-04-09T12:00:00.000Z",
  "service": "admin-api"
}
```

## 11. Service Ports Summary

| Service | Internal Port | External Port | Network |
|---------|--------------|---------------|---------|
| Kong Proxy | 8000 | 8000 | public-net, internal-net |
| Kong Proxy (TLS) | 8443 | 8443 | public-net, internal-net |
| Kong Admin | 8001 | 127.0.0.1:8001 | loopback only |
| Admin API | 3001 | 3001 | internal-net, public-net |
| Client API | 3002 | 3002 | internal-net, public-net |
| Auth Service | 3003 | 3003 | internal-net |
| Core Wallet | 3004 | 3004 | internal-net, vault-net |
| Key Vault | 3005 | 3005 | vault-net only |
| Chain Indexer | 3006 | 3006 | internal-net |
| Notification | 3007 | 3007 | internal-net |
| Cron Worker | 3008 | 3008 | internal-net |
| Admin Panel | 3000 (internal) | 3010 | public-net |
| Client Portal | 3000 (internal) | 3011 | public-net |
| Redis | 6379 | -- | internal-net |
| Prometheus | 9090 | 9090 | monitoring-net, internal-net |
| Grafana | 3000 | 3000 | monitoring-net |
| Loki | 3100 | 3100 | monitoring-net, internal-net |
| Jaeger UI | 16686 | 16686 | monitoring-net, internal-net |
| Jaeger OTLP | 4318 | 4318 | monitoring-net, internal-net |
| PostHog | 8000 (internal) | 8010 | monitoring-net, internal-net |

## 12. mTLS Certificate Generation

mTLS is active by default between Core Wallet Service and Key Vault Service. Generate certificates before first deployment:

```bash
bash scripts/generate-vault-certs.sh
```

This generates a self-signed CA, server certificate (Key Vault), and client certificate (Core Wallet) in `infra/certs/`. The certificates are mounted into containers via Docker Compose volumes.

**Environment Variables**:

| Variable | Description | Default |
|----------|-------------|---------|
| `VAULT_TLS_ENABLED` | Enable mTLS on vault-net | `true` |
| `VAULT_TLS_CA_PATH` | CA certificate path | `/certs/ca.pem` |
| `VAULT_TLS_CERT_PATH` | Server/client certificate path | `/certs/server.pem` or `/certs/client.pem` |
| `VAULT_TLS_KEY_PATH` | Server/client key path | `/certs/server-key.pem` or `/certs/client-key.pem` |

## 13. Promtail and Alertmanager

### Promtail

Promtail ships container logs from all services to Loki. It runs on the monitoring-net and internal-net, reading Docker container logs via the Docker socket.

### Alertmanager

Alertmanager processes alerts from Prometheus and delivers notifications. Three alert rules are configured:

1. **ServiceDown** -- fires when any service health check fails for >2 minutes
2. **RPCDegraded** -- fires when RPC health score drops below threshold
3. **SyncStalled** -- fires when chain indexer falls behind by >100 blocks

Configuration: `infra/prometheus/alertmanager.yml`

## 14. Additional Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `TRAEFIK_DASHBOARD_USERS` | Traefik | HTTP basic auth for Traefik dashboard |
| `CLICKHOUSE_PASSWORD` | ClickHouse | PostHog ClickHouse password |
| `VAULT_TLS_ENABLED` | Core Wallet, Key Vault | Enable mTLS (default: `true`) |
| `SERVICE_NAME` | All services | Service identifier for structured logging |
| `LOG_LEVEL` | All services | Pino log level (`debug`, `info`, `warn`, `error`) |

## 15. Redis Backups

Redis AOF persistence is enabled by default. For additional backup protection:

```bash
bash scripts/backup.sh
```

This script creates a point-in-time backup of the Redis AOF file and MySQL dumps.

## 16. Smart Contract Deployment

For detailed smart contract deployment procedures, see [`docs/operations/smart-contract-deployment.md`](operations/smart-contract-deployment.md).

## 17. Deployment Checklist

For the full production deployment checklist, see [`docs/operations/deployment-checklist.md`](operations/deployment-checklist.md).

---

## 18. Production Checklist

### Security

- [ ] Set strong `VAULT_MASTER_PASSWORD` (64+ characters, high entropy)
- [ ] Set strong `JWT_SECRET` (256-bit random)
- [ ] Set strong `INTERNAL_SERVICE_KEY` (256-bit random)
- [ ] Set strong `TOTP_ENCRYPTION_KEY` (64-character hex string)
- [ ] Set strong `REDIS_PASSWORD`
- [ ] Set strong `GRAFANA_PASSWORD`
- [ ] Generate mTLS certificates: `bash scripts/generate-vault-certs.sh`
- [ ] Verify `VAULT_TLS_ENABLED=true` (default)
- [ ] Configure TLS certificates for Kong (port 8443)
- [ ] Update CORS origins in `infra/kong/kong.yml` to production domains
- [ ] Verify Key Vault has zero internet access (test from container)
- [ ] Remove default Kong Admin API access (or restrict to loopback)
- [ ] Verify Swagger UI is disabled (`NODE_ENV=production`)
- [ ] Set `TRAEFIK_DASHBOARD_USERS` for Traefik dashboard auth
- [ ] Set `CLICKHOUSE_PASSWORD` for PostHog ClickHouse

### Infrastructure

- [ ] Set up MySQL cluster with replication and automated backups
- [ ] Configure Redis persistence (AOF enabled by default)
- [ ] Set up DNS and load balancer for Kong
- [ ] Configure external backup for Shamir shares (offline, encrypted)
- [ ] Set up log retention policies in Loki
- [ ] Configure PostHog data retention

### Application

- [ ] Deploy smart contracts to all target chains
- [ ] Register chain and token configurations via Admin API
- [ ] Create initial admin user and enable 2FA
- [ ] Configure real RPC endpoints with API keys for all target chains
- [ ] Configure Grafana dashboards and alert rules
- [ ] Load-test rate limiting configuration per tier
- [ ] Run smart contract tests (`npx hardhat test`)
- [ ] Verify all health endpoints respond correctly
