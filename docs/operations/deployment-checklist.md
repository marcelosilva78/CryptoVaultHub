# Deployment Checklist

Standard pre/post deployment checklist for CryptoVaultHub production releases. For major version rollouts (new services, schema migrations), use the full [Rollout Checklist](../rollout-checklist.md) instead.

---

## Pre-Deploy

### 1. Notify and Prepare

- [ ] Announce the deployment in the team channel with expected duration
- [ ] Confirm no other deployments or maintenance windows are in progress
- [ ] Verify the branch to be deployed is up to date with `main`

### 2. Backup

- [ ] Backup Redis state:

```bash
# On production server (green@vaulthub.live)
cd /docker/CryptoVaultHub
bash scripts/backup.sh
# This runs BGSAVE, copies dump.rdb, and gzips it to /docker/backups/redis/
```

- [ ] Backup critical databases (if schema changes are involved):

```bash
mysqldump --single-transaction --routines --triggers \
  -h $MYSQL_HOST -u $MYSQL_USER -p \
  cvh_keyvault > /docker/backups/db/cvh_keyvault_$(date +%Y%m%d_%H%M%S).sql

# Repeat for affected databases:
# cvh_auth, cvh_admin, cvh_wallets, cvh_transactions,
# cvh_compliance, cvh_notifications, cvh_indexer
```

- [ ] Verify backups are readable (spot-check file sizes, attempt restore to scratch)

### 3. Environment Variables

- [ ] Review `.env` for any new variables required by this release
- [ ] Compare `.env.example` in the new code against the production `.env`
- [ ] Ensure secrets are not committed (`.env` is in `.gitignore`)

### 4. Database Migrations

- [ ] Review migration SQL files for destructive operations (DROP, ALTER column type changes)
- [ ] Run migrations against production:

```bash
cd /docker/CryptoVaultHub/database
./migrate.sh -h $MYSQL_HOST -u $MYSQL_USER -p
```

- [ ] Verify migrations completed without errors
- [ ] If migrations fail, STOP -- do not proceed with deployment

### 5. Pull Latest Code

```bash
ssh green@vaulthub.live
cd /docker/CryptoVaultHub
git fetch origin
git pull origin main
```

---

## Deploy

### 6. Build and Recreate Containers

```bash
# Build all Docker images (no cache for clean builds)
docker compose build

# Recreate containers with the new images
docker compose up -d --force-recreate
```

For a targeted deployment (single service):

```bash
# Build and recreate only the affected service
docker compose build <service-name>
docker compose up -d --force-recreate <service-name>

# Example:
docker compose build chain-indexer-service
docker compose up -d --force-recreate chain-indexer-service
```

### 7. Wait for Health Checks

```bash
# Watch container status until all show "healthy" (timeout: 5 minutes)
docker compose ps

# Expected: all services show (healthy) status
# If a service shows (health: starting) for more than 2 minutes, check its logs
```

---

## Post-Deploy

### 8. Verify Health Endpoints

```bash
# Backend services
curl -s http://localhost:3001/health | jq  # admin-api
curl -s http://localhost:3002/health | jq  # client-api
curl -s http://localhost:3003/health | jq  # auth-service
curl -s http://localhost:3004/health | jq  # core-wallet-service
curl -s http://localhost:3005/health | jq  # key-vault-service
curl -s http://localhost:3006/health | jq  # chain-indexer-service
curl -s http://localhost:3007/health | jq  # notification-service
curl -s http://localhost:3008/health | jq  # cron-worker-service

# Frontend apps (HTTPS via Traefik)
curl -s -o /dev/null -w "%{http_code}" https://admin.vaulthub.live   # 200
curl -s -o /dev/null -w "%{http_code}" https://portal.vaulthub.live  # 200

# API via Traefik
curl -s https://api.vaulthub.live/auth/health | jq
```

### 9. Check Logs for Errors

```bash
# Check all service logs for errors in the last 5 minutes
docker compose logs --since 5m 2>&1 | grep -i "error\|fatal\|exception" | head -50

# Check specific service logs
docker compose logs --since 5m admin-api
docker compose logs --since 5m chain-indexer-service
docker compose logs --since 5m key-vault-service
```

### 10. Verify Metrics and Monitoring

- [ ] Open Grafana (https://grafana.vaulthub.live) and check:
  - Service health dashboard: all services green
  - Error rate: no spike after deployment
  - Response latency: no degradation
  - Queue depths: stable or decreasing
- [ ] Check Prometheus targets: `http://localhost:9090/targets` -- all targets should be UP
- [ ] Verify Jaeger is receiving traces: https://jaeger.vaulthub.live

### 11. Test Critical Endpoints

```bash
# Auth: verify login works
curl -s -X POST https://api.vaulthub.live/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<test-user>","password":"<test-password>"}' | jq '.success'

# Admin API: verify health composite
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  https://api.vaulthub.live/admin/monitoring/health | jq

# Chain Indexer: verify sync status
curl -s http://localhost:3006/sync-health | jq '.chains[].status'
# All chains should be "healthy" or "degraded" (catching up)

# Key Vault: verify isolation (should FAIL -- no internet)
docker exec key-vault-service ping -c 1 google.com 2>&1 | head -1
# Expected: ping failure (network isolation confirmed)
```

### 12. Verify Key Vault Isolation

```bash
# Must FAIL (no internet from vault-net)
docker exec key-vault-service ping -c 1 google.com

# Must FAIL (no access to Redis directly)
docker exec key-vault-service ping -c 1 redis

# Must SUCCEED (vault-net peer: core-wallet-service)
docker exec key-vault-service ping -c 1 core-wallet-service
```

### 13. Monitor for 30 Minutes

- [ ] Watch queue depths: `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/admin/monitoring/queues | jq`
- [ ] Watch chain indexer sync status: no chains should be in `error` state
- [ ] Watch for webhook delivery failures
- [ ] Check gas tank balances: `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/admin/gas-tanks | jq`
- [ ] Verify no unexpected compliance alerts

---

## Rollback Procedure

If critical issues are discovered after deployment:

### Immediate Rollback (< 5 minutes)

```bash
ssh green@vaulthub.live
cd /docker/CryptoVaultHub

# 1. Revert to previous git commit
git log --oneline -5  # identify the previous good commit
git checkout <PREVIOUS_COMMIT_HASH>

# 2. Rebuild and redeploy
docker compose build
docker compose up -d --force-recreate

# 3. Verify health
docker compose ps
curl -s http://localhost:3001/health | jq
```

### Database Rollback (if migrations were applied)

```bash
# 1. Stop all services
docker compose stop admin-api client-api auth-service core-wallet-service \
  chain-indexer-service notification-service cron-worker-service

# 2. Restore database backups
mysql -h $MYSQL_HOST -u $MYSQL_USER -p cvh_keyvault < /docker/backups/db/cvh_keyvault_<TIMESTAMP>.sql
# Repeat for each affected database

# 3. Revert code and redeploy
git checkout <PREVIOUS_COMMIT_HASH>
docker compose build
docker compose up -d --force-recreate

# 4. Verify
docker compose ps
```

### Redis Rollback (if needed)

```bash
# 1. Stop Redis
docker compose stop redis

# 2. Replace dump.rdb with backup
docker compose cp /docker/backups/redis/dump-<TIMESTAMP>.rdb.gz redis:/data/dump.rdb.gz
docker compose exec redis gunzip /data/dump.rdb.gz

# 3. Restart Redis
docker compose start redis
```

### Post-Rollback Verification

- [ ] All health endpoints return 200
- [ ] No error spikes in logs
- [ ] Chain indexer sync status is healthy
- [ ] Queue depths are stable
- [ ] Announce rollback completion in team channel
- [ ] Create a post-mortem for the failed deployment

---

## Deployment Log Template

Record each deployment for audit:

```
Date:          YYYY-MM-DD HH:MM UTC
Deployer:      <name>
Branch/Commit: <branch> @ <short-hash>
Services:      <list of services affected>
Migrations:    <list of migration files applied, or "none">
Duration:      <minutes>
Status:        SUCCESS / ROLLBACK
Notes:         <any issues encountered>
```
