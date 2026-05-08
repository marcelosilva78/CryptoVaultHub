# Withdrawals Screen Redesign — Design

**Status:** approved (architecture)
**Author:** brainstorming session 2026-05-08
**Companion:** `docs/superpowers/specs/2026-05-08-multisig-withdrawal-correctness-design.md` (multisig fix that just landed)

## 1. Goal

Two related improvements to the client portal `/withdrawals` page:

1. Allow the client to **withdraw from the Gas Tank** (currently only the Hot Wallet/transactional vault is a valid source).
2. Surface the **balances of both the Hot Wallet and the Gas Tank** at the moment of withdrawal so the client doesn't have to navigate elsewhere to check, and so over-withdrawal mistakes drop close to zero.

Plus a small but high-value addition that came out of the brainstorm: each row of the Withdrawal History gets two action icons — copy tx hash, open in chain explorer — so common operations stop requiring a copy-paste round trip.

## 2. Non-goals

- Redesign of the four KPI cards at the top (Pending, Confirmed Today, Whitelisted Addresses, Daily Limit Used) — they stay.
- A dedicated "Project Wallets" page or strip — overview of wallet balances lives **inside the form** through the new source picker. The Gas Tank dedicated page (`/gas-tanks/[chainId]`) already exists for deeper drill-down.
- Multi-chain stacking — source cards show the chain currently selected in the form. Switching chain refreshes the cards.
- Cosign-mode source picker — Hot Wallet picker keeps the platform/backup signer pair; client-key cosign is deferred to a future spec.

## 3. Architecture decisions

### 3.1 Source picker as dual cards inside the form

Two clickable cards at the top of the New Withdrawal form replace what would have been (a) a separate "Project Wallets" strip + (b) a generic "Source" dropdown. The cards do double duty: visible balance display **and** source selector. Selecting a card mutates the rest of the form (token list, validations, gas estimate).

The two cards:

- **Hot Wallet** — primary card, default selected. Shows balance, address (truncated), tags `2-of-3 multisig` and `native + ERC-20`. Clicking toggles to it.
- **Gas Tank** — second card. Shows balance, address, tags `single-sig` and `native only`. Clicking toggles to it; rest of form locks token to the chain's native and shows a callout about reserve.

### 3.2 Inline `Available: …` hint on the Amount field

Below the Amount input, show `Available: <balance> <symbol> · Use max`. The "Use max" link autofills the field with the maximum spendable. For Gas Tank source, max = balance − reserved. For Hot Wallet source, max = balance.

### 3.3 Withdraw-from-Gas-Tank reserve

Gas Tank cannot be drained below the reserve required to keep the platform key topped up (otherwise withdrawals from the Hot Wallet fail because the platform key has no gas) and to keep funding forwarder deploys.

```
reserved_wei = 2 × chains.platform_topup_amount_wei
```

Two top-ups' worth keeps the platform key healthy for the typical operational window (one cron tick can refill once; the second tick covers the gap before another deploy or sweep). On BSC with the default `platform_topup_amount_wei = 10_000_000_000_000_000` (0.01 BNB), the reserve is **0.02 BNB**.

The reserve is independent of (and complementary to) the platform top-up cron: the cron fires *after* the platform key dips below its threshold and pulls from the gas tank; this reserve prevents a withdrawal request from removing the gas tank's ability to feed that cron.

If `chains.platform_topup_amount_wei IS NULL` (chain not configured for top-up), fall back to a hard-coded per-network minimum: `0.02 ETH`-equivalent expressed in the chain's native unit (i.e. 20× `21000 × typical_gas_price`).

### 3.4 History row actions

Each row of the Withdrawal History data grid grows a sixth column `Actions` containing two icon buttons:

- **Copy tx hash** (clipboard icon) — copies `tx_hash` to clipboard, shows a 1.5s "Copied!" toast inline. Disabled when `tx_hash` is null (status `pending_approval`/`approved`).
- **Open in explorer** (diagonal arrow icon) — opens `<chains.explorer_url>/tx/<tx_hash>` in a new tab (`target="_blank" rel="noopener noreferrer"`). Disabled when `tx_hash` is null.

The explorer URL is already in the chains DB row. A tiny client-side helper resolves the per-chain URL with a fallback table.

## 4. Component-by-component

### 4.1 Frontend — `apps/client/`

**Modified:**

- `app/withdrawals/page.tsx` — replaces inline form with composed components; passes balance state down.

**Created:**

- `components/withdrawals/source-wallet-picker.tsx` — props `{ chainId, selected: 'hot' | 'gas_tank', onChange, hotBalance, gasTankBalance }`. Renders two cards. Internally fetches balances on mount + when `chainId` changes via `/v1/wallets/:chainId/balances` (hot) and `/v1/gas-tanks/:chainId` (gas tank).
- `components/withdrawals/tx-actions.tsx` — props `{ txHash, chainId, explorerUrl }`. Two icon-buttons; copy handler uses `navigator.clipboard.writeText` and shows a transient inline state.
- `lib/explorer.ts` — `explorerTxUrl(chainId, txHash, fallback?)`: returns the full explorer URL. Has a per-chain map (BSC/Ethereum/Polygon/Arbitrum/Optimism/Base/Avalanche) used when no `fallback` is provided.
- `lib/clipboard.ts` — thin `copyToClipboard(text): Promise<boolean>` wrapper, returns success.

### 4.2 Backend — `services/client-api/`

- `common/dto/withdrawal.dto.ts` — `CreateWithdrawalDto` gains `sourceWallet?: 'hot' | 'gas_tank'` (default `'hot'`), with `@ApiProperty` describing the two values, default, and the constraint that `gas_tank` only allows the chain's native token.
- `withdrawal/withdrawal.service.ts:createWithdrawal` — reads `sourceWallet`, forwards it to core-wallet. When `sourceWallet='gas_tank'`, skips `resolveTokenId` (always uses the chain's native token id, looked up via `/tokens?chainId=…&isNative=true`).
- `withdrawal/withdrawal.controller.ts` — Swagger `@ApiBody` examples gain a "Gas Tank withdrawal" entry; `@ApiResponse` 422 documents the new error shapes (`gas_tank source only supports native`, `insufficient gas tank balance after reserve`).

### 4.3 Backend — `services/core-wallet-service/`

- `prisma/schema.prisma` — `Withdrawal.sourceWallet String @default("hot") @map("source_wallet") @db.VarChar(16)`.
- `withdrawal/withdrawal.service.ts:createWithdrawal` — branches on `sourceWallet`:
  - **`hot`** — current behavior, unchanged.
  - **`gas_tank`** — validate token is the chain's native; compute `reserved` per §3.3; reject with 422 if `amount > balance - reserved`; same compliance + whitelist + cooldown checks as the hot path; insert the row with `source_wallet='gas_tank'`.

### 4.4 Backend — `services/cron-worker-service/`

- `prisma/schema.prisma` — mirror the new `sourceWallet` column.
- `withdrawal/withdrawal-worker.service.ts:process()` — branch on `withdrawal.sourceWallet` after claiming:
  - **`hot`** — existing path (operationHash + multisig).
  - **`gas_tank`** — call a new private `executeGasTankWithdrawal(withdrawal)` that:
    1. Resolves the gas-tank EOA address via `KeyResolverService.resolveAddress(clientId, 'gas_tank')`.
    2. Builds a value-transfer tx (`to=withdrawal.toAddress`, `value=amountRaw`, `data='0x'`, `gasLimit=21000`).
    3. Calls `TransactionSubmitterService.signAndSubmit({clientId, chainId, from: '', to, data: '0x', value: BigInt(amountRaw), keyType: 'gas_tank'})` (the submitter already supports value + keyType after the previous spec).
    4. Updates `tx_hash` + emits `withdrawals:broadcasting` with `sourceWallet='gas_tank'`.
- `withdrawal/withdrawal-confirm.service.ts` — no change; receipt check is identical for both sources.

### 4.5 Migrations

- `infra/sql/migrations/2026-05-08-withdrawal-source-wallet.sql`:
  ```sql
  ALTER TABLE cvh_transactions.withdrawals
    ADD COLUMN source_wallet VARCHAR(16) NOT NULL DEFAULT 'hot' AFTER project_id;
  ```

## 5. Data flow (Gas Tank source)

```
Client                client-api          core-wallet         cron-worker (BullMQ)        BSC chain
  |                      |                    |                       |                       |
  | POST /withdrawals    |                    |                       |                       |
  |  sourceWallet=gas_tank|                   |                       |                       |
  |--------------------->|                    |                       |                       |
  |                      | guard: deploy_status=ready                 |                       |
  |                      | force tokenSymbol = native of chain        |                       |
  |                      | resolve tokenId (native)                   |                       |
  |                      |------------------->|                       |                       |
  |                      |                    | check whitelist+cooldown                      |
  |                      |                    | check balance >= amount + reserved            |
  |                      |                    | INSERT pending_approval                       |
  |                      |                    | with source_wallet='gas_tank'                 |
  |                      |<-------------------|                       |                       |
  |                      |                    |                       |                       |
  | POST /:id/approve    |                    |                       |                       |
  |--------------------->|------------------->| status=approved       |                       |
  |                      |                    |                       |                       |
  |                      |                    |   (poll 30s)          |                       |
  |                      |                    |<----------------------| pickup approved       |
  |                      |                    | claim broadcasting    |                       |
  |                      |                    |                       |                       |
  |                      |                    |                       | branch on source      |
  |                      |                    |                       | gas_tank → submitter  |
  |                      |                    |                       |   .signAndSubmit({    |
  |                      |                    |                       |     keyType:gas_tank, |
  |                      |                    |                       |     value, to, ... }) |
  |                      |                    |                       | broadcast --------->  |
  |                      |                    |                       |<--- txHash            |
  |                      |                    | tx_hash, broadcast    |                       |
  |                      |                    |                       |                       |
  |                      |                    | confirm tracker ----->|                       |
  |                      |                    |                       | poll receipt          |
  |                      |                    |<----------------------| confirmed             |
  |                      |                    | status=confirmed      |                       |
```

## 6. Error handling

| Scenario | HTTP | Body |
|---|---|---|
| `gas_tank` source + non-native token | 422 | `{statusCode:422, message:'Gas Tank source only supports the chain native token', details:{tokenSymbol, expected}}` |
| `gas_tank` source + amount > available - reserve | 422 | `{statusCode:422, message:'Insufficient gas tank balance after reserve', details:{requested, available, reserved}}` |
| Existing 422 (whitelist cooldown, etc.) | unchanged | unchanged |

The reserve message must be specific so the user knows it's not a literal balance issue. Example body:
`{requested: "0.005", available: "0.003", reserved: "0.002"}`.

## 7. Documentation requirements (per standing rule)

This spec is the first to be subject to the standing rule that public-contract changes must update Knowledge Base + Swagger + Postman in the same delivery. The plan must include explicit tasks for:

- **Knowledge Base**
  - Update `apps/client/app/support/kb/data/integrations.ts` (postman article) — add `sourceWallet` to the variables table.
  - Create new article in `apps/client/app/support/kb/data/deposits-withdrawals.ts` titled "Saque do Gas Tank" — when to use it, the reserve rule, gas cost differences, security considerations.
- **Swagger** — `@ApiBody` examples for both source values; `@ApiResponse` 422 docs the two new error shapes; `@ApiProperty` on `sourceWallet` with description and default.
- **Postman**
  - `docs/integration/CryptoVaultHub.postman_collection.json` and `apps/client/public/postman/CryptoVaultHub.postman_collection.json` (mirror) — either a new folder "Withdrawal — Gas Tank" with parallel requests, or a `sourceWallet` collection variable + a duplicate "Create withdrawal (gas tank)" request beneath the existing one.
  - `docs/integration/postman-walkthrough.md` and `apps/client/public/postman/postman-walkthrough.md` (mirror) — new section explaining the variant.

## 8. Testing

**Frontend (Jest + React Testing Library):**
- `source-wallet-picker.spec.tsx` — renders both cards, fetches balances, default selection is hot, clicking gas_tank toggles selection, balance hint appears in form.
- `tx-actions.spec.tsx` — clicking copy invokes `navigator.clipboard.writeText` with the tx hash; clicking open dispatches a window.open with the resolved URL; both buttons disabled when `txHash` is null/undefined.

**Backend (Jest):**
- `withdrawal.service.spec.ts` (core-wallet) — `gas_tank` source with non-native token → 422; `gas_tank` source with amount above `balance - reserved` → 422; happy path inserts row with `source_wallet='gas_tank'`.
- `withdrawal-worker.service.spec.ts` — `executeGasTankWithdrawal` builds value-transfer with correct shape, calls submitter with `keyType:'gas_tank'`, persists tx hash.

**End-to-end (homologation suite):**
- New phase between current "withdrawal.confirmed" and "Cleanup": "Withdraw 0.0005 BNB from Gas Tank to recovery". Should land confirmed on-chain. Adds the 14th PASS to the suite.

## 9. Acceptance criteria

1. New Withdrawal form shows two clickable source cards with live balances; default is Hot Wallet.
2. Selecting Gas Tank locks the token to the chain's native and shows the reserve callout.
3. `Available: …` hint with `Use max` works for both sources.
4. Withdrawal History rows have copy + open icons; copy shows toast feedback; open routes to the correct explorer per chain (BSCScan/Etherscan/Polygonscan/Arbiscan/etc.).
5. `POST /v1/withdrawals` with `sourceWallet:'gas_tank'` and amount within reserve confirms on-chain in < 60s on BSC.
6. `POST /v1/withdrawals` with `sourceWallet:'gas_tank'` and `tokenSymbol:'USDT'` returns 422 with the specific message.
7. `POST /v1/withdrawals` with `sourceWallet:'gas_tank'` and amount above `balance - reserved` returns 422 with `details:{requested, available, reserved}`.
8. Knowledge Base "Saque do Gas Tank" article is published and linked from the withdrawals article.
9. Swagger UI at `/api/docs` shows `sourceWallet` in the request body schema with example values.
10. Postman collection has a working "Create withdrawal (gas tank)" request that, run end-to-end, lands a confirmed Gas Tank withdrawal.
11. Homologation suite reports 14/14 PASS on a fresh run.

## 10. Out of scope

- Cosign mode for either source (deferred — Hot Wallet's cosign uses client key, Gas Tank single-sig stays as-is regardless).
- Native token swap on Gas Tank withdrawal (e.g., withdrawing native and converting to USDT at the destination — different feature).
- Multi-chain Gas Tank consolidation in the source picker (one chain at a time).
- 2FA enforcement is unchanged: above the daily-limit threshold both sources require the X-2FA-Code header.
