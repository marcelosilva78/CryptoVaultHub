# Gas Tank Client UX — Design

**Date:** 2026-05-06
**Status:** Approved, ready for implementation plan
**Companion to:** `2026-05-05-gas-tank-client-ux-requirements.md`
**Scope:** All 5 priority items (full implementation)

---

## 1. Overview

Give clients full visibility and self-service over their gas tanks: a dedicated `/gas-tanks` page, dashboard widget, top-up flow with QR + auto-poll, low-balance alerts (banner + webhook + email-stub), and gas consumption history.

Architecture decisions confirmed during brainstorming:

- **History (item 5):** new persistent table `cvh_wallets.gas_tank_transactions`, populated by `cron-worker-service` when it submits any gas-tank-funded transaction.
- **Alert config (item 4):** new table `cvh_wallets.gas_tank_alert_config` keyed by `(project_id, chain_id)` — holds threshold + email/webhook opt-ins.
- **Email (item 4):** stub only this round. The flag is honored end-to-end (stored, returned by API, displayed in UI) but no message is sent. Webhook + dashboard banner are the live channels.

---

## 2. Data Model Changes

### 2.1 New table: `gas_tank_transactions` (cvh_wallets)

```prisma
model GasTankTransaction {
  id            BigInt    @id @default(autoincrement())
  walletId      BigInt    @map("wallet_id")        // FK to wallets (gas_tank wallet)
  projectId     BigInt    @map("project_id")
  chainId       Int       @map("chain_id")
  txHash        String    @db.VarChar(66) @map("tx_hash")
  operationType String    @db.VarChar(32) @map("operation_type") // 'deploy_wallet' | 'deploy_forwarder' | 'sweep' | 'flush' | 'topup_internal' | 'other'
  toAddress     String?   @db.VarChar(42) @map("to_address")
  gasUsed       BigInt?   @map("gas_used")              // populated when receipt confirmed
  gasPriceWei   String    @db.VarChar(80) @map("gas_price_wei") // string to fit u256
  gasCostWei    String?   @db.VarChar(80) @map("gas_cost_wei")  // gasUsed * effectiveGasPrice
  status        String    @default("submitted") @db.VarChar(16) // 'submitted' | 'confirmed' | 'failed'
  blockNumber   BigInt?   @map("block_number")
  metadata      Json?     // { walletId?, addressId?, jobId?, contractType? }
  submittedAt   DateTime  @default(now()) @map("submitted_at")
  confirmedAt   DateTime? @map("confirmed_at")

  @@index([projectId, chainId, submittedAt(sort: Desc)], name: "idx_proj_chain_time")
  @@index([walletId, submittedAt(sort: Desc)], name: "idx_wallet_time")
  @@index([txHash], name: "idx_tx_hash")
  @@map("gas_tank_transactions")
}
```

Cron-worker writes a row at submit time (status `submitted`, no receipt fields). A confirmation reconciler updates with receipt data when the tx mines (or marks `failed`).

### 2.2 New table: `gas_tank_alert_config` (cvh_wallets)

```prisma
model GasTankAlertConfig {
  id              BigInt   @id @default(autoincrement())
  projectId       BigInt   @map("project_id")
  chainId         Int      @map("chain_id")
  thresholdWei    String   @db.VarChar(80) @map("threshold_wei") // default = price-of-10-ops, computed at insert
  emailEnabled    Boolean  @default(false) @map("email_enabled")
  webhookEnabled  Boolean  @default(true)  @map("webhook_enabled")
  lastAlertAt     DateTime? @map("last_alert_at") // de-dup: don't re-alert for 1h
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([projectId, chainId])
  @@map("gas_tank_alert_config")
}
```

When a gas tank is created in the wizard, a default row is inserted (threshold = `gasPrice * 21000 * 10` as a starting point; user can edit).

---

## 3. Backend Changes

### 3.1 client-api: new module `gas-tanks`

`services/client-api/src/gas-tanks/`
- `gas-tanks.module.ts`
- `gas-tanks.controller.ts`
- `gas-tanks.service.ts`
- `dto/` — request/response DTOs (UpdateAlertConfigDto, GasTankResponseDto, etc.)

**Endpoints (all under `/v1/gas-tanks`, scoped to authenticated client + active project):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List gas tanks for project. Returns `[{ chainId, chainName, address, derivationPath, balanceWei, gasPriceWei, estimatedOpsRemaining, threshold, status: 'ok'\|'low'\|'critical', alertConfig }]`. Balance fetched live via core-wallet-service `BalanceService` (which uses `SharedRpcRateLimiter`). |
| GET | `/:chainId/history?limit=50&offset=0&type=&from=&to=` | Paginated history. Reads from `gas_tank_transactions`. |
| GET | `/:chainId/alert-config` | Current alert config for that chain. |
| PATCH | `/:chainId/alert-config` | Update threshold / email / webhook flags. Body: `{ thresholdWei?, emailEnabled?, webhookEnabled? }`. |
| POST | `/:chainId/export-keystore` | Returns encrypted JSON keystore. Body: `{ password }`. Re-uses key derivation from `project-setup.service.ts` (mnemonic from request signing) — actually, see "Keystore export" below. |
| GET | `/:chainId/topup-uri` | Returns `{ eip681Uri, address, chainId }` for QR rendering. |

**Keystore export model (security-critical):** the client supplies their mnemonic in the request (encrypted in transit via TLS); server derives the gas tank private key, encrypts to keystore JSON (PBKDF2 + AES-128-CTR per Web3 Secret Storage v3), returns. **Server never persists or logs mnemonic or private key.** The endpoint is rate-limited (5/min/project) and emits an audit event (`gas_tank.keystore_exported` with `projectId`, `chainId`, `userId`, `timestamp` — payload contains no secret material) through the existing audit-log mechanism (same path used by other client-api sensitive endpoints).

Status thresholds for the GET response:
- `critical` = balance < threshold
- `low` = balance < 2 × threshold
- `ok` = balance ≥ 2 × threshold

`estimatedOpsRemaining = balanceWei / (gasPriceWei × 21000)` for native transfer baseline (UI shows "~N transfers" — accurate enough as an order-of-magnitude indicator; the spec requires this metric).

### 3.2 cron-worker-service: instrument tx submitters

Locations to add a `GasTankTransactionLogger.logSubmit()` call (fire-and-forget, with try/catch so a logging failure never blocks a tx):

- `forwarder-deploy/forwarder-deploy.service.ts` — `operation_type='deploy_forwarder'`
- `sweep/transaction-submitter.service.ts` — `operation_type='sweep'` (covers sweep + flush by inspecting context)
- Wallet deploy path (likely in core-wallet-service `WalletDeployService`) — `operation_type='deploy_wallet'`
- Internal top-up (the existing `triggerAutoTopup` in `gas-tank.service.ts`) — `operation_type='topup_internal'`

A new `GasTankReceiptReconciler` (cron, every 30s) picks rows with `status='submitted'` older than 15s, fetches receipts via RPC, updates `gasUsed`, `gasCostWei`, `status`, `blockNumber`. Re-uses `SharedRpcRateLimiter`.

### 3.3 Low-balance alert pipeline

Existing cron-worker `gas-tank.service.ts` already detects low balance and publishes to Redis stream `gas_tank:alerts`. Augment:

1. **Threshold source:** read from `gas_tank_alert_config` per `(projectId, chainId)` instead of global config. Fallback to global default if no row.
2. **De-dup:** before alerting, check `lastAlertAt` — skip if < 1h ago. Update `lastAlertAt` on alert.
3. **Webhook fan-out:** new consumer in `notification-service` (which already owns webhook delivery and is the right home for fan-out) reads `gas_tank:alerts`, checks `webhookEnabled`, and if true, enqueues a `gas_tank.low_balance` webhook delivery via the existing webhook delivery pipeline. Payload: `{ eventType: 'gas_tank.low_balance', projectId, chainId, address, balanceWei, thresholdWei, timestamp }`.
4. **Email:** if `emailEnabled`, log a structured TODO line (`[email-stub] would send gas-tank low-balance email to project X`). No SMTP integration this round.

### 3.4 Webhook event registration

Add `'gas_tank.low_balance'` to the webhook event-type enum / list (wherever the existing `WebhookEventType` is defined — likely `webhook.service.ts` or a shared DTO). Document in the webhook OpenAPI description.

---

## 4. Frontend (apps/client)

### 4.1 New page: `/gas-tanks`

Files:
- `apps/client/app/gas-tanks/page.tsx` — page entry, uses layout-shell, fetches via TanStack Query
- `apps/client/components/gas-tanks/gas-tank-card.tsx` — one per chain
- `apps/client/components/gas-tanks/gas-tank-history-table.tsx` — last 5 + "view all" link to filtered table
- `apps/client/components/gas-tanks/gas-tank-history-page-content.tsx` — full history with filters
- `apps/client/components/gas-tanks/topup-modal.tsx` — QR + auto-poll
- `apps/client/components/gas-tanks/alert-config-modal.tsx` — threshold + email/webhook toggles
- `apps/client/components/gas-tanks/export-keystore-modal.tsx` — password prompt + download

Card shows: chain icon + name, address with copy, derivation path (collapsed by default), balance with status color, estimated ops remaining, last 5 history entries, and four buttons: **Top Up**, **Export Keystore**, **Configure Alerts**, **View Full History**.

Polling: TanStack Query `refetchInterval: 30_000` for the list endpoint. Top-up modal switches to `15_000` while open.

### 4.2 Sidebar entry

Add under OPERATIONS section in `apps/client/components/sidebar.tsx`. Icon: `Fuel` or `Droplet` from lucide-react. Route: `/gas-tanks`. Uses the same active-project-id wiring pattern that recent commits established.

### 4.3 Dashboard widget

In `apps/client/app/page.tsx`, add a `GasTankSummary` section below the custody balance:
- File: `apps/client/components/gas-tanks/gas-tank-summary.tsx`
- Shows compact row per chain: chain icon, balance, status pill, mini "Top Up" button (opens the same `topup-modal`).
- A red banner appears at the top of the dashboard if any tank is `critical`.

### 4.4 Top-up flow

`topup-modal.tsx`:
- QR via existing `qr-code.tsx` component, encoding `eip681Uri` from `/v1/gas-tanks/:chainId/topup-uri`.
- Address with copy button.
- Live balance polled every 15s.
- When balance increases vs. the value at modal-open, show a green "Funded! New balance: X" toast and stop polling after 60s of stability.

### 4.5 Alert config modal

Form: threshold (input with units toggle wei/ether/gwei), email checkbox (with "(coming soon)" annotation since stub), webhook checkbox. PATCH on save. Confirmation toast.

### 4.6 Export keystore modal

Two-step: (1) explain that mnemonic will be transmitted to the server only to encrypt and is not stored; (2) password input + mnemonic input. Server returns keystore JSON; browser downloads as `gas-tank-{chainId}-{shortAddr}.json`.

---

## 5. API Client (apps/client/lib)

Extend the existing client-api wrapper (look for `lib/api.ts` or similar) with:
- `getGasTanks(projectId)`
- `getGasTankHistory(projectId, chainId, opts)`
- `getAlertConfig(projectId, chainId)`
- `updateAlertConfig(projectId, chainId, body)`
- `exportKeystore(projectId, chainId, body)`
- `getTopupUri(projectId, chainId)`

---

## 6. Testing

- **Backend unit:** `gas-tanks.service.spec.ts` covers status calculation, estimated-ops math, alert-config CRUD, dedup logic.
- **Backend integration:** end-to-end test that submits a fake tx through the cron-worker logger → reconciler picks up receipt → history endpoint returns it.
- **Frontend:** at minimum, a smoke test (Playwright / webapp-testing skill) that loads `/gas-tanks`, verifies cards render, opens top-up modal, toggles alert config.
- **Webhook:** existing webhook-test endpoint should also accept `gas_tank.low_balance` as a test event.

---

## 7. Sequencing (for the implementation plan)

The implementation plan will break this into ordered tasks. Approximate order:

1. DB migrations (both tables) + Prisma schema bumps.
2. cron-worker logger + reconciler.
3. client-api `gas-tanks` module (read endpoints first: list, history, topup-uri).
4. client-api alert-config endpoints + augmented alert pipeline (consumer + webhook fan-out).
5. client-api keystore export endpoint.
6. Frontend: API client wrappers.
7. Frontend: `/gas-tanks` page with card, history, alert modal, export modal.
8. Frontend: top-up modal.
9. Frontend: dashboard widget + banner.
10. Frontend: sidebar entry.
11. Tests + smoke verification.

---

## 8. Out of Scope (explicit)

- Email delivery for `gas_tank.low_balance` (stubbed).
- Auto-topup from another wallet on low balance (admin-only feature, exists in cron-worker, not exposed to client).
- Historical analytics/charts of gas spend (could be a follow-up dashboard).
- Multi-currency display (USD value of balance) — show native token only.

---

## 9. Risks

- **Mnemonic transmission for keystore export.** Mitigation: TLS only, never log/persist, rate-limit, audit log, prominent UI warning. Long-term consideration: client-side keystore generation in browser (would eliminate transmission entirely) — track as follow-up.
- **History table growth.** A busy project on a high-fee chain could write thousands of rows/day. Mitigation: indexes are project+chain+time; add a retention policy follow-up (e.g., archive >90d) once we see real volume.
- **Reconciler missing receipts.** If a tx is dropped, its row stays `submitted` forever. Mitigation: reconciler marks `failed` after N retries (N=20, ~10 min) if `eth_getTransactionByHash` returns null and tx age > nonce-of-account suggests it was replaced.
