# Phase 4: Chain Indexer v2 + Phase 5: Webhooks v2 -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1-14 (Phase 4) and 15-25 (Phase 5) can be parallelized where indicated.

**Goal:** Upgrade the Chain Indexer Service to a production-grade block-level indexer with gap detection, reorg handling, finality tracking, and materialized balances. Upgrade the Notification Service webhooks to support per-webhook retry configuration, full delivery attempt history, dead letter queue management, and manual resend capabilities.

**Architecture:** Both phases modify existing NestJS microservices (`chain-indexer-service` and `notification-service`), add new database tables via SQL migrations, extend Prisma schemas, add new BullMQ workers, and expose new endpoints on `admin-api` and `client-api`. Frontend pages are added to `apps/admin` (Next.js) and `apps/client` (Next.js).

**Tech Stack:** TypeScript 5.4+, NestJS, Prisma (MySQL), BullMQ, Redis Streams, ioredis, ethers.js v6, Next.js 14 (App Router), Tailwind CSS, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-08-cryptovaulthub-design.md`

---

## File Structure (New/Modified)

```
CryptoVaultHub/
├── database/
│   ├── 013-indexer-v2.sql                                          # NEW
│   └── 014-webhooks-v2.sql                                         # NEW
│
├── services/chain-indexer-service/
│   ├── prisma/schema.prisma                                        # MODIFY
│   └── src/
│       ├── app.module.ts                                           # MODIFY
│       ├── block-processor/
│       │   ├── block-processor.module.ts                           # NEW
│       │   └── block-processor.service.ts                          # NEW
│       ├── gap-detector/
│       │   ├── gap-detector.module.ts                              # NEW
│       │   └── gap-detector.service.ts                             # NEW
│       ├── backfill-worker/
│       │   ├── backfill-worker.module.ts                           # NEW
│       │   └── backfill-worker.service.ts                          # NEW
│       ├── finality-tracker/
│       │   ├── finality-tracker.module.ts                          # NEW
│       │   └── finality-tracker.service.ts                         # NEW
│       ├── reorg-detector/
│       │   ├── reorg-detector.module.ts                            # NEW
│       │   └── reorg-detector.service.ts                           # NEW
│       ├── balance-materializer/
│       │   ├── balance-materializer.module.ts                      # NEW
│       │   └── balance-materializer.service.ts                     # NEW
│       ├── sync-health-monitor/
│       │   ├── sync-health-monitor.module.ts                       # NEW
│       │   └── sync-health-monitor.service.ts                      # NEW
│       ├── reconciliation/
│       │   └── reconciliation.service.ts                           # MODIFY
│       ├── common/
│       │   └── health.controller.ts                                # MODIFY
│       └── __tests__/
│           ├── block-processor.service.spec.ts                     # NEW
│           ├── gap-detector.service.spec.ts                        # NEW
│           ├── backfill-worker.service.spec.ts                     # NEW
│           ├── finality-tracker.service.spec.ts                    # NEW
│           ├── reorg-detector.service.spec.ts                      # NEW
│           ├── balance-materializer.service.spec.ts                # NEW
│           └── sync-health-monitor.service.spec.ts                 # NEW
│
├── services/notification-service/
│   ├── prisma/schema.prisma                                        # MODIFY
│   └── src/
│       ├── app.module.ts                                           # MODIFY
│       ├── webhook/
│       │   ├── webhook.module.ts                                   # MODIFY
│       │   ├── webhook-delivery.service.ts                         # MODIFY
│       │   ├── webhook.worker.ts                                   # MODIFY
│       │   ├── webhook.controller.ts                               # MODIFY
│       │   ├── configurable-retry.service.ts                       # NEW
│       │   ├── delivery-attempt-recorder.service.ts                # NEW
│       │   ├── dead-letter-processor.service.ts                    # NEW
│       │   └── manual-resend.service.ts                            # NEW
│       ├── common/dto/
│       │   └── webhook.dto.ts                                      # MODIFY
│       └── __tests__/
│           ├── configurable-retry.service.spec.ts                  # NEW
│           ├── delivery-attempt-recorder.service.spec.ts           # NEW
│           ├── dead-letter-processor.service.spec.ts               # NEW
│           └── manual-resend.service.spec.ts                       # NEW
│
├── services/admin-api/src/
│   ├── indexer-monitoring/
│   │   ├── indexer-monitoring.module.ts                            # NEW
│   │   ├── indexer-monitoring.service.ts                           # NEW
│   │   └── indexer-monitoring.controller.ts                        # NEW
│   ├── webhook-monitoring/
│   │   ├── webhook-monitoring.module.ts                            # NEW
│   │   ├── webhook-monitoring.service.ts                           # NEW
│   │   └── webhook-monitoring.controller.ts                        # NEW
│   └── app.module.ts                                               # MODIFY
│
├── services/client-api/src/
│   ├── balance/
│   │   ├── balance.module.ts                                       # NEW
│   │   ├── balance.service.ts                                      # NEW
│   │   └── balance.controller.ts                                   # NEW
│   ├── webhook/
│   │   ├── webhook.service.ts                                      # MODIFY
│   │   └── webhook.controller.ts                                   # MODIFY
│   ├── common/dto/
│   │   ├── balance.dto.ts                                          # NEW
│   │   └── webhook.dto.ts                                          # MODIFY
│   └── app.module.ts                                               # MODIFY
│
├── apps/admin/app/
│   ├── sync-health/
│   │   └── page.tsx                                                # NEW
│   └── webhook-stats/
│       └── page.tsx                                                # NEW
│
├── apps/admin/components/
│   ├── sync-health-card.tsx                                        # NEW
│   ├── gap-table.tsx                                               # NEW
│   ├── reorg-timeline.tsx                                          # NEW
│   ├── webhook-stats-card.tsx                                      # NEW
│   └── delivery-stats-chart.tsx                                    # NEW
│
├── apps/client/app/webhooks/
│   ├── page.tsx                                                    # MODIFY
│   └── [id]/
│       └── page.tsx                                                # NEW
│
└── apps/client/components/
    ├── delivery-history-table.tsx                                  # NEW
    ├── attempt-timeline.tsx                                        # NEW
    └── resend-button.tsx                                           # NEW
```

---

## PHASE 4 -- CHAIN INDEXER V2

---

## Task 1: Database Migration -- Indexer v2 Tables

**Files:**
- Create: `database/013-indexer-v2.sql`

- [ ] **Step 1: Create migration file `database/013-indexer-v2.sql`**

```sql
-- =============================================================================
-- CryptoVaultHub -- Indexer v2 Migration
-- New tables: indexed_blocks, indexed_events, materialized_balances,
--             sync_gaps, reorg_log
-- Enhanced: sync_cursors (add finalized_block, parent_hash columns)
-- =============================================================================

USE `cvh_indexer`;

-- -------------------------------------------------------
-- indexed_blocks: one row per block per chain we process
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `indexed_blocks` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `chain_id`      INT          NOT NULL,
  `block_number`  BIGINT       NOT NULL,
  `block_hash`    VARCHAR(66)  NOT NULL,
  `parent_hash`   VARCHAR(66)  NOT NULL,
  `block_time`    TIMESTAMP(3) NOT NULL,
  `tx_count`      INT          NOT NULL DEFAULT 0,
  `event_count`   INT          NOT NULL DEFAULT 0,
  `is_finalized`  TINYINT(1)   NOT NULL DEFAULT 0,
  `indexed_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_block` (`chain_id`, `block_number`),
  INDEX `idx_chain_finalized` (`chain_id`, `is_finalized`),
  INDEX `idx_block_hash` (`block_hash`),
  INDEX `idx_indexed_at` (`indexed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- indexed_events: every deposit/transfer event we detect
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `indexed_events` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `chain_id`         INT          NOT NULL,
  `block_number`     BIGINT       NOT NULL,
  `tx_hash`          VARCHAR(66)  NOT NULL,
  `log_index`        INT          NOT NULL,
  `event_type`       VARCHAR(30)  NOT NULL COMMENT 'native_transfer | erc20_transfer',
  `from_address`     VARCHAR(100) NOT NULL,
  `to_address`       VARCHAR(100) NOT NULL,
  `contract_address` VARCHAR(100) NULL COMMENT 'NULL for native transfers',
  `amount`           VARCHAR(78)  NOT NULL COMMENT 'uint256 as string',
  `client_id`        BIGINT       NULL COMMENT 'NULL if to_address not monitored',
  `wallet_id`        BIGINT       NULL,
  `is_finalized`     TINYINT(1)   NOT NULL DEFAULT 0,
  `is_invalidated`   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Set to 1 on reorg',
  `detected_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_tx_log` (`chain_id`, `tx_hash`, `log_index`),
  INDEX `idx_chain_block` (`chain_id`, `block_number`),
  INDEX `idx_to_address` (`to_address`),
  INDEX `idx_client_finalized` (`client_id`, `is_finalized`),
  INDEX `idx_event_type` (`event_type`),
  INDEX `idx_detected_at` (`detected_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- materialized_balances: computed from finalized events
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `materialized_balances` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `chain_id`         INT          NOT NULL,
  `address`          VARCHAR(100) NOT NULL,
  `contract_address` VARCHAR(100) NOT NULL DEFAULT 'native' COMMENT 'native for ETH/BNB/MATIC',
  `balance`          VARCHAR(78)  NOT NULL DEFAULT '0',
  `last_block`       BIGINT       NOT NULL DEFAULT 0,
  `client_id`        BIGINT       NULL,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_addr_token` (`chain_id`, `address`, `contract_address`),
  INDEX `idx_client_chain` (`client_id`, `chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- sync_gaps: ranges of blocks we skipped and must backfill
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sync_gaps` (
  `id`           BIGINT      NOT NULL AUTO_INCREMENT,
  `chain_id`     INT         NOT NULL,
  `gap_start`    BIGINT      NOT NULL,
  `gap_end`      BIGINT      NOT NULL,
  `status`       VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending | processing | filled | failed',
  `attempts`     INT         NOT NULL DEFAULT 0,
  `last_error`   TEXT        NULL,
  `detected_at`  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `filled_at`    TIMESTAMP   NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_chain_status` (`chain_id`, `status`),
  INDEX `idx_detected_at` (`detected_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- reorg_log: every chain reorganization we detect
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reorg_log` (
  `id`                BIGINT      NOT NULL AUTO_INCREMENT,
  `chain_id`          INT         NOT NULL,
  `fork_block`        BIGINT      NOT NULL COMMENT 'Last common ancestor',
  `old_head_block`    BIGINT      NOT NULL,
  `old_head_hash`     VARCHAR(66) NOT NULL,
  `new_head_block`    BIGINT      NOT NULL,
  `new_head_hash`     VARCHAR(66) NOT NULL,
  `depth`             INT         NOT NULL COMMENT 'Number of blocks reorganized',
  `events_invalidated` INT        NOT NULL DEFAULT 0,
  `detected_at`       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_chain_detected` (`chain_id`, `detected_at`),
  INDEX `idx_depth` (`depth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- Enhance sync_cursors: add finalized tracking + head hash
-- -------------------------------------------------------
ALTER TABLE `sync_cursors`
  ADD COLUMN `finalized_block` BIGINT NOT NULL DEFAULT 0 AFTER `last_block`,
  ADD COLUMN `head_hash` VARCHAR(66) NULL AFTER `finalized_block`,
  ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'syncing' AFTER `head_hash`,
  ADD COLUMN `last_error` TEXT NULL AFTER `status`,
  ADD COLUMN `blocks_behind` INT NOT NULL DEFAULT 0 AFTER `last_error`;

ALTER TABLE `sync_cursors`
  ADD INDEX `idx_status` (`status`);
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
mysql -u root -p < database/013-indexer-v2.sql
```

---

## Task 2: Prisma Schema -- Indexer v2 Models

**Files:**
- Modify: `services/chain-indexer-service/prisma/schema.prisma`

- [ ] **Step 1: Add new models and enhance SyncCursor in `services/chain-indexer-service/prisma/schema.prisma`**

Replace the full file contents with:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-client"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------------------
// Sync Cursors -- tracks last indexed block per chain (ENHANCED)
// ---------------------------------------------------------------------------

model SyncCursor {
  id             BigInt   @id @default(autoincrement())
  chainId        Int      @unique @map("chain_id")
  lastBlock      BigInt   @map("last_block")
  finalizedBlock BigInt   @default(0) @map("finalized_block")
  headHash       String?  @db.VarChar(66) @map("head_hash")
  status         String   @default("syncing") @db.VarChar(20)
  lastError      String?  @db.Text @map("last_error")
  blocksBehind   Int      @default(0) @map("blocks_behind")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([status])
  @@map("sync_cursors")
}

// ---------------------------------------------------------------------------
// Monitored Addresses -- forwarder addresses to watch for deposits
// ---------------------------------------------------------------------------

model MonitoredAddress {
  id        BigInt   @id @default(autoincrement())
  chainId   Int      @map("chain_id")
  address   String   @db.VarChar(100)
  clientId  BigInt   @map("client_id")
  walletId  BigInt   @map("wallet_id")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([chainId, address])
  @@index([chainId, isActive])
  @@map("monitored_addresses")
}

// ---------------------------------------------------------------------------
// Indexed Blocks -- one row per processed block
// ---------------------------------------------------------------------------

model IndexedBlock {
  id          BigInt   @id @default(autoincrement())
  chainId     Int      @map("chain_id")
  blockNumber BigInt   @map("block_number")
  blockHash   String   @db.VarChar(66) @map("block_hash")
  parentHash  String   @db.VarChar(66) @map("parent_hash")
  blockTime   DateTime @db.Timestamp(3) @map("block_time")
  txCount     Int      @default(0) @map("tx_count")
  eventCount  Int      @default(0) @map("event_count")
  isFinalized Boolean  @default(false) @map("is_finalized")
  indexedAt   DateTime @default(now()) @map("indexed_at")

  @@unique([chainId, blockNumber])
  @@index([chainId, isFinalized])
  @@index([blockHash])
  @@index([indexedAt])
  @@map("indexed_blocks")
}

// ---------------------------------------------------------------------------
// Indexed Events -- every deposit/transfer event
// ---------------------------------------------------------------------------

model IndexedEvent {
  id              BigInt   @id @default(autoincrement())
  chainId         Int      @map("chain_id")
  blockNumber     BigInt   @map("block_number")
  txHash          String   @db.VarChar(66) @map("tx_hash")
  logIndex        Int      @map("log_index")
  eventType       String   @db.VarChar(30) @map("event_type")
  fromAddress     String   @db.VarChar(100) @map("from_address")
  toAddress       String   @db.VarChar(100) @map("to_address")
  contractAddress String?  @db.VarChar(100) @map("contract_address")
  amount          String   @db.VarChar(78)
  clientId        BigInt?  @map("client_id")
  walletId        BigInt?  @map("wallet_id")
  isFinalized     Boolean  @default(false) @map("is_finalized")
  isInvalidated   Boolean  @default(false) @map("is_invalidated")
  detectedAt      DateTime @default(now()) @map("detected_at")

  @@unique([chainId, txHash, logIndex])
  @@index([chainId, blockNumber])
  @@index([toAddress])
  @@index([clientId, isFinalized])
  @@index([eventType])
  @@index([detectedAt])
  @@map("indexed_events")
}

// ---------------------------------------------------------------------------
// Materialized Balances -- computed from finalized events
// ---------------------------------------------------------------------------

model MaterializedBalance {
  id              BigInt   @id @default(autoincrement())
  chainId         Int      @map("chain_id")
  address         String   @db.VarChar(100)
  contractAddress String   @default("native") @db.VarChar(100) @map("contract_address")
  balance         String   @default("0") @db.VarChar(78)
  lastBlock       BigInt   @default(0) @map("last_block")
  clientId        BigInt?  @map("client_id")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([chainId, address, contractAddress])
  @@index([clientId, chainId])
  @@map("materialized_balances")
}

// ---------------------------------------------------------------------------
// Sync Gaps -- block ranges that need backfilling
// ---------------------------------------------------------------------------

model SyncGap {
  id         BigInt    @id @default(autoincrement())
  chainId    Int       @map("chain_id")
  gapStart   BigInt    @map("gap_start")
  gapEnd     BigInt    @map("gap_end")
  status     String    @default("pending") @db.VarChar(20)
  attempts   Int       @default(0)
  lastError  String?   @db.Text @map("last_error")
  detectedAt DateTime  @default(now()) @map("detected_at")
  filledAt   DateTime? @map("filled_at")

  @@index([chainId, status])
  @@index([detectedAt])
  @@map("sync_gaps")
}

// ---------------------------------------------------------------------------
// Reorg Log -- chain reorganization history
// ---------------------------------------------------------------------------

model ReorgLog {
  id                BigInt   @id @default(autoincrement())
  chainId           Int      @map("chain_id")
  forkBlock         BigInt   @map("fork_block")
  oldHeadBlock      BigInt   @map("old_head_block")
  oldHeadHash       String   @db.VarChar(66) @map("old_head_hash")
  newHeadBlock      BigInt   @map("new_head_block")
  newHeadHash       String   @db.VarChar(66) @map("new_head_hash")
  depth             Int
  eventsInvalidated Int      @default(0) @map("events_invalidated")
  detectedAt        DateTime @default(now()) @map("detected_at")

  @@index([chainId, detectedAt])
  @@index([depth])
  @@map("reorg_log")
}

// ---------------------------------------------------------------------------
// Chains (read replica / shared table reference)
// ---------------------------------------------------------------------------

model Chain {
  id                      Int     @id @map("chain_id")
  name                    String  @db.VarChar(50)
  shortName               String  @db.VarChar(10) @map("short_name")
  nativeCurrencySymbol    String  @db.VarChar(10) @map("native_currency_symbol")
  nativeCurrencyDecimals  Int     @default(18) @map("native_currency_decimals")
  rpcEndpoints            Json    @map("rpc_endpoints")
  blockTimeSeconds        Decimal @db.Decimal(5, 2) @map("block_time_seconds")
  confirmationsDefault    Int     @map("confirmations_default")
  walletFactoryAddress    String? @db.VarChar(42) @map("wallet_factory_address")
  forwarderFactoryAddress String? @db.VarChar(42) @map("forwarder_factory_address")
  walletImplAddress       String? @db.VarChar(42) @map("wallet_impl_address")
  forwarderImplAddress    String? @db.VarChar(42) @map("forwarder_impl_address")
  multicall3Address       String  @default("0xcA11bde05977b3631167028862bE2a173976CA11") @db.VarChar(42) @map("multicall3_address")
  explorerUrl             String? @db.VarChar(200) @map("explorer_url")
  gasPriceStrategy        String  @default("eip1559") @db.VarChar(10) @map("gas_price_strategy")
  isActive                Boolean @default(true) @map("is_active")
  isTestnet               Boolean @default(false) @map("is_testnet")
  createdAt               DateTime @default(now()) @map("created_at")

  @@map("chains")
}

// ---------------------------------------------------------------------------
// Tokens (read replica / shared table reference)
// ---------------------------------------------------------------------------

model Token {
  id              BigInt   @id @default(autoincrement())
  chainId         Int      @map("chain_id")
  contractAddress String   @db.VarChar(42) @map("contract_address")
  symbol          String   @db.VarChar(20)
  name            String   @db.VarChar(100)
  decimals        Int      @db.TinyInt
  isNative        Boolean  @default(false) @map("is_native")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")

  @@unique([chainId, contractAddress], name: "uq_chain_contract")
  @@map("tokens")
}
```

- [ ] **Step 2: Regenerate Prisma client**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/chain-indexer-service
npx prisma generate
```

---

## Task 3: BlockProcessor Service

**Files:**
- Create: `services/chain-indexer-service/src/block-processor/block-processor.service.ts`
- Create: `services/chain-indexer-service/src/block-processor/block-processor.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/block-processor/block-processor.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ERC20_ABI = ['function balanceOf(address account) external view returns (uint256)'];

export interface BlockProcessingResult {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  parentHash: string;
  txCount: number;
  eventCount: number;
  depositsDetected: number;
}

/**
 * Processes a single block: fetches block data, scans for ERC20 Transfer events
 * and native ETH transfers to monitored addresses, stores indexed_blocks and
 * indexed_events records, and publishes deposit events to Redis Streams.
 */
@Injectable()
export class BlockProcessorService {
  private readonly logger = new Logger(BlockProcessorService.name);

  /** In-memory cache of monitored addresses, keyed by `chainId:lowercaseAddress` */
  private monitoredCache = new Map<string, { clientId: bigint; walletId: bigint }>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Process a single block on the given chain. This is the core indexing unit.
   *
   * 1. Fetch the full block (with transactions) and ERC20 Transfer logs.
   * 2. Match events against monitored addresses.
   * 3. Store the block in `indexed_blocks`.
   * 4. Store matched events in `indexed_events`.
   * 5. Publish deposit-detected events to Redis Streams.
   * 6. Update sync_cursors.
   */
  async processBlock(chainId: number, blockNumber: number): Promise<BlockProcessingResult> {
    await this.ensureMonitoredCache(chainId);
    const provider = await this.evmProvider.getProvider(chainId);

    // Fetch block with full transactions
    const block = await provider.getBlock(blockNumber, true);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found on chain ${chainId}`);
    }

    // Fetch ERC20 Transfer logs in this block
    const logs = await provider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [TRANSFER_TOPIC],
    });

    // Process native transfers
    const nativeEvents = this.extractNativeTransfers(chainId, block);

    // Process ERC20 transfers
    const erc20Events = this.extractERC20Transfers(chainId, blockNumber, logs);

    const allEvents = [...nativeEvents, ...erc20Events];

    // Filter events to only those involving monitored addresses
    const matchedEvents = allEvents.filter((evt) => {
      const key = `${chainId}:${evt.toAddress.toLowerCase()}`;
      const monitored = this.monitoredCache.get(key);
      if (monitored) {
        evt.clientId = monitored.clientId;
        evt.walletId = monitored.walletId;
        return true;
      }
      return false;
    });

    // Store block and events in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Upsert indexed_block
      await tx.indexedBlock.upsert({
        where: {
          chainId_blockNumber: { chainId, blockNumber: BigInt(blockNumber) },
        },
        update: {
          blockHash: block.hash!,
          parentHash: block.parentHash,
          blockTime: new Date(block.timestamp * 1000),
          txCount: block.transactions.length,
          eventCount: matchedEvents.length,
        },
        create: {
          chainId,
          blockNumber: BigInt(blockNumber),
          blockHash: block.hash!,
          parentHash: block.parentHash,
          blockTime: new Date(block.timestamp * 1000),
          txCount: block.transactions.length,
          eventCount: matchedEvents.length,
        },
      });

      // Upsert indexed_events
      for (const evt of matchedEvents) {
        await tx.indexedEvent.upsert({
          where: {
            chainId_txHash_logIndex: {
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
            eventType: evt.eventType,
            fromAddress: evt.fromAddress,
            toAddress: evt.toAddress,
            contractAddress: evt.contractAddress,
            amount: evt.amount,
            clientId: evt.clientId ?? null,
            walletId: evt.walletId ?? null,
          },
        });
      }

      // Update sync cursor
      await tx.syncCursor.upsert({
        where: { chainId },
        update: {
          lastBlock: BigInt(blockNumber),
          headHash: block.hash,
          status: 'syncing',
        },
        create: {
          chainId,
          lastBlock: BigInt(blockNumber),
          headHash: block.hash,
          status: 'syncing',
        },
      });
    });

    // Publish deposit events to Redis Streams (outside transaction for speed)
    for (const evt of matchedEvents) {
      await this.redis.publishToStream('deposits:detected', {
        chainId: chainId.toString(),
        txHash: evt.txHash,
        blockNumber: blockNumber.toString(),
        fromAddress: evt.fromAddress,
        toAddress: evt.toAddress,
        contractAddress: evt.contractAddress ?? 'native',
        amount: evt.amount,
        clientId: evt.clientId?.toString() ?? '',
        walletId: evt.walletId?.toString() ?? '',
        detectedAt: new Date().toISOString(),
        source: 'block-processor',
      });
    }

    if (matchedEvents.length > 0) {
      this.logger.log(
        `Block ${blockNumber} on chain ${chainId}: ${matchedEvents.length} deposits indexed`,
      );
    }

    this.evmProvider.reportSuccess(chainId);

    return {
      chainId,
      blockNumber,
      blockHash: block.hash!,
      parentHash: block.parentHash,
      txCount: block.transactions.length,
      eventCount: matchedEvents.length,
      depositsDetected: matchedEvents.length,
    };
  }

  /**
   * Extract native ETH/BNB/MATIC transfers from block transactions.
   */
  private extractNativeTransfers(
    chainId: number,
    block: ethers.Block,
  ): Array<{
    txHash: string;
    logIndex: number;
    eventType: string;
    fromAddress: string;
    toAddress: string;
    contractAddress: string | null;
    amount: string;
    clientId?: bigint;
    walletId?: bigint;
  }> {
    const events: Array<{
      txHash: string;
      logIndex: number;
      eventType: string;
      fromAddress: string;
      toAddress: string;
      contractAddress: string | null;
      amount: string;
      clientId?: bigint;
      walletId?: bigint;
    }> = [];

    if (!block.prefetchedTransactions) return events;

    for (const tx of block.prefetchedTransactions) {
      if (!tx.to || tx.value === 0n) continue;

      events.push({
        txHash: tx.hash,
        logIndex: 0, // native transfers use logIndex 0
        eventType: 'native_transfer',
        fromAddress: tx.from,
        toAddress: tx.to,
        contractAddress: null,
        amount: tx.value.toString(),
      });
    }

    return events;
  }

  /**
   * Extract ERC20 Transfer events from logs.
   */
  private extractERC20Transfers(
    chainId: number,
    blockNumber: number,
    logs: ethers.Log[],
  ): Array<{
    txHash: string;
    logIndex: number;
    eventType: string;
    fromAddress: string;
    toAddress: string;
    contractAddress: string | null;
    amount: string;
    clientId?: bigint;
    walletId?: bigint;
  }> {
    const events: Array<{
      txHash: string;
      logIndex: number;
      eventType: string;
      fromAddress: string;
      toAddress: string;
      contractAddress: string | null;
      amount: string;
      clientId?: bigint;
      walletId?: bigint;
    }> = [];

    for (const log of logs) {
      if (log.topics.length < 3) continue;

      const toAddress = ethers.getAddress('0x' + log.topics[2].slice(26));
      const fromAddress = ethers.getAddress('0x' + log.topics[1].slice(26));
      const amount = log.data && log.data !== '0x' ? BigInt(log.data).toString() : '0';

      events.push({
        txHash: log.transactionHash,
        logIndex: log.index,
        eventType: 'erc20_transfer',
        fromAddress,
        toAddress,
        contractAddress: log.address,
        amount,
      });
    }

    return events;
  }

  /**
   * Load monitored addresses into memory cache.
   * Refreshes if older than CACHE_TTL_MS.
   */
  private async ensureMonitoredCache(chainId: number): Promise<void> {
    if (Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS && this.monitoredCache.size > 0) {
      return;
    }

    const addresses = await this.prisma.monitoredAddress.findMany({
      where: { isActive: true },
    });

    this.monitoredCache.clear();
    for (const addr of addresses) {
      const key = `${addr.chainId}:${addr.address.toLowerCase()}`;
      this.monitoredCache.set(key, {
        clientId: addr.clientId,
        walletId: addr.walletId,
      });
    }
    this.cacheLoadedAt = Date.now();

    this.logger.debug(`Monitored address cache refreshed: ${addresses.length} entries`);
  }

  /** Force-refresh the monitored address cache. */
  async refreshMonitoredCache(): Promise<void> {
    this.cacheLoadedAt = 0;
    await this.ensureMonitoredCache(0);
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/block-processor/block-processor.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BlockProcessorService } from './block-processor.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [BlockchainModule, RedisModule],
  providers: [BlockProcessorService],
  exports: [BlockProcessorService],
})
export class BlockProcessorModule {}
```

---

## Task 4: GapDetector Service

**Files:**
- Create: `services/chain-indexer-service/src/gap-detector/gap-detector.service.ts`
- Create: `services/chain-indexer-service/src/gap-detector/gap-detector.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/gap-detector/gap-detector.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface DetectedGap {
  chainId: number;
  gapStart: number;
  gapEnd: number;
}

/**
 * Periodically compares sync_cursors against indexed_blocks to detect
 * missing block ranges, and creates sync_gaps records for the BackfillWorker.
 */
@Injectable()
export class GapDetectorService {
  private readonly logger = new Logger(GapDetectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run gap detection every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectGaps(): Promise<DetectedGap[]> {
    const allGaps: DetectedGap[] = [];

    const cursors = await this.prisma.syncCursor.findMany({
      where: { status: { not: 'error' } },
    });

    for (const cursor of cursors) {
      try {
        const chainGaps = await this.detectChainGaps(
          cursor.chainId,
          Number(cursor.lastBlock),
        );
        allGaps.push(...chainGaps);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Gap detection failed for chain ${cursor.chainId}: ${msg}`);
      }
    }

    if (allGaps.length > 0) {
      this.logger.warn(`Gap detection found ${allGaps.length} gaps across all chains`);
    }

    return allGaps;
  }

  /**
   * Detect gaps for a single chain by querying indexed_blocks for missing ranges.
   * Strategy: find the min and max indexed blocks, then look for holes.
   */
  async detectChainGaps(chainId: number, cursorBlock: number): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = [];

    // Find the earliest indexed block for this chain
    const earliest = await this.prisma.indexedBlock.findFirst({
      where: { chainId },
      orderBy: { blockNumber: 'asc' },
      select: { blockNumber: true },
    });

    if (!earliest) return gaps;

    const startBlock = Number(earliest.blockNumber);

    // Query all indexed block numbers in ascending order
    const indexedBlocks = await this.prisma.indexedBlock.findMany({
      where: {
        chainId,
        blockNumber: {
          gte: BigInt(startBlock),
          lte: BigInt(cursorBlock),
        },
      },
      orderBy: { blockNumber: 'asc' },
      select: { blockNumber: true },
    });

    const indexedSet = new Set(indexedBlocks.map((b) => Number(b.blockNumber)));

    // Scan for gaps
    let gapStart: number | null = null;
    for (let block = startBlock; block <= cursorBlock; block++) {
      if (!indexedSet.has(block)) {
        if (gapStart === null) gapStart = block;
      } else {
        if (gapStart !== null) {
          const gapEnd = block - 1;
          gaps.push({ chainId, gapStart, gapEnd });
          gapStart = null;
        }
      }
    }

    // Trailing gap
    if (gapStart !== null) {
      gaps.push({ chainId, gapStart, gapEnd: cursorBlock });
    }

    // Persist gaps that do not already exist
    for (const gap of gaps) {
      const existing = await this.prisma.syncGap.findFirst({
        where: {
          chainId: gap.chainId,
          gapStart: BigInt(gap.gapStart),
          gapEnd: BigInt(gap.gapEnd),
          status: { in: ['pending', 'processing'] },
        },
      });

      if (!existing) {
        await this.prisma.syncGap.create({
          data: {
            chainId: gap.chainId,
            gapStart: BigInt(gap.gapStart),
            gapEnd: BigInt(gap.gapEnd),
            status: 'pending',
          },
        });
        this.logger.log(
          `Created gap: chain ${gap.chainId} blocks ${gap.gapStart}-${gap.gapEnd}`,
        );
      }
    }

    return gaps;
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/gap-detector/gap-detector.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { GapDetectorService } from './gap-detector.service';

@Module({
  providers: [GapDetectorService],
  exports: [GapDetectorService],
})
export class GapDetectorModule {}
```

---

## Task 5: BackfillWorker (BullMQ Processor)

**Files:**
- Create: `services/chain-indexer-service/src/backfill-worker/backfill-worker.service.ts`
- Create: `services/chain-indexer-service/src/backfill-worker/backfill-worker.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/backfill-worker/backfill-worker.service.ts`**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';

interface BackfillJobData {
  gapId: number;
  chainId: number;
  gapStart: number;
  gapEnd: number;
}

const MAX_GAP_ATTEMPTS = 5;

/**
 * BullMQ processor that backfills blocks for detected sync gaps.
 * Picks up pending gaps on a schedule and processes them block-by-block.
 */
@Processor('backfill')
@Injectable()
export class BackfillWorkerService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BackfillWorkerService.name);

  constructor(
    @InjectQueue('backfill') private readonly backfillQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly blockProcessor: BlockProcessorService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Enqueue any pending gaps on startup
    await this.enqueuePendingGaps();
  }

  /**
   * Periodically check for pending gaps and enqueue them.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async enqueuePendingGaps(): Promise<void> {
    const pendingGaps = await this.prisma.syncGap.findMany({
      where: {
        status: 'pending',
        attempts: { lt: MAX_GAP_ATTEMPTS },
      },
      orderBy: { detectedAt: 'asc' },
      take: 10,
    });

    for (const gap of pendingGaps) {
      const jobId = `backfill-gap-${gap.id}`;

      // Check if job already exists
      const existing = await this.backfillQueue.getJob(jobId);
      if (existing) continue;

      await this.backfillQueue.add(
        'backfill-gap',
        {
          gapId: Number(gap.id),
          chainId: gap.chainId,
          gapStart: Number(gap.gapStart),
          gapEnd: Number(gap.gapEnd),
        } satisfies BackfillJobData,
        {
          jobId,
          attempts: 1,
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );

      await this.prisma.syncGap.update({
        where: { id: gap.id },
        data: { status: 'processing' },
      });

      this.logger.log(
        `Enqueued backfill job for gap ${gap.id}: chain ${gap.chainId} blocks ${gap.gapStart}-${gap.gapEnd}`,
      );
    }
  }

  /**
   * BullMQ worker: process a single gap by iterating block-by-block.
   */
  async process(job: Job<BackfillJobData>): Promise<void> {
    const { gapId, chainId, gapStart, gapEnd } = job.data;

    this.logger.log(
      `Backfilling gap ${gapId}: chain ${chainId} blocks ${gapStart}-${gapEnd} (${gapEnd - gapStart + 1} blocks)`,
    );

    try {
      for (let block = gapStart; block <= gapEnd; block++) {
        await this.blockProcessor.processBlock(chainId, block);

        // Update progress
        const progress = Math.round(((block - gapStart) / (gapEnd - gapStart + 1)) * 100);
        await job.updateProgress(progress);
      }

      // Mark gap as filled
      await this.prisma.syncGap.update({
        where: { id: BigInt(gapId) },
        data: {
          status: 'filled',
          filledAt: new Date(),
          attempts: { increment: 1 },
        },
      });

      this.logger.log(`Gap ${gapId} filled successfully`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await this.prisma.syncGap.update({
        where: { id: BigInt(gapId) },
        data: {
          status: 'pending',
          attempts: { increment: 1 },
          lastError: msg,
        },
      });

      this.logger.error(`Backfill failed for gap ${gapId}: ${msg}`);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/backfill-worker/backfill-worker.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackfillWorkerService } from './backfill-worker.service';
import { BlockProcessorModule } from '../block-processor/block-processor.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'backfill' }),
    BlockProcessorModule,
  ],
  providers: [BackfillWorkerService],
  exports: [BackfillWorkerService],
})
export class BackfillWorkerModule {}
```

---

## Task 6: FinalityTracker Service

**Files:**
- Create: `services/chain-indexer-service/src/finality-tracker/finality-tracker.service.ts`
- Create: `services/chain-indexer-service/src/finality-tracker/finality-tracker.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/finality-tracker/finality-tracker.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

/**
 * Tracks finality per chain: when a block reaches the confirmation threshold,
 * it marks the block and all its events as finalized, then triggers balance
 * materialization via Redis Stream.
 */
@Injectable()
export class FinalityTrackerService {
  private readonly logger = new Logger(FinalityTrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Check finality every 30 seconds across all chains.
   */
  @Cron('*/30 * * * * *')
  async checkFinality(): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    await Promise.all(
      chains.map((chain) => this.checkChainFinality(chain.id, chain.confirmationsDefault)),
    );
  }

  /**
   * For a single chain:
   * 1. Get current block number from the provider.
   * 2. Compute the finalized block = currentBlock - confirmationsDefault.
   * 3. Mark all indexed_blocks <= finalized as finalized.
   * 4. Mark all indexed_events in finalized blocks as finalized.
   * 5. Update sync_cursors.finalized_block.
   * 6. Publish finalization events for balance materialization.
   */
  async checkChainFinality(chainId: number, confirmationsRequired: number): Promise<number> {
    try {
      const provider = await this.evmProvider.getProvider(chainId);
      const currentBlock = await provider.getBlockNumber();
      const finalizedBlock = currentBlock - confirmationsRequired;

      if (finalizedBlock <= 0) return 0;

      // Get current finalized block from cursor
      const cursor = await this.prisma.syncCursor.findUnique({
        where: { chainId },
      });
      const previousFinalized = cursor ? Number(cursor.finalizedBlock) : 0;

      if (finalizedBlock <= previousFinalized) return 0;

      // Mark blocks as finalized
      const updatedBlocks = await this.prisma.indexedBlock.updateMany({
        where: {
          chainId,
          blockNumber: {
            gt: BigInt(previousFinalized),
            lte: BigInt(finalizedBlock),
          },
          isFinalized: false,
        },
        data: { isFinalized: true },
      });

      // Mark events as finalized
      const updatedEvents = await this.prisma.indexedEvent.updateMany({
        where: {
          chainId,
          blockNumber: {
            gt: BigInt(previousFinalized),
            lte: BigInt(finalizedBlock),
          },
          isFinalized: false,
          isInvalidated: false,
        },
        data: { isFinalized: true },
      });

      // Update sync cursor
      await this.prisma.syncCursor.update({
        where: { chainId },
        data: {
          finalizedBlock: BigInt(finalizedBlock),
          blocksBehind: currentBlock - Number(cursor?.lastBlock ?? currentBlock),
        },
      });

      // Publish finalization trigger for balance materializer
      if (updatedEvents.count > 0) {
        await this.redis.publishToStream('indexer:finalized', {
          chainId: chainId.toString(),
          fromBlock: (previousFinalized + 1).toString(),
          toBlock: finalizedBlock.toString(),
          eventsFinalized: updatedEvents.count.toString(),
          timestamp: new Date().toISOString(),
        });
      }

      if (updatedBlocks.count > 0) {
        this.logger.log(
          `Chain ${chainId}: finalized ${updatedBlocks.count} blocks up to ${finalizedBlock}, ${updatedEvents.count} events`,
        );
      }

      this.evmProvider.reportSuccess(chainId);
      return updatedBlocks.count;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Finality check failed for chain ${chainId}: ${msg}`);
      this.evmProvider.reportFailure(chainId);
      return 0;
    }
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/finality-tracker/finality-tracker.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { FinalityTrackerService } from './finality-tracker.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [BlockchainModule, RedisModule],
  providers: [FinalityTrackerService],
  exports: [FinalityTrackerService],
})
export class FinalityTrackerModule {}
```

---

## Task 7: ReorgDetector Service

**Files:**
- Create: `services/chain-indexer-service/src/reorg-detector/reorg-detector.service.ts`
- Create: `services/chain-indexer-service/src/reorg-detector/reorg-detector.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/reorg-detector/reorg-detector.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

export interface ReorgResult {
  chainId: number;
  forkBlock: number;
  oldHeadBlock: number;
  newHeadBlock: number;
  depth: number;
  eventsInvalidated: number;
}

/**
 * Detects chain reorganizations by comparing parent hashes of indexed blocks
 * against the chain. Walks back to the fork point and invalidates events.
 */
@Injectable()
export class ReorgDetectorService {
  private readonly logger = new Logger(ReorgDetectorService.name);

  /** Maximum depth we will walk back looking for the fork point. */
  private readonly MAX_REORG_DEPTH = 128;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Check for a reorg at the given block. Called by BlockProcessorService
   * before processing a new block, or by the realtime detector when it
   * notices a parent hash mismatch.
   *
   * Strategy:
   * 1. Fetch the new block from the chain.
   * 2. Look up the indexed_block at (blockNumber - 1) in our DB.
   * 3. If the new block's parentHash matches our stored block_hash, no reorg.
   * 4. If mismatch, walk back until we find a common ancestor (fork point).
   * 5. Invalidate all events from fork_block+1 to old head.
   * 6. Delete indexed_blocks from fork_block+1 to old head.
   * 7. Log the reorg.
   */
  async checkForReorg(chainId: number, newBlockNumber: number): Promise<ReorgResult | null> {
    const provider = await this.evmProvider.getProvider(chainId);

    // Fetch new block header from chain
    const newBlock = await provider.getBlock(newBlockNumber);
    if (!newBlock) return null;

    // Look up our stored previous block
    const prevIndexed = await this.prisma.indexedBlock.findUnique({
      where: {
        chainId_blockNumber: {
          chainId,
          blockNumber: BigInt(newBlockNumber - 1),
        },
      },
    });

    // If we have no previous block, we cannot detect a reorg
    if (!prevIndexed) return null;

    // Compare parent hashes
    if (newBlock.parentHash === prevIndexed.blockHash) {
      // No reorg
      return null;
    }

    this.logger.warn(
      `Reorg detected on chain ${chainId} at block ${newBlockNumber}: ` +
      `expected parent ${prevIndexed.blockHash}, got ${newBlock.parentHash}`,
    );

    // Walk back to find fork point
    let forkBlock = newBlockNumber - 1;
    const oldHeadBlock = Number(prevIndexed.blockNumber);
    let depth = 0;

    for (let b = newBlockNumber - 1; b > 0 && depth < this.MAX_REORG_DEPTH; b--, depth++) {
      const chainBlock = await provider.getBlock(b);
      const indexedBlock = await this.prisma.indexedBlock.findUnique({
        where: { chainId_blockNumber: { chainId, blockNumber: BigInt(b) } },
      });

      if (!chainBlock || !indexedBlock) {
        forkBlock = b;
        break;
      }

      if (chainBlock.hash === indexedBlock.blockHash) {
        // Found common ancestor
        forkBlock = b;
        break;
      }
    }

    // Invalidate events from fork_block+1 onward
    const invalidated = await this.prisma.indexedEvent.updateMany({
      where: {
        chainId,
        blockNumber: { gt: BigInt(forkBlock) },
        isInvalidated: false,
      },
      data: { isInvalidated: true, isFinalized: false },
    });

    // Delete indexed_blocks from fork_block+1 onward
    await this.prisma.indexedBlock.deleteMany({
      where: {
        chainId,
        blockNumber: { gt: BigInt(forkBlock) },
      },
    });

    // Update sync cursor to fork block
    await this.prisma.syncCursor.update({
      where: { chainId },
      data: { lastBlock: BigInt(forkBlock) },
    });

    // Log the reorg
    const reorgEntry = await this.prisma.reorgLog.create({
      data: {
        chainId,
        forkBlock: BigInt(forkBlock),
        oldHeadBlock: BigInt(oldHeadBlock),
        oldHeadHash: prevIndexed.blockHash,
        newHeadBlock: BigInt(newBlockNumber),
        newHeadHash: newBlock.hash!,
        depth: depth + 1,
        eventsInvalidated: invalidated.count,
      },
    });

    // Publish reorg event to Redis Stream
    await this.redis.publishToStream('indexer:reorg', {
      chainId: chainId.toString(),
      forkBlock: forkBlock.toString(),
      depth: (depth + 1).toString(),
      eventsInvalidated: invalidated.count.toString(),
      timestamp: new Date().toISOString(),
    });

    const result: ReorgResult = {
      chainId,
      forkBlock,
      oldHeadBlock,
      newHeadBlock: newBlockNumber,
      depth: depth + 1,
      eventsInvalidated: invalidated.count,
    };

    this.logger.warn(
      `Reorg resolved on chain ${chainId}: fork at ${forkBlock}, depth ${result.depth}, ${invalidated.count} events invalidated`,
    );

    return result;
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/reorg-detector/reorg-detector.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ReorgDetectorService } from './reorg-detector.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [BlockchainModule, RedisModule],
  providers: [ReorgDetectorService],
  exports: [ReorgDetectorService],
})
export class ReorgDetectorModule {}
```

---

## Task 8: BalanceMaterializer Service

**Files:**
- Create: `services/chain-indexer-service/src/balance-materializer/balance-materializer.service.ts`
- Create: `services/chain-indexer-service/src/balance-materializer/balance-materializer.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/balance-materializer/balance-materializer.service.ts`**

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consumes `indexer:finalized` events from Redis Streams and computes
 * materialized balances from finalized indexed events. The materialized
 * balance is the sum of all finalized, non-invalidated incoming transfer
 * amounts minus outgoing transfer amounts for each (chain, address, token).
 */
@Injectable()
export class BalanceMaterializerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BalanceMaterializerService.name);
  private redis!: Redis;
  private running = false;

  private readonly CONSUMER_GROUP = 'balance-materializer';
  private readonly CONSUMER_NAME = 'worker-1';
  private readonly STREAM = 'indexer:finalized';
  private readonly BLOCK_MS = 5000;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
    });

    // Ensure consumer group
    try {
      await this.redis.xgroup('CREATE', this.STREAM, this.CONSUMER_GROUP, '0', 'MKSTREAM');
    } catch (error: any) {
      if (!error.message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create consumer group: ${error.message}`);
      }
    }

    this.running = true;
    this.consumeLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.redis.quit();
  }

  /**
   * Main consumer loop.
   */
  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP', this.CONSUMER_GROUP, this.CONSUMER_NAME,
          'COUNT', 5,
          'BLOCK', this.BLOCK_MS,
          'STREAMS', this.STREAM, '>',
        );

        if (!results) continue;

        for (const [, entries] of results) {
          for (const [id, fields] of entries) {
            try {
              const data: Record<string, string> = {};
              for (let i = 0; i < (fields as string[]).length; i += 2) {
                data[(fields as string[])[i]] = (fields as string[])[i + 1];
              }

              await this.materializeRange(
                parseInt(data.chainId, 10),
                parseInt(data.fromBlock, 10),
                parseInt(data.toBlock, 10),
              );

              await this.redis.xack(this.STREAM, this.CONSUMER_GROUP, id as string);
            } catch (error: any) {
              this.logger.error(`Failed to process finalization event ${id}: ${error.message}`);
            }
          }
        }
      } catch (error: any) {
        if (this.running) {
          this.logger.error(`Balance materializer loop error: ${error.message}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  /**
   * Materialize balances for all addresses that had finalized events in the block range.
   * For each affected (chain, address, contract), re-sum all finalized, non-invalidated events.
   */
  async materializeRange(chainId: number, fromBlock: number, toBlock: number): Promise<number> {
    // Find all distinct (toAddress, contractAddress) pairs in the newly finalized range
    const affectedEvents = await this.prisma.indexedEvent.findMany({
      where: {
        chainId,
        blockNumber: {
          gte: BigInt(fromBlock),
          lte: BigInt(toBlock),
        },
        isFinalized: true,
        isInvalidated: false,
        clientId: { not: null },
      },
      select: {
        toAddress: true,
        contractAddress: true,
        clientId: true,
      },
      distinct: ['toAddress', 'contractAddress'],
    });

    let materialized = 0;

    for (const { toAddress, contractAddress, clientId } of affectedEvents) {
      const tokenKey = contractAddress ?? 'native';

      // Sum all finalized incoming amounts for this address+token
      const incomingEvents = await this.prisma.indexedEvent.findMany({
        where: {
          chainId,
          toAddress,
          contractAddress: contractAddress ?? null,
          isFinalized: true,
          isInvalidated: false,
        },
        select: { amount: true },
      });

      // Sum all finalized outgoing amounts for this address+token
      const outgoingEvents = await this.prisma.indexedEvent.findMany({
        where: {
          chainId,
          fromAddress: toAddress,
          contractAddress: contractAddress ?? null,
          isFinalized: true,
          isInvalidated: false,
        },
        select: { amount: true },
      });

      let balance = 0n;
      for (const evt of incomingEvents) {
        balance += BigInt(evt.amount);
      }
      for (const evt of outgoingEvents) {
        balance -= BigInt(evt.amount);
      }
      if (balance < 0n) balance = 0n;

      // Find the latest finalized block for this address
      const latestEvent = await this.prisma.indexedEvent.findFirst({
        where: {
          chainId,
          toAddress,
          contractAddress: contractAddress ?? null,
          isFinalized: true,
          isInvalidated: false,
        },
        orderBy: { blockNumber: 'desc' },
        select: { blockNumber: true },
      });

      // Upsert materialized balance
      await this.prisma.materializedBalance.upsert({
        where: {
          chainId_address_contractAddress: {
            chainId,
            address: toAddress,
            contractAddress: tokenKey,
          },
        },
        update: {
          balance: balance.toString(),
          lastBlock: latestEvent?.blockNumber ?? BigInt(toBlock),
          clientId,
        },
        create: {
          chainId,
          address: toAddress,
          contractAddress: tokenKey,
          balance: balance.toString(),
          lastBlock: latestEvent?.blockNumber ?? BigInt(toBlock),
          clientId,
        },
      });

      materialized++;
    }

    if (materialized > 0) {
      this.logger.log(
        `Materialized ${materialized} balances for chain ${chainId} blocks ${fromBlock}-${toBlock}`,
      );
    }

    return materialized;
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/balance-materializer/balance-materializer.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BalanceMaterializerService } from './balance-materializer.service';

@Module({
  providers: [BalanceMaterializerService],
  exports: [BalanceMaterializerService],
})
export class BalanceMaterializerModule {}
```

---

## Task 9: SyncHealthMonitor Service

**Files:**
- Create: `services/chain-indexer-service/src/sync-health-monitor/sync-health-monitor.service.ts`
- Create: `services/chain-indexer-service/src/sync-health-monitor/sync-health-monitor.module.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/sync-health-monitor/sync-health-monitor.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

export interface ChainSyncHealth {
  chainId: number;
  chainName: string;
  status: 'healthy' | 'degraded' | 'critical' | 'error';
  lastBlock: number;
  finalizedBlock: number;
  chainHead: number;
  blocksBehind: number;
  pendingGaps: number;
  recentReorgs: number;
  lastError: string | null;
  updatedAt: Date;
}

/**
 * Monitors sync health per chain, computing severity levels based on
 * blocks-behind, gap count, and reorg frequency.
 */
@Injectable()
export class SyncHealthMonitorService {
  private readonly logger = new Logger(SyncHealthMonitorService.name);

  /** Thresholds for severity levels */
  private readonly DEGRADED_BLOCKS_BEHIND = 10;
  private readonly CRITICAL_BLOCKS_BEHIND = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Refresh health status every 30 seconds.
   */
  @Cron('*/30 * * * * *')
  async refreshHealth(): Promise<void> {
    await this.getAllChainHealth();
  }

  /**
   * Get sync health for all active chains.
   */
  async getAllChainHealth(): Promise<ChainSyncHealth[]> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    const healthResults: ChainSyncHealth[] = [];

    for (const chain of chains) {
      try {
        const health = await this.getChainHealth(chain.id, chain.name);
        healthResults.push(health);

        // Update cursor status
        await this.prisma.syncCursor.updateMany({
          where: { chainId: chain.id },
          data: {
            status: health.status === 'error' ? 'error' : 'syncing',
            blocksBehind: health.blocksBehind,
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Health check failed for chain ${chain.id}: ${msg}`);

        healthResults.push({
          chainId: chain.id,
          chainName: chain.name,
          status: 'error',
          lastBlock: 0,
          finalizedBlock: 0,
          chainHead: 0,
          blocksBehind: -1,
          pendingGaps: 0,
          recentReorgs: 0,
          lastError: msg,
          updatedAt: new Date(),
        });
      }
    }

    return healthResults;
  }

  /**
   * Get sync health for a single chain.
   */
  async getChainHealth(chainId: number, chainName: string): Promise<ChainSyncHealth> {
    const cursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });

    // Get current chain head from provider
    let chainHead = 0;
    try {
      const provider = await this.evmProvider.getProvider(chainId);
      chainHead = await provider.getBlockNumber();
      this.evmProvider.reportSuccess(chainId);
    } catch {
      this.evmProvider.reportFailure(chainId);
    }

    const lastBlock = cursor ? Number(cursor.lastBlock) : 0;
    const finalizedBlock = cursor ? Number(cursor.finalizedBlock) : 0;
    const blocksBehind = chainHead > 0 ? chainHead - lastBlock : -1;

    // Count pending gaps
    const pendingGaps = await this.prisma.syncGap.count({
      where: { chainId, status: { in: ['pending', 'processing'] } },
    });

    // Count reorgs in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReorgs = await this.prisma.reorgLog.count({
      where: { chainId, detectedAt: { gte: oneDayAgo } },
    });

    // Determine severity
    let status: 'healthy' | 'degraded' | 'critical' | 'error' = 'healthy';
    if (blocksBehind < 0 || cursor?.lastError) {
      status = 'error';
    } else if (blocksBehind >= this.CRITICAL_BLOCKS_BEHIND || pendingGaps > 10) {
      status = 'critical';
    } else if (blocksBehind >= this.DEGRADED_BLOCKS_BEHIND || pendingGaps > 0 || recentReorgs > 3) {
      status = 'degraded';
    }

    return {
      chainId,
      chainName,
      status,
      lastBlock,
      finalizedBlock,
      chainHead,
      blocksBehind,
      pendingGaps,
      recentReorgs,
      lastError: cursor?.lastError ?? null,
      updatedAt: new Date(),
    };
  }

  /**
   * Get summary of all gaps.
   */
  async getGapSummary(chainId?: number) {
    const where = chainId ? { chainId } : {};
    const gaps = await this.prisma.syncGap.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });

    return gaps.map((g) => ({
      id: Number(g.id),
      chainId: g.chainId,
      gapStart: Number(g.gapStart),
      gapEnd: Number(g.gapEnd),
      blockCount: Number(g.gapEnd) - Number(g.gapStart) + 1,
      status: g.status,
      attempts: g.attempts,
      lastError: g.lastError,
      detectedAt: g.detectedAt,
      filledAt: g.filledAt,
    }));
  }

  /**
   * Get recent reorg events.
   */
  async getRecentReorgs(chainId?: number, limit: number = 50) {
    const where = chainId ? { chainId } : {};
    const reorgs = await this.prisma.reorgLog.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });

    return reorgs.map((r) => ({
      id: Number(r.id),
      chainId: r.chainId,
      forkBlock: Number(r.forkBlock),
      oldHeadBlock: Number(r.oldHeadBlock),
      oldHeadHash: r.oldHeadHash,
      newHeadBlock: Number(r.newHeadBlock),
      newHeadHash: r.newHeadHash,
      depth: r.depth,
      eventsInvalidated: r.eventsInvalidated,
      detectedAt: r.detectedAt,
    }));
  }
}
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/sync-health-monitor/sync-health-monitor.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SyncHealthMonitorService } from './sync-health-monitor.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [BlockchainModule, RedisModule],
  providers: [SyncHealthMonitorService],
  exports: [SyncHealthMonitorService],
})
export class SyncHealthMonitorModule {}
```

---

## Task 10: Enhanced Reconciliation Service

**Files:**
- Modify: `services/chain-indexer-service/src/reconciliation/reconciliation.service.ts`

- [ ] **Step 1: Add materialized balance comparison to `reconciliation.service.ts`**

Add the following method to the existing `ReconciliationService` class, after the `reconcileChain` method:

```typescript
  /**
   * Sample-based reconciliation: pick random addresses, compare on-chain
   * balances vs materialized_balances table.
   */
  async reconcileMaterializedBalances(
    chainId: number,
    sampleSize: number = 20,
  ): Promise<ReconciliationDiscrepancy[]> {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    // Get a random sample of materialized balances
    const total = await this.prisma.materializedBalance.count({
      where: { chainId },
    });

    if (total === 0) return discrepancies;

    const skip = Math.max(0, Math.floor(Math.random() * Math.max(total - sampleSize, 0)));
    const sample = await this.prisma.materializedBalance.findMany({
      where: { chainId },
      skip,
      take: sampleSize,
    });

    const provider = await this.evmProvider.getProvider(chainId);
    const chain = await this.prisma.chain.findUnique({ where: { id: chainId } });
    if (!chain) return discrepancies;

    const multicall3 = new ethers.Contract(
      chain.multicall3Address,
      MULTICALL3_ABI,
      provider,
    );
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    const multicall3Iface = new ethers.Interface(MULTICALL3_ABI);

    // Build batch calls for sampled balances
    const calls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
    const callMeta: Array<{ address: string; contractAddress: string; isNative: boolean }> = [];

    for (const mb of sample) {
      if (mb.contractAddress === 'native') {
        calls.push({
          target: chain.multicall3Address,
          allowFailure: true,
          callData: multicall3Iface.encodeFunctionData('getEthBalance', [mb.address]),
        });
        callMeta.push({ address: mb.address, contractAddress: 'native', isNative: true });
      } else {
        calls.push({
          target: mb.contractAddress,
          allowFailure: true,
          callData: erc20Iface.encodeFunctionData('balanceOf', [mb.address]),
        });
        callMeta.push({ address: mb.address, contractAddress: mb.contractAddress, isNative: false });
      }
    }

    if (calls.length === 0) return discrepancies;

    const results: Array<{ success: boolean; returnData: string }> =
      await multicall3.aggregate3.staticCall(calls);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const meta = callMeta[i];
      const mb = sample[i];

      if (!result.success || result.returnData === '0x') continue;

      let onChainBalance: bigint;
      if (meta.isNative) {
        const [val] = multicall3Iface.decodeFunctionResult('getEthBalance', result.returnData);
        onChainBalance = val as bigint;
      } else {
        const [val] = erc20Iface.decodeFunctionResult('balanceOf', result.returnData);
        onChainBalance = val as bigint;
      }

      const materializedBalance = BigInt(mb.balance);

      if (onChainBalance !== materializedBalance) {
        discrepancies.push({
          chainId,
          address: meta.address,
          tokenAddress: meta.isNative ? null : meta.contractAddress,
          onChainBalance: onChainBalance.toString(),
          cachedBalance: materializedBalance.toString(),
          difference: (onChainBalance - materializedBalance).toString(),
        });
      }
    }

    if (discrepancies.length > 0) {
      this.logger.warn(
        `Materialized balance reconciliation on chain ${chainId}: ${discrepancies.length} discrepancies in ${sample.length} samples`,
      );

      for (const d of discrepancies) {
        await this.redis.publishToStream('reconciliation:discrepancies', {
          chainId: d.chainId.toString(),
          address: d.address,
          tokenAddress: d.tokenAddress ?? 'native',
          onChainBalance: d.onChainBalance,
          materializedBalance: d.cachedBalance,
          difference: d.difference,
          source: 'materialized-reconciliation',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return discrepancies;
  }
```

Also add to the imports at the top of the file, after the existing PrismaService import:

```typescript
// (add this alias if not already present; the model is now available)
// import { MaterializedBalance } from '../generated/prisma-client';
```

---

## Task 11: Admin API -- Indexer Monitoring Endpoints

**Files:**
- Create: `services/admin-api/src/indexer-monitoring/indexer-monitoring.controller.ts`
- Create: `services/admin-api/src/indexer-monitoring/indexer-monitoring.service.ts`
- Create: `services/admin-api/src/indexer-monitoring/indexer-monitoring.module.ts`
- Modify: `services/admin-api/src/app.module.ts`

- [ ] **Step 1: Create `services/admin-api/src/indexer-monitoring/indexer-monitoring.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class IndexerMonitoringService {
  private readonly logger = new Logger(IndexerMonitoringService.name);
  private readonly indexerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.indexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async getSyncHealth() {
    try {
      const { data } = await axios.get(`${this.indexerUrl}/sync-health`, {
        headers: this.headers,
        timeout: 10000,
      });
      return data;
    } catch (err) {
      this.logger.warn(`Failed to fetch sync health: ${(err as Error).message}`);
      return { status: 'unavailable', error: (err as Error).message };
    }
  }

  async getGaps(chainId?: number) {
    try {
      const params = chainId ? { chainId } : {};
      const { data } = await axios.get(`${this.indexerUrl}/sync-health/gaps`, {
        headers: this.headers,
        params,
        timeout: 10000,
      });
      return data;
    } catch (err) {
      this.logger.warn(`Failed to fetch gaps: ${(err as Error).message}`);
      return { status: 'unavailable', error: (err as Error).message };
    }
  }

  async getReorgs(chainId?: number) {
    try {
      const params = chainId ? { chainId } : {};
      const { data } = await axios.get(`${this.indexerUrl}/sync-health/reorgs`, {
        headers: this.headers,
        params,
        timeout: 10000,
      });
      return data;
    } catch (err) {
      this.logger.warn(`Failed to fetch reorgs: ${(err as Error).message}`);
      return { status: 'unavailable', error: (err as Error).message };
    }
  }
}
```

- [ ] **Step 2: Create `services/admin-api/src/indexer-monitoring/indexer-monitoring.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { IndexerMonitoringService } from './indexer-monitoring.service';

@ApiTags('Indexer Monitoring')
@ApiBearerAuth('JWT')
@Controller('admin/indexer')
export class IndexerMonitoringController {
  constructor(private readonly service: IndexerMonitoringService) {}

  @Get('sync-health')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get chain sync health',
    description: 'Returns the synchronization health status of all active chains including blocks behind, gap count, and reorg frequency.',
  })
  @ApiResponse({ status: 200, description: 'Sync health for all chains' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSyncHealth() {
    const health = await this.service.getSyncHealth();
    return { success: true, ...health };
  }

  @Get('gaps')
  @AdminAuth()
  @ApiOperation({
    summary: 'List sync gaps',
    description: 'Returns all detected block sync gaps across chains, including their status and backfill progress.',
  })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of sync gaps' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGaps(@Query('chainId') chainId?: number) {
    const gaps = await this.service.getGaps(chainId);
    return { success: true, ...gaps };
  }

  @Get('reorgs')
  @AdminAuth()
  @ApiOperation({
    summary: 'List recent reorgs',
    description: 'Returns recent chain reorganization events with depth, fork point, and the number of events invalidated.',
  })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of recent reorgs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReorgs(@Query('chainId') chainId?: number) {
    const reorgs = await this.service.getReorgs(chainId);
    return { success: true, ...reorgs };
  }
}
```

- [ ] **Step 3: Create `services/admin-api/src/indexer-monitoring/indexer-monitoring.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { IndexerMonitoringService } from './indexer-monitoring.service';
import { IndexerMonitoringController } from './indexer-monitoring.controller';

@Module({
  controllers: [IndexerMonitoringController],
  providers: [IndexerMonitoringService],
})
export class IndexerMonitoringModule {}
```

- [ ] **Step 4: Add `IndexerMonitoringModule` to `services/admin-api/src/app.module.ts`**

Add to imports array:

```typescript
import { IndexerMonitoringModule } from './indexer-monitoring/indexer-monitoring.module';
```

Add `IndexerMonitoringModule` to the `imports` array of `@Module`.

---

## Task 12: Client API -- Materialized Balances Endpoint

**Files:**
- Create: `services/client-api/src/balance/balance.service.ts`
- Create: `services/client-api/src/balance/balance.controller.ts`
- Create: `services/client-api/src/balance/balance.module.ts`
- Create: `services/client-api/src/common/dto/balance.dto.ts`
- Modify: `services/client-api/src/app.module.ts`

- [ ] **Step 1: Create `services/client-api/src/common/dto/balance.dto.ts`**

```typescript
import { IsOptional, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListBalancesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by chain ID' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  chainId?: number;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  limit?: number;
}
```

- [ ] **Step 2: Create `services/client-api/src/balance/balance.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);
  private readonly indexerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.indexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async getBalances(
    clientId: number,
    params: { chainId?: number; page?: number; limit?: number },
  ) {
    try {
      const { data } = await axios.get(
        `${this.indexerUrl}/balances/client/${clientId}`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to fetch balances: ${error.message}`);
      throw error;
    }
  }
}
```

- [ ] **Step 3: Create `services/client-api/src/balance/balance.controller.ts`**

```typescript
import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { BalanceService } from './balance.service';
import { ListBalancesQueryDto } from '../common/dto/balance.dto';

@ApiTags('Balances')
@ApiSecurity('ApiKey')
@Controller('client/v1/balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get materialized balances',
    description: `Returns the materialized balances for all monitored deposit addresses belonging to the authenticated client. Balances are computed from finalized on-chain events and updated automatically as blocks become final.

**Important:** These balances represent the finalized, confirmed state. They may lag behind the actual on-chain balance by the number of confirmation blocks required for the chain.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Materialized balances retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 1 },
              address: { type: 'string', example: '0x742d35Cc...' },
              token: { type: 'string', example: 'native' },
              balance: { type: 'string', example: '1500000000000000000' },
              lastBlock: { type: 'integer', example: 19500000 },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 50 },
            total: { type: 'integer', example: 25 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getBalances(@Query() query: ListBalancesQueryDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.balanceService.getBalances(clientId, {
      chainId: query.chainId,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
    return { success: true, ...result };
  }
}
```

- [ ] **Step 4: Create `services/client-api/src/balance/balance.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';

@Module({
  controllers: [BalanceController],
  providers: [BalanceService],
})
export class BalanceModule {}
```

- [ ] **Step 5: Add `BalanceModule` to `services/client-api/src/app.module.ts`**

Add to imports:

```typescript
import { BalanceModule } from './balance/balance.module';
```

Add `BalanceModule` to the `imports` array.

---

## Task 13: Indexer Health Controller + Chain Indexer AppModule

**Files:**
- Modify: `services/chain-indexer-service/src/common/health.controller.ts`
- Modify: `services/chain-indexer-service/src/app.module.ts`

- [ ] **Step 1: Add sync health and balance endpoints to the health controller**

Replace `services/chain-indexer-service/src/common/health.controller.ts` with:

```typescript
import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { SyncHealthMonitorService } from '../sync-health-monitor/sync-health-monitor.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(
    private readonly syncHealth: SyncHealthMonitorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  async getHealth() {
    return { status: 'ok', service: 'chain-indexer-service', timestamp: new Date().toISOString() };
  }

  @Get('sync-health')
  async getSyncHealth() {
    const chains = await this.syncHealth.getAllChainHealth();
    return { chains };
  }

  @Get('sync-health/gaps')
  async getGaps(@Query('chainId') chainId?: string) {
    const cid = chainId ? parseInt(chainId, 10) : undefined;
    const gaps = await this.syncHealth.getGapSummary(cid);
    return { gaps };
  }

  @Get('sync-health/reorgs')
  async getReorgs(@Query('chainId') chainId?: string) {
    const cid = chainId ? parseInt(chainId, 10) : undefined;
    const reorgs = await this.syncHealth.getRecentReorgs(cid);
    return { reorgs };
  }

  @Get('balances/client/:clientId')
  async getClientBalances(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('chainId') chainId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page ?? '1', 10);
    const limitNum = parseInt(limit ?? '50', 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { clientId: BigInt(clientId) };
    if (chainId) where.chainId = parseInt(chainId, 10);

    const [balances, total] = await Promise.all([
      this.prisma.materializedBalance.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.materializedBalance.count({ where }),
    ]);

    return {
      balances: balances.map((b) => ({
        chainId: b.chainId,
        address: b.address,
        token: b.contractAddress,
        balance: b.balance,
        lastBlock: Number(b.lastBlock),
        updatedAt: b.updatedAt,
      })),
      meta: { page: pageNum, limit: limitNum, total },
    };
  }
}
```

- [ ] **Step 2: Update `services/chain-indexer-service/src/app.module.ts`**

Replace with:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { RealtimeDetectorModule } from './realtime-detector/realtime-detector.module';
import { PollingDetectorModule } from './polling-detector/polling-detector.module';
import { ConfirmationTrackerModule } from './confirmation-tracker/confirmation-tracker.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { BlockProcessorModule } from './block-processor/block-processor.module';
import { GapDetectorModule } from './gap-detector/gap-detector.module';
import { BackfillWorkerModule } from './backfill-worker/backfill-worker.module';
import { FinalityTrackerModule } from './finality-tracker/finality-tracker.module';
import { ReorgDetectorModule } from './reorg-detector/reorg-detector.module';
import { BalanceMaterializerModule } from './balance-materializer/balance-materializer.module';
import { SyncHealthMonitorModule } from './sync-health-monitor/sync-health-monitor.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    BlockchainModule,
    RealtimeDetectorModule,
    PollingDetectorModule,
    ConfirmationTrackerModule,
    ReconciliationModule,
    BlockProcessorModule,
    GapDetectorModule,
    BackfillWorkerModule,
    FinalityTrackerModule,
    ReorgDetectorModule,
    BalanceMaterializerModule,
    SyncHealthMonitorModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Install `@nestjs/schedule` dependency**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/chain-indexer-service
npm install @nestjs/schedule
```

---

## Task 13b: Admin Frontend -- Sync Health Dashboard

**Files:**
- Create: `apps/admin/app/sync-health/page.tsx`
- Create: `apps/admin/components/sync-health-card.tsx`
- Create: `apps/admin/components/gap-table.tsx`
- Create: `apps/admin/components/reorg-timeline.tsx`

- [ ] **Step 1: Create `apps/admin/components/sync-health-card.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface SyncHealthCardProps {
  chainId: number;
  chainName: string;
  status: "healthy" | "degraded" | "critical" | "error";
  lastBlock: number;
  finalizedBlock: number;
  chainHead: number;
  blocksBehind: number;
  pendingGaps: number;
  recentReorgs: number;
}

const statusColors: Record<string, string> = {
  healthy: "bg-status-success",
  degraded: "bg-status-warning",
  critical: "bg-status-error",
  error: "bg-status-error",
};

const statusBg: Record<string, string> = {
  healthy: "bg-status-success-subtle text-status-success",
  degraded: "bg-status-warning/10 text-status-warning",
  critical: "bg-status-error-subtle text-status-error",
  error: "bg-status-error-subtle text-status-error",
};

export function SyncHealthCard(props: SyncHealthCardProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-all duration-fast hover:border-accent-primary/20 group relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-pill", statusColors[props.status])} />
          <span className="text-subheading font-display text-text-primary">{props.chainName}</span>
          <span className="text-micro text-text-muted font-mono">ID: {props.chainId}</span>
        </div>
        <span className={cn("px-2 py-0.5 rounded-badge text-micro font-semibold font-display uppercase", statusBg[props.status])}>
          {props.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-caption">
        <div>
          <div className="text-text-muted font-display">Last Block</div>
          <div className="font-mono text-text-primary">{props.lastBlock.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-text-muted font-display">Finalized</div>
          <div className="font-mono text-text-primary">{props.finalizedBlock.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-text-muted font-display">Chain Head</div>
          <div className="font-mono text-text-primary">{props.chainHead.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-text-muted font-display">Behind</div>
          <div className={cn("font-mono font-semibold", props.blocksBehind > 10 ? "text-status-error" : "text-status-success")}>
            {props.blocksBehind}
          </div>
        </div>
        <div>
          <div className="text-text-muted font-display">Gaps</div>
          <div className={cn("font-mono font-semibold", props.pendingGaps > 0 ? "text-status-warning" : "text-text-primary")}>
            {props.pendingGaps}
          </div>
        </div>
        <div>
          <div className="text-text-muted font-display">Reorgs (24h)</div>
          <div className={cn("font-mono font-semibold", props.recentReorgs > 3 ? "text-status-warning" : "text-text-primary")}>
            {props.recentReorgs}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/admin/components/gap-table.tsx`**

```tsx
"use client";

import { Badge } from "@/components/badge";

interface Gap {
  id: number;
  chainId: number;
  gapStart: number;
  gapEnd: number;
  blockCount: number;
  status: string;
  attempts: number;
  detectedAt: string;
  filledAt: string | null;
}

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  filled: "success",
  processing: "warning",
  pending: "default",
  failed: "error",
};

export function GapTable({ gaps }: { gaps: Gap[] }) {
  if (gaps.length === 0) {
    return (
      <div className="bg-surface-card border border-border-default rounded-card p-card-p text-center text-text-muted text-caption font-display">
        No sync gaps detected
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
      <table className="w-full text-caption">
        <thead>
          <tr className="border-b border-border-default bg-surface-elevated">
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Chain</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Range</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Blocks</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Status</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Attempts</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Detected</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((gap) => (
            <tr key={gap.id} className="border-b border-border-default/50 hover:bg-surface-elevated/50 transition-colors">
              <td className="px-3 py-2 font-mono text-text-primary">{gap.chainId}</td>
              <td className="px-3 py-2 font-mono text-text-primary">
                {gap.gapStart.toLocaleString()} - {gap.gapEnd.toLocaleString()}
              </td>
              <td className="px-3 py-2 font-mono text-text-primary">{gap.blockCount.toLocaleString()}</td>
              <td className="px-3 py-2">
                <Badge variant={statusVariant[gap.status] || "default"}>{gap.status}</Badge>
              </td>
              <td className="px-3 py-2 font-mono text-text-primary">{gap.attempts}</td>
              <td className="px-3 py-2 text-text-muted font-display">{new Date(gap.detectedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/admin/components/reorg-timeline.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface Reorg {
  id: number;
  chainId: number;
  forkBlock: number;
  depth: number;
  eventsInvalidated: number;
  detectedAt: string;
}

export function ReorgTimeline({ reorgs }: { reorgs: Reorg[] }) {
  if (reorgs.length === 0) {
    return (
      <div className="bg-surface-card border border-border-default rounded-card p-card-p text-center text-text-muted text-caption font-display">
        No reorgs detected in the last 7 days
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reorgs.map((reorg) => (
        <div
          key={reorg.id}
          className="bg-surface-card border border-border-default rounded-card p-3 shadow-card flex items-center gap-4"
        >
          <div className={cn(
            "w-10 h-10 rounded-card flex items-center justify-center font-mono text-caption font-bold",
            reorg.depth > 5 ? "bg-status-error-subtle text-status-error" : "bg-status-warning/10 text-status-warning",
          )}>
            {reorg.depth}
          </div>
          <div className="flex-1">
            <div className="text-caption font-display text-text-primary">
              Chain {reorg.chainId} -- Fork at block{" "}
              <span className="font-mono">{reorg.forkBlock.toLocaleString()}</span>
            </div>
            <div className="text-micro text-text-muted font-display mt-0.5">
              {reorg.eventsInvalidated} events invalidated -- {new Date(reorg.detectedAt).toLocaleString()}
            </div>
          </div>
          <div className={cn(
            "px-2 py-0.5 rounded-badge text-micro font-semibold font-display",
            reorg.depth > 5 ? "bg-status-error-subtle text-status-error" : "bg-status-warning/10 text-status-warning",
          )}>
            depth: {reorg.depth}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/admin/app/sync-health/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncHealthCard } from "@/components/sync-health-card";
import { GapTable } from "@/components/gap-table";
import { ReorgTimeline } from "@/components/reorg-timeline";

const mockChains = [
  { chainId: 1, chainName: "Ethereum", status: "healthy" as const, lastBlock: 19500120, finalizedBlock: 19500108, chainHead: 19500122, blocksBehind: 2, pendingGaps: 0, recentReorgs: 0 },
  { chainId: 137, chainName: "Polygon", status: "degraded" as const, lastBlock: 55000080, finalizedBlock: 55000000, chainHead: 55000100, blocksBehind: 20, pendingGaps: 2, recentReorgs: 1 },
  { chainId: 56, chainName: "BSC", status: "healthy" as const, lastBlock: 38000500, finalizedBlock: 38000485, chainHead: 38000502, blocksBehind: 2, pendingGaps: 0, recentReorgs: 0 },
  { chainId: 42161, chainName: "Arbitrum", status: "healthy" as const, lastBlock: 195000300, finalizedBlock: 195000299, chainHead: 195000301, blocksBehind: 1, pendingGaps: 0, recentReorgs: 0 },
];

const mockGaps = [
  { id: 1, chainId: 137, gapStart: 54999500, gapEnd: 54999510, blockCount: 11, status: "processing", attempts: 1, detectedAt: "2026-04-09T12:00:00Z", filledAt: null },
  { id: 2, chainId: 137, gapStart: 54998200, gapEnd: 54998205, blockCount: 6, status: "pending", attempts: 0, detectedAt: "2026-04-09T11:45:00Z", filledAt: null },
];

const mockReorgs = [
  { id: 1, chainId: 137, forkBlock: 54999498, depth: 2, eventsInvalidated: 3, detectedAt: "2026-04-09T11:58:00Z" },
];

export default function SyncHealthPage() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">Chain Sync Health</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Real-time synchronization status, gap detection, and reorg monitoring
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex items-center gap-1.5 bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display",
            refreshing && "border-accent-primary text-accent-primary",
          )}
        >
          <RefreshCw className={cn("w-3.5 h-3.5 transition-transform", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Chain Health Grid */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Per-Chain Status
      </div>
      <div className="grid grid-cols-2 gap-4 mb-section-gap">
        {mockChains.map((chain) => (
          <SyncHealthCard key={chain.chainId} {...chain} />
        ))}
      </div>

      {/* Sync Gaps */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Sync Gaps
      </div>
      <div className="mb-section-gap">
        <GapTable gaps={mockGaps} />
      </div>

      {/* Reorg History */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Recent Reorganizations
      </div>
      <ReorgTimeline reorgs={mockReorgs} />
    </div>
  );
}
```

---

## Task 14: Phase 4 Tests

**Files:**
- Create: `services/chain-indexer-service/src/__tests__/block-processor.service.spec.ts`
- Create: `services/chain-indexer-service/src/__tests__/reorg-detector.service.spec.ts`
- Create: `services/chain-indexer-service/src/__tests__/gap-detector.service.spec.ts`
- Create: `services/chain-indexer-service/src/__tests__/finality-tracker.service.spec.ts`

- [ ] **Step 1: Create `services/chain-indexer-service/src/__tests__/block-processor.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BlockProcessorService } from '../block-processor/block-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('BlockProcessorService', () => {
  let service: BlockProcessorService;
  let mockPrisma: any;
  let mockRedis: Partial<RedisService>;
  let mockEvmProvider: Partial<EvmProviderService>;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getBlock: jest.fn(),
      getLogs: jest.fn().mockResolvedValue([]),
    };

    mockPrisma = {
      monitoredAddress: {
        findMany: jest.fn().mockResolvedValue([
          {
            chainId: 1,
            address: '0x1111111111111111111111111111111111111111',
            clientId: BigInt(1),
            walletId: BigInt(1),
            isActive: true,
          },
        ]),
      },
      indexedBlock: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      indexedEvent: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      syncCursor: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockPrisma)),
    };

    mockRedis = {
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
      reportSuccess: jest.fn(),
      reportFailure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockProcessorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EvmProviderService, useValue: mockEvmProvider },
      ],
    }).compile();

    service = module.get<BlockProcessorService>(BlockProcessorService);
  });

  it('should process a block with no relevant transactions', async () => {
    mockProvider.getBlock.mockResolvedValue({
      hash: '0xblockhash',
      parentHash: '0xparenthash',
      timestamp: 1712600000,
      transactions: [],
      prefetchedTransactions: [],
    });

    const result = await service.processBlock(1, 100);

    expect(result.blockNumber).toBe(100);
    expect(result.depositsDetected).toBe(0);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockEvmProvider.reportSuccess).toHaveBeenCalledWith(1);
  });

  it('should detect native transfer to monitored address', async () => {
    mockProvider.getBlock.mockResolvedValue({
      hash: '0xblockhash',
      parentHash: '0xparenthash',
      timestamp: 1712600000,
      transactions: ['0xtx1'],
      prefetchedTransactions: [
        {
          hash: '0xtx1',
          from: '0x0000000000000000000000000000000000000002',
          to: '0x1111111111111111111111111111111111111111',
          value: 1000000000000000000n,
        },
      ],
    });

    const result = await service.processBlock(1, 100);

    expect(result.depositsDetected).toBe(1);
    expect(mockRedis.publishToStream).toHaveBeenCalledWith(
      'deposits:detected',
      expect.objectContaining({
        toAddress: '0x1111111111111111111111111111111111111111',
        source: 'block-processor',
      }),
    );
  });

  it('should throw when block is not found', async () => {
    mockProvider.getBlock.mockResolvedValue(null);

    await expect(service.processBlock(1, 999)).rejects.toThrow(
      'Block 999 not found on chain 1',
    );
  });
});
```

- [ ] **Step 2: Create `services/chain-indexer-service/src/__tests__/reorg-detector.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ReorgDetectorService } from '../reorg-detector/reorg-detector.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

describe('ReorgDetectorService', () => {
  let service: ReorgDetectorService;
  let mockPrisma: any;
  let mockEvmProvider: Partial<EvmProviderService>;
  let mockRedis: Partial<RedisService>;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getBlock: jest.fn(),
    };

    mockPrisma = {
      indexedBlock: {
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      indexedEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      syncCursor: {
        update: jest.fn().mockResolvedValue({}),
      },
      reorgLog: {
        create: jest.fn().mockResolvedValue({ id: BigInt(1) }),
      },
    };

    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };

    mockRedis = {
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReorgDetectorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ReorgDetectorService>(ReorgDetectorService);
  });

  it('should return null when no previous block is indexed', async () => {
    mockProvider.getBlock.mockResolvedValue({ hash: '0xnew', parentHash: '0xparent' });
    mockPrisma.indexedBlock.findUnique.mockResolvedValue(null);

    const result = await service.checkForReorg(1, 100);
    expect(result).toBeNull();
  });

  it('should return null when parent hashes match (no reorg)', async () => {
    mockProvider.getBlock.mockResolvedValue({
      hash: '0xnewblock',
      parentHash: '0xprevhash',
    });
    mockPrisma.indexedBlock.findUnique.mockResolvedValue({
      blockNumber: BigInt(99),
      blockHash: '0xprevhash',
    });

    const result = await service.checkForReorg(1, 100);
    expect(result).toBeNull();
  });

  it('should detect reorg when parent hashes mismatch', async () => {
    // New block at 100 with unexpected parent
    mockProvider.getBlock.mockImplementation((num: number) => {
      if (num === 100) return { hash: '0xnewblock100', parentHash: '0xdifferent' };
      if (num === 99) return { hash: '0xnewblock99', parentHash: '0xmatch98' };
      if (num === 98) return { hash: '0xmatch98' };
      return null;
    });

    // Our indexed block 99 has a different hash
    mockPrisma.indexedBlock.findUnique.mockImplementation(({ where }: any) => {
      const bn = Number(where.chainId_blockNumber.blockNumber);
      if (bn === 99) return { blockNumber: BigInt(99), blockHash: '0xoldhash99' };
      if (bn === 98) return { blockNumber: BigInt(98), blockHash: '0xmatch98' };
      return null;
    });

    mockPrisma.indexedEvent.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.checkForReorg(1, 100);

    expect(result).not.toBeNull();
    expect(result!.forkBlock).toBe(98);
    expect(result!.depth).toBeGreaterThanOrEqual(1);
    expect(result!.eventsInvalidated).toBe(5);
    expect(mockPrisma.reorgLog.create).toHaveBeenCalled();
    expect(mockRedis.publishToStream).toHaveBeenCalledWith(
      'indexer:reorg',
      expect.objectContaining({ chainId: '1' }),
    );
  });
});
```

- [ ] **Step 3: Create `services/chain-indexer-service/src/__tests__/gap-detector.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { GapDetectorService } from '../gap-detector/gap-detector.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GapDetectorService', () => {
  let service: GapDetectorService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      syncCursor: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      indexedBlock: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      syncGap: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GapDetectorService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GapDetectorService>(GapDetectorService);
  });

  it('should detect a gap in the middle of indexed blocks', async () => {
    mockPrisma.indexedBlock.findFirst.mockResolvedValue({ blockNumber: BigInt(100) });
    mockPrisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: BigInt(100) },
      { blockNumber: BigInt(101) },
      // gap: 102-103
      { blockNumber: BigInt(104) },
      { blockNumber: BigInt(105) },
    ]);

    const gaps = await service.detectChainGaps(1, 105);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ chainId: 1, gapStart: 102, gapEnd: 103 });
    expect(mockPrisma.syncGap.create).toHaveBeenCalled();
  });

  it('should return no gaps when all blocks are present', async () => {
    mockPrisma.indexedBlock.findFirst.mockResolvedValue({ blockNumber: BigInt(100) });
    mockPrisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: BigInt(100) },
      { blockNumber: BigInt(101) },
      { blockNumber: BigInt(102) },
    ]);

    const gaps = await service.detectChainGaps(1, 102);
    expect(gaps).toHaveLength(0);
  });

  it('should return empty when no blocks are indexed', async () => {
    mockPrisma.indexedBlock.findFirst.mockResolvedValue(null);

    const gaps = await service.detectChainGaps(1, 100);
    expect(gaps).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Create `services/chain-indexer-service/src/__tests__/finality-tracker.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FinalityTrackerService } from '../finality-tracker/finality-tracker.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

describe('FinalityTrackerService', () => {
  let service: FinalityTrackerService;
  let mockPrisma: any;
  let mockEvmProvider: Partial<EvmProviderService>;
  let mockRedis: Partial<RedisService>;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(112),
    };

    mockPrisma = {
      chain: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Ethereum', confirmationsDefault: 12, isActive: true }]),
      },
      syncCursor: {
        findUnique: jest.fn().mockResolvedValue({ chainId: 1, lastBlock: BigInt(112), finalizedBlock: BigInt(90) }),
        update: jest.fn().mockResolvedValue({}),
      },
      indexedBlock: {
        updateMany: jest.fn().mockResolvedValue({ count: 10 }),
      },
      indexedEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 25 }),
      },
    };

    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
      reportSuccess: jest.fn(),
      reportFailure: jest.fn(),
    };

    mockRedis = {
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinalityTrackerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FinalityTrackerService>(FinalityTrackerService);
  });

  it('should finalize blocks and events up to current - confirmations', async () => {
    // currentBlock = 112, confirmations = 12, so finalized = 100
    // previous finalized = 90
    const count = await service.checkChainFinality(1, 12);

    expect(count).toBe(10);
    expect(mockPrisma.indexedBlock.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        chainId: 1,
        blockNumber: { gt: BigInt(90), lte: BigInt(100) },
        isFinalized: false,
      }),
      data: { isFinalized: true },
    });
    expect(mockPrisma.syncCursor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chainId: 1 },
        data: expect.objectContaining({ finalizedBlock: BigInt(100) }),
      }),
    );
    expect(mockRedis.publishToStream).toHaveBeenCalledWith(
      'indexer:finalized',
      expect.objectContaining({ chainId: '1', fromBlock: '91', toBlock: '100' }),
    );
  });

  it('should not finalize when already caught up', async () => {
    mockPrisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: BigInt(112),
      finalizedBlock: BigInt(100),
    });

    const count = await service.checkChainFinality(1, 12);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 5: Run all Phase 4 tests**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/chain-indexer-service
npx jest --testPathPattern='__tests__' --passWithNoTests
```

---

## PHASE 5 -- WEBHOOKS V2

---

## Task 15: Database Migration -- Webhooks v2 Tables

**Files:**
- Create: `database/014-webhooks-v2.sql`

- [ ] **Step 1: Create `database/014-webhooks-v2.sql`**

```sql
-- =============================================================================
-- CryptoVaultHub -- Webhooks v2 Migration
-- New tables: webhook_delivery_attempts, webhook_dead_letters
-- Enhanced: webhooks (retry config), webhook_deliveries (full history)
-- =============================================================================

USE `cvh_notifications`;

-- -------------------------------------------------------
-- webhook_delivery_attempts: full log of every HTTP attempt
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `webhook_delivery_attempts` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `delivery_id`      BIGINT       NOT NULL,
  `attempt_number`   INT          NOT NULL,
  `request_url`      VARCHAR(500) NOT NULL,
  `request_headers`  JSON         NOT NULL,
  `request_body`     TEXT         NOT NULL,
  `response_status`  INT          NULL,
  `response_headers` JSON         NULL,
  `response_body`    TEXT         NULL,
  `response_time_ms` INT          NOT NULL DEFAULT 0,
  `error`            TEXT         NULL,
  `attempted_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_delivery_attempt` (`delivery_id`, `attempt_number`),
  INDEX `idx_attempted_at` (`attempted_at`),
  CONSTRAINT `fk_attempt_delivery`
    FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- webhook_dead_letters: deliveries that exhausted retries
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS `webhook_dead_letters` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `delivery_id`    BIGINT       NOT NULL,
  `webhook_id`     BIGINT       NOT NULL,
  `client_id`      BIGINT       NOT NULL,
  `event_type`     VARCHAR(50)  NOT NULL,
  `payload`        JSON         NOT NULL,
  `total_attempts` INT          NOT NULL,
  `last_error`     TEXT         NULL,
  `last_http_status` INT        NULL,
  `dead_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resent_at`      TIMESTAMP    NULL COMMENT 'Set when manually resent',
  `resent_delivery_id` BIGINT   NULL COMMENT 'FK to new delivery on resend',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_delivery` (`delivery_id`),
  INDEX `idx_client_dead` (`client_id`, `dead_at`),
  INDEX `idx_webhook_dead` (`webhook_id`, `dead_at`),
  CONSTRAINT `fk_dead_letter_delivery`
    FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- Enhance webhooks: add retry configuration columns
-- -------------------------------------------------------
ALTER TABLE `webhooks`
  ADD COLUMN `max_attempts` INT NOT NULL DEFAULT 5 AFTER `is_active`,
  ADD COLUMN `retry_strategy` VARCHAR(20) NOT NULL DEFAULT 'exponential' AFTER `max_attempts`,
  ADD COLUMN `initial_delay_ms` INT NOT NULL DEFAULT 1000 AFTER `retry_strategy`,
  ADD COLUMN `max_delay_ms` INT NOT NULL DEFAULT 3600000 AFTER `initial_delay_ms`,
  ADD COLUMN `timeout_ms` INT NOT NULL DEFAULT 10000 AFTER `max_delay_ms`,
  ADD COLUMN `label` VARCHAR(100) NULL AFTER `url`,
  ADD COLUMN `description` VARCHAR(500) NULL AFTER `label`,
  ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

-- -------------------------------------------------------
-- Enhance webhook_deliveries: add idempotency key + metadata
-- -------------------------------------------------------
ALTER TABLE `webhook_deliveries`
  ADD COLUMN `idempotency_key` VARCHAR(100) NULL AFTER `delivery_code`,
  ADD COLUMN `completed_at` TIMESTAMP NULL AFTER `next_retry_at`,
  ADD INDEX `idx_client_created` (`client_id`, `created_at`),
  ADD INDEX `idx_idempotency` (`idempotency_key`);
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
mysql -u root -p < database/014-webhooks-v2.sql
```

---

## Task 16: Prisma Schema -- Enhanced Webhook Models

**Files:**
- Modify: `services/notification-service/prisma/schema.prisma`

- [ ] **Step 1: Replace `services/notification-service/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-client"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------------------
// Webhook configuration (ENHANCED)
// ---------------------------------------------------------------------------

model Webhook {
  id             BigInt   @id @default(autoincrement())
  clientId       BigInt   @map("client_id")
  url            String   @db.VarChar(500)
  label          String?  @db.VarChar(100)
  description    String?  @db.VarChar(500)
  secret         String   @db.VarChar(128)
  events         Json
  isActive       Boolean  @default(true) @map("is_active")
  maxAttempts    Int      @default(5) @map("max_attempts")
  retryStrategy  String   @default("exponential") @db.VarChar(20) @map("retry_strategy")
  initialDelayMs Int      @default(1000) @map("initial_delay_ms")
  maxDelayMs     Int      @default(3600000) @map("max_delay_ms")
  timeoutMs      Int      @default(10000) @map("timeout_ms")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  deliveries     WebhookDelivery[]
  deadLetters    WebhookDeadLetter[]

  @@unique([clientId, url])
  @@map("webhooks")
}

// ---------------------------------------------------------------------------
// Webhook delivery tracking (ENHANCED)
// ---------------------------------------------------------------------------

model WebhookDelivery {
  id              BigInt    @id @default(autoincrement())
  deliveryCode    String    @unique @db.VarChar(50) @map("delivery_code")
  idempotencyKey  String?   @db.VarChar(100) @map("idempotency_key")
  webhookId       BigInt    @map("webhook_id")
  clientId        BigInt    @map("client_id")
  eventType       String    @db.VarChar(50) @map("event_type")
  payload         Json
  status          String    @default("queued") @db.VarChar(20)
  httpStatus      Int?      @map("http_status")
  responseBody    String?   @db.Text @map("response_body")
  responseTimeMs  Int?      @map("response_time_ms")
  attempts        Int       @default(0)
  maxAttempts     Int       @default(5) @map("max_attempts")
  lastAttemptAt   DateTime? @map("last_attempt_at")
  nextRetryAt     DateTime? @map("next_retry_at")
  completedAt     DateTime? @map("completed_at")
  error           String?   @db.Text
  createdAt       DateTime  @default(now()) @map("created_at")

  webhook         Webhook   @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  attempts_log    WebhookDeliveryAttempt[]
  deadLetter      WebhookDeadLetter?

  @@index([webhookId, createdAt])
  @@index([status])
  @@index([clientId, createdAt])
  @@index([idempotencyKey])
  @@map("webhook_deliveries")
}

// ---------------------------------------------------------------------------
// Webhook delivery attempts -- full log of every HTTP attempt
// ---------------------------------------------------------------------------

model WebhookDeliveryAttempt {
  id              BigInt    @id @default(autoincrement())
  deliveryId      BigInt    @map("delivery_id")
  attemptNumber   Int       @map("attempt_number")
  requestUrl      String    @db.VarChar(500) @map("request_url")
  requestHeaders  Json      @map("request_headers")
  requestBody     String    @db.Text @map("request_body")
  responseStatus  Int?      @map("response_status")
  responseHeaders Json?     @map("response_headers")
  responseBody    String?   @db.Text @map("response_body")
  responseTimeMs  Int       @default(0) @map("response_time_ms")
  error           String?   @db.Text
  attemptedAt     DateTime  @default(now()) @map("attempted_at")

  delivery        WebhookDelivery @relation(fields: [deliveryId], references: [id], onDelete: Cascade)

  @@index([deliveryId, attemptNumber])
  @@index([attemptedAt])
  @@map("webhook_delivery_attempts")
}

// ---------------------------------------------------------------------------
// Webhook dead letters -- deliveries that exhausted all retries
// ---------------------------------------------------------------------------

model WebhookDeadLetter {
  id               BigInt    @id @default(autoincrement())
  deliveryId       BigInt    @unique @map("delivery_id")
  webhookId        BigInt    @map("webhook_id")
  clientId         BigInt    @map("client_id")
  eventType        String    @db.VarChar(50) @map("event_type")
  payload          Json
  totalAttempts    Int       @map("total_attempts")
  lastError        String?   @db.Text @map("last_error")
  lastHttpStatus   Int?      @map("last_http_status")
  deadAt           DateTime  @default(now()) @map("dead_at")
  resentAt         DateTime? @map("resent_at")
  resentDeliveryId BigInt?   @map("resent_delivery_id")

  delivery         WebhookDelivery @relation(fields: [deliveryId], references: [id], onDelete: Cascade)
  webhook          Webhook         @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  @@index([clientId, deadAt])
  @@index([webhookId, deadAt])
  @@map("webhook_dead_letters")
}

// ---------------------------------------------------------------------------
// Email logs
// ---------------------------------------------------------------------------

model EmailLog {
  id        BigInt    @id @default(autoincrement())
  clientId  BigInt    @map("client_id")
  to        String    @db.VarChar(255)
  subject   String    @db.VarChar(500)
  body      String    @db.Text
  status    String    @default("queued") @db.VarChar(20)
  sentAt    DateTime? @map("sent_at")
  error     String?   @db.Text
  createdAt DateTime  @default(now()) @map("created_at")

  @@map("email_logs")
}
```

- [ ] **Step 2: Regenerate Prisma client**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/notification-service
npx prisma generate
```

---

## Task 17: ConfigurableRetryService

**Files:**
- Create: `services/notification-service/src/webhook/configurable-retry.service.ts`

- [ ] **Step 1: Create `services/notification-service/src/webhook/configurable-retry.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RetryConfig {
  maxAttempts: number;
  retryStrategy: 'exponential' | 'linear' | 'fixed';
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

/**
 * Reads per-webhook retry configuration and computes the next delay.
 * Falls back to system defaults if the webhook has no custom config.
 */
@Injectable()
export class ConfigurableRetryService {
  private readonly logger = new Logger(ConfigurableRetryService.name);

  private readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 5,
    retryStrategy: 'exponential',
    initialDelayMs: 1000,
    maxDelayMs: 3_600_000,
    timeoutMs: 10_000,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the retry configuration for a specific webhook.
   */
  async getRetryConfig(webhookId: bigint): Promise<RetryConfig> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
      select: {
        maxAttempts: true,
        retryStrategy: true,
        initialDelayMs: true,
        maxDelayMs: true,
        timeoutMs: true,
      },
    });

    if (!webhook) return { ...this.DEFAULT_CONFIG };

    return {
      maxAttempts: webhook.maxAttempts,
      retryStrategy: webhook.retryStrategy as RetryConfig['retryStrategy'],
      initialDelayMs: webhook.initialDelayMs,
      maxDelayMs: webhook.maxDelayMs,
      timeoutMs: webhook.timeoutMs,
    };
  }

  /**
   * Compute the delay for the next retry attempt based on the retry strategy.
   *
   * @param attemptNumber - The attempt number (1-based) that just failed.
   * @param config - The retry configuration.
   * @returns Delay in milliseconds, or -1 if max attempts exhausted.
   */
  computeNextDelay(attemptNumber: number, config: RetryConfig): number {
    if (attemptNumber >= config.maxAttempts) {
      return -1; // Exhausted
    }

    let delay: number;

    switch (config.retryStrategy) {
      case 'exponential': {
        // delay = initialDelay * 2^(attempt-1) with jitter
        const baseDelay = config.initialDelayMs * Math.pow(2, attemptNumber - 1);
        const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
        delay = baseDelay + jitter;
        break;
      }

      case 'linear': {
        // delay = initialDelay * attempt
        delay = config.initialDelayMs * attemptNumber;
        break;
      }

      case 'fixed': {
        delay = config.initialDelayMs;
        break;
      }

      default:
        delay = config.initialDelayMs;
    }

    return Math.min(delay, config.maxDelayMs);
  }
}
```

---

## Task 18: DeliveryAttemptRecorder Service

**Files:**
- Create: `services/notification-service/src/webhook/delivery-attempt-recorder.service.ts`

- [ ] **Step 1: Create `services/notification-service/src/webhook/delivery-attempt-recorder.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AttemptRecord {
  deliveryId: bigint;
  attemptNumber: number;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  responseTimeMs: number;
  error: string | null;
}

/**
 * Records every HTTP attempt with full request/response details for traceability.
 */
@Injectable()
export class DeliveryAttemptRecorderService {
  private readonly logger = new Logger(DeliveryAttemptRecorderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a single delivery attempt.
   */
  async recordAttempt(record: AttemptRecord): Promise<void> {
    await this.prisma.webhookDeliveryAttempt.create({
      data: {
        deliveryId: record.deliveryId,
        attemptNumber: record.attemptNumber,
        requestUrl: record.requestUrl,
        requestHeaders: record.requestHeaders as any,
        requestBody: record.requestBody,
        responseStatus: record.responseStatus,
        responseHeaders: record.responseHeaders as any,
        responseBody: record.responseBody?.slice(0, 10000) ?? null,
        responseTimeMs: record.responseTimeMs,
        error: record.error,
      },
    });
  }

  /**
   * Get all attempts for a delivery, ordered by attempt number.
   */
  async getAttempts(deliveryId: bigint) {
    const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
      where: { deliveryId },
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map((a) => ({
      id: Number(a.id),
      attemptNumber: a.attemptNumber,
      requestUrl: a.requestUrl,
      requestHeaders: a.requestHeaders,
      responseStatus: a.responseStatus,
      responseHeaders: a.responseHeaders,
      responseBody: a.responseBody,
      responseTimeMs: a.responseTimeMs,
      error: a.error,
      attemptedAt: a.attemptedAt,
    }));
  }
}
```

---

## Task 19: DeadLetterProcessor Service

**Files:**
- Create: `services/notification-service/src/webhook/dead-letter-processor.service.ts`

- [ ] **Step 1: Create `services/notification-service/src/webhook/dead-letter-processor.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Moves failed deliveries to the dead letter queue after max attempts
 * are exhausted. Provides listing and stats for the DLQ.
 */
@Injectable()
export class DeadLetterProcessorService {
  private readonly logger = new Logger(DeadLetterProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Move a failed delivery to the dead letter queue.
   */
  async moveToDeadLetter(deliveryId: bigint): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) return;

    // Check if already in DLQ
    const existing = await this.prisma.webhookDeadLetter.findUnique({
      where: { deliveryId },
    });
    if (existing) return;

    await this.prisma.webhookDeadLetter.create({
      data: {
        deliveryId,
        webhookId: delivery.webhookId,
        clientId: delivery.clientId,
        eventType: delivery.eventType,
        payload: delivery.payload as any,
        totalAttempts: delivery.attempts,
        lastError: delivery.error,
        lastHttpStatus: delivery.httpStatus,
      },
    });

    // Update delivery status
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'dead_letter',
        completedAt: new Date(),
      },
    });

    this.logger.log(`Delivery ${delivery.deliveryCode} moved to dead letter queue`);
  }

  /**
   * List dead letters for a client.
   */
  async listDeadLetters(clientId: bigint, params?: { page?: number; limit?: number }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [deadLetters, total] = await Promise.all([
      this.prisma.webhookDeadLetter.findMany({
        where: { clientId },
        orderBy: { deadAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookDeadLetter.count({ where: { clientId } }),
    ]);

    return {
      deadLetters: deadLetters.map((dl) => ({
        id: Number(dl.id),
        deliveryId: Number(dl.deliveryId),
        webhookId: Number(dl.webhookId),
        eventType: dl.eventType,
        payload: dl.payload,
        totalAttempts: dl.totalAttempts,
        lastError: dl.lastError,
        lastHttpStatus: dl.lastHttpStatus,
        deadAt: dl.deadAt,
        resentAt: dl.resentAt,
        resentDeliveryId: dl.resentDeliveryId ? Number(dl.resentDeliveryId) : null,
      })),
      meta: { page, limit, total },
    };
  }

  /**
   * Get dead letter stats for all clients (admin view).
   */
  async getStats() {
    const totalDead = await this.prisma.webhookDeadLetter.count();
    const unresolvedDead = await this.prisma.webhookDeadLetter.count({
      where: { resentAt: null },
    });
    const resentDead = await this.prisma.webhookDeadLetter.count({
      where: { resentAt: { not: null } },
    });

    // Dead letters per client (top 10)
    const perClient = await this.prisma.webhookDeadLetter.groupBy({
      by: ['clientId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    return {
      total: totalDead,
      unresolved: unresolvedDead,
      resent: resentDead,
      topClients: perClient.map((c) => ({
        clientId: Number(c.clientId),
        count: c._count.id,
      })),
    };
  }
}
```

---

## Task 20: ManualResendService

**Files:**
- Create: `services/notification-service/src/webhook/manual-resend.service.ts`

- [ ] **Step 1: Create `services/notification-service/src/webhook/manual-resend.service.ts`**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Allows manual resend of individual deliveries or batch resend from the DLQ.
 */
@Injectable()
export class ManualResendService {
  private readonly logger = new Logger(ManualResendService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
  ) {}

  /**
   * Resend a single failed delivery. Creates a new delivery record
   * with the original payload and enqueues it immediately.
   */
  async resendDelivery(deliveryId: bigint): Promise<{ newDeliveryId: number; deliveryCode: string }> {
    const original = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!original) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    const webhook = await this.prisma.webhook.findUnique({
      where: { id: original.webhookId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${original.webhookId} not found`);
    }

    const deliveryCode = `dlv_${uuidv4().replace(/-/g, '')}`;

    // Create new delivery
    const newDelivery = await this.prisma.webhookDelivery.create({
      data: {
        deliveryCode,
        webhookId: original.webhookId,
        clientId: original.clientId,
        eventType: original.eventType,
        payload: original.payload as any,
        status: 'queued',
        maxAttempts: webhook.maxAttempts,
        idempotencyKey: `resend:${original.deliveryCode}:${Date.now()}`,
      },
    });

    // Enqueue for immediate delivery
    await this.deliveryQueue.add(
      'deliver',
      {
        deliveryId: Number(newDelivery.id),
        webhookId: Number(original.webhookId),
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    // Update dead letter record if exists
    await this.prisma.webhookDeadLetter.updateMany({
      where: { deliveryId },
      data: {
        resentAt: new Date(),
        resentDeliveryId: newDelivery.id,
      },
    });

    this.logger.log(
      `Resent delivery ${original.deliveryCode} as ${deliveryCode}`,
    );

    return {
      newDeliveryId: Number(newDelivery.id),
      deliveryCode,
    };
  }

  /**
   * Batch resend multiple dead-lettered deliveries.
   */
  async batchResend(deadLetterIds: bigint[]): Promise<{ resent: number; errors: number }> {
    let resent = 0;
    let errors = 0;

    for (const dlId of deadLetterIds) {
      try {
        const dl = await this.prisma.webhookDeadLetter.findUnique({
          where: { id: dlId },
        });
        if (!dl || dl.resentAt) {
          errors++;
          continue;
        }

        await this.resendDelivery(dl.deliveryId);
        resent++;
      } catch (error) {
        errors++;
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to resend dead letter ${dlId}: ${msg}`);
      }
    }

    this.logger.log(`Batch resend: ${resent} succeeded, ${errors} failed`);
    return { resent, errors };
  }
}
```

---

## Task 21: Enhanced WebhookDeliveryService + WebhookWorker

**Files:**
- Modify: `services/notification-service/src/webhook/webhook-delivery.service.ts`
- Modify: `services/notification-service/src/webhook/webhook.worker.ts`
- Modify: `services/notification-service/src/webhook/webhook.module.ts`
- Modify: `services/notification-service/src/common/dto/webhook.dto.ts`

- [ ] **Step 1: Update webhook-delivery.service.ts to use configurable retry and record attempts**

In the `handleFailure` method of `webhook-delivery.service.ts`, replace the hardcoded `RETRY_DELAYS_MS` logic. Add the new dependencies to the constructor:

```typescript
// Add to imports at top
import { ConfigurableRetryService } from './configurable-retry.service';
import { DeliveryAttemptRecorderService } from './delivery-attempt-recorder.service';
import { DeadLetterProcessorService } from './dead-letter-processor.service';
```

Add to the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookService,
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
    private readonly retryService: ConfigurableRetryService,
    private readonly attemptRecorder: DeliveryAttemptRecorderService,
    private readonly deadLetterProcessor: DeadLetterProcessorService,
  ) {}
```

In `deliverWebhook`, after every attempt (success or failure), add:

```typescript
    // Record the attempt
    await this.attemptRecorder.recordAttempt({
      deliveryId,
      attemptNumber: delivery.attempts + 1,
      requestUrl: webhook.url,
      requestHeaders: {
        'Content-Type': 'application/json',
        'X-Signature': `sha256=${signature}`,
        'X-Event-Type': delivery.eventType,
        'X-Delivery-Id': delivery.deliveryCode,
      },
      requestBody: payloadStr,
      responseStatus: isSuccess ? response.status : (response?.status ?? null),
      responseHeaders: response?.headers ? Object.fromEntries(
        Object.entries(response.headers).filter(([, v]) => typeof v === 'string'),
      ) : null,
      responseBody: responseBody,
      responseTimeMs,
      error: isSuccess ? null : errorMessage,
    });
```

In `handleFailure`, replace delay computation with:

```typescript
    const config = await this.retryService.getRetryConfig(BigInt(delivery.webhookId));
    const delayMs = this.retryService.computeNextDelay(nextAttempt, config);

    if (delayMs === -1) {
      // Dead letter
      await this.deadLetterProcessor.moveToDeadLetter(delivery.id);
      // ... existing dead letter update logic ...
    }
```

- [ ] **Step 2: Update webhook.module.ts to add new providers**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookController } from './webhook.controller';
import { WebhookWorker } from './webhook.worker';
import { ConfigurableRetryService } from './configurable-retry.service';
import { DeliveryAttemptRecorderService } from './delivery-attempt-recorder.service';
import { DeadLetterProcessorService } from './dead-letter-processor.service';
import { ManualResendService } from './manual-resend.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-delivery',
    }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WebhookDeliveryService,
    WebhookWorker,
    ConfigurableRetryService,
    DeliveryAttemptRecorderService,
    DeadLetterProcessorService,
    ManualResendService,
  ],
  exports: [
    WebhookService,
    WebhookDeliveryService,
    ConfigurableRetryService,
    DeliveryAttemptRecorderService,
    DeadLetterProcessorService,
    ManualResendService,
  ],
})
export class WebhookModule {}
```

- [ ] **Step 3: Add new endpoints to notification service webhook.controller.ts**

Add these new endpoints to the existing `WebhookController`:

```typescript
  @Get(':id/deliveries/:deliveryId/attempts')
  async listAttempts(
    @Param('id', ParseIntPipe) webhookId: number,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
  ) {
    const attempts = await this.attemptRecorder.getAttempts(BigInt(deliveryId));
    return { success: true, count: attempts.length, attempts };
  }

  @Get('dead-letters/client/:clientId')
  async listDeadLetters(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.deadLetterProcessor.listDeadLetters(BigInt(clientId), {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return { success: true, ...result };
  }

  @Post('dead-letters/stats')
  async getDeadLetterStats() {
    const stats = await this.deadLetterProcessor.getStats();
    return { success: true, ...stats };
  }

  @Post('deliveries/:deliveryId/resend')
  async resendDelivery(
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
  ) {
    const result = await this.manualResend.resendDelivery(BigInt(deliveryId));
    return { success: true, ...result };
  }

  @Post('dead-letters/batch-resend')
  async batchResend(@Body() body: { deadLetterIds: number[] }) {
    const ids = body.deadLetterIds.map((id) => BigInt(id));
    const result = await this.manualResend.batchResend(ids);
    return { success: true, ...result };
  }
```

Add the new service injections to the controller constructor:

```typescript
  constructor(
    private readonly webhookService: WebhookService,
    private readonly deliveryService: WebhookDeliveryService,
    private readonly attemptRecorder: DeliveryAttemptRecorderService,
    private readonly deadLetterProcessor: DeadLetterProcessorService,
    private readonly manualResend: ManualResendService,
  ) {}
```

---

## Task 22: Client API -- Delivery History + Resend + DLQ

**Files:**
- Modify: `services/client-api/src/webhook/webhook.service.ts`
- Modify: `services/client-api/src/webhook/webhook.controller.ts`
- Modify: `services/client-api/src/common/dto/webhook.dto.ts`

- [ ] **Step 1: Add new methods to `services/client-api/src/webhook/webhook.service.ts`**

Add these methods:

```typescript
  async getDeliveryAttempts(clientId: number, deliveryId: string) {
    try {
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/0/deliveries/${deliveryId}/attempts`,
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listDeadLetters(clientId: number, params: { page?: number; limit?: number }) {
    try {
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/dead-letters/client/${clientId}`,
        { headers: this.headers, params, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async resendFromDeadLetter(clientId: number, deliveryId: string) {
    try {
      const { data } = await axios.post(
        `${this.notificationUrl}/webhooks/deliveries/${deliveryId}/resend`,
        { clientId },
        { headers: this.headers, timeout: 30000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
```

- [ ] **Step 2: Add new endpoints to `services/client-api/src/webhook/webhook.controller.ts`**

Add these new routes:

```typescript
  @Get('deliveries/:deliveryId/attempts')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List delivery attempts',
    description: `Returns the full attempt history for a specific delivery, including request/response headers, body, status code, and timing for each attempt. Useful for debugging webhook connectivity issues.

**Required scope:** \`read\``,
  })
  @ApiParam({ name: 'deliveryId', type: String })
  @ApiResponse({ status: 200, description: 'Delivery attempts retrieved.' })
  async getDeliveryAttempts(@Param('deliveryId') deliveryId: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.getDeliveryAttempts(clientId, deliveryId);
    return { success: true, ...result };
  }

  @Get('dead-letters')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List dead-lettered deliveries',
    description: `Returns deliveries that exhausted all retry attempts. These can be manually resent using the resend endpoint.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Dead letters retrieved.' })
  async listDeadLetters(@Query() query: any, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.listDeadLetters(clientId, {
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
    return { success: true, ...result };
  }

  @Post('dead-letters/:deliveryId/resend')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend a dead-lettered delivery',
    description: `Creates a new delivery from a dead-lettered original and enqueues it for immediate delivery. The original payload is reused with a fresh signature.

**Required scope:** \`write\``,
  })
  @ApiParam({ name: 'deliveryId', type: String })
  @ApiResponse({ status: 200, description: 'Delivery resent.' })
  async resendDeadLetter(@Param('deliveryId') deliveryId: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.resendFromDeadLetter(clientId, deliveryId);
    return { success: true, ...result };
  }
```

---

## Task 23: Admin API -- Webhook Monitoring

**Files:**
- Create: `services/admin-api/src/webhook-monitoring/webhook-monitoring.service.ts`
- Create: `services/admin-api/src/webhook-monitoring/webhook-monitoring.controller.ts`
- Create: `services/admin-api/src/webhook-monitoring/webhook-monitoring.module.ts`
- Modify: `services/admin-api/src/app.module.ts`

- [ ] **Step 1: Create `services/admin-api/src/webhook-monitoring/webhook-monitoring.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WebhookMonitoringService {
  private readonly logger = new Logger(WebhookMonitoringService.name);
  private readonly notificationUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.notificationUrl = this.configService.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async getDeadLetterStats() {
    try {
      const { data } = await axios.post(
        `${this.notificationUrl}/webhooks/dead-letters/stats`,
        {},
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (err) {
      return { status: 'unavailable', error: (err as Error).message };
    }
  }

  async listAllDeadLetters(params?: { page?: number; limit?: number; clientId?: number }) {
    try {
      const clientId = params?.clientId ?? 0;
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/dead-letters/client/${clientId}`,
        { headers: this.headers, params, timeout: 10000 },
      );
      return data;
    } catch (err) {
      return { status: 'unavailable', error: (err as Error).message };
    }
  }
}
```

- [ ] **Step 2: Create `services/admin-api/src/webhook-monitoring/webhook-monitoring.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { WebhookMonitoringService } from './webhook-monitoring.service';

@ApiTags('Webhook Monitoring')
@ApiBearerAuth('JWT')
@Controller('admin/webhooks')
export class WebhookMonitoringController {
  constructor(private readonly service: WebhookMonitoringService) {}

  @Get('stats')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get webhook delivery statistics',
    description: 'Returns dead letter queue stats, delivery success rates, and top failing clients.',
  })
  @ApiResponse({ status: 200, description: 'Webhook stats' })
  async getStats() {
    const stats = await this.service.getDeadLetterStats();
    return { success: true, ...stats };
  }

  @Get('dead-letters')
  @AdminAuth()
  @ApiOperation({
    summary: 'Browse dead-lettered deliveries across all clients',
    description: 'Admin view of all dead-lettered deliveries with optional client filter.',
  })
  @ApiQuery({ name: 'clientId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Dead letters' })
  async listDeadLetters(
    @Query('clientId') clientId?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.service.listAllDeadLetters({ clientId, page, limit });
    return { success: true, ...result };
  }
}
```

- [ ] **Step 3: Create `services/admin-api/src/webhook-monitoring/webhook-monitoring.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { WebhookMonitoringService } from './webhook-monitoring.service';
import { WebhookMonitoringController } from './webhook-monitoring.controller';

@Module({
  controllers: [WebhookMonitoringController],
  providers: [WebhookMonitoringService],
})
export class WebhookMonitoringModule {}
```

- [ ] **Step 4: Add `WebhookMonitoringModule` to admin-api app.module.ts**

Add import and add to imports array.

---

## Task 24: Frontend -- Client Webhook Delivery History + Admin Webhook Stats

**Files:**
- Create: `apps/client/app/webhooks/[id]/page.tsx`
- Create: `apps/client/components/delivery-history-table.tsx`
- Create: `apps/client/components/attempt-timeline.tsx`
- Create: `apps/client/components/resend-button.tsx`
- Create: `apps/admin/app/webhook-stats/page.tsx`
- Create: `apps/admin/components/webhook-stats-card.tsx`
- Create: `apps/admin/components/delivery-stats-chart.tsx`

- [ ] **Step 1: Create `apps/client/components/delivery-history-table.tsx`**

```tsx
"use client";

import { Badge } from "@/components/badge";

interface Delivery {
  id: number;
  deliveryCode: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  responseTimeMs: number | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
}

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  sent: "success",
  queued: "default",
  failed: "error",
  dead_letter: "error",
};

export function DeliveryHistoryTable({
  deliveries,
  onSelect,
}: {
  deliveries: Delivery[];
  onSelect: (id: number) => void;
}) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
      <table className="w-full text-caption">
        <thead>
          <tr className="border-b border-border-default bg-surface-elevated">
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Code</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Event</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Status</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">HTTP</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Time</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Attempts</th>
            <th className="px-3 py-2 text-left font-display font-semibold text-text-muted uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr
              key={d.id}
              onClick={() => onSelect(d.id)}
              className="border-b border-border-default/50 hover:bg-surface-elevated/50 transition-colors cursor-pointer"
            >
              <td className="px-3 py-2 font-mono text-accent-primary text-micro">{d.deliveryCode}</td>
              <td className="px-3 py-2 font-display text-text-primary">{d.eventType}</td>
              <td className="px-3 py-2">
                <Badge variant={statusVariant[d.status] || "default"}>{d.status}</Badge>
              </td>
              <td className="px-3 py-2 font-mono text-text-primary">{d.httpStatus ?? "-"}</td>
              <td className="px-3 py-2 font-mono text-text-primary">{d.responseTimeMs ? `${d.responseTimeMs}ms` : "-"}</td>
              <td className="px-3 py-2 font-mono text-text-primary">{d.attempts}/{d.maxAttempts}</td>
              <td className="px-3 py-2 text-text-muted font-display">{new Date(d.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/client/components/attempt-timeline.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface Attempt {
  attemptNumber: number;
  responseStatus: number | null;
  responseTimeMs: number;
  error: string | null;
  attemptedAt: string;
}

export function AttemptTimeline({ attempts }: { attempts: Attempt[] }) {
  return (
    <div className="space-y-0">
      {attempts.map((a, idx) => (
        <div key={a.attemptNumber} className="flex items-start gap-3 pb-4 relative">
          {/* Connector line */}
          {idx < attempts.length - 1 && (
            <div className="absolute left-[11px] top-6 w-[2px] h-[calc(100%-16px)] bg-border-default" />
          )}
          {/* Dot */}
          <div className={cn(
            "w-6 h-6 rounded-pill flex items-center justify-center text-micro font-bold font-mono shrink-0 mt-0.5",
            a.responseStatus && a.responseStatus >= 200 && a.responseStatus < 300
              ? "bg-status-success-subtle text-status-success"
              : a.error
                ? "bg-status-error-subtle text-status-error"
                : "bg-surface-elevated text-text-muted",
          )}>
            {a.attemptNumber}
          </div>
          {/* Content */}
          <div className="flex-1 bg-surface-card border border-border-default rounded-card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-caption font-display font-semibold text-text-primary">
                Attempt #{a.attemptNumber}
              </span>
              <span className="text-micro text-text-muted font-display">
                {new Date(a.attemptedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-4 text-micro">
              {a.responseStatus && (
                <span className={cn(
                  "font-mono font-semibold",
                  a.responseStatus >= 200 && a.responseStatus < 300 ? "text-status-success" : "text-status-error",
                )}>
                  HTTP {a.responseStatus}
                </span>
              )}
              <span className="font-mono text-text-muted">{a.responseTimeMs}ms</span>
              {a.error && (
                <span className="text-status-error font-display truncate max-w-xs">{a.error}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/client/components/resend-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ResendButton({ deliveryId, onResend }: { deliveryId: number; onResend: (id: number) => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = () => {
    setLoading(true);
    onResend(deliveryId);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    }, 1500);
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading || done}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast border",
        done
          ? "bg-status-success-subtle text-status-success border-status-success"
          : loading
            ? "bg-surface-elevated text-text-muted border-border-default cursor-wait"
            : "bg-accent-primary text-accent-text border-transparent hover:bg-accent-hover",
      )}
    >
      {done ? "Resent" : loading ? "Sending..." : "Resend"}
    </button>
  );
}
```

- [ ] **Step 4: Create `apps/client/app/webhooks/[id]/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DeliveryHistoryTable } from "@/components/delivery-history-table";
import { AttemptTimeline } from "@/components/attempt-timeline";
import { ResendButton } from "@/components/resend-button";
import { JsonViewer } from "@/components/json-viewer";

const mockDeliveries = [
  { id: 1, deliveryCode: "dlv_a1b2c3d4", eventType: "deposit.confirmed", status: "sent", httpStatus: 200, responseTimeMs: 145, attempts: 1, maxAttempts: 5, createdAt: "2026-04-09T14:00:00Z" },
  { id: 2, deliveryCode: "dlv_e5f6g7h8", eventType: "deposit.detected", status: "sent", httpStatus: 200, responseTimeMs: 89, attempts: 1, maxAttempts: 5, createdAt: "2026-04-09T13:55:00Z" },
  { id: 3, deliveryCode: "dlv_i9j0k1l2", eventType: "withdrawal.confirmed", status: "failed", httpStatus: 503, responseTimeMs: 10023, attempts: 5, maxAttempts: 5, createdAt: "2026-04-09T12:00:00Z" },
];

const mockAttempts = [
  { attemptNumber: 1, responseStatus: 503, responseTimeMs: 2100, error: "Service Unavailable", attemptedAt: "2026-04-09T12:00:01Z" },
  { attemptNumber: 2, responseStatus: 503, responseTimeMs: 3200, error: "Service Unavailable", attemptedAt: "2026-04-09T12:00:06Z" },
  { attemptNumber: 3, responseStatus: 503, responseTimeMs: 10023, error: "Service Unavailable", attemptedAt: "2026-04-09T12:00:36Z" },
  { attemptNumber: 4, responseStatus: null, responseTimeMs: 10000, error: "ETIMEDOUT", attemptedAt: "2026-04-09T12:02:36Z" },
  { attemptNumber: 5, responseStatus: 503, responseTimeMs: 1500, error: "Service Unavailable", attemptedAt: "2026-04-09T12:12:36Z" },
];

export default function WebhookDeliveryDetailPage() {
  const [selectedDelivery, setSelectedDelivery] = useState<number | null>(null);
  const [showAttempts, setShowAttempts] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-section-gap">
        <Link href="/webhooks" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-heading font-display text-text-primary">Webhook Deliveries</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Full delivery history with attempt timeline and resend capability
          </p>
        </div>
      </div>

      {/* Delivery History */}
      <div className="mb-section-gap">
        <DeliveryHistoryTable
          deliveries={mockDeliveries}
          onSelect={(id) => {
            setSelectedDelivery(id);
            setShowAttempts(true);
          }}
        />
      </div>

      {/* Attempt Timeline (shown when a delivery is selected) */}
      {showAttempts && selectedDelivery && (
        <div className="mb-section-gap">
          <div className="flex items-center justify-between mb-3">
            <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] font-display">
              Attempt Timeline -- Delivery #{selectedDelivery}
            </div>
            <div className="flex items-center gap-2">
              <ResendButton
                deliveryId={selectedDelivery}
                onResend={(id) => console.log(`Resending delivery ${id}`)}
              />
              <button
                onClick={() => setShowAttempts(false)}
                className="text-text-muted hover:text-text-primary text-caption font-display transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <AttemptTimeline attempts={mockAttempts} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/admin/components/webhook-stats-card.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface WebhookStatsCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: "success" | "error" | "warning" | "accent";
}

const colorMap: Record<string, string> = {
  success: "text-status-success",
  error: "text-status-error",
  warning: "text-status-warning",
  accent: "text-accent-primary",
};

export function WebhookStatsCard({ label, value, subtitle, color }: WebhookStatsCardProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card group relative overflow-hidden hover:border-accent-primary/20 transition-all duration-fast">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />
      <div className="text-caption font-medium uppercase tracking-[0.06em] text-text-muted mb-2 font-display">{label}</div>
      <div className={cn("text-stat font-bold tracking-tight leading-none font-display", color && colorMap[color])}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {subtitle && <div className="text-caption text-text-muted mt-1 font-display">{subtitle}</div>}
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/admin/components/delivery-stats-chart.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface DeliveryStatRow {
  clientId: number;
  count: number;
}

export function DeliveryStatsChart({ data }: { data: DeliveryStatRow[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
      <div className="text-caption font-semibold text-text-primary font-display mb-3">Top Failing Clients</div>
      <div className="space-y-2">
        {data.map((row) => (
          <div key={row.clientId} className="flex items-center gap-3">
            <span className="text-micro font-mono text-text-muted w-16">Client {row.clientId}</span>
            <div className="flex-1 h-5 bg-surface-elevated rounded-pill overflow-hidden">
              <div
                className="h-full bg-status-error/80 rounded-pill transition-all duration-normal"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
            <span className="text-micro font-mono text-text-primary w-10 text-right">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `apps/admin/app/webhook-stats/page.tsx`**

```tsx
"use client";

import { WebhookStatsCard } from "@/components/webhook-stats-card";
import { DeliveryStatsChart } from "@/components/delivery-stats-chart";

const mockStats = {
  total: 142,
  unresolved: 89,
  resent: 53,
  topClients: [
    { clientId: 12, count: 34 },
    { clientId: 7, count: 22 },
    { clientId: 45, count: 18 },
    { clientId: 3, count: 15 },
  ],
};

export default function WebhookStatsPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">Webhook Statistics</h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Platform-wide webhook delivery health, dead letter queue, and failure analytics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-section-gap">
        <WebhookStatsCard label="Total Dead Letters" value={mockStats.total} color="error" />
        <WebhookStatsCard label="Unresolved" value={mockStats.unresolved} color="warning" subtitle="Awaiting manual resend" />
        <WebhookStatsCard label="Resent" value={mockStats.resent} color="success" subtitle="Manually recovered" />
        <WebhookStatsCard
          label="Resolution Rate"
          value={`${Math.round((mockStats.resent / mockStats.total) * 100)}%`}
          color="accent"
        />
      </div>

      {/* Top Failing Clients */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Dead Letters by Client
      </div>
      <DeliveryStatsChart data={mockStats.topClients} />
    </div>
  );
}
```

---

## Task 25: Phase 5 Tests

**Files:**
- Create: `services/notification-service/src/__tests__/configurable-retry.service.spec.ts`
- Create: `services/notification-service/src/__tests__/delivery-attempt-recorder.service.spec.ts`
- Create: `services/notification-service/src/__tests__/dead-letter-processor.service.spec.ts`
- Create: `services/notification-service/src/__tests__/manual-resend.service.spec.ts`

- [ ] **Step 1: Create `services/notification-service/src/__tests__/configurable-retry.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurableRetryService } from '../webhook/configurable-retry.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ConfigurableRetryService', () => {
  let service: ConfigurableRetryService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      webhook: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurableRetryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConfigurableRetryService>(ConfigurableRetryService);
  });

  describe('getRetryConfig', () => {
    it('should return webhook config when found', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        maxAttempts: 10,
        retryStrategy: 'linear',
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        timeoutMs: 5000,
      });

      const config = await service.getRetryConfig(BigInt(1));

      expect(config.maxAttempts).toBe(10);
      expect(config.retryStrategy).toBe('linear');
      expect(config.initialDelayMs).toBe(2000);
    });

    it('should return defaults when webhook not found', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(null);

      const config = await service.getRetryConfig(BigInt(999));

      expect(config.maxAttempts).toBe(5);
      expect(config.retryStrategy).toBe('exponential');
    });
  });

  describe('computeNextDelay', () => {
    it('should return -1 when max attempts exhausted', () => {
      const config = { maxAttempts: 5, retryStrategy: 'exponential' as const, initialDelayMs: 1000, maxDelayMs: 3600000, timeoutMs: 10000 };
      expect(service.computeNextDelay(5, config)).toBe(-1);
    });

    it('should compute exponential backoff', () => {
      const config = { maxAttempts: 10, retryStrategy: 'exponential' as const, initialDelayMs: 1000, maxDelayMs: 3600000, timeoutMs: 10000 };

      const delay1 = service.computeNextDelay(1, config);
      const delay2 = service.computeNextDelay(2, config);
      const delay3 = service.computeNextDelay(3, config);

      // Base delays: 1000, 2000, 4000 (plus up to 10% jitter)
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThan(1200);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThan(2400);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThan(4800);
    });

    it('should compute linear backoff', () => {
      const config = { maxAttempts: 10, retryStrategy: 'linear' as const, initialDelayMs: 5000, maxDelayMs: 60000, timeoutMs: 10000 };

      expect(service.computeNextDelay(1, config)).toBe(5000);
      expect(service.computeNextDelay(2, config)).toBe(10000);
      expect(service.computeNextDelay(3, config)).toBe(15000);
    });

    it('should compute fixed backoff', () => {
      const config = { maxAttempts: 10, retryStrategy: 'fixed' as const, initialDelayMs: 3000, maxDelayMs: 60000, timeoutMs: 10000 };

      expect(service.computeNextDelay(1, config)).toBe(3000);
      expect(service.computeNextDelay(5, config)).toBe(3000);
    });

    it('should cap delay at maxDelayMs', () => {
      const config = { maxAttempts: 20, retryStrategy: 'exponential' as const, initialDelayMs: 1000, maxDelayMs: 10000, timeoutMs: 10000 };

      // 2^9 * 1000 = 512000, but capped at 10000
      const delay = service.computeNextDelay(10, config);
      expect(delay).toBeLessThanOrEqual(10000);
    });
  });
});
```

- [ ] **Step 2: Create `services/notification-service/src/__tests__/dead-letter-processor.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DeadLetterProcessorService } from '../webhook/dead-letter-processor.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeadLetterProcessorService', () => {
  let service: DeadLetterProcessorService;
  let mockPrisma: any;

  const MOCK_DELIVERY = {
    id: BigInt(10),
    deliveryCode: 'dlv_test123',
    webhookId: BigInt(1),
    clientId: BigInt(100),
    eventType: 'deposit.confirmed',
    payload: { event: 'deposit.confirmed' },
    attempts: 5,
    error: 'HTTP 503',
    httpStatus: 503,
  };

  beforeEach(async () => {
    mockPrisma = {
      webhookDelivery: {
        findUnique: jest.fn().mockResolvedValue({ ...MOCK_DELIVERY }),
        update: jest.fn().mockResolvedValue({}),
      },
      webhookDeadLetter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterProcessorService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DeadLetterProcessorService>(DeadLetterProcessorService);
  });

  it('should move a delivery to the dead letter queue', async () => {
    await service.moveToDeadLetter(BigInt(10));

    expect(mockPrisma.webhookDeadLetter.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveryId: BigInt(10),
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        totalAttempts: 5,
        lastError: 'HTTP 503',
        lastHttpStatus: 503,
      }),
    });

    expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: BigInt(10) },
      data: expect.objectContaining({ status: 'dead_letter' }),
    });
  });

  it('should not create duplicate dead letter entries', async () => {
    mockPrisma.webhookDeadLetter.findUnique.mockResolvedValue({ id: BigInt(1) });

    await service.moveToDeadLetter(BigInt(10));

    expect(mockPrisma.webhookDeadLetter.create).not.toHaveBeenCalled();
  });

  it('should handle missing delivery gracefully', async () => {
    mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);

    await service.moveToDeadLetter(BigInt(999));

    expect(mockPrisma.webhookDeadLetter.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Create `services/notification-service/src/__tests__/manual-resend.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { ManualResendService } from '../webhook/manual-resend.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('uuid', () => ({ v4: () => 'aaaabbbb-cccc-dddd-eeee-ffffffffffff' }));

describe('ManualResendService', () => {
  let service: ManualResendService;
  let mockPrisma: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockPrisma = {
      webhookDelivery: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(10),
          deliveryCode: 'dlv_original',
          webhookId: BigInt(1),
          clientId: BigInt(100),
          eventType: 'deposit.confirmed',
          payload: { event: 'deposit.confirmed', data: { txHash: '0xabc' } },
        }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: BigInt(20), ...data }),
        ),
      },
      webhook: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(1),
          maxAttempts: 5,
        }),
      },
      webhookDeadLetter: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManualResendService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('webhook-delivery'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<ManualResendService>(ManualResendService);
  });

  it('should create a new delivery and enqueue it', async () => {
    const result = await service.resendDelivery(BigInt(10));

    expect(result.deliveryCode).toMatch(/^dlv_/);
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        status: 'queued',
      }),
    });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ deliveryId: 20 }),
      expect.any(Object),
    );
  });

  it('should throw when original delivery not found', async () => {
    mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);

    await expect(service.resendDelivery(BigInt(999))).rejects.toThrow(NotFoundException);
  });

  it('should throw when webhook not found', async () => {
    mockPrisma.webhook.findUnique.mockResolvedValue(null);

    await expect(service.resendDelivery(BigInt(10))).rejects.toThrow(NotFoundException);
  });

  it('should update dead letter record on resend', async () => {
    await service.resendDelivery(BigInt(10));

    expect(mockPrisma.webhookDeadLetter.updateMany).toHaveBeenCalledWith({
      where: { deliveryId: BigInt(10) },
      data: expect.objectContaining({
        resentAt: expect.any(Date),
        resentDeliveryId: BigInt(20),
      }),
    });
  });
});
```

- [ ] **Step 4: Run all Phase 5 tests**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/notification-service
npx jest --testPathPattern='__tests__' --passWithNoTests
```

---

## Parallelism Guide

The following tasks can be executed in parallel:

**Parallel Group 1** (database + prisma):
- Task 1 (013-indexer-v2.sql) + Task 15 (014-webhooks-v2.sql)
- Then: Task 2 (indexer prisma) + Task 16 (webhook prisma)

**Parallel Group 2** (core services -- after Group 1):
- Task 3 (BlockProcessor) + Task 17 (ConfigurableRetryService)
- Task 4 (GapDetector) + Task 18 (DeliveryAttemptRecorder)
- Task 5 (BackfillWorker) + Task 19 (DeadLetterProcessor)
- Task 6 (FinalityTracker) + Task 20 (ManualResendService)
- Task 7 (ReorgDetector)
- Task 8 (BalanceMaterializer)
- Task 9 (SyncHealthMonitor)
- Task 10 (Enhanced Reconciliation)

**Parallel Group 3** (APIs -- after Group 2):
- Task 11 (Admin API indexer) + Task 22 (Client API webhook v2) + Task 23 (Admin API webhook monitoring)
- Task 12 (Client API balances) + Task 21 (Enhanced delivery service)
- Task 13 (Indexer health + app module)

**Parallel Group 4** (Frontend -- after Group 3):
- Task 13b (Admin sync health page) + Task 24 (Client delivery history + Admin webhook stats)

**Parallel Group 5** (Tests -- after Group 4):
- Task 14 (Phase 4 tests) + Task 25 (Phase 5 tests)

---

## Verification Checklist

After all tasks are complete, run:

```bash
# Regenerate all Prisma clients
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/chain-indexer-service && npx prisma generate
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/notification-service && npx prisma generate

# Run all tests
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
npx turbo test --filter=chain-indexer-service --filter=notification-service

# Build all modified services
npx turbo build --filter=chain-indexer-service --filter=notification-service --filter=admin-api --filter=client-api

# Build frontends
npx turbo build --filter=admin --filter=client

# Verify SQL migrations parse correctly
mysql -u root -p --execute="SOURCE database/013-indexer-v2.sql;" 2>&1 | head -5
mysql -u root -p --execute="SOURCE database/014-webhooks-v2.sql;" 2>&1 | head -5
```
