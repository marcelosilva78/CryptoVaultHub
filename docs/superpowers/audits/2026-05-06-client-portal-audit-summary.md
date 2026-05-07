# Client Portal Audit — Final Summary

**Date:** 2026-05-06
**Trigger:** User reported gas tank history empty + project selector dropdown empty
**Scope grew to:** comprehensive audit across all client portal contracts and runtime behavior

## Phases executed

1. **Phase 1 — Static contract audit** (code-explorer subagent) — 8 contract issues across frontend ↔ client-api boundary.
2. **Phase 2 — Runtime API probes** (curl with auth cookie) — 5 additional issues in client-api ↔ downstream services not visible from static analysis.
3. **Phase 2b — Downstream investigation** — root-caused each runtime failure with exact file:line and effort estimate.
4. **Phase 4 — Triage** — categorized HOT vs MEDIUM vs COSMETIC.
5. **Phase 5 — Fix waves** — 4 implementation waves dispatched in parallel where files didn't conflict.
6. **Phase 6 — Playwright runtime verification** — confirmed dropdown fix end-to-end.

## Total fixes shipped (24 commits beyond initial deploy)

### Frontend fixes
- `apps/client/app/notifications/page.tsx` — PATCH → PUT for rule update
- `apps/client/app/projects/page.tsx` — deletion-impact field renames (9 fields)
- `apps/client/components/gas-tanks/gas-tank-history-table.tsx` + `app/gas-tanks/[chainId]/history/page.tsx` — info banner about tracking-start date
- `apps/client/lib/project-context.tsx` — 3-attempt retry on initial load + visibility-change refetch + exposed `refetchProjects`
- `apps/client/components/project-selector.tsx` — kick a refetch when dropdown opens with empty list
- `apps/client/app/gas-tanks/page.tsx` + history page — drop redundant `<LayoutShell>` wrapper

### client-api fixes
- `co-sign.service.ts` — wrong upstream URL (key-vault → core-wallet)
- `co-sign.controller.ts` — `@Post('pending')` → `@Get('pending')`
- `co-sign.service.ts` — unwrap nested `{operations:{operations}}`
- `withdrawal.service.ts` — `/withdrawals/${id}` → `/withdrawals/detail/${id}`
- `security/security.service.ts` — `/keys/:id/shamir-status` → `/shamir/:id/status` and `/auth/users/:id/2fa-status` → `/auth/clients/:id/2fa-status`
- `project-setup/project-setup.service.ts` — `/webhooks?clientId=…` → `/webhooks/client/${clientId}` and use new internal `/auth/internal/api-keys/by-client/:id` route
- `address-book/address-book.controller.ts` — relax 2FA gate when user has 2FA disabled
- `address-group/address-group.controller.ts` + `service.ts` — wire new `POST /v1/address-groups/:groupUid/provision`
- `gas-tanks/gas-tanks.service.ts` — include `chainId` in topup-uri response
- `gas-tanks/gas-tanks.service.ts` — inline LIMIT/OFFSET in history (mysql2 limitation)
- `wallet/wallet.service.ts` — log status code on balance fetch failure
- `project/project.service.ts` — return `chainsCount/walletsCount/deletionRequestedAt/deletionScheduledFor` in projects list

### core-wallet-service fixes
- New `address-book/` module — controller + service + module — implements `GET/POST/PATCH/DELETE /address-book` (was entirely missing)
- New `POST /address-groups/:groupUid/provision` route + `provisionGroup()` service method with clientId ownership check
- `balance/balance.service.ts` — graceful empty-balances on missing hot wallet (instead of throwing 500)
- `co-sign-orchestrator.service.ts` — fix collation-mismatch JOIN with `tokens.contract_address`
- `co-sign-orchestrator.service.ts` — fix `chains JOIN ... ON co.chain_id = c.chain_id` (was `c.id`)
- `deploy/project-deploy.service.ts` — gas-tank tx logger instrumented at 2 broadcast sites + new local logger
- `wallet/wallet.service.ts` — seed default `gas_tank_alert_config` when gas tank wallet is registered

### auth-service fixes
- New `GET /auth/users/:userId/2fa-status` route (internal, by user id)
- New `GET /auth/clients/:clientId/2fa-status` route (internal, by client id — what client-api needs)
- New `GET /auth/internal/api-keys/by-client/:clientId` route (internal-key auth)

### key-vault-service fixes
- `shamir/shamir.controller.ts` — serialize BigInt fields in response (was crashing JSON.stringify)

### cron-worker-service fixes
- New `export/export.controller.ts` — exposes `GET/POST /exports`, `GET /exports/:id`, `GET /exports/:id/download` (was completely missing — exports always returned empty silently)
- `export.controller.ts` — typed via `http.ServerResponse` instead of express types (no @types/express dep)
- `gas-tank/gas-tank-receipt-reconciler.service.ts` — replaced `@nestjs/schedule` with `setInterval` (service uses BullMQ for everything else)

### Database
- Migration `043-gas-tank-client-ux.sql` (already shipped earlier in the session — `gas_tank_transactions` + `gas_tank_alert_config`)

## Verification

Final endpoint probe (post all fixes) — all 200:

| Endpoint | Status | Notes |
|---|---|---|
| `/v1/projects` | 200 | Returns BrPay with all extras |
| `/v1/co-sign/pending` | 200 | Empty operations array |
| `/v1/security/2fa-status` | 200 | `{enabled: false}` |
| `/v1/security/shamir-shares` | 200 | 15 shares |
| `/v1/addresses` | 200 | Empty list |
| `/v1/exports` | 200 | Empty list |
| `/v1/wallets/56/balances` | 200 | Empty (no hot wallet on chain 56) |
| `/v1/withdrawals` | 200 | Empty |
| `/v1/projects/:id/deletion-impact` | 200 | All counts populated |
| `/v1/gas-tanks` | 200 | BNB Smart Chain card |
| `/v1/gas-tanks/56/history` | 200 | Empty (post-deploy tracking) |

Playwright verification: dropdown shows BrPay correctly after click; gas-tank history modal shows the info banner; dashboard widget shows the gas tank live.

## Known remaining issues (not fixed this session)

1. **CORS error on `https://api.vaulthub.live/auth/validate`** — auth-context's first call hits this endpoint cross-origin and gets blocked. Doesn't break the app (the catch is silent and middleware redirects work) but pollutes the console. Pre-existing infrastructure issue.

2. **Gas-tank history backfill** — operations from before May 6, 2026 are not in `gas_tank_transactions`. UI now displays a clear note about this. Backfill from `deploy_traces` / `flush_operations` is documented as a follow-up.

3. **Dropdown initial-load race** — first fetch may still race the cookie. Mitigations layered: 3 retries with backoff, refetch on visibility change, refetch on dropdown click. Net user impact: dropdown populates within 1 click.

## Outputs

- `docs/superpowers/specs/2026-05-06-client-portal-audit-design.md` — design
- `docs/superpowers/audits/2026-05-06-client-portal-audit-phase1.md` — static audit
- `docs/superpowers/audits/2026-05-06-client-portal-audit-phase2.md` — runtime probes
- `docs/superpowers/audits/2026-05-06-client-portal-audit-phase2b-investigation.md` — downstream root causes
- `docs/superpowers/audits/2026-05-06-client-portal-audit-summary.md` — this file
