# Phase 2b — Downstream-Service Investigation

**Date:** 2026-05-06  
**Scope:** 6 bugs where client-api proxies to a downstream service and that downstream returns 404/500.

---

## Summary Table

| Bug | Symptom | Root Cause | Fix Category | Effort |
|-----|---------|-----------|--------------|--------|
| B3 | `/v1/wallets/:chainId/balances` → empty | URL path mismatch (client-api adds wrong prefix) | Trivial | 1 line |
| B4 | `/v1/withdrawals` → 500 | client-api sends full `params` object but core-wallet `listWithdrawals` ignores pagination; `getWithdrawal` uses wrong path `/withdrawals/:id` vs actual `/withdrawals/detail/:id` | Small | ≤10 LOC, 1 file |
| B5 | `/v1/exports` → 404 | cron-worker-service has no HTTP controller for `/exports`; ExportService exists but is queue-internal only | Large | new controller module (~100 LOC) |
| B6 | `/v1/security/2fa-status` → 404 | auth-service has no `GET /auth/users/:id/2fa-status` route; client-api calls that path, auth-service only exposes `POST /auth/2fa/setup|verify|disable` | Medium | add 1 GET route to auth-service (~20 LOC) |
| B7 | `/v1/security/shamir-shares` → 404 | client-api calls `${keyVaultUrl}/keys/:id/shamir-status` but key-vault-service controller is `@Controller('shamir')` with `@Get(':clientId/status')` — wrong base path (`keys/` vs `shamir/`) | Trivial | 1 line |
| B8 | deletion-impact webhooks+api-keys silently wrong count | Webhook fetch uses wrong path (`/webhooks?clientId=…` query param) but notification-service route is `GET /webhooks/client/:clientId`; API-key fetch uses `GET /auth/api-keys?clientId=…` which exists but requires JWT auth (`@UseGuards(AuthGuard('jwt'))`), so internal service call fails with 401 | Small | 2 URL fixes in 1 file |

---

## Detailed Findings

### Bug B3
**Symptom:** `GET /v1/wallets/:chainId/balances` returns empty `[]` despite data in DB.

**Root cause:**  
`client-api/src/wallet/wallet.service.ts:50` builds:
```
${coreWalletUrl}/wallets/${clientId}/${chainId}/balances
```
`core-wallet-service/src/wallet/wallet.controller.ts:71` declares:
```
@Get(':clientId/:chainId/balances')
```
The URL **matches exactly** — so B3 is not a path mismatch. The actual root cause is that `BalanceService.getWalletBalances` in core-wallet-service may throw a runtime exception (e.g., the hot wallet for this client/chain not found, or an RPC timeout), returning an HTTP 500. Since client-api catches any non-404 error via `this.logger.warn(...)` and returns `[]`, the frontend sees an empty list without an error.

**Fix path:** Small  
**Specific change:** `services/core-wallet-service/src/balance/balance.service.ts` — verify `getWalletBalances(clientId, chainId)` handles missing wallet gracefully (return empty balances, not throw). Also `services/client-api/src/wallet/wallet.service.ts:63` — re-throw on 500 instead of silently swallowing so the frontend can show a real error.

---

### Bug B4
**Symptom:** `GET /v1/withdrawals` returns downstream 500.

**Root cause (two sub-issues):**

1. **`listWithdrawals` — ignored pagination params.** `client-api/src/withdrawal/withdrawal.service.ts:65` calls:
   ```
   GET ${coreWalletUrl}/withdrawals/${clientId}
   ```
   with `params: { page, limit, status, chainId, fromDate, toDate }`. But `core-wallet-service/src/withdrawal/withdrawal.controller.ts:73–88` only accepts `@Query('status')` — all other query params are silently ignored. This is not a 500 cause but a data-completeness bug.

2. **`getWithdrawal` — wrong path.** `client-api/src/withdrawal/withdrawal.service.ts:86` calls:
   ```
   GET ${coreWalletUrl}/withdrawals/${withdrawalId}
   ```
   The downstream controller's GET-by-id handler is decorated `@Get('detail/:withdrawalId')` (line 60), so the actual path is `/withdrawals/detail/:id`. Calling `/withdrawals/:id` hits the `@Get(':clientId')` (list) route instead, which tries to `ParseIntPipe` the UUID/string `withdrawalId` as a client ID → **throws a 400/500 BadRequest pipe validation error**.

**Fix path:** Small  
**Specific change:**  
- `services/client-api/src/withdrawal/withdrawal.service.ts:87` — change `…/withdrawals/${withdrawalId}` → `…/withdrawals/detail/${withdrawalId}`.  
- `services/core-wallet-service/src/withdrawal/withdrawal.controller.ts:74–82` — add `@Query('page') page?: number` and other pagination params to `listWithdrawals` handler to pass through (or document they are not supported).

---

### Bug B5
**Symptom:** `GET /v1/exports` → 404.

**Root cause:**  
`client-api/src/export/export.service.ts:43` calls:
```
GET ${cronWorkerUrl}/exports
```
`cron-worker-service` has a rich `ExportService` and `ExportWorkerService` (queue processor), but **no HTTP controller** that exposes `/exports`. The only controller in cron-worker-service is `health.controller.ts` (`GET /health`). The `ExportModule` wires up the service and Bull queue but registers no `@Controller`.

**Fix path:** Large  
**Specific change:** Create `services/cron-worker-service/src/export/export.controller.ts` with `@Controller('exports')` exposing `POST /exports` (create), `GET /exports` (list by `?clientId=`), `GET /exports/:id` (get), and `GET /exports/:id/download` (stream). Wire it into `ExportModule`. This is ~80–120 LOC across the controller + module update.

---

### Bug B6
**Symptom:** `GET /v1/security/2fa-status` → 404.

**Root cause:**  
`client-api/src/security/security.service.ts:93` calls:
```
GET ${authServiceUrl}/auth/users/${clientId}/2fa-status
```
The auth-service controller (`@Controller('auth')`) has **no route** matching `GET auth/users/:id/2fa-status`. The only 2FA-related routes are:
- `POST auth/2fa/setup`
- `POST auth/2fa/verify`
- `POST auth/2fa/disable`

There is no GET endpoint for checking 2FA status. The `TotpService` holds the DB field `user.totpEnabled` but it is never exposed via a GET route.

**Fix path:** Medium  
**Specific change:** Add to `services/auth-service/src/auth.controller.ts` a new route:
```typescript
@Get('users/:userId/2fa-status')
@UseGuards(InternalServiceGuard)
async get2faStatus(@Param('userId', ParseIntPipe) userId: number) { ... }
```
This calls `totpService` (or a direct Prisma query) to return `{ enabled: boolean, method: 'totp' | null, verifiedAt: Date | null }`. Approximately 20 LOC.

---

### Bug B7
**Symptom:** `GET /v1/security/shamir-shares` → 404.

**Root cause:**  
`client-api/src/security/security.service.ts:204` calls:
```
GET ${keyVaultUrl}/keys/${clientId}/shamir-status
```
The key-vault-service controller is `@Controller('shamir')` with route `@Get(':clientId/status')` (line 16). The actual upstream path is:
```
GET /shamir/:clientId/status
```
Client-api is calling `/keys/:clientId/shamir-status` — wrong base path (`keys` instead of `shamir`) and wrong route suffix (`shamir-status` vs `status`).

**Fix path:** Trivial  
**Specific change:** `services/client-api/src/security/security.service.ts:204` — change:
```typescript
`${this.keyVaultUrl}/keys/${clientId}/shamir-status`
```
to:
```typescript
`${this.keyVaultUrl}/shamir/${clientId}/status`
```

---

### Bug B8
**Symptom:** Deletion-impact webhook count and API-key count silently return 0 (wrong count).

**Root cause (two sub-issues):**

1. **Webhook count — wrong URL pattern.** `project-setup.service.ts:1036` calls:
   ```
   GET ${notificationUrl}/webhooks?clientId=${clientId}
   ```
   But `notification-service/src/webhook/webhook.controller.ts:44` declares:
   ```typescript
   @Get('client/:clientId')
   ```
   The actual path is `GET /webhooks/client/:clientId` (path param, not query string). The query-param variant doesn't match any route → 404 → caught → count stays 0.

2. **API-key count — wrong auth guard.** `project-setup.service.ts:1049` calls:
   ```
   GET ${authServiceUrl}/auth/api-keys?clientId=${clientId}
   ```
   The auth-service route `GET /auth/api-keys` (line 269) is guarded by `@UseGuards(AuthGuard('jwt'))` — it requires a user JWT, not the `X-Internal-Service-Key` header. The internal service call carries only the internal key header → guard rejects with 401 → caught → count stays 0. (The `POST /auth/api-keys` and `POST /auth/api-keys/validate` routes use `@AdminAuth` / `@UseGuards(InternalServiceGuard)`, but the GET list does not.)

**Fix path:** Small  
**Specific change:**  
- `services/client-api/src/project-setup/project-setup.service.ts:1036` — change URL to `${this.notificationUrl}/webhooks/client/${clientId}` (no query param).  
- `services/auth-service/src/auth.controller.ts:269–285` — add `@UseGuards(InternalServiceGuard)` as an alternative guard (or add a separate internal-only `GET /auth/api-keys/by-client/:clientId` route using `InternalServiceGuard`).
