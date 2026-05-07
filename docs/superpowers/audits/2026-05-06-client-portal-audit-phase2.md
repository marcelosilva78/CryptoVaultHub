# Phase 2 Runtime API Probes — Client Portal

**Date:** 2026-05-06
**Method:** Authenticated curl probes against `https://portal.vaulthub.live/api/proxy/...`
**Test user:** `wallet@grupogreen.org` (clientId=8, default project id=6998 BrPay)

## Endpoints OK

- `/v1/projects` — 200, returns `{success, projects[]}` with valid project list
- `/v1/gas-tanks` — 200, returns the gas tank
- `/v1/gas-tanks/56/history` — 200, total=0, rows=[] (empty as expected post-deploy)
- `/v1/gas-tanks/56/topup-uri` — 200 (cosmetic: missing `chainId` field)
- `/v1/gas-tanks/56/alert-config` — 200
- `/v1/wallets` — 200
- `/v1/deposits`, `/v1/withdrawals` (response only), `/v1/exports` — 200 but **silently masking downstream errors**
- `/v1/projects/:id/deletion-impact` — 200 (shape mismatch confirmed)
- `/v1/projects/:id/deploy/traces` — 200
- `/v1/knowledge-base` — 200
- `/v1/security/settings` — 200
- `/v1/chains` — 200
- `/v1/address-groups`, `/v1/notifications/rules`, `/v1/webhooks` — 200

## Endpoints BROKEN

### CRITICAL — wrong upstream URL in client-api

**B1. `/v1/co-sign/pending` → 404**
client-api `co-sign.service.ts:35` proxies to `${keyVaultUrl}/co-sign/pending`. The actual handler is `core-wallet-service/src/co-sign/co-sign.controller.ts` at `@Controller('co-sign') @Get('pending')`. Wrong service URL.

**B2. `/v1/addresses` → 404**
client-api `address-book.service.ts:37` proxies to `${coreWalletUrl}/address-book`. **No such controller exists in core-wallet-service.** The `WhitelistedAddress` Prisma model exists, but no controller/service/module exposes it. Entire address-book feature is broken end-to-end.

**B3. `/v1/wallets/:chainId/balances` → 200 with empty `balances:[]`**
Log: `WalletService: No balances data available for chain 56 (endpoint not found in downstream service)`. core-wallet-service is missing the `/wallets/:clientId/:chainId/balances` route. Dashboard, wallets page, withdrawals page all show empty balances.

**B4. `/v1/withdrawals` → 200 with empty `withdrawals:[]`**
Log: `WithdrawalService Failed to fetch withdrawals: Request failed with status code 500`. core-wallet-service `/withdrawals` endpoint returns 500. Errors swallowed.

**B5. `/v1/exports` → 200 with empty `exports:[]`**
Log: `ExportApiService Failed to list exports: Request failed with status code 404`. Downstream `/exports` route missing.

**B6. `/v1/security/2fa-status` → 404**
client-api proxies to `auth-service /users/:id/2fa-status` — auth-service doesn't have this route.

**B7. `/v1/security/shamir-shares` → 404**
client-api proxies to `key-vault-service /keys/:id/shamir-status` — key-vault-service doesn't have this route.

**B8. deletion-impact: webhooks + api-keys count silently fail**
Log: `Failed to count webhooks for project 6998, defaulting to 0` / `Failed to count API keys ... defaulting to 0`. Counts always 0.

### Confirmed from Phase 1

**B9. `/v1/co-sign/pending`** — frontend GET, backend POST (also has B1 above). Two-bug compound.

**B10. `/v1/notifications/rules/:id`** — frontend PATCH, backend PUT → 404.

**B11. `/v1/addresses` POST/DELETE** — even if B2 fixed, missing X-2FA-Code header (frontend doesn't send).

**B12. `/v1/address-groups/:groupUid/provision`** — MISSING handler entirely.

**B13. Shape mismatches:** `/v1/projects` extra fields, `/v1/projects/:id/deletion-impact` 9 field renames, project-context `chainIds`.

## Triage

### HOT — fix this session
B1, B2, B4 (investigate), B5 (investigate), B9, B10, B11, B12, B13 (deletion-impact rename), gas-tank history UI note

### MEDIUM — fix if time
B3, B6, B7, B8

### COSMETIC — defer
gas-tanks/:chainId/topup-uri chainId field, project-context.tsx chainIds

## Next steps

Phase 3 Playwright deferred — most findings are static API contract issues better fixed first. Will run Playwright as post-fix verification.
