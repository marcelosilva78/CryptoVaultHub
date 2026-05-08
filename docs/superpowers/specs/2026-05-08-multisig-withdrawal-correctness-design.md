# Multisig Withdrawal Correctness — Design

**Status:** approved (architecture)
**Author:** brainstorming session 2026-05-08
**Companion:** `docs/superpowers/audits/2026-05-08-consolidated-action-plan.md`

## 1. Background

The deposit→sweep flow is verified end-to-end with real funds on BSC mainnet. Forwarders deploy, auto-flush native balance to the project's hot wallet (`CvhWalletSimple` proxy), and `swept` reconciliation works. The **withdrawal** flow, however, broadcasts transactions that revert on-chain at ~29k gas — i.e. before the contract's main logic runs.

### Investigation results

The hot wallet at `0x17193A58d73825485393E00ecE33051Fa2536415` for project 6998 / chain 56:

- **Is correctly deployed** (`project_chains.deploy_status='ready'`, wizard ran).
- **Is initialized** with the project's three Key Vault keys as signers:
  - `platform` (id 48, `0x04a093d2…`)
  - `client`   (id 49, `0xede18972…`)
  - `backup`   (id 50, `0x53acdedd…`)
- The project's gas tank EOA (`0x54f55b…`) is **not** a signer — by design. `CvhWalletSimple.sendMultiSig` requires `msg.sender` to be one of the three signers (`onlySigner` modifier), and the contract is a 2-of-3 BitGo-style multisig: one signer broadcasts, a second signer's ECDSA signature is in calldata.

Two real bugs in `services/cron-worker-service/src/withdrawal/withdrawal-worker.service.ts`:

1. **`operationHash` is missing `address(this)`.** Worker encodes `[networkId, toAddress, value, data, expireTime, sequenceId]` (6 fields). Contract hashes `[networkId, address(this), toAddress, value, data, expireTime, sequenceId]` (7 fields). Even if `msg.sender` were a signer, ecrecover yields the wrong address.
2. **Wrong broadcaster.** Worker broadcasts via `gas_tank` EOA, which is not (and should not be) a signer. The contract reverts at `onlySigner` before any logic runs — matches the observed `gasUsed=29539`.

The existing 4 stale withdrawals failed because of these bugs, not because of any missing guardrail. They reference the correct hot wallet but were submitted via the wrong execution path.

## 2. Goal

Withdrawal flow works end-to-end on-chain. The end-state validation is: a recovery `sendMultiSig` from `0x17193A…` to `0x95DEda…` for 0.005 BNB lands in a confirmed block, and the homologation suite passes 11/11 on a fresh run.

## 3. Architecture decisions

### 3.1 Honor the contract's 2-of-3 multisig design

`CvhWalletSimple` was designed for the BitGo pattern:

- **Broadcaster signer** — calls `sendMultiSig` (their address is `msg.sender`), pays gas. Must be in `isSigner`.
- **Co-signer** — provides an ECDSA signature over the operation hash, passed in the calldata. Must be in `isSigner` and `≠ msg.sender`.

We use **`platform`** as broadcaster and **`backup`** as co-signer. `client` is reserved for cosign-mode (where the customer holds it); leaving `client` untouched on the hot path keeps cosign-mode adoption a one-flag swap later.

The gas tank EOA's role is simplified: **fund deploys**, and **fund the platform key's EOA** when its balance dips below a per-chain threshold. It never signs withdrawals.

### 3.2 Gas top-up cron

A new service in `cron-worker-service` polls every 5 minutes. For each chain with at least one project_chain in `deploy_status='ready'`:

- Read the platform-key EOA balance for each project on that chain.
- If below threshold (BSC: 0.005 BNB, configurable in `chains.platform_topup_threshold` and `chains.platform_topup_amount`), build a regular value-transfer from `gas_tank` to that platform-key EOA.
- Sign with the `gas_tank` Key Vault key, broadcast.
- Emit a metric and a `gas_tank.topup` Redis Stream event.

If the gas tank itself is below `topup_amount + 21000*gasPrice`, log warn + emit a `gas_tank.low_balance` alert. Don't block other chains.

### 3.3 API guardrails

Create-deposit-address and create-withdrawal both refuse if the requested chain's `project_chains.deploy_status !== 'ready'`. Returns 422 with the literal status (`pending`, `deploying`, `failed`) so the frontend can guide the user. This is a defense-in-depth check; the failure mode it prevents is exactly the one this incident exhibited.

### 3.4 Recovery as smoke test

Two recovery transactions, both routed through production code paths so that they double as fix validation:

1. **Gas tank → `0x95DEda…`** — regular value transfer. Signed by `gas_tank` Key Vault key via `TransactionSubmitterService.signAndSubmit`. Implemented as a one-shot script in `scripts/recovery/`. Validates the gas-tank signing path is unaffected.
2. **Hot wallet → `0x95DEda…` for 0.005 BNB** — `sendMultiSig` via the **fixed worker**. We insert a withdrawal row in DB pointing at the recovery address, mark it `approved`, and let the regular cron worker pick it up. If this lands, the worker fix is proven on-chain in production. No throwaway code.

Withdrawals 1-4 in DB are marked `cancelled` (`cancellation_reason='superseded by worker fix 2026-05-08'`).

### 3.5 No reset of on-chain state

The `0x17193A…` hot wallet stays. It's correct. The `0xB01a…` forwarder stays. We just need a fresh deposit row for the homologation re-run, which the suite already handles by clearing `evidence/state.json`.

## 4. Component-by-component

### 4.1 `withdrawal-worker.service.ts` changes

- **`operationHash`** computation: add `address(this)` between `getNetworkId()` and `toAddress`. For native: `['string','address','address','uint256','bytes','uint256','uint256']`. For ERC-20: `['string','address','address','uint256','address','uint256','uint256']`.
- **Signing flow:**
  - Apply `\x19Ethereum Signed Message:\n32` prefix → `prefixedHash`.
  - Call `keyVault.sign(prefixedHash)` with `keyType='backup'`, projectId — returns `r,s,v` of the **co-signature**.
  - Build `sendMultiSig` calldata with `signature = r||s||v`.
- **Broadcasting:**
  - Build raw tx targeting hot wallet, calldata as above, `from = platform` key's EOA, value=0.
  - Call `keyVault.signTransaction({...txData, requestedBy:'withdrawal-worker'})` with `keyType='platform'`, projectId.
  - `provider.broadcastTransaction(signedTx)`.

The Key Vault already supports both `sign` (raw hash) and `signTransaction` (full tx), and both accept `keyType` + `projectId`. No Key Vault changes.

### 4.2 New `PlatformKeyTopupService`

File: `services/cron-worker-service/src/gas-tank/platform-key-topup.service.ts`.

- BullMQ repeat job, 5 min interval. Wrapped in `WorkerHost` like existing services.
- Per chain: query `project_chains` where `deploy_status='ready'`, join with `derived_keys` where `key_type='platform'`. For each row, read on-chain balance via `EvmProviderService`.
- Threshold + top-up amount come from new columns on `chains`: `platform_topup_threshold_wei` (default `0.005 ether`) and `platform_topup_amount_wei` (default `0.01 ether`). If absent, use defaults from a `DEFAULTS` const map keyed by `nativeSymbol`.
- Below threshold: sign value transfer with `gas_tank` key, broadcast.
- Concurrency lock per `(chainId, projectId)` with 5-min Redis lock to prevent duplicate top-ups across replicas.

### 4.3 API guardrails

- `services/client-api/src/withdrawal/withdrawal.service.ts:createWithdrawal` — before resolving tokenId/toAddressId, fetch project_chain status (new `GET /project-chains/:projectId/:chainId/status` on core-wallet, or use existing `/deploy/project/:id/chain/:id/status`). 422 on `deploy_status !== 'ready'`.
- `services/client-api/src/deposit/deposit.service.ts:generateAddress` — same gate.

A small NestJS guard (`ProjectChainReadyGuard`) caches the result per (project, chain) for 60 seconds in Redis to avoid hammering core-wallet. Applied via `@UseGuards(ProjectChainReadyGuard)` on the two endpoints that need it.

### 4.4 Recovery scripts

`scripts/recovery/recover-gas-tank.ts` — args `--client-id 8 --chain-id 56 --to 0x95DEda…`. Reads gas tank balance, computes max-transferable (`balance - 21000*gasPrice`), signs+broadcasts via `TransactionSubmitterService`. Logs the tx hash.

The hot-wallet recovery is *not* a script. It's a regular withdrawal through the production API:

1. `POST /client/v1/addresses` — whitelist `0x95DEda…` for client 8 chain 56. (Pre-flight: SQL update to flip its `status` from `cooldown` → `active` so the test doesn't have to wait 24h.)
2. `POST /client/v1/withdrawals` body `{ chainId:56, tokenSymbol:'BNB', toAddress:'0x95DEda…', amount:'0.005' }`.
3. `POST /client/v1/withdrawals/:id/approve` — full-custody self-approval.
4. Worker pickup → sign → broadcast.
5. Verify tx confirms on BSCScan.

This way the worker fix is validated through the exact code path the production API uses — no DB inserts, no script bypasses.

### 4.5 Stale data cleanup

```sql
UPDATE cvh_transactions.withdrawals
SET status='cancelled', failure_reason='superseded by worker fix 2026-05-08'
WHERE id IN (1,2,3,4);
```

No deletion — keep the audit trail.

## 5. Data flow (corrected withdrawal path)

```
Client                 client-api          core-wallet      cron-worker (BullMQ)        BSC chain
  |                       |                    |                   |                       |
  | POST /withdrawals     |                    |                   |                       |
  |---------------------->|                    |                   |                       |
  |                       | check deploy_status|                   |                       |
  |                       |    (guardrail)     |                   |                       |
  |                       | resolve tokenId/   |                   |                       |
  |                       |    toAddressId     |                   |                       |
  |                       |------------------->|                   |                       |
  |                       |                    | INSERT pending_approval                   |
  |                       |<-------------------|                   |                       |
  |                       |                    |                   |                       |
  | POST /:id/approve     |                    |                   |                       |
  |---------------------->|------------------->| status=approved   |                       |
  |                       |                    |                   |                       |
  |                       |                    |   (poll 30s)      |                       |
  |                       |                    |<------------------| pickup approved       |
  |                       |                    | claim broadcasting|                       |
  |                       |                    |                   |                       |
  |                       |                    |                   | getNextSequenceId  -->|
  |                       |                    |                   |<--                    |
  |                       |                    |                   | build opHash incl.    |
  |                       |                    |                   |   address(this)       |
  |                       |                    |                   | KV.sign(prefixedHash, |
  |                       |                    |                   |    keyType=backup)    |
  |                       |                    |                   | build sendMultiSig    |
  |                       |                    |                   |    calldata           |
  |                       |                    |                   | KV.signTransaction(   |
  |                       |                    |                   |    keyType=platform)  |
  |                       |                    |                   | broadcast --------->  |
  |                       |                    |                   |<--- txHash            |
  |                       |                    | tx_hash, broadcast|                       |
  |                       |                    |                   |                       |
  |                       |                    | confirm tracker ->|                       |
  |                       |                    |   getReceipt      |                       |
  |                       |                    |<------ confirmed  |                       |
  |                       |                    | status=confirmed  |                       |
```

## 6. Error handling

- **Worker tx revert** — set `status='failed'`, populate `failure_reason` from receipt status / revert string. The 4 stale withdrawals already have null `failure_reason`; new ones will have it.
- **Worker exception during build** — three retries with exponential backoff (existing BullMQ config). On final failure, `status='failed'`, log error, no auto-retry on subsequent ticks.
- **Top-up: gas tank empty** — emit `gas_tank.low_balance` alert with chain id and project id; don't fail the cron tick. Other chains/projects continue.
- **API guardrail trip** — 422 with shape `{statusCode:422, message:'project deployment not ready', details:{deployStatus,projectId,chainId}}`.

## 7. Testing

- **Unit, in `cron-worker-service`:**
  - `OperationHashBuilder` — given fixed input vector, produces hash matching a hardcoded golden value (computed once via local Hardhat call to the actual contract).
  - `SendMultiSigCalldata` — encodes correctly with both backup and platform key roles.
- **Integration, in `cron-worker-service`:**
  - Mocked Key Vault returns deterministic signatures; mocked `EvmProvider` confirms the broadcast path is correct shape; assert tx hash flows through.
- **E2E:** the existing homologation suite re-run validates the full path. Add a new step before `Aguardar withdrawal.broadcast` that explicitly checks `getNextSequenceId() == sequenceId+1` after broadcast (proves the on-chain tx mutated state, not just got mined as a revert).
- **Top-up service:** unit test that thresholds are honored, that locks prevent duplicate top-ups, that low gas tank emits alert without throwing.

## 8. Files

**Modified:**
- `services/cron-worker-service/src/withdrawal/withdrawal-worker.service.ts` (worker bugs)
- `services/cron-worker-service/src/sweep/transaction-submitter.service.ts` (no change required; reused as-is for top-up signing)
- `services/cron-worker-service/src/gas-tank/gas-tank.module.ts` (register `PlatformKeyTopupService`)
- `services/client-api/src/withdrawal/withdrawal.service.ts` (deploy_status guardrail)
- `services/client-api/src/deposit/deposit.service.ts` (deploy_status guardrail)
- `services/core-wallet-service/prisma/schema.prisma` (`Chain.platformTopupThresholdWei`, `Chain.platformTopupAmountWei`)
- `services/cron-worker-service/prisma/schema.prisma` (mirror)

**Created:**
- `services/cron-worker-service/src/gas-tank/platform-key-topup.service.ts`
- `services/cron-worker-service/src/withdrawal/operation-hash.ts` (small pure module — easy to unit-test)
- `services/client-api/src/common/guards/project-chain-ready.guard.ts`
- `scripts/recovery/recover-gas-tank.ts`
- `services/cron-worker-service/src/withdrawal/operation-hash.spec.ts`

**Migrations:**
- `cvh_wallets.chains.platform_topup_threshold_wei VARCHAR(78) NULL`
- `cvh_wallets.chains.platform_topup_amount_wei VARCHAR(78) NULL`
- (Optional) `cvh_transactions.withdrawals.failure_reason VARCHAR(500) NULL` if not already present.

## 9. Out of scope

- Cosign mode (client key as co-signer) — deferred. Hot path stays platform/backup.
- Multi-broadcaster failover (rotate to client key if platform key disabled) — deferred.
- ERC-20 withdrawal validation — already covered by the same operationHash fix; no separate work.
- Wizard UX changes — not needed; wizard already deploys correctly.

## 10. Acceptance criteria

1. `operation-hash.spec.ts` passes against a golden vector derived from the deployed contract.
2. Recovery withdrawal (hot wallet → `0x95DEda…`) lands as `confirmed` on BSC.
3. Recovery transfer (gas tank → `0x95DEda…`) lands as `confirmed` on BSC.
4. Homologation suite, with a fresh deposit, runs end-to-end and reports 11/11 PASS.
5. With `project_chains.deploy_status='pending'` (synthetic), `POST /v1/withdrawals` returns 422 with the explicit status in the body.
6. With platform-key EOA balance below threshold (synthetic), the top-up cron tops it up within one tick and emits the metric.
