# Consolidated Action Plan — Production Readiness

**Date:** 2026-05-08
**Source:** 5 specialist deep-dive audits (indexer, downstream contracts, custody pipeline, address-registration stream, webhook pipeline)
**Status:** Architectural gaps identified across the entire deposit/sweep/flush pipeline. The withdrawal pipeline is the only fully functional E2E flow.

---

## Reality Check

Of the major customer-facing flows, only **withdrawal** is genuinely production-ready end-to-end. Everything else has at least one BROKEN handoff or STUB:

| Flow | State | Blocker(s) |
|---|---|---|
| Auth + project + API key | ✅ Working (post-recent fixes) | — |
| Generate deposit address | ✅ Working (post-recent fixes) | — |
| **Detect on-chain deposit** | ❌ **BROKEN** | Cursor frozen + no `deposits:detected → DB` consumer |
| **Confirmation tracking** | ❌ **BROKEN** | `ConfirmationTrackerService.trackDeposit()` never called |
| **Forwarder on-chain deploy** | ❌ **STUB** | `ForwarderDeployService` only publishes event, no tx |
| **Auto sweep** | ❌ **BROKEN** | `cvh_transactions.deposits` never populated → 0 rows to sweep |
| **Manual flush** | ❌ **STUB** | `FlushOrchestratorService.flushItem()` only publishes event |
| **Gas tank auto-topup** | ❌ **STUB** | Only publishes event, no tx |
| **Withdrawal** | ✅ Working | — |
| **Webhook delivery** | 🟡 44% working | 3 missing publishers + stream name mismatches |

## Bugs Catalogued (by severity)

### CRITICAL (block E2E homologation)

| # | Bug | File | Fix complexity |
|---|---|---|---|
| 1 | No `deposits:detected → DB` consumer (no `DepositPersistenceHandler`) | new file in `chain-indexer-service` | M (60 LOC) |
| 2 | `ConfirmationTrackerService.trackDeposit()` never called | `realtime-detector.service.ts` | S (15 LOC) |
| 3 | `ForwarderDeployService` is a stub | `forwarder-deploy.service.ts:175` | M (40 LOC) |
| 4 | Indexer cursor frozen — `last_block` never advances | `polling-detector.service.ts`, `finality-tracker.service.ts` | S (10 LOC, SQL) |
| 5 | `cvh_transactions.deposits` never written → sweep blocked | covered by #1 | — |
| 6 | TATUM_API_KEY may be missing in prod env | `/docker/CryptoVaultHub/.env` | XS (set env var) |
| 7 | `address:registered` stream — 2 missing publishers | `deposit-address.service.ts`, `address-group.service.ts` | S (20 LOC) |
| 8 | Forwarder/wallet factory addresses NULL in `chains` table | DB | XS (UPDATE) |
| 9 | hot_wallet not in `wallets` table despite contract deployed | DB | XS (INSERT) |

### HIGH (functional but breaks integration)

| # | Bug | File | Fix complexity |
|---|---|---|---|
| 10 | `withdrawal.submitted` stream name mismatch | `event-consumer.service.ts:22` | XS (rename) |
| 11 | `deposit.swept` has no publisher | new `SweepConfirmationService` | M (50 LOC) |
| 12 | `FlushOrchestratorService.flushItem()` is a stub | `flush-orchestrator.service.ts:159` | M (40 LOC) |
| 13 | All flush routes PATH_MISMATCH | `client-api/flush.service.ts` | S (URL fixes) |
| 14 | Address-groups CRUD PATH_MISMATCH | `client-api/address-group.service.ts` | S (URL fixes) |
| 15 | `GET /v1/deposits` MISSING downstream | new `deposit.controller.ts` in core-wallet | M (60 LOC) |
| 16 | Token list PATH_MISMATCH | `core-wallet/token.controller.ts` | XS (add `:chainId` route) |
| 17 | `POST /webhooks/:id/test` MISSING | `notification-service` | S (30 LOC) |

### MEDIUM (degraded UX, non-blocking for E2E)

| # | Bug | File | Fix complexity |
|---|---|---|---|
| 18 | 2FA verify AUTH_MISMATCH (uses JWT, internal call has API key) | `auth-service` + `client-api/address-book` | M (40 LOC) |
| 19 | Safe-mode endpoint MISSING | `core-wallet` + `auth-service` | M (60 LOC) |
| 20 | Gas tank auto-topup is a stub | `gas-tank.service.ts:219` | M (40 LOC) |
| 21 | Polling detector zero diagnostic logs | `polling-detector.service.ts` | XS (add logs) |
| 22 | DeadLetterService is empty stub | `dead-letter.service.ts` | S (20 LOC) |

---

## Wave Plan (this session)

### Wave 1: SQL/config quick fixes (~30 min)
- Fix `FinalityTrackerService` ON DUPLICATE KEY UPDATE to include `last_block`
- Fix `SyncHealthService` similarly
- Add cursor advance call to `PollingDetectorService.pollChain()`
- Verify `TATUM_API_KEY` in prod env

### Wave 2: Stream publishers (~45 min)
- `DepositAddressService.generateAddress()` → publish `address:registered`
- `AddressGroupService.provisionOnChains()` → publish `address:registered`
- `RealtimeDetectorService.processBlock()` → call `confirmationTracker.trackDeposit()`
- Fix `withdrawal.submitted` stream mapping

### Wave 3: DepositPersistenceHandler (~90 min)
- New service in `chain-indexer-service` that:
  - Subscribes to `deposits:detected` Redis stream (consumer group)
  - Upserts `cvh_transactions.deposits` row with `status='detected'`
  - On `deposits:confirmation` event, transitions `detected → confirming → confirmed`
- Wire into `chain-indexer-service` module

### Wave 4: Real forwarder deploy (~90 min)
- Replace stub in `ForwarderDeployService.deployPendingForwarders()` with real `createForwarder` tx via `TransactionSubmitterService`
- Sign with gas_tank key via KeyVault
- Update `depositAddress.isDeployed = true` after confirmation

### Wave 5: Real flush execution (~60 min)
- Replace stub in `FlushOrchestratorService.flushItem()` with real tx
- Use existing `TransactionSubmitterService.buildFlushCalldata()` + `signAndSubmit()`

### Wave 6: SweepConfirmationService (~60 min)
- New BullMQ worker that polls sweep tx receipts
- Updates `deposits.status: sweep_pending → swept`
- Publishes `deposits:swept` Redis stream

### Wave 7: Path/route fixes (~45 min)
- Add `GET /deposits` to core-wallet
- Fix flush + address-groups path mismatches
- Add `GET /tokens/:chainId`
- Add `POST /webhooks/:id/test`

### Wave 8: E2E re-run + verification
- Run homologation suite
- Iterate on any remaining issues

---

## Out of scope (this session)

- **2FA verify path** (Bug 18) — needs auth-service redesign
- **Safe-mode** (Bug 19) — feature not core to the homologation flow
- **Gas tank auto-topup** (Bug 20) — gas tank manual top-up still works
- **Multi-chain support** — focus only on BSC chain 56 first
- **Backfill** of historical deposits — clean slate going forward
- **Dead letter implementation** (Bug 22) — degraded but functional via manual resend

---

## Estimated effort

| Wave | Complexity | Effort |
|---|---|---|
| 1 | SQL fixes | 30 min |
| 2 | Add publishes/calls | 45 min |
| 3 | New service: DepositPersistenceHandler | 90 min |
| 4 | Real forwarder deploy tx | 90 min |
| 5 | Real flush tx | 60 min |
| 6 | New service: SweepConfirmationService | 60 min |
| 7 | Path/route fixes | 45 min |
| 8 | E2E iteration | 60 min |
| **Total** | | **~7-8h** |

This is realistic for a single focused session. Past that, deeper architectural rework (proper multi-chain, true production hardening, observability) is multi-day work.

---

## Source audits

- `2026-05-08-indexer-deep-dive.md` — chain-indexer cursor analysis
- `2026-05-08-downstream-contract-audit.md` — full client-api ↔ downstream contract map
- `2026-05-08-custody-pipeline-deep-dive.md` — deposit→sweep→withdrawal pipeline
- `2026-05-08-address-registration-stream.md` — Redis stream publisher gap
- `2026-05-08-webhook-pipeline-deep-dive.md` — webhook publisher coverage
