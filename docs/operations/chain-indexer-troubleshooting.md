# Chain Indexer Troubleshooting Guide

## Architecture Overview

The chain-indexer-service (`localhost:3006`) monitors EVM blockchains for deposits to monitored addresses. It consists of the following components:

| Component | Schedule | Purpose |
|-----------|----------|---------|
| **BlockProcessorService** | Continuous | Scans blocks for native + ERC20 transfers to/from monitored addresses, writes to `indexed_events` and `indexed_blocks` |
| **SyncHealthService** | Every 30s (cron) | Checks each chain's sync lag, updates `sync_cursors`, pushes Prometheus metrics |
| **GapDetectorService** | Every 5min (cron) | Detects missing blocks between `start_block` and `last_block`, inserts `sync_gaps`, enqueues backfill jobs |
| **BackfillWorker** | BullMQ consumer | Processes gap ranges in batches of 100 blocks using BlockProcessorService |
| **FinalityTrackerService** | Periodic | Marks blocks as finalized once they pass the chain's `finality_threshold` |
| **ReorgRollbackHandler** | Redis Stream consumer (`chain:reorg`) | Rolls back indexed data (events, blocks, balances) when a chain reorg is detected |
| **AddressRegistrationHandler** | Redis Stream consumer (`address:registered`) | Registers new monitored addresses, creates sync cursors, invalidates caches |
| **BalanceMaterializerService** | Periodic | Computes `materialized_balances` from finalized indexed events |

---

## 1. Checking Sync Status

### Via Admin API

```bash
# Get sync health for all chains
curl -s http://localhost:3006/sync-health | jq

# Response shows per-chain status:
# {
#   "chains": [
#     {
#       "chainId": 1,
#       "chainName": "Ethereum",
#       "lastBlock": 19500000,
#       "latestFinalizedBlock": 19499968,
#       "chainHeadBlock": 19500005,
#       "blocksBehind": 5,
#       "status": "healthy",
#       "gapCount": 0,
#       "lastUpdated": "2026-04-23T10:00:00.000Z",
#       "lastError": null
#     }
#   ]
# }
```

### Via Direct SQL

```sql
-- Check sync cursor state for all chains
SELECT
  sc.chain_id,
  c.name AS chain_name,
  sc.last_block,
  sc.latest_finalized_block,
  sc.blocks_behind,
  sc.indexer_status,
  sc.last_error,
  sc.last_error_at,
  sc.updated_at
FROM cvh_indexer.sync_cursors sc
JOIN cvh_indexer.chains c ON c.chain_id = sc.chain_id
ORDER BY sc.chain_id;
```

### Status Thresholds

| Status | blocks_behind | Condition |
|--------|--------------|-----------|
| `healthy` | < 5 | Indexer is keeping up |
| `degraded` | 5 - 50 | Indexer is falling behind (may be catching up after restart) |
| `critical` | > 50 | Indexer is significantly behind, investigate immediately |
| `error` | any | No progress for 5+ minutes (stale), or RPC provider unreachable |

### Prometheus Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `sync_blocks_behind` | `chain_id` | Current blocks behind chain head |
| `sync_gaps_open` | `chain_id` | Number of open (detected + backfilling) gaps |
| `sync_indexer_status` | `chain_id` | 0 = stopped/stale, 1 = running |

Query in Grafana:
```promql
sync_blocks_behind{chain_id="1"}
```

---

## 2. Identifying and Resolving Gaps

Gaps are missing block ranges between the earliest monitored address `start_block` and the current `last_block`. The GapDetectorService runs every 5 minutes and checks for blocks that are neither in `indexed_blocks` nor marked as scanned in Redis (`scanned:<chainId>:<blockNumber>`).

### Check for Open Gaps

```bash
# Via API -- filter by chain and/or status
curl -s "http://localhost:3006/sync-gaps?chainId=1&status=detected" | jq

# Response:
# {
#   "gaps": [
#     {
#       "id": 42,
#       "chainId": 1,
#       "gapStartBlock": 19400100,
#       "gapEndBlock": 19400150,
#       "status": "detected",
#       "attemptCount": 0,
#       "maxAttempts": 5,
#       "lastError": null,
#       "detectedAt": "2026-04-23T09:00:00.000Z",
#       "resolvedAt": null
#     }
#   ]
# }
```

```sql
-- Direct SQL: open gaps ordered by size
SELECT
  id,
  chain_id,
  gap_start_block,
  gap_end_block,
  (gap_end_block - gap_start_block + 1) AS gap_size,
  status,
  attempt_count,
  max_attempts,
  last_error,
  detected_at
FROM cvh_indexer.sync_gaps
WHERE status IN ('detected', 'backfilling')
ORDER BY chain_id, gap_start_block;
```

### Trigger Manual Backfill

```bash
# Retry a specific gap (resets attempt_count to 0 and enqueues backfill job)
curl -X POST http://localhost:3006/sync-gaps/42/retry | jq

# Response: { "message": "Backfill retry enqueued for gap 42" }
```

### Check Failed Gaps

```sql
-- Gaps that exhausted their retry attempts
SELECT id, chain_id, gap_start_block, gap_end_block, attempt_count, last_error
FROM cvh_indexer.sync_gaps
WHERE status = 'failed'
ORDER BY detected_at DESC;
```

To reset a failed gap for retry:

```sql
UPDATE cvh_indexer.sync_gaps
SET status = 'detected', attempt_count = 0, last_error = NULL, resolved_at = NULL
WHERE id = <GAP_ID>;
```

Then trigger backfill via the API: `POST /sync-gaps/<GAP_ID>/retry`.

### BackfillWorker Details

- Processes gaps in batches of 100 blocks.
- Each block is processed by `BlockProcessorService.processBlock()`.
- Successfully scanned blocks are cached in Redis (`scanned:<chainId>:<blockNumber>`, 24h TTL) to prevent the gap detector from re-flagging empty blocks.
- Default max attempts: 5, with exponential backoff (30s base).
- Job progress is reported to BullMQ (visible in monitoring).

---

## 3. Handling Chain Reorgs

A chain reorganization occurs when the blockchain switches to a longer fork, invalidating previously confirmed blocks. The `ReorgRollbackHandler` consumes `chain:reorg` Redis Stream events and performs a multi-step rollback.

### Check Reorg History

```bash
# Via API
curl -s "http://localhost:3006/reorgs?chainId=1&limit=10" | jq

# Response:
# {
#   "reorgs": [
#     {
#       "id": 1,
#       "chainId": 1,
#       "reorgAtBlock": 19499990,
#       "oldBlockHash": "0xabc...",
#       "newBlockHash": "0xdef...",
#       "depth": 3,
#       "eventsInvalidated": 12,
#       "balancesRecalculated": 5,
#       "detectedAt": "2026-04-23T08:00:00.000Z",
#       "reindexedAt": "2026-04-23T08:00:05.000Z"
#     }
#   ]
# }
```

```sql
-- Direct SQL
SELECT
  id, chain_id, reorg_at_block, depth,
  events_invalidated, balances_recalculated,
  detected_at, reindexed_at
FROM cvh_indexer.reorg_log
WHERE chain_id = 1
ORDER BY detected_at DESC
LIMIT 20;
```

### What the Rollback Does (10 Steps)

1. Fetches deposit events (`erc20_transfer`, `native_transfer`) at `block >= forkBlock` for `deposits:reverted` notifications.
2. Collects all affected addresses (from/to) for balance cleanup.
3. **DELETE** `indexed_events` at `block >= forkBlock`.
4. **DELETE** `indexed_blocks` at `block >= forkBlock`.
5. **DELETE** `materialized_balances` for all affected addresses on the chain.
6. Reset balance materializer Redis watermark to `forkBlock - 1`.
7. Reset `sync_cursors.last_block` to `forkBlock - 1` so the indexer re-scans.
8. Invalidate block hash cache in Redis for invalidated blocks.
9. Publish `deposits:reverted` events to Redis Stream for each invalidated deposit.
10. Log to `reorg_log` table for audit trail.

### Verifying Rollback Completed

After a reorg, check that:

1. `sync_cursors.last_block` is set to `forkBlock - 1` (indexer will re-scan from there).
2. No `indexed_events` exist at `block >= forkBlock` for the affected chain.
3. No `indexed_blocks` exist at `block >= forkBlock` for the affected chain.
4. `materialized_balances` for affected addresses have been deleted (will be re-materialized).

```sql
-- Verify events are rolled back
SELECT COUNT(*) FROM cvh_indexer.indexed_events
WHERE chain_id = <CHAIN_ID> AND block_number >= <FORK_BLOCK>;
-- Should be 0

-- Verify sync cursor was reset
SELECT last_block FROM cvh_indexer.sync_cursors WHERE chain_id = <CHAIN_ID>;
-- Should be forkBlock - 1
```

### Manual Reorg Trigger

If a reorg was not automatically detected, you can manually publish a reorg event to the Redis Stream:

```bash
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" \
  XADD chain:reorg '*' \
  chainId <CHAIN_ID> \
  reorgFromBlock <FORK_BLOCK> \
  depth <DEPTH> \
  detectedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
```

---

## 4. Adding a New Chain

### Via Admin API (Recommended)

```bash
curl -X POST http://localhost:3006/chains \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 42161,
    "name": "Arbitrum One",
    "symbol": "ETH",
    "shortName": "arb1",
    "rpcEndpoints": ["https://arb1.gateway.tatum.io/"],
    "blockTimeSeconds": 0.25,
    "confirmationsRequired": 64,
    "finalityThreshold": 64,
    "explorerUrl": "https://arbiscan.io",
    "isActive": true,
    "isTestnet": false
  }'
```

### Verify the Indexer Picks It Up

1. Check that the chain appears in the chain list:

```bash
curl -s http://localhost:3006/chains | jq '.chains[] | select(.chainId == 42161)'
```

2. The `SyncHealthService` runs every 30 seconds and will automatically detect the new chain.
3. A `sync_cursors` entry is created when the first `address:registered` event arrives for this chain (via `AddressRegistrationHandler`).
4. To manually initialize the sync cursor:

```sql
INSERT INTO cvh_indexer.sync_cursors (chain_id, last_block, indexer_status)
VALUES (42161, <STARTING_BLOCK>, 'syncing');
```

### Post-Addition Checklist

- [ ] Chain appears in `GET /sync-health` output
- [ ] RPC endpoint is reachable (check chain-indexer-service logs for connection errors)
- [ ] Deploy smart contracts (wallet factory, forwarder factory) to the new chain
- [ ] Register contract addresses via `PATCH /chains/<chainId>`
- [ ] Add tokens for the chain via `POST /tokens`
- [ ] Create wallets for existing clients on the new chain
- [ ] Monitor sync status for the first hour

---

## 5. Debugging Missed Deposits

If a deposit was made to a monitored address but does not appear in `indexed_events`:

### Step 1: Verify the Address is Monitored

```sql
SELECT *
FROM cvh_indexer.monitored_addresses
WHERE address = LOWER('<DEPOSIT_ADDRESS>')
  AND chain_id = <CHAIN_ID>
  AND is_active = 1;
```

If no rows returned, the address is not being monitored. Check if the `address:registered` event was published when the wallet was created. The `AddressRegistrationHandler` listens on the `address:registered` Redis Stream.

### Step 2: Check if the Block Was Indexed

```sql
SELECT *
FROM cvh_indexer.indexed_blocks
WHERE chain_id = <CHAIN_ID>
  AND block_number = <DEPOSIT_BLOCK>;
```

If no rows returned, the block was not processed. Check if it falls in a gap:

```sql
SELECT *
FROM cvh_indexer.sync_gaps
WHERE chain_id = <CHAIN_ID>
  AND gap_start_block <= <DEPOSIT_BLOCK>
  AND gap_end_block >= <DEPOSIT_BLOCK>;
```

### Step 3: Check if the Block Was Scanned but Empty

```bash
# Check Redis for scanned marker
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" \
  GET "scanned:<CHAIN_ID>:<DEPOSIT_BLOCK>"
```

If the block was scanned but no events were found, the deposit may not match a monitored address (check step 1) or the transfer was to a contract address not in the monitored list.

### Step 4: Verify the Transaction On-Chain

```bash
# Use the chain's RPC to verify the transaction exists and is confirmed
curl -X POST <RPC_URL> \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_getTransactionReceipt",
    "params": ["<TX_HASH>"],
    "id": 1
  }'
```

Confirm:
- The transaction is in the expected block.
- The `to` address matches the monitored address (for native transfers).
- For ERC20: check `logs` for a `Transfer(address,address,uint256)` event where the `to` topic matches the monitored address.

### Step 5: Check the Sync Cursor

```sql
SELECT last_block FROM cvh_indexer.sync_cursors WHERE chain_id = <CHAIN_ID>;
```

If `last_block` is below the deposit block, the indexer has not reached that block yet. Check the `blocksBehind` value in sync health.

### Step 6: Check for Address Cache Staleness

The `BlockProcessorService` caches monitored addresses in memory with a 60-second TTL. If a wallet was created very recently (within the last minute), the address may not be in the cache when the deposit block was processed. In this case:

1. The address was registered via `AddressRegistrationHandler`, which calls `blockProcessor.invalidateCache(chainId)`.
2. If the cache was not invalidated in time, the block was processed without the new address.
3. This block will appear in `indexed_blocks` but the deposit event will not be in `indexed_events`.
4. The gap detector will NOT flag this as a gap (the block was indexed).
5. **Resolution:** Manually trigger a re-scan of the specific block range:

```sql
-- Delete the indexed_blocks entry so the gap detector re-flags it
DELETE FROM cvh_indexer.indexed_blocks
WHERE chain_id = <CHAIN_ID> AND block_number = <DEPOSIT_BLOCK>;

-- Also clear the Redis scanned marker
-- docker compose exec redis redis-cli -a "$REDIS_PASSWORD" DEL "scanned:<CHAIN_ID>:<DEPOSIT_BLOCK>"
```

Wait for the gap detector (runs every 5 minutes) to detect and backfill the missing block.

### Step 7: Check Indexed Events

If all the above checks pass, look for the event in `indexed_events`:

```sql
SELECT *
FROM cvh_indexer.indexed_events
WHERE chain_id = <CHAIN_ID>
  AND tx_hash = '<TX_HASH>';
```

```bash
# Or via API -- recent events for a chain
curl -s "http://localhost:3006/events/recent?chainId=<CHAIN_ID>&limit=50" | jq
```

---

## 6. Common Error Messages

### SyncHealthService Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `Health check failed for chain <id>: <message>` | RPC provider unreachable or returned an error | Check RPC endpoint URL, API key validity, rate limits |
| `Indexer stale - no progress` | No blocks indexed for 5+ minutes | Check chain-indexer logs for blocking errors, restart if stuck |

### BlockProcessorService Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `Block <N> not found on chain <id>` | RPC returned null for block -- may be ahead of the node's sync | Wait and retry; check if RPC node is fully synced |
| `Failed to get ERC20 logs for block <N>` | `eth_getLogs` call failed | Check RPC rate limits; some providers throttle log queries |

### GapDetectorService Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `Gap detection failed for chain <id>` | Error during gap detection query | Check database connectivity, verify `indexed_blocks` table is not locked |

### BackfillWorker Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `Gap <id> not found, skipping` | Gap was deleted between detection and processing | No action needed |
| `Gap <id> exceeded max attempts (<N>)` | Backfill failed 5 times -- marked as `failed` | Investigate `last_error`, fix the root cause (usually RPC issues), then retry via API |
| `Failed to process block <N> during backfill` | Individual block processing failed during backfill | Block will not be scanned; gap detector may re-flag it later |

### ReorgRollbackHandler Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `Skipping reorg entry with missing chainId or reorgFromBlock` | Malformed reorg event in Redis Stream | Check what published to `chain:reorg` stream |
| `Consumer loop error` | Redis connection issue | Handler retries after 1 second; check Redis connectivity |

### AddressRegistrationHandler Errors

| Error | Meaning | Action |
|-------|---------|--------|
| `Skipping entry with missing chainId or address` | Malformed event in `address:registered` stream | Check core-wallet-service publish logic |
| `Failed to process <stream>/<id>` | Error registering address (DB or RPC issue) | Message stays pending in consumer group and will be retried via periodic recovery (every 60s) |

---

## 7. Service Restart Procedures

### Restart Chain Indexer

```bash
# On production server (green@vaulthub.live)
cd /docker/CryptoVaultHub
docker compose restart chain-indexer-service

# Verify it comes back healthy
docker compose ps chain-indexer-service
curl -s http://localhost:3006/health | jq
```

### Clear Redis State (Nuclear Option)

If the indexer is in an unrecoverable state, you can clear its Redis state and let it rebuild:

```bash
# Clear sync progress timestamps
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "sync:progress:*"
# Then DEL each key

# Clear scanned block markers (will cause gap detector to re-check all blocks)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "scanned:*"
# Then DEL each key -- WARNING: this will trigger full gap detection

# Clear balance watermarks (forces re-materialization)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "balance:watermark:*"
# Then DEL each key
```

### Reset a Chain's Sync Cursor

To force the indexer to re-scan from a specific block:

```sql
UPDATE cvh_indexer.sync_cursors
SET last_block = <TARGET_BLOCK>, indexer_status = 'syncing', blocks_behind = 0
WHERE chain_id = <CHAIN_ID>;
```

> **WARNING:** Blocks before `TARGET_BLOCK` that were already indexed will not be re-scanned unless you also delete the corresponding `indexed_blocks` rows.
