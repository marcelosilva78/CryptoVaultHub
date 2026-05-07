# Phase 1 Static Contract Audit — Client Portal Frontend ↔ Backend API

**Date:** 2026-05-06
**Method:** Static read-only analysis — no source code modified
**Proxy path:** Frontend `clientFetch('/v1/...')` → `/api/proxy/v1/...` → `http://localhost:3002/client/v1/...` → NestJS `@Controller('client/v1/...')`

## Legend

| Status | Meaning |
|---|---|
| MATCH | Path, method, and payload shape all agree |
| MISSING | Backend endpoint does not exist |
| METHOD_MISMATCH | Path exists, wrong HTTP verb |
| SHAPE_MISMATCH | Path + method match, request/response field names differ |
| SCOPE_MISMATCH | Endpoint exists but frontend omits a required header/scope |

## Summary

| Status | Count |
|---|---|
| MATCH | 38 |
| SHAPE_MISMATCH | 4 |
| METHOD_MISMATCH | 2 |
| SCOPE_MISMATCH | 1 |
| MISSING | 1 |
| **Total broken** | **8** |

## Top 5 HOT Findings (severity order)

### 1. `co-sign/page.tsx:250` — METHOD_MISMATCH (CRITICAL)
Frontend `clientFetch('/v1/co-sign/pending', { method: 'GET' })`. Backend `co-sign.controller.ts` declares `@Post('pending') @HttpCode(HttpStatus.OK)`. GET → POST-only route returns **405 Method Not Allowed**. Co-sign page is completely broken on every load.

### 2. `addresses/page.tsx:61,72` — SCOPE_MISMATCH (CRITICAL)
Backend `@Post()` and `@Delete(':id')` call `verify2fa(req)` which reads `X-2FA-Code` header. Frontend never sends it. Every attempt to add/delete a whitelist address returns **403 Forbidden**.

### 3. `address-groups/page.tsx:193` — MISSING (CRITICAL)
Frontend `POST /v1/address-groups/:groupUid/provision`. Backend has only `@Get()`, `@Post()`, `@Get(':id')` — no provision route. Provision Chain button always **404 Not Found**.

### 4. `projects/page.tsx:295` — SHAPE_MISMATCH (HIGH)
`GET /v1/projects/:id/deletion-impact` — frontend reads `deposits/withdrawals/wallets/webhooks/apiKeys/balances[].chain/amount/symbol/gracePeriodDays/scheduledFor/immediate`. Backend returns `depositCount/withdrawalCount/walletCount/webhookCount/apiKeyCount/hasNonZeroBalance/balances[].chainId/address/balanceFormatted`. Nine fields with different names → all counters show 0 in deletion modal.

### 5. `notifications/page.tsx:304` — METHOD_MISMATCH (HIGH)
Frontend `PATCH /v1/notifications/rules/:id`. Backend `@Put(':id')`. NestJS does not alias PUT for PATCH → **404**. Toggle-enable for notification rules silently broken.

## Secondary

### `projects/page.tsx:25-31` — SHAPE_MISMATCH
`GET /v1/projects` never returns `chainsCount`, `walletsCount`, `deletionRequestedAt`, `deletionScheduledFor`. Projects table columns for chains/wallets always 0; "Deleting in Xd" countdown permanently absent.

### `gas-tanks/topup-uri` — SHAPE_MISMATCH (cosmetic)
Frontend expects `{ success, address, chainId, eip681Uri }`. Backend returns only `address` and `eip681Uri`. `res.chainId` is `undefined` — non-fatal, just unused.

### `project-context.tsx` — SHAPE_MISMATCH
Local `Project` interface includes `chainIds: number[]`. Backend doesn't return it. Defensively handled in context but downstream consumers may break silently.

## Files Audited

### Frontend
- `apps/client/app/projects/page.tsx`
- `apps/client/app/projects/[id]/deploys/page.tsx`
- `apps/client/app/projects/[id]/export/page.tsx`
- `apps/client/app/gas-tanks/page.tsx`
- `apps/client/app/gas-tanks/[chainId]/history/page.tsx`
- `apps/client/app/co-sign/page.tsx`
- `apps/client/app/addresses/page.tsx`
- `apps/client/app/address-groups/page.tsx`
- `apps/client/app/notifications/page.tsx`
- `apps/client/app/dashboard/page.tsx`
- `apps/client/app/transactions/page.tsx`
- `apps/client/app/wallets/page.tsx`
- `apps/client/app/webhooks/page.tsx`
- `apps/client/lib/api.ts`
- `apps/client/lib/project-context.tsx`
- `apps/client/app/api/proxy/[...path]/route.ts`

### Backend
- `services/client-api/src/project/project.controller.ts`
- `services/client-api/src/project-setup/project-setup.controller.ts`
- `services/client-api/src/gas-tanks/gas-tanks.controller.ts`
- `services/client-api/src/co-sign/co-sign.controller.ts`
- `services/client-api/src/address-book/address-book.controller.ts`
- `services/client-api/src/address-group/address-group.controller.ts`
- `services/client-api/src/notification-rules/notification-rules.controller.ts`
