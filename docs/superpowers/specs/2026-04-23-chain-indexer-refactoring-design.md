# Chain Indexer Refactoring — Selective Monitoring & Queue-Orchestrated Pipeline

**Date:** 2026-04-23
**Status:** Approved

## Problem

The chain-indexer-service has several critical issues:

1. Polls ALL active chains regardless of whether they have monitored addresses, wasting RPC calls and hitting rate limits
2. GapDetector detects gaps but never inserts into `sync_gaps` and never enqueues backfill jobs — the recovery pipeline is disconnected
3. BackfillModule is not registered in AppModule — the backfill worker never starts
4. BlockProcessor does not filter transactions by monitored addresses — processes everything in a block
5. `indexed_events` is never populated — BalanceMaterializerService reads from it but nothing writes to it
6. FinalityTracker hardcodes finality thresholds instead of reading from the DB
7. New addresses deployed after startup are not picked up — no live refresh mechanism
8. `indexed_blocks` stores a row for every block processed, not just blocks with relevant transactions

## Core Principle

**No Monitored Addresses = No Work.** Every service in the indexer only spends RPC calls and storage on chains that have at least one entry in `monitored_addresses`. If a chain has zero monitored addresses, it is completely ignored — no polling, no finality tracking, no gap detection.

## Storage Model

Only relevant data is stored:

- **`indexed_blocks`**: keeps ONLY blocks that contained at least one transaction involving a monitored address. Fields: chainId, blockNumber, blockHash, parentHash, blockTimestamp, eventsDetected. No raw block JSON.
- **`indexed_events`**: stores extracted transaction data for monitored addresses only. Fields: chainId, blockNumber, txHash, fromAddress, toAddress, value, tokenAddress, eventType (native_transfer/erc20_transfer), logIndex, isFinalized. No full transaction objects.
- **`sync_gaps`**: tracks block ranges that were skipped and need backfill. Fields: chainId, fromBlock, toBlock, gapSize, status (pending/backfilling/resolved/failed).
- **`sync_cursors`**: one row per chain, tracks `last_block` (last block fully scanned) and `latest_finalized_block`.

## Queue Architecture

All block processing flows through BullMQ queues.

### Queues

| Queue | Purpose | Producer | Consumer |
|-------|---------|----------|----------|
| `block-scan` | Scan a single block for relevant transactions | PollingDetector, RealtimeDetector | BlockScanWorker |
| `backfill` | Process missed/gap blocks in batches | GapDetector | BackfillWorker |

### Flow 1: Normal Operation (new blocks)

1. `PollingDetectorService` runs a cron (every 15s). For each chain with `monitored_addresses.count > 0`, it calls `eth_blockNumber` to get the latest block.
2. For each new block since `sync_cursors.last_block`, it enqueues a `block-scan` job: `{ chainId, blockNumber }`.
3. `BlockScanWorker` processes the job:
   a. Fetches the block via RPC (`eth_getBlockByNumber` with full transactions)
   b. Loads monitored addresses for this chain (cached in-memory with 60s TTL)
   c. Filters: native transfers where `from` or `to` is a monitored address
   d. Filters: ERC20 Transfer events where `from` or `to` is a monitored address (via `eth_getLogs` with Transfer topic)
   e. If relevant transactions found: inserts into `indexed_events`, inserts block metadata into `indexed_blocks`
   f. If no relevant transactions: does NOT insert into `indexed_blocks`
   g. Checks `parent_hash` against previous block for reorg detection (only for non-finalized blocks)
   h. Updates `sync_cursors.last_block`
   i. Publishes detected deposits to `deposits:detected` Redis Stream (existing flow, unchanged)

### Flow 2: New Address Deployment

1. When core-wallet-service creates a wallet, gas tank, or deposit address, it publishes to `address:registered` Redis Stream with `{ chainId, address, clientId, projectId, walletId, addressType }`.
2. `AddressRegistrationHandler` in chain-indexer-service consumes this stream:
   a. Upserts into `monitored_addresses` with `start_block = current block number`
   b. If this is the first address on this chain: inserts `sync_cursors` with `last_block = start_block - 1`
   c. Signals PollingDetector to include this chain in the next cycle

### Flow 3: Gap Recovery (backward sync)

1. `GapDetectorService` runs a cron (every 5 min). Only processes chains with monitored addresses.
2. For each chain, queries `sync_cursors.last_block` and compares against `indexed_blocks` to find block number gaps where no scan was performed.
3. For each gap found: inserts into `sync_gaps` with status `pending`, enqueues `backfill` jobs in batches of 100 blocks.
4. `BackfillWorker` processes each batch:
   a. Marks the `sync_gaps` row as `backfilling`
   b. For each block in the range: same logic as BlockScanWorker (filter by monitored addresses, save only relevant data)
   c. Marks the gap as `resolved` when complete, or `failed` with error details on failure
5. Failed gaps are retried up to 3 times with exponential backoff. After 3 failures, they stay as `failed` for manual intervention via `POST /sync-gaps/:id/retry`.

Note: gap detection uses the absence of `indexed_blocks` entries to identify gaps. Since blocks with no relevant transactions are not stored, gap detection works by comparing `sync_cursors.last_block` against the range of blocks that SHOULD have been scanned (based on block numbers), not against stored blocks. The worker tracks "scanned but empty" blocks in a lightweight Redis set (`scanned:{chainId}`) with a 24h TTL to distinguish "scanned and found nothing" from "never scanned."

### Flow 4: Finality Confirmation

1. `FinalityTrackerService` runs a cron (every 30s). Only processes chains with monitored addresses.
2. Reads `finality_threshold` from the `chains` table in the database (not hardcoded).
3. For each chain: gets current block number, computes `finalized_block = current - threshold`.
4. Marks `indexed_events` rows at or below `finalized_block` as `is_finalized = true`.
5. Updates `sync_cursors.latest_finalized_block`.
6. Triggers `BalanceMaterializerService.materializeForChain()` for balance recalculation.

### Flow 5: Reorg Detection

1. During `BlockScanWorker` processing, for non-finalized blocks: checks if the block's `parent_hash` matches the `block_hash` of `blockNumber - 1` in `indexed_blocks`.
2. If mismatch: the chain has reorged.
   a. Marks affected `indexed_events` as `is_reorged = true`
   b. Inserts into `reorg_log` with details
   c. Re-enqueues affected blocks via `block-scan` queue for re-processing
3. Finalized blocks are never checked for reorgs — they are immutable.

## Schema Changes

### `monitored_addresses` — add `start_block` column

```sql
ALTER TABLE monitored_addresses ADD COLUMN start_block BIGINT NOT NULL DEFAULT 0;
```

This column records the block number at which monitoring began for this address. Used to initialize `sync_cursors.last_block` when the first address on a chain is deployed.

### `indexed_events` — ensure columns exist

The table exists but is never written to. Verify it has:
- `chain_id`, `block_number`, `tx_hash`, `log_index`
- `from_address`, `to_address`, `value`, `token_address`
- `event_type` (native_transfer / erc20_transfer)
- `is_finalized` (boolean, default false)
- `is_reorged` (boolean, default false)
- `created_at`

### No new tables needed

`indexed_blocks`, `sync_gaps`, `sync_cursors`, `reorg_log` all exist already.

## File Changes Summary

| File | Change |
|------|--------|
| `app.module.ts` | Register BackfillModule |
| `polling-detector.service.ts` | Only poll chains with monitored addresses |
| `realtime-detector.service.ts` | Add `address:registered` Redis Stream consumer for live address refresh |
| `block-processor.service.ts` | Refactor into `block-scan.worker.ts` — filter by monitored addresses, write to `indexed_events`, write `indexed_blocks` only for relevant blocks, add reorg check |
| `gap-detector.service.ts` | Insert gaps into `sync_gaps`, enqueue `backfill` jobs, use Redis set for "scanned empty" tracking |
| `backfill.worker.ts` | Already functional — reuse block scan logic, add retry/failure handling |
| `finality-tracker.service.ts` | Read thresholds from DB, only active chains, mark `indexed_events` not `indexed_blocks` |
| `balance-materializer.service.ts` | No change — works once `indexed_events` is populated |
| core-wallet-service (wallet.service.ts, deposit.service.ts) | Publish to `address:registered` Redis Stream on wallet/address creation |

## What This Does NOT Do

- Does NOT store raw block JSON or full transaction lists
- Does NOT poll chains without monitored addresses
- Does NOT sync from genesis — starts from the block where the first address was deployed
- Does NOT require massive storage — only monitored-address transactions are persisted
- Does NOT change the existing deposit detection Redis Stream flow
