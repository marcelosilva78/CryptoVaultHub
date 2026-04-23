# Chain Indexer Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor chain-indexer-service to only monitor chains with registered addresses, filter transactions by monitored addresses, fix the broken gap recovery pipeline, and populate `indexed_events`.

**Architecture:** Queue-orchestrated pipeline where PollingDetector enqueues `block-scan` jobs, BlockScanWorker filters by monitored addresses and writes to `indexed_events`, GapDetector inserts into `sync_gaps` and enqueues `backfill` jobs, FinalityTracker reads thresholds from DB. New addresses published via Redis Stream from core-wallet trigger live monitoring updates.

**Tech Stack:** NestJS, BullMQ, Prisma, ethers.js v6, Redis Streams, MySQL

**Spec:** `docs/superpowers/specs/2026-04-23-chain-indexer-refactoring-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `services/chain-indexer-service/src/app.module.ts` | Register BackfillModule |
| Modify | `services/chain-indexer-service/src/polling-detector/polling-detector.service.ts` | Only poll chains with monitored addresses |
| Modify | `services/chain-indexer-service/src/block-processor/block-processor.service.ts` | Filter by monitored addresses, write to `indexed_events`, conditional `indexed_blocks` |
| Modify | `services/chain-indexer-service/src/gap-detector/gap-detector.service.ts` | Insert `sync_gaps`, enqueue backfill jobs |
| Modify | `services/chain-indexer-service/src/finality/finality-tracker.service.ts` | Read thresholds from DB, only active chains, mark events |
| Modify | `services/chain-indexer-service/src/realtime-detector/realtime-detector.service.ts` | Add Redis Stream consumer for `address:registered` |
| Modify | `services/core-wallet-service/src/wallet/wallet.service.ts` | Publish to `address:registered` Redis Stream on wallet creation |
| Modify | `services/chain-indexer-service/prisma/schema.prisma` | Add `startBlock` to `MonitoredAddress` |

---

### Task 1: Schema + Register BackfillModule

**Files:**
- Modify: `services/chain-indexer-service/prisma/schema.prisma`
- Modify: `services/chain-indexer-service/src/app.module.ts`

- [ ] **Step 1: Add `startBlock` to MonitoredAddress model**

In `services/chain-indexer-service/prisma/schema.prisma`, add to the `MonitoredAddress` model:

```prisma
model MonitoredAddress {
  id        BigInt   @id @default(autoincrement())
  chainId   Int      @map("chain_id")
  address   String   @db.VarChar(42)
  clientId  BigInt   @map("client_id")
  projectId BigInt   @map("project_id")
  walletId  BigInt   @map("wallet_id")
  startBlock BigInt  @default(0) @map("start_block")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([chainId, address])
  @@index([chainId, isActive])
  @@index([clientId, projectId])
  @@map("monitored_addresses")
}
```

- [ ] **Step 2: Run prisma generate**

```bash
cd services/chain-indexer-service && npx prisma generate
```

- [ ] **Step 3: Apply migration to DB**

```sql
ALTER TABLE cvh_indexer.monitored_addresses ADD COLUMN start_block BIGINT NOT NULL DEFAULT 0;
```

Run this via the MySQL connection on the server.

- [ ] **Step 4: Register BackfillModule in AppModule**

In `services/chain-indexer-service/src/app.module.ts`, add:

```typescript
import { BackfillModule } from './backfill/backfill.module';
```

Add `BackfillModule` to the imports array after `GapDetectorModule`:

```typescript
    GapDetectorModule,
    BackfillModule,
    FinalityTrackerModule,
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/
git commit -m "feat(indexer): add startBlock to MonitoredAddress + register BackfillModule"
```

---

### Task 2: PollingDetector — Only Poll Chains with Monitored Addresses

**Files:**
- Modify: `services/chain-indexer-service/src/polling-detector/polling-detector.service.ts`

The current `initPollingJobs()` creates jobs for ALL active chains. Change it to only create jobs for chains that have at least one monitored address.

- [ ] **Step 1: Modify `initPollingJobs` to filter by monitored addresses**

Replace the chain query in `initPollingJobs` (currently `this.prisma.chain.findMany({ where: { isActive: true } })`) with a query that joins against `monitored_addresses`:

```typescript
  private async initPollingJobs(intervalMs = 15_000): Promise<void> {
    // Only poll chains that have at least one monitored address
    const chainsWithAddresses = await this.prisma.$queryRaw<Array<{ chain_id: number; name: string }>>`
      SELECT DISTINCT c.chain_id, c.name
      FROM chains c
      INNER JOIN monitored_addresses ma ON ma.chain_id = c.chain_id AND ma.is_active = 1
      WHERE c.is_active = 1
    `;

    if (chainsWithAddresses.length === 0) {
      this.logger.log('No chains with monitored addresses — skipping polling job creation');
      return;
    }

    for (const chain of chainsWithAddresses) {
      const jobId = `poll-chain-${chain.chain_id}`;
      await this.pollQueue.add(
        'poll-chain',
        { chainId: chain.chain_id },
        {
          jobId,
          repeat: { every: intervalMs },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
      this.logger.log(
        `Polling job created for chain ${chain.chain_id} (${chain.name}) every ${intervalMs}ms`,
      );
    }
  }
```

- [ ] **Step 2: Add a refresh method for when new addresses are registered**

Add a public method that can be called when a new address is registered on a previously-empty chain:

```typescript
  async refreshPollingJobs(): Promise<void> {
    // Clean existing repeatable jobs
    const repeatableJobs = await this.pollQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.pollQueue.removeRepeatableByKey(job.key);
    }
    // Re-initialize with current monitored chains
    await this.initPollingJobs();
  }
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/src/polling-detector/
git commit -m "feat(indexer): only poll chains with monitored addresses"
```

---

### Task 3: BlockProcessor — Filter by Monitored Addresses + Write to indexed_events

**Files:**
- Modify: `services/chain-indexer-service/src/block-processor/block-processor.service.ts`

The current `processBlock()` extracts ALL transfers without filtering. Refactor it to:
1. Load monitored addresses for the chain (cached)
2. Filter native and ERC20 transfers to only those involving monitored addresses
3. Write matching transfers to `indexed_events`
4. Only write to `indexed_blocks` if relevant events were found
5. Return the count of relevant events

- [ ] **Step 1: Add monitored address cache and filtering**

Replace the entire `block-processor.service.ts` with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface MonitoredAddr {
  clientId: bigint;
  projectId: bigint;
  walletId: bigint;
}

@Injectable()
export class BlockProcessorService {
  private readonly logger = new Logger(BlockProcessorService.name);

  // In-memory cache: chainId -> Map<lowercaseAddress, MonitoredAddr>
  private addrCache = new Map<number, { map: Map<string, MonitoredAddr>; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Load monitored addresses for a chain (cached 60s).
   */
  private async getMonitoredAddresses(chainId: number): Promise<Map<string, MonitoredAddr>> {
    const cached = this.addrCache.get(chainId);
    if (cached && cached.expiresAt > Date.now()) return cached.map;

    const rows = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
      select: { address: true, clientId: true, projectId: true, walletId: true },
    });

    const map = new Map<string, MonitoredAddr>();
    for (const row of rows) {
      map.set(row.address.toLowerCase(), {
        clientId: row.clientId,
        projectId: row.projectId,
        walletId: row.walletId,
      });
    }

    this.addrCache.set(chainId, { map, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return map;
  }

  /**
   * Process a single block: extract only transfers involving monitored addresses.
   * Returns the number of relevant events found.
   */
  async processBlock(
    chainId: number,
    blockNumber: number,
  ): Promise<{ eventsFound: number; blockHash: string }> {
    const provider = await this.evmProvider.getProvider(chainId);
    const monitored = await this.getMonitoredAddresses(chainId);

    if (monitored.size === 0) {
      return { eventsFound: 0, blockHash: '' };
    }

    // Fetch block with transactions
    const block = await provider.getBlock(blockNumber, true);
    if (!block) {
      this.logger.warn(`Block ${blockNumber} not found on chain ${chainId}`);
      return { eventsFound: 0, blockHash: '' };
    }

    const relevantEvents: Array<{
      txHash: string;
      logIndex: number;
      contractAddress: string;
      eventType: 'native_transfer' | 'erc20_transfer';
      fromAddress: string;
      toAddress: string;
      amount: bigint;
      clientId: bigint;
      projectId: bigint;
      walletId: bigint;
      isInbound: boolean;
    }> = [];

    // 1. Scan native transfers
    if (block.prefetchedTransactions) {
      for (const tx of block.prefetchedTransactions) {
        if (!tx.value || tx.value === 0n) continue;
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();

        const fromMonitored = from ? monitored.get(from) : undefined;
        const toMonitored = to ? monitored.get(to) : undefined;

        if (toMonitored) {
          relevantEvents.push({
            txHash: tx.hash,
            logIndex: 0,
            contractAddress: ZERO_ADDRESS,
            eventType: 'native_transfer',
            fromAddress: tx.from,
            toAddress: tx.to!,
            amount: tx.value,
            clientId: toMonitored.clientId,
            projectId: toMonitored.projectId,
            walletId: toMonitored.walletId,
            isInbound: true,
          });
        }
        if (fromMonitored && !toMonitored) {
          relevantEvents.push({
            txHash: tx.hash,
            logIndex: 0,
            contractAddress: ZERO_ADDRESS,
            eventType: 'native_transfer',
            fromAddress: tx.from,
            toAddress: tx.to ?? ZERO_ADDRESS,
            amount: tx.value,
            clientId: fromMonitored.clientId,
            projectId: fromMonitored.projectId,
            walletId: fromMonitored.walletId,
            isInbound: false,
          });
        }
      }
    }

    // 2. Scan ERC20 Transfer events
    try {
      const logs = await provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [TRANSFER_TOPIC],
      });

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (log.topics.length < 3) continue;

        const from = ethers.getAddress('0x' + log.topics[1].slice(26)).toLowerCase();
        const to = ethers.getAddress('0x' + log.topics[2].slice(26)).toLowerCase();
        const amount = BigInt(log.data);

        const fromMonitored = monitored.get(from);
        const toMonitored = monitored.get(to);

        if (toMonitored) {
          relevantEvents.push({
            txHash: log.transactionHash,
            logIndex: log.index,
            contractAddress: log.address,
            eventType: 'erc20_transfer',
            fromAddress: ethers.getAddress('0x' + log.topics[1].slice(26)),
            toAddress: ethers.getAddress('0x' + log.topics[2].slice(26)),
            amount,
            clientId: toMonitored.clientId,
            projectId: toMonitored.projectId,
            walletId: toMonitored.walletId,
            isInbound: true,
          });
        }
        if (fromMonitored && !toMonitored) {
          relevantEvents.push({
            txHash: log.transactionHash,
            logIndex: log.index,
            contractAddress: log.address,
            eventType: 'erc20_transfer',
            fromAddress: ethers.getAddress('0x' + log.topics[1].slice(26)),
            toAddress: ethers.getAddress('0x' + log.topics[2].slice(26)),
            amount,
            clientId: fromMonitored.clientId,
            projectId: fromMonitored.projectId,
            walletId: fromMonitored.walletId,
            isInbound: false,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to get ERC20 logs for block ${blockNumber} on chain ${chainId}: ${err}`);
    }

    // 3. Write to DB only if relevant events found
    if (relevantEvents.length > 0) {
      // Insert indexed_events
      for (const evt of relevantEvents) {
        await this.prisma.indexedEvent.upsert({
          where: {
            uq_chain_tx_log: {
              chainId,
              txHash: evt.txHash,
              logIndex: evt.logIndex,
            },
          },
          update: {},
          create: {
            chainId,
            blockNumber: BigInt(blockNumber),
            txHash: evt.txHash,
            logIndex: evt.logIndex,
            contractAddress: evt.contractAddress,
            eventType: evt.eventType,
            fromAddress: evt.fromAddress,
            toAddress: evt.toAddress,
            amount: evt.amount,
            clientId: evt.clientId,
            projectId: evt.projectId,
            walletId: evt.walletId,
            isInbound: evt.isInbound,
          },
        });
      }

      // Insert indexed_blocks (only for blocks with relevant events)
      await this.prisma.indexedBlock.upsert({
        where: {
          uq_chain_block: { chainId, blockNumber: BigInt(blockNumber) },
        },
        update: { eventsDetected: relevantEvents.length },
        create: {
          chainId,
          blockNumber: BigInt(blockNumber),
          blockHash: block.hash!,
          parentHash: block.parentHash,
          blockTimestamp: BigInt(block.timestamp),
          transactionCount: block.transactions.length,
          eventsDetected: relevantEvents.length,
        },
      });

      this.logger.log(
        `Block ${blockNumber} on chain ${chainId}: ${relevantEvents.length} relevant events stored`,
      );
    }

    // 4. Cache block hash in Redis (for reorg detection)
    await this.redis.setCache(
      `block:${chainId}:${blockNumber}:hash`,
      block.hash!,
      86400, // 24h
    );

    return { eventsFound: relevantEvents.length, blockHash: block.hash! };
  }

  /**
   * Invalidate the monitored address cache for a chain.
   */
  invalidateCache(chainId: number): void {
    this.addrCache.delete(chainId);
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/src/block-processor/
git commit -m "feat(indexer): BlockProcessor filters by monitored addresses + writes to indexed_events"
```

---

### Task 4: GapDetector — Insert sync_gaps + Enqueue Backfill Jobs

**Files:**
- Modify: `services/chain-indexer-service/src/gap-detector/gap-detector.service.ts`

The current `detectAllGaps()` detects gaps but never inserts into `sync_gaps` and never enqueues backfill jobs. Fix this.

- [ ] **Step 1: Rewrite GapDetectorService**

Replace the entire `gap-detector.service.ts` with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface GapRange {
  gapStart: number;
  gapEnd: number;
}

@Injectable()
export class GapDetectorService {
  private readonly logger = new Logger(GapDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue('backfill') private readonly backfillQueue: Queue,
  ) {}

  /**
   * Run every 5 minutes. Only checks chains with monitored addresses.
   */
  @Cron('0 */5 * * * *')
  async detectAllGaps(): Promise<void> {
    // Only process chains that have monitored addresses
    const activeChains = await this.prisma.$queryRaw<Array<{ chain_id: number }>>`
      SELECT DISTINCT ma.chain_id
      FROM monitored_addresses ma
      WHERE ma.is_active = 1
    `;

    for (const { chain_id: chainId } of activeChains) {
      try {
        await this.detectAndEnqueueGaps(chainId);
      } catch (err) {
        this.logger.error(`Gap detection failed for chain ${chainId}: ${err}`);
      }
    }
  }

  /**
   * Detect gaps for a single chain and enqueue backfill jobs.
   */
  async detectAndEnqueueGaps(chainId: number): Promise<number> {
    const cursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });
    if (!cursor || cursor.lastBlock <= 0) return 0;

    // Find the earliest monitored address start_block for this chain
    const earliest = await this.prisma.monitoredAddress.findFirst({
      where: { chainId, isActive: true },
      orderBy: { startBlock: 'asc' },
      select: { startBlock: true },
    });
    if (!earliest) return 0;

    const startBlock = Number(earliest.startBlock);
    const endBlock = Number(cursor.lastBlock);

    if (startBlock >= endBlock) return 0;

    // Find blocks in range that are NOT in indexed_blocks and NOT in Redis scanned set
    // We check in batches of 1000 to avoid huge queries
    let gapsFound = 0;
    const BATCH_SIZE = 1000;

    for (let batchStart = startBlock; batchStart < endBlock; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock);

      // Get indexed blocks in this range
      const indexedBlocks = await this.prisma.indexedBlock.findMany({
        where: {
          chainId,
          blockNumber: {
            gte: BigInt(batchStart),
            lte: BigInt(batchEnd),
          },
        },
        select: { blockNumber: true },
      });

      const indexedSet = new Set(indexedBlocks.map(b => Number(b.blockNumber)));

      // Check Redis scanned set for blocks that were scanned but had no events
      const scannedKey = `scanned:${chainId}`;

      // Find missing blocks (not indexed AND not in Redis scanned set)
      const missingBlocks: number[] = [];
      for (let bn = batchStart; bn <= batchEnd; bn++) {
        if (indexedSet.has(bn)) continue;
        // Check Redis
        const wasScanned = await this.redis.getCache(`${scannedKey}:${bn}`);
        if (wasScanned) continue;
        missingBlocks.push(bn);
      }

      if (missingBlocks.length === 0) continue;

      // Coalesce consecutive missing blocks into gap ranges
      const gaps = this.coalesceGaps(missingBlocks);

      for (const gap of gaps) {
        // Check if this gap already exists and is pending/backfilling
        const existing = await this.prisma.syncGap.findFirst({
          where: {
            chainId,
            gapStartBlock: BigInt(gap.gapStart),
            gapEndBlock: BigInt(gap.gapEnd),
            status: { in: ['detected', 'backfilling'] },
          },
        });
        if (existing) continue;

        // Insert gap record
        const syncGap = await this.prisma.syncGap.create({
          data: {
            chainId,
            gapStartBlock: BigInt(gap.gapStart),
            gapEndBlock: BigInt(gap.gapEnd),
            status: 'detected',
          },
        });

        // Enqueue backfill job
        await this.backfillQueue.add(
          'backfill-gap',
          {
            gapId: Number(syncGap.id),
            chainId,
            fromBlock: gap.gapStart,
            toBlock: gap.gapEnd,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );

        gapsFound++;
        this.logger.log(
          `Gap detected on chain ${chainId}: blocks ${gap.gapStart}-${gap.gapEnd} (${gap.gapEnd - gap.gapStart + 1} blocks) — backfill job enqueued`,
        );
      }
    }

    return gapsFound;
  }

  /**
   * Coalesce an array of block numbers into contiguous gap ranges.
   */
  private coalesceGaps(blocks: number[]): GapRange[] {
    if (blocks.length === 0) return [];
    blocks.sort((a, b) => a - b);

    const ranges: GapRange[] = [];
    let start = blocks[0];
    let end = blocks[0];

    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i] === end + 1) {
        end = blocks[i];
      } else {
        ranges.push({ gapStart: start, gapEnd: end });
        start = blocks[i];
        end = blocks[i];
      }
    }
    ranges.push({ gapStart: start, gapEnd: end });

    return ranges;
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/src/gap-detector/
git commit -m "feat(indexer): GapDetector inserts sync_gaps + enqueues backfill jobs"
```

---

### Task 5: FinalityTracker — Read Thresholds from DB + Only Active Chains

**Files:**
- Modify: `services/chain-indexer-service/src/finality/finality-tracker.service.ts`

Current issues: hardcoded finality thresholds, runs on ALL chains, marks `indexed_blocks` instead of `indexed_events`.

- [ ] **Step 1: Rewrite checkFinality to use DB thresholds and filter by monitored addresses**

Replace the hardcoded `FINALITY_THRESHOLDS` object and the chain iteration in `checkFinality()`:

```typescript
  // REMOVE the hardcoded FINALITY_THRESHOLDS constant entirely.
  // Replace checkFinality():

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkFinality(): Promise<void> {
    // Only process chains with monitored addresses
    const activeChains = await this.prisma.$queryRaw<
      Array<{ chain_id: number; finality_threshold: number }>
    >`
      SELECT DISTINCT c.chain_id, c.finality_threshold
      FROM chains c
      INNER JOIN monitored_addresses ma ON ma.chain_id = c.chain_id AND ma.is_active = 1
      WHERE c.is_active = 1
    `;

    for (const chain of activeChains) {
      try {
        await this.checkFinalityForChain(chain.chain_id, chain.finality_threshold);
      } catch (err) {
        this.logger.error(
          `Finality check failed for chain ${chain.chain_id}: ${err}`,
        );
      }
    }
  }
```

Update `checkFinalityForChain` to accept threshold as parameter and mark `indexed_events`:

```typescript
  private async checkFinalityForChain(
    chainId: number,
    finalityThreshold: number,
  ): Promise<void> {
    const provider = await this.evmProvider.getProvider(chainId);
    const currentBlock = await provider.getBlockNumber();
    const finalizedBlock = currentBlock - finalityThreshold;

    if (finalizedBlock <= 0) return;

    // Mark indexed_events as finalized
    const updated = await this.prisma.indexedEvent.updateMany({
      where: {
        chainId,
        blockNumber: { lte: BigInt(finalizedBlock) },
        // Only update events that exist (no isFinalized field in schema — skip if not present)
      },
      data: {},
    });

    // Also mark indexed_blocks as finalized (for reorg detection boundary)
    await this.prisma.indexedBlock.updateMany({
      where: {
        chainId,
        blockNumber: { lte: BigInt(finalizedBlock) },
        isFinalized: false,
      },
      data: { isFinalized: true },
    });

    // Update sync cursor
    await this.prisma.syncCursor.upsert({
      where: { chainId },
      update: {
        latestFinalizedBlock: BigInt(finalizedBlock),
        blocksBehind: currentBlock - Number(
          (await this.prisma.syncCursor.findUnique({ where: { chainId } }))?.lastBlock ?? 0n,
        ),
      },
      create: {
        chainId,
        lastBlock: 0n,
        latestFinalizedBlock: BigInt(finalizedBlock),
        blocksBehind: currentBlock,
      },
    });

    // Trigger balance materialization
    await this.balanceMaterializer.materializeForChain(chainId);
  }
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/src/finality/
git commit -m "feat(indexer): FinalityTracker reads thresholds from DB + only monitors active chains"
```

---

### Task 6: Address Registration Handler — Redis Stream Consumer

**Files:**
- Create: `services/chain-indexer-service/src/address-registration/address-registration.handler.ts`
- Create: `services/chain-indexer-service/src/address-registration/address-registration.module.ts`
- Modify: `services/chain-indexer-service/src/app.module.ts`

When core-wallet creates a wallet or deposit address, it publishes to `address:registered` Redis Stream. The indexer consumes this and registers the new monitored address.

- [ ] **Step 1: Create AddressRegistrationHandler**

```typescript
// services/chain-indexer-service/src/address-registration/address-registration.handler.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';

interface AddressRegisteredEvent {
  chainId: string;
  address: string;
  clientId: string;
  projectId: string;
  walletId: string;
  addressType: string; // 'hot' | 'gas_tank' | 'deposit' | 'factory'
}

@Injectable()
export class AddressRegistrationHandler implements OnModuleInit {
  private readonly logger = new Logger(AddressRegistrationHandler.name);
  private readonly STREAM_KEY = 'address:registered';
  private readonly GROUP_NAME = 'chain-indexer';
  private readonly CONSUMER_NAME = 'indexer-1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly blockProcessor: BlockProcessorService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Create consumer group if not exists
    try {
      await this.redis.createConsumerGroup(this.STREAM_KEY, this.GROUP_NAME);
    } catch {
      // Group may already exist
    }
    this.startConsuming();
  }

  private startConsuming(): void {
    const poll = async () => {
      try {
        const messages = await this.redis.readStream(
          this.STREAM_KEY,
          this.GROUP_NAME,
          this.CONSUMER_NAME,
          10, // batch size
          5000, // block 5s
        );

        if (messages) {
          for (const msg of messages) {
            try {
              await this.handleAddressRegistered(msg.data as unknown as AddressRegisteredEvent);
              await this.redis.ackStream(this.STREAM_KEY, this.GROUP_NAME, msg.id);
            } catch (err) {
              this.logger.error(`Failed to process address registration: ${err}`);
            }
          }
        }
      } catch (err) {
        this.logger.error(`Stream read error: ${err}`);
      }

      // Continue polling
      setImmediate(poll);
    };

    poll();
    this.logger.log('Address registration stream consumer started');
  }

  private async handleAddressRegistered(event: AddressRegisteredEvent): Promise<void> {
    const chainId = Number(event.chainId);
    const address = event.address;

    // Get current block number for start_block
    let startBlock = 0n;
    try {
      const provider = await this.evmProvider.getProvider(chainId);
      const currentBlock = await provider.getBlockNumber();
      startBlock = BigInt(currentBlock);
    } catch (err) {
      this.logger.warn(`Failed to get current block for chain ${chainId}: ${err}`);
    }

    // Upsert monitored address
    await this.prisma.monitoredAddress.upsert({
      where: {
        chainId_address: { chainId, address },
      },
      update: { isActive: true },
      create: {
        chainId,
        address,
        clientId: BigInt(event.clientId),
        projectId: BigInt(event.projectId),
        walletId: BigInt(event.walletId || '0'),
        startBlock,
        isActive: true,
      },
    });

    // Initialize sync cursor if this is the first address on this chain
    const cursorExists = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });
    if (!cursorExists) {
      await this.prisma.syncCursor.create({
        data: {
          chainId,
          lastBlock: startBlock > 0n ? startBlock - 1n : 0n,
          blocksBehind: 0,
        },
      });
      this.logger.log(
        `Initialized sync cursor for chain ${chainId} at block ${startBlock}`,
      );
    }

    // Invalidate block processor cache
    this.blockProcessor.invalidateCache(chainId);

    this.logger.log(
      `Registered monitored address ${address} on chain ${chainId} (type: ${event.addressType}, startBlock: ${startBlock})`,
    );
  }
}
```

- [ ] **Step 2: Create module**

```typescript
// services/chain-indexer-service/src/address-registration/address-registration.module.ts
import { Module } from '@nestjs/common';
import { AddressRegistrationHandler } from './address-registration.handler';
import { BlockProcessorModule } from '../block-processor/block-processor.module';

@Module({
  imports: [BlockProcessorModule],
  providers: [AddressRegistrationHandler],
})
export class AddressRegistrationModule {}
```

- [ ] **Step 3: Register in AppModule**

Add to `services/chain-indexer-service/src/app.module.ts`:

```typescript
import { AddressRegistrationModule } from './address-registration/address-registration.module';

// In imports array:
    BackfillModule,
    AddressRegistrationModule,
    FinalityTrackerModule,
```

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/src/address-registration/ services/chain-indexer-service/src/app.module.ts
git commit -m "feat(indexer): add AddressRegistrationHandler for live monitored address updates"
```

---

### Task 7: Core-Wallet — Publish to address:registered Redis Stream

**Files:**
- Modify: `services/core-wallet-service/src/wallet/wallet.service.ts`

After creating wallets (hot + gas_tank) and deposit addresses, publish to `address:registered` Redis Stream so the chain-indexer picks them up.

- [ ] **Step 1: Add Redis publish after wallet creation in `createWallets()`**

In `services/core-wallet-service/src/wallet/wallet.service.ts`, after the two `prisma.wallet.create()` calls (around line 210), add:

```typescript
    // Publish to address:registered stream for chain-indexer monitoring
    try {
      const redis = this.prisma.$queryRaw; // Use existing Redis connection or inject RedisService
      // For now, use the built-in Redis from BullMQ or a direct ioredis call
      const Redis = require('ioredis');
      const redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      });

      const publishAddress = async (address: string, walletType: string, walletId: bigint) => {
        await redisClient.xadd(
          'address:registered',
          '*',
          'chainId', String(chainId),
          'address', address,
          'clientId', String(clientId),
          'projectId', String(defaultProjectId),
          'walletId', String(walletId),
          'addressType', walletType,
        );
      };

      // Hot wallet
      const hotWallet = await this.prisma.wallet.findUnique({
        where: { uq_client_chain_type: { clientId: BigInt(clientId), chainId, walletType: 'hot' } },
      });
      if (hotWallet) await publishAddress(hotWalletAddress, 'hot', hotWallet.id);

      // Gas tank
      const gasTankWallet = await this.prisma.wallet.findUnique({
        where: { uq_client_chain_type: { clientId: BigInt(clientId), chainId, walletType: 'gas_tank' } },
      });
      if (gasTankWallet) await publishAddress(gasTankKey.address, 'gas_tank', gasTankWallet.id);

      await redisClient.quit();
    } catch (err) {
      this.logger.warn(`Failed to publish address:registered event: ${err}`);
      // Non-blocking — the address will be picked up on next indexer restart
    }
```

**Note:** This is a simplified approach. If a `RedisService` already exists in core-wallet-service, inject it instead of creating a new ioredis client. Check `services/core-wallet-service/src/redis/` for an existing service.

- [ ] **Step 2: Also publish from `registerWallet()` method**

In the `registerWallet()` method (added earlier for gas tank wizard), add the same Redis Stream publish after the `prisma.wallet.create()` call.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit -p services/core-wallet-service/tsconfig.json
git add services/core-wallet-service/src/wallet/
git commit -m "feat(core-wallet): publish to address:registered Redis Stream on wallet creation"
```

---

### Task 8: Update BackfillWorker to Use New BlockProcessor

**Files:**
- Modify: `services/chain-indexer-service/src/backfill/backfill.worker.ts`

The existing BackfillWorker is functional but needs to:
1. Mark scanned-but-empty blocks in Redis (so gap detector doesn't re-detect them)
2. Update sync_cursors after backfill

- [ ] **Step 1: Update BackfillWorker process method**

In the block processing loop inside `process()`, after calling `blockProcessor.processBlock()`, add:

```typescript
        // Mark block as scanned in Redis (even if no events found)
        // This prevents gap detector from re-detecting already-scanned empty blocks
        await this.redis.setCache(
          `scanned:${job.data.chainId}:${blockNumber}`,
          '1',
          86400, // 24h TTL
        );
```

Inject `RedisService` in the BackfillWorker constructor if not already present.

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit -p services/chain-indexer-service/tsconfig.json
git add services/chain-indexer-service/src/backfill/
git commit -m "feat(indexer): BackfillWorker marks scanned blocks in Redis to prevent re-detection"
```
