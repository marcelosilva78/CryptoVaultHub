# Dynamic Kong Rate Limiting — Implementation Guide

## Current State
Kong uses static rate limits defined in `infra/kong/kong.yml`:
- admin-api: 50 req/sec
- client-api: 100 req/sec
- auth-service: 10 req/sec

These are **edge-layer safety nets** only. Per-client, tier-aware rate limiting
is already enforced at the application layer by `TierRateLimitGuard` in
client-api (Redis sliding-window, reads from `cvh_admin.tiers`).

Kong runs in **DB-less / declarative mode** (`KONG_DATABASE=off`), which means
consumers cannot be created dynamically via the Admin API without switching to
a database-backed deployment.

## Target State
Rate limits should be dynamically configured per client tier from the
`cvh_admin.tiers` table, enforced at the Kong edge before requests reach
backend services.

## Implementation Approach

### Option A: Kong Admin API Sync (Recommended)
Requires switching Kong to **database mode** (PostgreSQL).

1. Add a `TierSyncService` in admin-api
2. On tier update, call Kong Admin API to update the rate-limiting plugin config
3. Kong Admin API: `PATCH /services/{service}/plugins/{plugin_id}`
4. Use consumer-level rate limiting (Kong consumer = client API key)
5. Register each client API key as a Kong consumer via
   `POST /consumers` + `POST /consumers/{consumer}/key-auth`

### Option B: Custom Plugin
Write a Kong plugin (Lua or Go) that reads tier config from Redis on each
request. This avoids the DB-mode requirement but adds plugin maintenance
overhead and a Redis dependency inside Kong's hot path.

### Option C: Keep Application-Layer Only (Current)
The existing `TierRateLimitGuard` already provides per-client, per-endpoint
rate limiting with tier overrides. Kong's static limits serve as a DDoS
safety net. This may be sufficient for current scale.

## Prerequisites (Options A & B)
- Kong must be accessible on its Admin API port (8001) from admin-api
- Consumer mapping: each client's API key must be registered as a Kong consumer
- Plugin must use `config.consumer` targeting, not `config.service`
- For Option A: migrate Kong from declarative to database mode

## Migration Steps (Option A)
1. Deploy PostgreSQL for Kong (or use the existing MySQL cluster via `pg_kong` bridge)
2. Import current declarative config into Kong DB: `kong config db_import kong.yml`
3. Create Kong consumers for each existing client API key
4. Configure per-consumer rate-limiting plugins
5. Build admin-api `TierSyncService` to keep consumers/plugins in sync
6. Test with staging clients before production cutover

## Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| — | Pending | Evaluate whether application-layer enforcement (Option C) is sufficient at current scale before investing in Kong DB migration |
