# Client Portal Audit + Fix Batch — Design

**Date:** 2026-05-06
**Trigger:** Production user reported (a) gas tank history shows empty despite balance OK, and (b) project selector dropdown lists no projects. User requested broader UI audit.
**Status:** Approved, executing autonomously.

## Goal

Comprehensive audit of the client portal (`apps/client`) covering both static contracts and runtime behavior, followed by a fix batch addressing the most impactful bugs.

## Phases

### Phase 1 — Static contract audit
Map every route in `apps/client/app/` to the API endpoints it consumes. Cross-reference against client-api controllers. Flag mismatches in path, method, scope, request shape, response shape.

### Phase 2 — Runtime API probes
For every endpoint identified, hit production with the test user's auth and verify status, latency, and response shape.

### Phase 3 — Runtime UI audit (Playwright)
Login as the test user against `portal.vaulthub.live`. Walk through every page: dashboard, projects, wallets, deposits, withdrawals, co-sign, flush, setup, gas-tanks (and sub-pages), settings, webhooks, api-keys, notifications, security, knowledge-base. For each: capture console errors, network failures, screenshot, and try 1–2 main interactions.

### Phase 4 — Triage
Consolidate findings. Categorize as HOT (broken feature), COLD (UX/edge case), WONT-FIX (design intent).

### Phase 5 — Implement HOT fixes
Subagent-driven execution. After each fix: commit, push, deploy to server, verify.

### Phase 6 — Known fixes
- Issue #1: add UI note "operations from {deploy date} onwards" on history view; write `gas-tank-history-backfill-design.md` follow-up spec (not executed this session).
- Issue #2: fix project selector dropdown (root cause TBD by Phase 1+2).

## Outputs

- `docs/superpowers/specs/2026-05-06-client-portal-audit-design.md` (this file)
- `docs/superpowers/audits/2026-05-06-client-portal-audit-report.md` (findings)
- `docs/superpowers/specs/2026-05-XX-gas-tank-history-backfill-design.md` (follow-up)
- N commits, one per fix, deployed to production

## Test credentials

`wallet@grupogreen.org` (provided). Treat as sandbox-permission — Playwright will click through features, may generate addresses, open modals, etc.

## Stop conditions

Per user direction, execute autonomously. Stop only when:
- Strictly necessary user decision (e.g., destructive action, ambiguous business logic)
- All HOT fixes shipped and verified in production
- Phase 6 follow-up spec written
