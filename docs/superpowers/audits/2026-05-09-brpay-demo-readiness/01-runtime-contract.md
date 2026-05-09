# CryptoVaultHub Client-API — Complete Runtime Contract

> **Source of truth:** `services/client-api/src` — read direct from controllers, guards, decorators, DTOs.
> **Generated:** 2026-05-09 (BrPay demo readiness audit).
> **Total endpoints:** 81 across 20 functional groups.
> **Service base path:** All routes prefixed `/client/v1/*`. Production base URL: `https://api.vaulthub.live`.
> **Global ValidationPipe** (`main.ts:17-22`): `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

---

## Section A — Endpoint Inventory (81 endpoints)

### Group 1 — Health / Public (no auth)

| # | Method + Path | Auth | Scopes | Notes |
|---|---|---|---|---|
| 1 | `GET /client/v1/health` | public | none | `{ success, status:"ok", service, timestamp }` |
| 2 | `GET /client/v1/tokens` (HealthController) | **public** | none | ⚠ **Route conflict** with `TokenController` — see Section D anomaly #1 |

### Group 2 — API Keys (JWT-only, self-service)

| # | Method + Path | Auth | Scopes | Body / Path |
|---|---|---|---|---|
| 3 | `GET /client/v1/api-keys` | JWT (PortalAuth) | none (clientId from JWT) | — |
| 4 | `POST /client/v1/api-keys` | JWT | none | `CreateApiKeyDto`: projectId, scopes[], label?, ipAllowlist?, allowedChains?, expiresAt? |
| 5 | `DELETE /client/v1/api-keys/:id` | JWT | none | id (int) |

`JwtOnlyAuthGuard.canActivate()` (`jwt-only-auth.guard.ts:34-37`) **explicitly throws 401 if `X-API-Key` header is present** — confirmed privilege escalation block. Bypasses `TierRateLimitGuard`.

### Group 3 — Wallets

| # | Method + Path | Scopes |
|---|---|---|
| 6 | `GET /client/v1/wallets` | `wallets:read` |
| 7 | `GET /client/v1/wallets/:chainId/balances` | `wallets:read` |

### Group 4 — Deposits

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 8 | `POST /client/v1/wallets/:chainId/deposit-address` | `forwarders:create` | + ProjectChainReadyGuard. Body: `externalId` (≤64), `label?`, `callbackUrl?`. Idempotent via `externalId` (deterministic CREATE2 salt). |
| 9 | `POST /client/v1/wallets/:chainId/deposit-addresses/batch` | `forwarders:create` | Body: `count` (1-100), `labelPrefix?` |
| 10 | `GET /client/v1/deposit-addresses` | `deposits:read` | page, limit |
| 11 | `GET /client/v1/deposits` | `deposits:read` | status enum, chainId, fromDate, toDate |
| 12 | `GET /client/v1/deposits/:id` | `deposits:read` | — |

### Group 5 — Withdrawals

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 13 | `POST /client/v1/withdrawals` | `withdrawals:hot` OR `withdrawals:gas-tank` (guard accepts either; **handler enforces exact match against `dto.sourceWallet`**) | + ProjectChainReadyGuard. `idempotencyKey` field in body, 30-day validity |
| 14 | `GET /client/v1/withdrawals` | `withdrawals:read` | 10-value status enum |
| 15 | `POST /client/v1/withdrawals/:id/approve` | `withdrawals:hot` OR `withdrawals:gas-tank` | ⚠ no in-handler discriminator — see anomaly #4 |
| 16 | `GET /client/v1/withdrawals/:id` | `withdrawals:read` | — |

`withdrawal.controller.ts:183-191`:
```ts
const required = dto.sourceWallet === 'gas_tank'
  ? 'withdrawals:gas-tank'
  : 'withdrawals:hot';
```

### Group 6 — Gas Tanks

| # | Method + Path | Scopes |
|---|---|---|
| 17 | `GET /client/v1/gas-tanks` | `gas-tanks:read` |
| 18 | `GET /client/v1/gas-tanks/:chainId/history` | `gas-tanks:read` |
| 19 | `GET /client/v1/gas-tanks/:chainId/topup-uri` | `gas-tanks:read` |
| 20 | `GET /client/v1/gas-tanks/:chainId/alert-config` | `gas-tanks:read` |
| 21 | `POST /client/v1/gas-tanks/:chainId/export-keystore` | `gas-tanks:write` |
| 22 | `PATCH /client/v1/gas-tanks/:chainId/alert-config` | `gas-tanks:write` |

### Group 7 — Flush

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 23 | `POST /client/v1/flush` | `forwarders:flush` | ⚠ projectId may be undefined (anomaly #3) |
| 24 | `GET /client/v1/flush/:id` | `forwarders:read` | — |
| 25 | `GET /client/v1/flush` | `forwarders:read` | — |

### Group 8 — Webhooks

| # | Method + Path | Scopes |
|---|---|---|
| 26 | `POST /client/v1/webhooks` | `webhooks:write` |
| 27 | `GET /client/v1/webhooks` | `webhooks:read` |
| 28 | `PATCH /client/v1/webhooks/:id` | `webhooks:write` |
| 29 | `DELETE /client/v1/webhooks/:id` | `webhooks:write` |
| 30 | `POST /client/v1/webhooks/:id/test` | `webhooks:write` |
| 31 | `GET /client/v1/webhooks/:id/deliveries` | `webhooks:read` |
| 32 | `POST /client/v1/webhooks/deliveries/:id/retry` | `webhooks:write` |
| 33 | `GET /client/v1/webhooks/deliveries/:deliveryId` | `webhooks:read` |
| 34 | `POST /client/v1/webhooks/deliveries/:deliveryId/resend` | `webhooks:write` |
| 35 | `GET /client/v1/webhooks/dead-letters` | `webhooks:read` |

### Group 9 — Address Book (2FA gated on writes)

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 36 | `POST /client/v1/addresses` | `address-book:write` | `X-2FA-Code` required if 2FA on. 24h cooldown |
| 37 | `GET /client/v1/addresses` | `address-book:read` | — |
| 38 | `PATCH /client/v1/addresses/:id` | `address-book:write` | label/notes only |
| 39 | `DELETE /client/v1/addresses/:id` | `address-book:write` | `X-2FA-Code` required if 2FA on |

### Group 10 — Address Groups

| # | Method + Path | Scopes |
|---|---|---|
| 40 | `POST /client/v1/address-groups` | `address-groups:write` |
| 41 | `GET /client/v1/address-groups` | `address-groups:read` |
| 42 | `GET /client/v1/address-groups/:id` | `address-groups:read` |
| 43 | `POST /client/v1/address-groups/:groupUid/provision` | `address-groups:write` |

### Group 11 — Co-Sign

| # | Method + Path | Scopes |
|---|---|---|
| 44 | `GET /client/v1/co-sign/pending` | `co-sign:read` |
| 45 | `POST /client/v1/co-sign/:operationId/sign` | `co-sign:write` |

### Group 12 — Security

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 46 | `GET /client/v1/security/settings` | `security:read` | — |
| 47 | `GET /client/v1/security/2fa-status` | `security:read` | — |
| 48 | `PATCH /client/v1/security/custody-mode` | `security:write` | — |
| 49 | `POST /client/v1/security/safe-mode` | `security:write` | ⚠ **IRREVERSÍVEL on-chain** |
| 50 | `GET /client/v1/security/shamir-shares` | `security:read` | — |

### Group 13 — Projects (read)

| # | Method + Path | Scopes |
|---|---|---|
| 51 | `GET /client/v1/projects` | `projects:read` |
| 52 | `GET /client/v1/projects/current` | `projects:read` |
| 53 | `GET /client/v1/projects/:id` | `projects:read` |

### Group 14 — Project Setup

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 54 | `POST /client/v1/projects/setup` | `project-setup:write` | name, description?, chains[], custodyMode |
| 55 | `POST /client/v1/projects/:id/keys` | `project-setup:write` | mnemonic returned **once** |
| 56 | `POST /client/v1/projects/:id/confirm-seed` | `project-setup:write` | irrevocable |
| 57 | `GET /client/v1/projects/:id/gas-check` | `project-setup:read` | — |
| 58 | `POST /client/v1/projects/:id/deploy` | `project-setup:write` | ⚠ **gas real, deploya 5 contratos/chain** |
| 59 | `GET /client/v1/projects/:id/deploy/status` | `project-setup:read` | — |
| 60 | `GET /client/v1/projects/:id/deploy/traces` | `project-setup:read` | — |
| 61 | `GET /client/v1/projects/:id/export` | `project-setup:read` | full project JSON |
| 62 | `GET /client/v1/projects/:id/deploy/traces/:chainId` | `project-setup:read` | — |
| 63 | `GET /client/v1/projects/:id/deletion-impact` | `project-setup:read` | — |
| 64 | `DELETE /client/v1/projects/:id` | `project-setup:write` | — |
| 65 | `POST /client/v1/projects/:id/cancel-deletion` | `project-setup:write` | — |

### Group 15 — Notification Rules

| # | Method + Path | Scopes |
|---|---|---|
| 66 | `GET /client/v1/notifications/rules` | `notifications:read` |
| 67 | `POST /client/v1/notifications/rules` | `notifications:write` |
| 68 | `PUT /client/v1/notifications/rules/:id` | `notifications:write` |
| 69 | `DELETE /client/v1/notifications/rules/:id` | `notifications:write` |

### Group 16 — Chains

| # | Method + Path | Scopes |
|---|---|---|
| 70 | `GET /client/v1/chains` | `chains:read` |

### Group 17 — Tokens

| # | Method + Path | Scopes | Notes |
|---|---|---|---|
| 71 | `GET /client/v1/tokens` (TokenController) | `tokens:read` | ⚠ Conflito com #2 |
| 72 | `GET /client/v1/tokens/:chainId` | `tokens:read` | — |

### Group 18 — Knowledge Base

| # | Method + Path | Scopes |
|---|---|---|
| 73 | `GET /client/v1/knowledge-base` | `kb:read` |
| 74 | `GET /client/v1/knowledge-base/categories` | `kb:read` |
| 75 | `GET /client/v1/knowledge-base/slug/:slug` | `kb:read` |

### Group 19 — Deploy Traces

| # | Method + Path | Scopes |
|---|---|---|
| 76 | `GET /client/v1/deploy-traces` | `deploy-trace:read` |
| 77 | `GET /client/v1/deploy-traces/:id` | `deploy-trace:read` |

### Group 20 — Exports

| # | Method + Path | Scopes |
|---|---|---|
| 78 | `POST /client/v1/exports` | `export:read` |
| 79 | `GET /client/v1/exports` | `export:read` |
| 80 | `GET /client/v1/exports/:id` | `export:read` |
| 81 | `GET /client/v1/exports/:id/download` | `export:read` |

---

## Section B — Scope Catalog (31 granular scopes)

Source: `services/client-api/src/common/scopes/scope-catalog.ts`.

| Scope | Used by |
|---|---|
| `wallets:read` | wallets list/balances |
| `wallets:create` | ⚠ **defined but unused** — reserved |
| `forwarders:read` | flush list/detail |
| `forwarders:create` | deposit-address create + batch |
| `forwarders:flush` | POST /flush |
| `address-book:read` | list addresses |
| `address-book:write` | add / update / delete address |
| `address-groups:read` | list / detail |
| `address-groups:write` | create / provision |
| `withdrawals:read` | list / detail |
| `withdrawals:hot` | POST withdrawal (sourceWallet=hot or default) + approve |
| `withdrawals:gas-tank` | POST withdrawal (sourceWallet=gas_tank) + approve |
| `webhooks:read` | list / deliveries / dead-letters |
| `webhooks:write` | create / update / delete / test / retry / resend |
| `deposits:read` | list / detail / list deposit-addresses |
| `tokens:read` | tokens list / by chain |
| `chains:read` | GET /chains |
| `gas-tanks:read` | list / history / topup-uri / alert-config |
| `gas-tanks:write` | export-keystore / update alert-config |
| `co-sign:read` | pending list |
| `co-sign:write` | sign |
| `projects:read` | list / current / detail |
| `project-setup:read` | gas-check / deploy status / traces / export / deletion-impact |
| `project-setup:write` | setup / keys / confirm-seed / deploy / delete / cancel-deletion |
| `notifications:read` | list rules |
| `notifications:write` | create / update / delete rules |
| `security:read` | settings / 2fa-status / shamir-shares |
| `security:write` | custody-mode / safe-mode |
| `deploy-trace:read` | list / detail |
| `kb:read` | list / categories / slug |
| `export:read` | create / list / detail / download |

### Macro expansion (`scope-catalog.ts:43-85`)

- **`read`** → all 18 `*:read` scopes
- **`write`** → `wallets:create`, `forwarders:create`, `forwarders:flush`, `address-book:write`, `address-groups:write`, `webhooks:write`, `gas-tanks:write`, `co-sign:write`, `project-setup:write`, `notifications:write`, `security:write`, `export:read`
- **`withdraw`** → `withdrawals:hot`, `withdrawals:gas-tank`

`isGranularScope()` rejects macro strings on **self-service key creation** (`POST /client/v1/api-keys`). Legacy keys still work via `expandLegacyScopes()` at validation time in `ApiKeyAuthGuard.checkScopes()`.

---

## Section C — Auth & Security

### Auth path (`api-key-auth.guard.ts`)
1. `canActivate()` line 40 — checks `X-API-Key` first, then `Authorization: Bearer`
2. `validateApiKey()` line 165 — POSTs `{ apiKey, ip: requestIp }` to `${AUTH_SERVICE_URL}/auth/api-keys/validate` with `X-Internal-Service-Key`
3. CIDR/IP allowlist enforcement is **delegated to auth-service** — client-api just forwards request IP and trusts `valid:false`
4. Scope expansion at line 143 (legacy macros → granular)
5. JWT fallback lines 50-56 — portal users get role-mapped scopes (`owner` → `[read,write,admin]`, `admin` → `[read,write]`, `viewer` → `[read]`); macros expanded at check time

### JWT-only gate (`jwt-only-auth.guard.ts`)
- Line 34-37: if `x-api-key` header present → 401 "This endpoint requires portal session auth, not API key auth"
- Applied via `@PortalAuth()` on `/client/v1/api-keys/*` only
- Bypasses `TierRateLimitGuard`

### Project scope (`project-scope.guard.ts`)
- Fast path: if api-key has `project_id`, used directly; DB lookup skipped
- Slow path: `X-Project-Id` header validated against client; or auto-select if exactly 1 active project; 400 with project list if multiple

### `ProjectChainReadyGuard`
- Applied on `POST /wallets/:chainId/deposit-address` and `POST /withdrawals`
- Validates project has deployed contracts on target chainId

---

## Section D — Anomalies & E2E Risks

### Anomaly #1 — Route shadowing on `GET /client/v1/tokens` 🚨 **SECURITY**

`HealthController` registers `@Get('tokens')` (public, no guard, falls back to empty array on error) AND `TokenController` registers `@Get()` on `@Controller('client/v1/tokens')` (requires `tokens:read`). NestJS uses whichever controller is registered first in the module. **If the unauthenticated `HealthController` version wins, anyone can list tokens without a key.**

**Action:** verify which one resolves at runtime via real request, then remove the duplicate.

### Anomaly #2 — `POST /withdrawals/:id/approve` lacks discriminator
Guard accepts either `withdrawals:hot` OR `withdrawals:gas-tank`, but the handler doesn't enforce that the approver's scope matches the withdrawal's `sourceWallet`. **A key with only `withdrawals:hot` can approve gas-tank withdrawals and vice-versa.**

### Anomaly #3 — `FlushController` reads `req.projectId` without `@ClientAuthWithProject()`
Uses bare `@ClientAuth('forwarders:flush')`. If api-key has no `project_id` and `X-Project-Id` header absent, `projectId === undefined` is passed to service. Latent bug, may surface as multi-project clients.

### Anomaly #4 — `wallets:create` defined but unused
Reserved for future. Issuing keys without it is safe today.

### Anomaly #5 — `audit_logs` export type in DTO but not in Swagger description
`export.dto.ts:20` accepts it, `export.controller.ts:33-46` doesn't mention it.

### High-risk endpoints in mainnet E2E

| Endpoint | Risk | Why |
|---|---|---|
| `POST /withdrawals` | HIGH | Real funds, real gas. Use idempotencyKey or skip in mainnet |
| `POST /projects/:id/deploy` | HIGH | Deploys 5 contracts/chain — real gas |
| `POST /security/safe-mode` | **CRITICAL** | Irreversível on-chain. **Nunca** em automação |
| `POST /projects/:id/confirm-seed` | MEDIUM | One-way flag |
| `DELETE /projects/:id` | HIGH | Inicia deletion grace period |
| `POST /address-groups/:groupUid/provision` | MEDIUM | Provisioning on-chain |
| `POST /co-sign/:operationId/sign` | HIGH | Broadcast pipeline |
| `POST /flush` | MEDIUM | Sweep on-chain — gás do gas tank |

### Idempotency
Only `POST /withdrawals` accepts `idempotencyKey` (body field, not header). 30-day validity. 409 on field conflict.

### 2FA
`POST/DELETE /addresses` checks via `securityService.get2faStatus()`. **Fail-safe:** if auth-service unreachable, treats 2FA as enabled (line 69-72).

### Rate limits
- 2 buckets: global (per-second) + endpoint (per-minute)
- Tier defaults: Starter 60/s, Business 300/s, Enterprise 1000/s
- Headers on every authenticated response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429: `Retry-After`
- JWT-only routes bypass entirely
