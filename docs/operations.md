# CryptoVaultHub v2 -- Operations Guide

## 1. Deployment Steps (Docker Compose)

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- MySQL 8.0+ cluster (or use an external managed instance)
- At minimum 8 GB RAM for the full stack
- Node.js 20+ (for local development without Docker)

### Step-by-Step Deployment

```bash
# 1. Clone and enter the repository
git clone https://github.com/marcelosilva78/CryptoVaultHub.git && cd CryptoVaultHub

# 2. Automated setup (recommended)
bash scripts/setup.sh

# --- OR manual steps below ---

# 2a. Copy and configure environment variables
cp .env.example .env
# Edit .env with production values (see section 3 below)

# 3. Ensure DNS records point to your server IP before starting
#    admin.vaulthub.live, portal.vaulthub.live, api.vaulthub.live,
#    grafana.vaulthub.live, jaeger.vaulthub.live

# 4. Run database migrations
cd database
./migrate.sh -h $MYSQL_HOST -u $MYSQL_USER -p
cd ..

# 5. Generate Prisma clients for all services
npx turbo build --filter='./services/*'

# 6. Build and start all containers
docker compose up -d --build
# Traefik will automatically provision SSL certificates via Let's Encrypt (~30s)

# 7. Verify all services are healthy
docker compose ps
# All services should show "healthy" status

# 8. Verify health endpoints
curl http://localhost:3001/health  # admin-api
curl http://localhost:3002/health  # client-api
curl http://localhost:3003/health  # auth-service
curl http://localhost:3004/health  # core-wallet-service
curl http://localhost:3005/health  # key-vault-service
curl http://localhost:3006/health  # chain-indexer-service
curl http://localhost:3007/health  # notification-service
curl http://localhost:3008/health  # cron-worker-service

# 9. Verify Traefik SSL certificates
curl -s https://admin.vaulthub.live/health
curl -s https://api.vaulthub.live/auth/health
```

> **Note:** SSL is handled automatically by Traefik v3.0 via Let's Encrypt. There is no `init-ssl.sh` script or manual certificate setup required. Traefik provisions and renews certificates automatically as long as DNS records point to the server.

### Container Build

The project uses two Dockerfiles:
- `infra/docker/Dockerfile.nestjs` -- for all NestJS backend services (parameterized via `SERVICE_PATH` and `PORT` build args)
- `infra/docker/Dockerfile.nextjs` -- for Next.js frontend apps (parameterized via `APP_PATH`)

---

## 2. Migration Execution Order

Migrations must be executed in strict numerical order:

| # | File | Idempotent | Description |
|---|------|-----------|-------------|
| 000 | `000-create-databases.sql` | Yes | Creates all databases with IF NOT EXISTS |
| 001 | `001-cvh-auth.sql` | Yes | Auth tables |
| 002 | `002-cvh-keyvault.sql` | Yes | Key vault tables |
| 003 | `003-cvh-admin.sql` | Yes | Admin tables (tiers before clients for FK) |
| 004 | `004-cvh-wallets.sql` | Yes | Wallet tables |
| 005 | `005-cvh-transactions.sql` | Yes | Transaction tables |
| 006 | `006-cvh-compliance.sql` | Yes | Compliance tables |
| 007 | `007-cvh-notifications.sql` | Yes | Notification tables |
| 008 | `008-cvh-indexer.sql` | Yes | Indexer tables |
| 009 | `009-seed-data.sql` | Yes | Seed data (ON DUPLICATE KEY UPDATE) |
| 010 | `010-performance-indexes.sql` | Yes | Performance indexes (IF NOT EXISTS) |
| 011 | `011-traceability-views.sql` | Yes | Cross-DB views (CREATE OR REPLACE) |
| 012 | `012-schema-fixes.sql` | No | ALTER TABLE operations -- run once |

**Automated runner:**

```bash
./database/migrate.sh                          # localhost:3306, root
./database/migrate.sh -h 10.0.0.5 -u admin -p # custom host, prompt password
```

The runner (`database/migrate.sh`) executes all `0*.sql` files in order and stops on first failure.

---

## 3. Environment Variables Reference

### Global / Docker Compose Level

| Variable | Required | Description |
|----------|----------|-------------|
| `MYSQL_HOST` | Yes | MySQL hostname |
| `MYSQL_PORT` | Yes | MySQL port (default: 3306) |
| `MYSQL_USER` | Yes | MySQL username |
| `MYSQL_PASSWORD` | Yes | MySQL password |
| `REDIS_PASSWORD` | Yes | Redis authentication password |
| `INTERNAL_SERVICE_KEY` | Yes | Shared secret for service-to-service auth |
| `JWT_SECRET` | Yes | JWT signing secret (64+ chars) |
| `JWT_EXPIRES_IN_SECONDS` | No | Access token TTL (default: 900) |
| `REFRESH_TOKEN_TTL_DAYS` | No | Refresh token TTL (default: 7) |
| `TOTP_ENCRYPTION_KEY` | Yes | AES key for TOTP secret encryption (32+ chars) |
| `VAULT_MASTER_PASSWORD` | Yes | Master password for key vault (64+ chars) |
| `GRAFANA_PASSWORD` | No | Grafana admin password (default: changeme) |

### Per-Service Variables

**admin-api** (`.env.example` at `services/admin-api/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3001) |
| `ADMIN_DATABASE_URL` | MySQL connection string for cvh_admin |
| `AUTH_SERVICE_URL` | URL to auth-service |
| `CORE_WALLET_SERVICE_URL` | URL to core-wallet-service |
| `KEY_VAULT_SERVICE_URL` | URL to key-vault-service |
| `CHAIN_INDEXER_URL` | URL to chain-indexer-service |
| `NOTIFICATION_SERVICE_URL` | URL to notification-service |
| `POSTHOG_API_KEY` | PostHog API key |
| `POSTHOG_HOST` | PostHog host URL |
| `CORS_ORIGINS` | Allowed CORS origins |

**auth-service** (`.env.example` at `services/auth-service/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3003) |
| `DATABASE_URL` | MySQL connection string for cvh_auth |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN_SECONDS` | Access token TTL |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token TTL |
| `TOTP_ENCRYPTION_KEY` | Encryption key for TOTP secrets at rest |

**key-vault-service** (`.env.example` at `services/key-vault-service/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3005) |
| `DATABASE_URL` | MySQL connection string for cvh_keyvault |
| `VAULT_MASTER_PASSWORD` | Master password for KEK derivation |
| `KDF_ITERATIONS` | PBKDF2 iterations (default: 600000) |
| `INTERNAL_SERVICE_KEY` | Service-to-service auth key |

**chain-indexer-service** (`.env.example` at `services/chain-indexer-service/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3006) |
| `DATABASE_URL` | MySQL connection string for cvh_indexer |
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `POLLING_INTERVAL_MS` | Balance polling interval (default: 15000) |
| `DEFAULT_CONFIRMATIONS` | Default confirmation threshold (default: 12) |
| `TATUM_API_KEY` | Tatum.io API key for RPC access |

**core-wallet-service** (`.env.example` at `services/core-wallet-service/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3004) |
| `DATABASE_URL` | MySQL connection string for cvh_wallets |
| `KEY_VAULT_URL` | URL to key-vault-service |
| `TATUM_API_KEY` | Tatum.io API key |
| `WHITELIST_COOLDOWN_HOURS` | Whitelist cooldown period (default: 24) |

**cron-worker-service** (`.env.example` at `services/cron-worker-service/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3008) |
| `DATABASE_URL` | MySQL connection string for cvh_wallets |
| `KEY_VAULT_URL` | URL to key-vault-service |
| `SWEEP_INTERVAL_MS` | Sweep interval (default: 60000) |
| `GAS_TANK_LOW_THRESHOLD` | Low gas alert threshold in ETH (default: 0.1) |
| `OFAC_SDN_URL` | OFAC SDN list download URL |
| `TATUM_API_KEY` | Tatum.io API key |

**notification-service** (`.env.example` at `services/notification-service/`):
| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3007) |
| `DATABASE_URL` | MySQL connection string for cvh_notifications |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (587 for TLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for emails |

---

## 4. Health Checks

Docker Compose health checks are configured for all services:

| Service | Endpoint | Interval | Timeout | Retries |
|---------|----------|----------|---------|---------|
| Traefik | `GET /ping` | 10s | 3s | 3 |
| admin-api | `GET /health` | 30s | 5s | 3 |
| client-api | `GET /health` | 30s | 5s | 3 |
| auth-service | `GET /health` | 30s | 5s | 3 |
| core-wallet-service | `GET /health` | 30s | 5s | 3 |
| key-vault-service | `GET /health` | 30s | 5s | 3 |
| chain-indexer-service | `GET /health` | 30s | 5s | 3 |
| notification-service | `GET /health` | 30s | 5s | 3 |
| cron-worker-service | `GET /health` | 30s | 5s | 3 |
| Redis | `redis-cli -a $REDIS_PASSWORD ping` | 10s | 3s | 3 |
| Kong | `kong health` | 10s | 3s | 3 |
| Prometheus | `GET /-/healthy` | 30s | 5s | 3 |
| Grafana | `GET /api/health` | 30s | 5s | 3 |
| Loki | `GET /ready` | 30s | 5s | 3 |

The admin API's `/admin/monitoring/health` endpoint provides a composite health view of all services and infrastructure.

---

## 5. Monitoring Stack

### Traefik (Reverse Proxy / TLS)

- **External ports:** 80 (HTTP, redirects to HTTPS), 443 (HTTPS)
- **Dashboard:** `traefik.vaulthub.live` (internal access only)
- **SSL:** Automatic via Let's Encrypt (ACME HTTP-01 challenge)
- **Routing:** Docker label-based subdomain routing (no config files)
- **Subdomains:** `admin.vaulthub.live`, `portal.vaulthub.live`, `api.vaulthub.live`, `grafana.vaulthub.live`, `jaeger.vaulthub.live`
- **Metrics:** Exposed to Prometheus for scraping

### Prometheus

- **Config:** `infra/prometheus/prometheus.yml`
- **Port:** 9090
- **Scrape interval:** 15 seconds
- **Scrape targets:**
  - Kong gateway (`:8001`)
  - All 7 application services (admin-api through cron-worker-service)

### Grafana

- **Port:** 3000
- **Default password:** Set via `GRAFANA_PASSWORD` env var
- **Data sources:** Prometheus, Loki
- **Recommended dashboards:**
  - Service health overview
  - Queue depth and throughput
  - Chain indexer sync status
  - Gas tank balances
  - Webhook delivery success rates

### Loki

- **Port:** 3100
- **Connected to:** internal-net (receives logs from all services)
- **Query via:** Grafana LogQL

### Jaeger

- **UI Port:** 16686
- **Collector Port:** 4318 (OTLP HTTP)
- **Use for:** Distributed trace analysis across service calls

### PostHog

- **Port:** 8010
- **Backend:** ClickHouse + Kafka + PostgreSQL + Redis
- **Use for:** Product analytics, user behavior, feature flags

---

## 6. Common Troubleshooting

### Traefik / SSL Issues

**Symptoms:** SSL certificate errors in browser, HTTPS not working, `ERR_SSL_PROTOCOL_ERROR`.

**Diagnosis:**
```bash
# Check Traefik logs for certificate provisioning errors
docker compose logs traefik

# Check if Traefik container is running and healthy
docker compose ps traefik

# Verify DNS records resolve to your server IP
dig admin.vaulthub.live +short
dig api.vaulthub.live +short
```

**Resolution:**
1. **DNS not pointing to server:** Verify all subdomain DNS A records (`admin`, `portal`, `api`, `grafana`, `jaeger` `.vaulthub.live`) resolve to your server's public IP. Traefik cannot provision certificates if DNS does not point to the server.
2. **Certificate not provisioned yet:** After first start, wait approximately 30 seconds for Let's Encrypt to issue certificates. Check progress in `docker compose logs traefik`.
3. **Force certificate renewal:** Restart the Traefik container: `docker compose restart traefik`. Traefik will re-check and renew any expiring certificates.
4. **Rate limit hit:** Let's Encrypt has rate limits (50 certificates per registered domain per week). If you hit the limit during testing, wait or use Let's Encrypt staging environment.
5. **Port 80 blocked:** Traefik uses HTTP-01 challenge on port 80. Ensure port 80 is open in your firewall and not blocked by any upstream load balancer.
6. **Check Traefik dashboard:** Access `traefik.vaulthub.live` to inspect router and service status, active certificates, and middleware chain.

---

### Indexer Falling Behind

**Symptoms:** `sync_cursors.last_block` significantly behind the chain head block.

**Diagnosis:**
```sql
-- Check sync lag per chain
SELECT sc.chain_id, c.name, sc.last_block, sc.updated_at
FROM cvh_indexer.sync_cursors sc
JOIN cvh_admin.chains c ON c.chain_id = sc.chain_id;
```

**Resolution:**
1. Check RPC provider health: `GET /admin/monitoring/health` (rpcNodes section)
2. Verify WebSocket connections are active (check chain-indexer-service logs)
3. If WS is down, the service falls back to polling (every 15s) -- this is slower but functional
4. Check if the polling-detector BullMQ queue is backed up: `GET /admin/monitoring/queues`
5. Increase `POLLING_INTERVAL_MS` only if RPC rate limits are being hit
6. For persistent issues, restart the chain-indexer-service container

### Webhook Delivery Failures

**Symptoms:** `webhook_deliveries.status = 'failed'` accumulating.

**Diagnosis:**
```sql
SELECT event_type, status, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms
FROM cvh_notifications.webhook_deliveries
WHERE created_at > NOW() - INTERVAL 1 HOUR
GROUP BY event_type, status;
```

**Resolution:**
1. Check the `error` and `http_status` columns for the failure reason
2. Common causes: client endpoint down (connection refused), timeout, 5xx errors
3. Retries follow exponential backoff: 1s, 4s, 16s, 64s, 256s (5 attempts)
4. After max retries, delivery is marked `failed` -- use `POST /client/v1/webhooks/deliveries/:id/retry` to manually retry
5. If a client's endpoint is permanently down, consider deactivating the webhook

### RPC Provider Failover

**Symptoms:** Intermittent transaction failures, indexer gaps.

**Resolution:**
1. The `EvmProviderService` tracks success/failure per chain and reports to monitoring
2. Configure multiple RPC endpoints in the chain's `rpc_endpoints` JSON array with priorities
3. If primary provider fails, traffic automatically routes to lower-priority providers
4. Monitor via `GET /admin/monitoring/health` (rpcNodes section)
5. Add backup providers via `POST /admin/chains` or update chain config

### Queue Backlog

**Symptoms:** Growing queue depth in BullMQ queues.

**Diagnosis:**
```bash
# Check queue status via admin API
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/admin/monitoring/queues
```

**Resolution:**
1. Identify which queue is backed up (deposit-detection, withdrawal-processing, forwarder-deploy, webhook-delivery, sweep)
2. Check worker count -- each queue has configurable concurrency
3. For `forwarder-deploy`: likely gas tank is empty on one or more chains
4. For `sweep`: check that forwarders have deployed contracts (is_deployed=1)
5. For `webhook-delivery`: client endpoints may be slow; check response times
6. Scale workers by adjusting BullMQ concurrency or adding service replicas

### Flush/Sweep Failures

**Symptoms:** Deposits stuck in `confirmed` status without being swept.

**Diagnosis:**
```sql
SELECT chain_id, COUNT(*) as stuck
FROM cvh_transactions.deposits
WHERE status = 'confirmed' AND sweep_tx_hash IS NULL
  AND confirmed_at < NOW() - INTERVAL 10 MINUTE
GROUP BY chain_id;
```

**Resolution:**
1. Check gas tank balance for the chain: `GET /admin/gas-tanks`
2. If gas tank is empty, refill the gas tank wallet
3. Verify forwarder factory address is set for the chain
4. Check cron-worker-service logs for sweep errors
5. Verify the sweep BullMQ job is running: `GET /admin/monitoring/queues`

---

## 7. Backup Strategy

### Database Backups

| Database | Backup Frequency | Retention | Method |
|----------|-----------------|-----------|--------|
| `cvh_keyvault` | Every 4 hours | 90 days | Full dump, encrypted at rest |
| `cvh_auth` | Every 6 hours | 30 days | Full dump |
| `cvh_admin` | Daily | 30 days | Full dump |
| `cvh_wallets` | Every 6 hours | 60 days | Full dump |
| `cvh_transactions` | Every 4 hours | 90 days | Full dump + incremental |
| `cvh_compliance` | Daily | 365 days (regulatory) | Full dump |
| `cvh_notifications` | Daily | 30 days | Full dump |
| `cvh_indexer` | Every 6 hours | 14 days | Full dump |
| `cvh_jobs` | Daily | 30 days | Full dump |
| `cvh_exports` | Daily | 30 days | Full dump |

**Recommended tool:** `mysqldump --single-transaction --routines --triggers`

**Critical:** `cvh_keyvault` backups must be encrypted and stored with the same access controls as the vault master password. Loss of this database without backup means loss of all private keys.

### Redis Backup

Redis is configured with AOF persistence (`appendonly yes`). The `redis-data` Docker volume should be backed up daily. Redis data is recoverable from the database, so loss is non-critical but causes temporary performance degradation.

---

## 8. Log Levels and Locations

### Service Logs

All NestJS services use the built-in Logger with levels: `error`, `warn`, `log`, `debug`, `verbose`.

| Level | When to Use |
|-------|-------------|
| `error` | Unrecoverable failures (DB connection lost, signing failures) |
| `warn` | Degraded operations (WS fallback to polling, gas tank low) |
| `log` | Normal operations (deposit detected, sweep completed, webhook delivered) |
| `debug` | Detailed flow (RPC call details, cache hits/misses) |
| `verbose` | Full payloads (request/response bodies) -- never in production |

### Log Locations

- **Docker stdout/stderr:** `docker compose logs <service-name>`
- **Loki aggregation:** Query via Grafana (port 3000) using LogQL
- **Key vault audit:** `cvh_keyvault.key_vault_audit` table (structured, queryable)
- **Admin audit:** `cvh_admin.audit_logs` table
- **Webhook delivery logs:** `cvh_notifications.webhook_deliveries` (includes response body)

### Log Retention

- Container logs: Controlled by Docker logging driver (default: json-file with 100MB max)
- Loki: Configure retention in Loki config (recommended: 30 days)
- Database audit logs: Retained indefinitely (compliance requirement)
