# CryptoVaultHub v2 -- Rollout Checklist

Step-by-step checklist for deploying CryptoVaultHub v2. Execute in order. Each step should be verified before proceeding to the next.

---

## Pre-Deployment

- [ ] **Notify the team** -- announce the maintenance window
- [ ] **Freeze deployments** -- no other changes during the rollout
- [ ] **Review this checklist** with at least one other engineer

---

## 1. Database Backup

- [ ] Backup `cvh_auth` database (full dump)
- [ ] Backup `cvh_keyvault` database (full dump, **encrypt the backup**)
- [ ] Backup `cvh_admin` database (full dump)
- [ ] Backup `cvh_wallets` database (full dump)
- [ ] Backup `cvh_transactions` database (full dump)
- [ ] Backup `cvh_compliance` database (full dump)
- [ ] Backup `cvh_notifications` database (full dump)
- [ ] Backup `cvh_indexer` database (full dump)
- [ ] Verify all backups are readable (test restore on a scratch instance)
- [ ] Store backups in a separate location from production

```bash
# Example backup command (run for each database)
mysqldump --single-transaction --routines --triggers \
  -h $MYSQL_HOST -u $MYSQL_USER -p \
  cvh_keyvault > backup_cvh_keyvault_$(date +%Y%m%d_%H%M%S).sql
```

---

## 2. Run Migrations 013-022

Execute v2 migrations in strict order. Each migration must succeed before running the next.

- [ ] Run migration 013 -- Create `cvh_jobs` and `cvh_exports` databases
- [ ] Run migration 014 -- Job queue tables (jobs, job_attempts, dead_letter_queue)
- [ ] Run migration 015 -- Export tables (export_requests, export_files)
- [ ] Run migration 016 -- Project tables (projects, project_members)
- [ ] Run migration 017 -- RPC provider tables (rpc_providers, rpc_health_checks)
- [ ] Run migration 018 -- Sync health tables (sync_health, block_gaps)
- [ ] Run migration 019 -- Address group tables (address_groups, address_group_chains)
- [ ] Run migration 020 -- Flush operation tables (flush_operations, flush_results)
- [ ] Run migration 021 -- Enhanced webhook tables (webhook retry config, batch resend)
- [ ] Run migration 022 -- Impersonation tables (impersonation_sessions, audit)
- [ ] Verify all migrations completed without errors

```bash
# Run migrations via the migration runner
cd database && ./migrate.sh -h $MYSQL_HOST -u $MYSQL_USER -p
```

**Rollback point:** If any migration fails, stop and investigate. Do NOT continue with partial migrations.

---

## 3. Verify Prisma Generation

- [ ] Run `npx prisma generate` for admin-api
- [ ] Run `npx prisma generate` for client-api
- [ ] Run `npx prisma generate` for auth-service
- [ ] Run `npx prisma generate` for core-wallet-service
- [ ] Run `npx prisma generate` for key-vault-service
- [ ] Run `npx prisma generate` for chain-indexer-service
- [ ] Run `npx prisma generate` for notification-service
- [ ] Run `npx prisma generate` for cron-worker-service

```bash
# Or run all at once via Turbo
npx turbo build --filter='./services/*'
```

- [ ] Verify no Prisma schema validation errors

---

## 4. Deploy New Services

- [ ] Build all Docker images

```bash
docker compose build --no-cache
```

- [ ] Deploy rpc-gateway-service container (new in v2)

```bash
docker compose up -d rpc-gateway-service
```

- [ ] Verify rpc-gateway-service health: `curl http://localhost:3009/rpc/health`
- [ ] Deploy updated versions of all existing services

```bash
docker compose up -d --build
```

- [ ] Wait for all containers to reach `healthy` status

```bash
docker compose ps
# All services should show (healthy)
```

---

## 5. Configure RPC Providers

- [ ] Add RPC providers via admin panel or API

```bash
# Example: Add Tatum as primary Ethereum provider
curl -X POST "http://localhost:3001/admin/rpc/providers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "name": "Tatum Ethereum",
    "url": "https://eth-mainnet.gateway.tatum.io/",
    "type": "http",
    "priority": 1,
    "rateLimit": 50
  }'
```

- [ ] Configure providers for all active chains
- [ ] Verify RPC health: `GET /admin/rpc/health`

---

## 6. Verify Health Checks

- [ ] `curl http://localhost:3001/health` -- admin-api returns 200
- [ ] `curl http://localhost:3002/health` -- client-api returns 200
- [ ] `curl http://localhost:3003/health` -- auth-service returns 200
- [ ] `curl http://localhost:3004/health` -- core-wallet-service returns 200
- [ ] `curl http://localhost:3005/health` -- key-vault-service returns 200
- [ ] `curl http://localhost:3006/health` -- chain-indexer-service returns 200
- [ ] `curl http://localhost:3007/health` -- notification-service returns 200
- [ ] `curl http://localhost:3008/health` -- cron-worker-service returns 200
- [ ] `GET /admin/monitoring/health` -- all services report healthy

---

## 7. Verify Core Functionality

### Test Project System

- [ ] Create a project for an existing client via `POST /admin/projects`
- [ ] Verify project appears in `GET /admin/projects`
- [ ] Verify default project backfill ran for existing clients

### Test Webhook Delivery

- [ ] Create a test webhook: `POST /client/v1/webhooks`
- [ ] Send a test ping: `POST /client/v1/webhooks/{id}/test`
- [ ] Verify delivery succeeded with new retry config
- [ ] Verify delivery history: `GET /client/v1/webhooks/{id}/deliveries`

### Test Flush Operations

- [ ] Execute a dry-run flush: `POST /client/v1/flush/dry-run`
- [ ] Verify gas estimation is reasonable
- [ ] Execute a single token flush on testnet first
- [ ] Verify deposit status updated to `swept`

### Test Indexer Sync

- [ ] Check sync status: `GET /admin/sync/status`
- [ ] Verify all chains are within acceptable lag (< 10 blocks)
- [ ] Check for gaps: `GET /admin/sync/gaps`
- [ ] If gaps found, trigger backfill: `POST /admin/sync/backfill`

### Test Export System

- [ ] Request a test export: `POST /admin/exports`
- [ ] Wait for export to complete: `GET /admin/exports/{id}`
- [ ] Download and verify export file: `GET /admin/exports/{id}/download`

### Test Impersonation

- [ ] Test read-only impersonation first:

```bash
curl -X POST "http://localhost:3003/auth/impersonate" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetUserId": 42, "mode": "read_only"}'
```

- [ ] Verify impersonated session has read-only access
- [ ] End impersonation: `POST /auth/impersonate/end`
- [ ] Verify audit log records the impersonation session

---

## 8. Monitor

- [ ] Open Grafana dashboards (http://localhost:3000)
- [ ] Verify Prometheus is scraping all targets (http://localhost:9090/targets)
- [ ] Check Loki for error logs (query: `{job="services"} |= "error"`)
- [ ] Verify Jaeger is receiving traces (http://localhost:16686)
- [ ] Monitor queue depths: `GET /admin/monitoring/queues`
- [ ] Monitor gas tank balances: `GET /admin/gas-tanks`
- [ ] Watch for the first 30 minutes after deployment for any anomalies

---

## 9. Post-Deployment Verification (T+1 hour)

- [ ] Verify deposits are being detected on all active chains
- [ ] Verify sweeps are executing (check `cvh_transactions.deposits` for recent `swept` status)
- [ ] Verify webhooks are being delivered (check `cvh_notifications.webhook_deliveries`)
- [ ] Verify no new compliance alerts that indicate false positives
- [ ] Verify queue depths are stable (not growing unbounded)
- [ ] Check Grafana for any error rate spikes

---

## 10. Post-Deployment Verification (T+24 hours)

- [ ] Verify daily reconciliation ran successfully (check chain-indexer-service logs)
- [ ] Verify sanctions list sync completed (check cron-worker-service logs)
- [ ] Review all compliance alerts generated in the last 24 hours
- [ ] Review webhook delivery failure rate (should be < 1%)
- [ ] Verify gas tank balances have not dropped below warning threshold
- [ ] Run a manual reconciliation on one chain to verify accuracy

---

## Rollback Plan

If critical issues are discovered after deployment:

### Severity: Service Crash / Data Corruption

1. **Stop all services immediately:** `docker compose down`
2. **Restore databases from backup** (taken in step 1)
3. **Redeploy previous version** of all services
4. **Verify restored state** matches pre-deployment
5. **Investigate root cause** before attempting re-deployment

### Severity: Feature Bug (Non-Critical)

1. **Identify affected feature** (e.g., flush operations not working)
2. **Disable the feature** via environment variable or config flag
3. **Continue operating** with v2 (minus the broken feature)
4. **Fix and redeploy** the specific service

### Severity: Performance Degradation

1. **Check queue depths** and identify bottleneck
2. **Scale affected service** (increase container resources or replicas)
3. **Check RPC provider health** (may need to switch providers)
4. **Check database slow query log** for new queries from v2 migrations

### Rollback Migrations

Database migrations 013-022 can be reversed with:

```sql
-- Only if needed -- these DROP statements are destructive
DROP DATABASE IF EXISTS cvh_jobs;
DROP DATABASE IF EXISTS cvh_exports;
-- Plus DROP TABLE for any tables added to existing databases
```

**Warning:** Rolling back migrations will lose any data created after the migration was applied. Only do this if the data is expendable (e.g., no real deposits were processed with the new schema).

---

## Contacts

| Role | Name | Availability |
|------|------|-------------|
| Platform Lead | (fill in) | During rollout |
| DBA | (fill in) | On-call |
| DevOps | (fill in) | During rollout |
| Security | (fill in) | On-call |
