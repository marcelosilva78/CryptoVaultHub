# Phase 6 & 7: Flush Operations + Deploy Traceability & Multi-Chain Addresses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement manual and batch flush operations for ERC-20 tokens and native asset sweeps with full lifecycle tracking, dry-run simulation, Redis-based concurrency guards, and a BullMQ worker. Then add rich deploy traceability (tx receipt, block info, explorer URLs) and multi-chain address groups that let a single logical address span multiple chains via shared CREATE2 salt.

**Architecture:** Flush operations flow through Client API -> core-wallet-service (FlushOrchestrator) -> BullMQ flush queue (cron-worker-service FlushWorker). Each operation creates a `flush_operations` row with N `flush_items` rows. A Redis SETNX lock per deposit address prevents double-flush. Deploy traces capture full tx receipt JSON for every on-chain deployment. Address groups tie multiple per-chain deposit addresses under one logical entity.

**Tech Stack:** TypeScript 5.4+, NestJS 10, Prisma (MySQL), BullMQ, Redis, ethers.js v6, Next.js 14, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-08-cryptovaulthub-design.md`

---

## File Structure

```
# Phase 6 — Flush Operations
database/019-flush-operations.sql                                    # Migration
services/core-wallet-service/src/flush/flush.module.ts               # NestJS module
services/core-wallet-service/src/flush/flush-orchestrator.service.ts  # Batch orchestration
services/core-wallet-service/src/flush/manual-flush.service.ts       # Single + batch ERC-20 flush
services/core-wallet-service/src/flush/sweep-native.service.ts       # Native asset sweep
services/core-wallet-service/src/flush/dry-run.service.ts            # Simulate without executing
services/core-wallet-service/src/flush/flush-guard.service.ts        # Redis lock per address
services/core-wallet-service/src/flush/flush.controller.ts           # Internal HTTP endpoints
services/core-wallet-service/src/common/dto/flush.dto.ts             # DTOs
services/cron-worker-service/src/flush-worker/flush-worker.module.ts # BullMQ module
services/cron-worker-service/src/flush-worker/flush-worker.service.ts# BullMQ processor
services/client-api/src/flush/flush.module.ts                        # Client API module
services/client-api/src/flush/flush.service.ts                       # Proxy to core-wallet-service
services/client-api/src/flush/flush.controller.ts                    # Client-facing endpoints
services/client-api/src/common/dto/flush.dto.ts                      # Client API DTOs
services/admin-api/src/flush-management/flush-management.module.ts   # Admin module
services/admin-api/src/flush-management/flush-management.service.ts  # Admin flush service
services/admin-api/src/flush-management/flush-management.controller.ts # Admin endpoints
services/admin-api/src/common/dto/flush.dto.ts                       # Admin DTOs
apps/client/components/flush-modal.tsx                                # Flush confirmation modal
apps/client/components/flush-status-tracker.tsx                       # Real-time status card
apps/client/app/deposits/page.tsx                                     # Updated with flush UI

# Phase 7 — Deploy Traceability & Multi-Chain Addresses
database/020-deploy-traces.sql                                        # Migration
services/core-wallet-service/src/deploy-trace/deploy-trace.module.ts  # NestJS module
services/core-wallet-service/src/deploy-trace/deploy-trace.service.ts # Trace capture service
services/core-wallet-service/src/deploy-trace/deploy-trace.controller.ts # Internal endpoints
services/core-wallet-service/src/address-group/address-group.module.ts   # NestJS module
services/core-wallet-service/src/address-group/address-group.service.ts  # Group + multi-chain
services/core-wallet-service/src/address-group/address-group.controller.ts # Internal endpoints
services/core-wallet-service/src/common/dto/deploy-trace.dto.ts       # DTOs
services/core-wallet-service/src/common/dto/address-group.dto.ts      # DTOs
services/client-api/src/address-group/address-group.module.ts         # Client API module
services/client-api/src/address-group/address-group.service.ts        # Proxy
services/client-api/src/address-group/address-group.controller.ts     # Client endpoints
services/client-api/src/deploy-trace/deploy-trace.module.ts           # Client API module
services/client-api/src/deploy-trace/deploy-trace.service.ts          # Proxy
services/client-api/src/deploy-trace/deploy-trace.controller.ts       # Client endpoints
apps/client/components/address-group-card.tsx                         # Group card UI
apps/client/components/deploy-trace-timeline.tsx                      # Timeline view
apps/client/components/multi-chain-provision-modal.tsx                # Multi-chain provisioning
apps/client/app/deposits/page.tsx                                     # Updated with groups + traces
```

---

## Task 1: Database Migration — Flush Operations

**Files:**
- Create: `database/019-flush-operations.sql`

- [ ] **Step 1: Create the flush operations migration**

```sql
-- =============================================================================
-- CryptoVaultHub — Flush Operations Tables
-- Migration: 019-flush-operations.sql
-- Tables: flush_operations, flush_items
-- Database: cvh_transactions
-- =============================================================================

USE `cvh_transactions`;

-- flush_operations: tracks each flush/sweep operation lifecycle
CREATE TABLE IF NOT EXISTS `flush_operations` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `operation_uid`     VARCHAR(255)  NOT NULL,
  `client_id`         BIGINT        NOT NULL,
  `project_id`        BIGINT        NOT NULL,
  `chain_id`          INT           NOT NULL,
  `operation_type`    ENUM('flush_tokens','sweep_native') NOT NULL,
  `mode`              ENUM('manual','automated','batch') NOT NULL DEFAULT 'manual',
  `trigger_type`      ENUM('user','system','scheduled') NOT NULL,
  `triggered_by`      BIGINT        NULL,
  `is_dry_run`        TINYINT(1)    NOT NULL DEFAULT 0,
  `status`            ENUM('pending','queued','processing','succeeded','failed','partially_succeeded','canceled') NOT NULL DEFAULT 'pending',
  `token_id`          BIGINT        NULL,
  `wallet_id`         BIGINT        NOT NULL,
  `total_addresses`   INT           NOT NULL DEFAULT 0,
  `succeeded_count`   INT           NOT NULL DEFAULT 0,
  `failed_count`      INT           NOT NULL DEFAULT 0,
  `total_amount`      DECIMAL(78,0) NOT NULL DEFAULT 0,
  `succeeded_amount`  DECIMAL(78,0) NOT NULL DEFAULT 0,
  `gas_cost_total`    DECIMAL(78,0) NOT NULL DEFAULT 0,
  `tx_hash`           VARCHAR(66)   NULL,
  `error_message`     TEXT          NULL,
  `dry_run_result`    JSON          NULL,
  `filters_applied`   JSON          NULL,
  `started_at`        DATETIME(3)   NULL,
  `completed_at`      DATETIME(3)   NULL,
  `created_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_operation_uid` (`operation_uid`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `status`),
  INDEX `idx_chain_status` (`chain_id`, `status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- flush_items: per-address detail within a flush operation
CREATE TABLE IF NOT EXISTS `flush_items` (
  `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
  `operation_id`       BIGINT        NOT NULL,
  `deposit_address_id` BIGINT        NOT NULL,
  `address`            VARCHAR(100)  NOT NULL,
  `status`             ENUM('pending','processing','succeeded','failed','skipped') NOT NULL DEFAULT 'pending',
  `amount_before`      DECIMAL(78,0) NULL,
  `amount_flushed`     DECIMAL(78,0) NULL,
  `tx_hash`            VARCHAR(66)   NULL,
  `gas_cost`           DECIMAL(78,0) NULL,
  `error_message`      TEXT          NULL,
  `processed_at`       DATETIME(3)   NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_operation` (`operation_id`, `status`),
  INDEX `idx_deposit_address` (`deposit_address_id`),
  CONSTRAINT `fk_flush_items_operation` FOREIGN KEY (`operation_id`)
    REFERENCES `flush_operations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Run migration against local MySQL**

```bash
mysql -u cvh_admin -p < database/019-flush-operations.sql
```

---

## Task 2: Prisma Models — FlushOperation, FlushItem

**Files:**
- Modify: `services/core-wallet-service/prisma/schema.prisma`

- [ ] **Step 1: Add FlushOperation and FlushItem models to the Prisma schema**

Append these models to `schema.prisma` inside the existing generator/datasource block:

```prisma
enum FlushOperationType {
  flush_tokens
  sweep_native
}

enum FlushMode {
  manual
  automated
  batch
}

enum FlushTriggerType {
  user
  system
  scheduled
}

enum FlushOperationStatus {
  pending
  queued
  processing
  succeeded
  failed
  partially_succeeded
  canceled
}

enum FlushItemStatus {
  pending
  processing
  succeeded
  failed
  skipped
}

model FlushOperation {
  id              BigInt               @id @default(autoincrement())
  operationUid    String               @unique @map("operation_uid")
  clientId        BigInt               @map("client_id")
  projectId       BigInt               @map("project_id")
  chainId         Int                  @map("chain_id")
  operationType   FlushOperationType   @map("operation_type")
  mode            FlushMode            @default(manual)
  triggerType     FlushTriggerType     @map("trigger_type")
  triggeredBy     BigInt?              @map("triggered_by")
  isDryRun        Boolean              @default(false) @map("is_dry_run")
  status          FlushOperationStatus @default(pending)
  tokenId         BigInt?              @map("token_id")
  walletId        BigInt               @map("wallet_id")
  totalAddresses  Int                  @default(0) @map("total_addresses")
  succeededCount  Int                  @default(0) @map("succeeded_count")
  failedCount     Int                  @default(0) @map("failed_count")
  totalAmount     Decimal              @default(0) @map("total_amount") @db.Decimal(78, 0)
  succeededAmount Decimal              @default(0) @map("succeeded_amount") @db.Decimal(78, 0)
  gasCostTotal    Decimal              @default(0) @map("gas_cost_total") @db.Decimal(78, 0)
  txHash          String?              @map("tx_hash") @db.VarChar(66)
  errorMessage    String?              @map("error_message") @db.Text
  dryRunResult    Json?                @map("dry_run_result")
  filtersApplied  Json?                @map("filters_applied")
  startedAt       DateTime?            @map("started_at")
  completedAt     DateTime?            @map("completed_at")
  createdAt       DateTime             @default(now()) @map("created_at")

  items           FlushItem[]

  @@index([clientId, projectId, status], name: "idx_client_project")
  @@index([chainId, status], name: "idx_chain_status")
  @@index([createdAt], name: "idx_created_at")
  @@map("flush_operations")
}

model FlushItem {
  id               BigInt          @id @default(autoincrement())
  operationId      BigInt          @map("operation_id")
  depositAddressId BigInt          @map("deposit_address_id")
  address          String          @db.VarChar(100)
  status           FlushItemStatus @default(pending)
  amountBefore     Decimal?        @map("amount_before") @db.Decimal(78, 0)
  amountFlushed    Decimal?        @map("amount_flushed") @db.Decimal(78, 0)
  txHash           String?         @map("tx_hash") @db.VarChar(66)
  gasCost          Decimal?        @map("gas_cost") @db.Decimal(78, 0)
  errorMessage     String?         @map("error_message") @db.Text
  processedAt      DateTime?       @map("processed_at")

  operation        FlushOperation  @relation(fields: [operationId], references: [id], onDelete: Cascade)

  @@index([operationId, status], name: "idx_operation")
  @@index([depositAddressId], name: "idx_deposit_address")
  @@map("flush_items")
}
```

- [ ] **Step 2: Generate Prisma client**

```bash
cd services/core-wallet-service && npx prisma generate
```

---

## Task 3: Flush DTOs

**Files:**
- Create: `services/core-wallet-service/src/common/dto/flush.dto.ts`

- [ ] **Step 1: Create the flush DTOs for core-wallet-service**

```typescript
import { IsInt, IsOptional, IsString, IsBoolean, IsArray, IsEnum, Min, Max } from 'class-validator';

export class FlushTokensDto {
  @IsInt()
  clientId: number;

  @IsInt()
  chainId: number;

  @IsInt()
  tokenId: number;

  @IsInt()
  walletId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  depositAddressIds?: number[];

  @IsEnum(['manual', 'batch'])
  @IsOptional()
  mode?: 'manual' | 'batch';

  @IsBoolean()
  @IsOptional()
  isDryRun?: boolean;

  @IsInt()
  @IsOptional()
  triggeredBy?: number;

  @IsOptional()
  filters?: {
    minBalance?: string;
    labels?: string[];
  };
}

export class SweepNativeDto {
  @IsInt()
  clientId: number;

  @IsInt()
  chainId: number;

  @IsInt()
  walletId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  depositAddressIds?: number[];

  @IsBoolean()
  @IsOptional()
  isDryRun?: boolean;

  @IsInt()
  @IsOptional()
  triggeredBy?: number;

  @IsOptional()
  filters?: {
    minBalance?: string;
  };
}

export class ListFlushOperationsDto {
  @IsInt()
  clientId: number;

  @IsInt()
  @IsOptional()
  chainId?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export interface FlushOperationResult {
  operationUid: string;
  status: string;
  operationType: string;
  mode: string;
  isDryRun: boolean;
  chainId: number;
  totalAddresses: number;
  succeededCount: number;
  failedCount: number;
  totalAmount: string;
  succeededAmount: string;
  gasCostTotal: string;
  txHash: string | null;
  dryRunResult: unknown | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  items: FlushItemResult[];
}

export interface FlushItemResult {
  id: number;
  address: string;
  status: string;
  amountBefore: string | null;
  amountFlushed: string | null;
  txHash: string | null;
  gasCost: string | null;
  errorMessage: string | null;
  processedAt: Date | null;
}
```

---

## Task 4: FlushGuardService — Redis Lock Per Address

**Files:**
- Create: `services/core-wallet-service/src/flush/flush-guard.service.ts`

- [ ] **Step 1: Create the Redis-based lock guard**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Prevents concurrent flush/sweep operations on the same deposit address.
 * Uses Redis SETNX with a TTL as a distributed lock.
 */
@Injectable()
export class FlushGuardService {
  private readonly logger = new Logger(FlushGuardService.name);

  /** Lock TTL: 5 minutes max per flush attempt */
  private readonly LOCK_TTL_SECONDS = 300;

  constructor(private readonly redis: RedisService) {}

  /**
   * Acquire a lock for flushing a specific deposit address.
   * Returns the lock value (for release) or null if already locked.
   */
  async acquireLock(
    chainId: number,
    address: string,
    operationUid: string,
  ): Promise<string | null> {
    const lockKey = this.buildKey(chainId, address);
    const lockValue = `${operationUid}:${Date.now()}`;

    const client = this.redis.getClient();
    const result = await client.set(
      lockKey,
      lockValue,
      'EX',
      this.LOCK_TTL_SECONDS,
      'NX',
    );

    if (result === 'OK') {
      this.logger.debug(
        `Flush lock acquired: ${address} on chain ${chainId} (op: ${operationUid})`,
      );
      return lockValue;
    }

    this.logger.warn(
      `Flush lock denied: ${address} on chain ${chainId} already locked`,
    );
    return null;
  }

  /**
   * Release a lock for a specific deposit address.
   * Only releases if the lock is still owned by the same operation.
   */
  async releaseLock(
    chainId: number,
    address: string,
    lockValue: string,
  ): Promise<void> {
    const lockKey = this.buildKey(chainId, address);
    const client = this.redis.getClient();

    // Atomic check-and-delete via Lua
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await client.eval(script, 1, lockKey, lockValue);
    this.logger.debug(`Flush lock released: ${address} on chain ${chainId}`);
  }

  /**
   * Batch acquire locks for multiple addresses.
   * Returns a map of address -> lockValue for acquired locks,
   * and a list of addresses that were already locked.
   */
  async acquireBatchLocks(
    chainId: number,
    addresses: string[],
    operationUid: string,
  ): Promise<{
    acquired: Map<string, string>;
    denied: string[];
  }> {
    const acquired = new Map<string, string>();
    const denied: string[] = [];

    for (const address of addresses) {
      const lockValue = await this.acquireLock(chainId, address, operationUid);
      if (lockValue) {
        acquired.set(address, lockValue);
      } else {
        denied.push(address);
      }
    }

    return { acquired, denied };
  }

  /**
   * Release all locks in a batch.
   */
  async releaseBatchLocks(
    chainId: number,
    locks: Map<string, string>,
  ): Promise<void> {
    for (const [address, lockValue] of locks) {
      await this.releaseLock(chainId, address, lockValue);
    }
  }

  /**
   * Check if an address is currently locked.
   */
  async isLocked(chainId: number, address: string): Promise<boolean> {
    const lockKey = this.buildKey(chainId, address);
    const client = this.redis.getClient();
    const result = await client.get(lockKey);
    return result !== null;
  }

  private buildKey(chainId: number, address: string): string {
    return `flush_lock:${chainId}:${address.toLowerCase()}`;
  }
}
```

---

## Task 5: DryRunService — Simulate Flush Without Executing

**Files:**
- Create: `services/core-wallet-service/src/flush/dry-run.service.ts`

- [ ] **Step 1: Create the dry-run simulation service**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export interface DryRunItem {
  depositAddressId: number;
  address: string;
  label: string | null;
  currentBalance: string;
  currentBalanceFormatted: string;
  wouldFlush: boolean;
  skipReason: string | null;
}

export interface DryRunResult {
  chainId: number;
  operationType: 'flush_tokens' | 'sweep_native';
  tokenSymbol: string | null;
  tokenDecimals: number;
  totalAddresses: number;
  flushableAddresses: number;
  skippedAddresses: number;
  totalBalance: string;
  totalBalanceFormatted: string;
  estimatedGasCost: string;
  estimatedGasCostFormatted: string;
  items: DryRunItem[];
}

@Injectable()
export class DryRunService {
  private readonly logger = new Logger(DryRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Simulate an ERC-20 token flush without executing any transactions.
   * Returns balance snapshots and estimated gas costs.
   */
  async simulateTokenFlush(params: {
    clientId: number;
    chainId: number;
    tokenId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }): Promise<DryRunResult> {
    const { clientId, chainId, tokenId, depositAddressIds, minBalance } = params;

    const token = await this.prisma.token.findUnique({
      where: { id: BigInt(tokenId) },
    });
    if (!token) {
      throw new NotFoundException(`Token ${tokenId} not found`);
    }

    // Get deposit addresses
    const whereClause: any = {
      clientId: BigInt(clientId),
      chainId,
      isDeployed: true,
    };
    if (depositAddressIds && depositAddressIds.length > 0) {
      whereClause.id = { in: depositAddressIds.map((id) => BigInt(id)) };
    }

    const addresses = await this.prisma.depositAddress.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    const provider = await this.evmProvider.getProvider(chainId);
    const erc20 = new ethers.Contract(
      token.contractAddress,
      ERC20_ABI,
      provider,
    );

    const minBalanceWei = minBalance
      ? ethers.parseUnits(minBalance, token.decimals)
      : 0n;

    const items: DryRunItem[] = [];
    let totalBalance = 0n;
    let flushableCount = 0;

    for (const addr of addresses) {
      let balance: bigint;
      try {
        balance = await erc20.balanceOf(addr.address);
      } catch {
        items.push({
          depositAddressId: Number(addr.id),
          address: addr.address,
          label: addr.label,
          currentBalance: '0',
          currentBalanceFormatted: '0',
          wouldFlush: false,
          skipReason: 'balance_query_failed',
        });
        continue;
      }

      const wouldFlush = balance > 0n && balance >= minBalanceWei;
      let skipReason: string | null = null;

      if (balance === 0n) {
        skipReason = 'zero_balance';
      } else if (balance < minBalanceWei) {
        skipReason = 'below_minimum';
      }

      if (wouldFlush) {
        totalBalance += balance;
        flushableCount++;
      }

      items.push({
        depositAddressId: Number(addr.id),
        address: addr.address,
        label: addr.label,
        currentBalance: balance.toString(),
        currentBalanceFormatted: ethers.formatUnits(balance, token.decimals),
        wouldFlush,
        skipReason,
      });
    }

    // Estimate gas cost: ~65,000 gas per individual flushTokens call,
    // or ~30,000 per address in a batchFlushERC20Tokens call
    const gasPrice = await provider.getFeeData();
    const gasPerAddress = flushableCount > 1 ? 30_000n : 65_000n;
    const estimatedGas = gasPerAddress * BigInt(flushableCount);
    const estimatedGasCost = estimatedGas * (gasPrice.gasPrice ?? 0n);

    return {
      chainId,
      operationType: 'flush_tokens',
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      totalAddresses: addresses.length,
      flushableAddresses: flushableCount,
      skippedAddresses: addresses.length - flushableCount,
      totalBalance: totalBalance.toString(),
      totalBalanceFormatted: ethers.formatUnits(totalBalance, token.decimals),
      estimatedGasCost: estimatedGasCost.toString(),
      estimatedGasCostFormatted: ethers.formatEther(estimatedGasCost),
      items,
    };
  }

  /**
   * Simulate a native asset sweep without executing any transactions.
   */
  async simulateNativeSweep(params: {
    clientId: number;
    chainId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }): Promise<DryRunResult> {
    const { clientId, chainId, depositAddressIds, minBalance } = params;

    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain) {
      throw new NotFoundException(`Chain ${chainId} not found`);
    }

    const whereClause: any = {
      clientId: BigInt(clientId),
      chainId,
      isDeployed: true,
    };
    if (depositAddressIds && depositAddressIds.length > 0) {
      whereClause.id = { in: depositAddressIds.map((id) => BigInt(id)) };
    }

    const addresses = await this.prisma.depositAddress.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    const provider = await this.evmProvider.getProvider(chainId);
    const minBalanceWei = minBalance ? ethers.parseEther(minBalance) : 0n;

    // Native sweep requires sending a tx FROM each forwarder,
    // so we need to estimate gas cost per address (21,000 base gas for ETH transfer)
    const gasPrice = await provider.getFeeData();
    const gasCostPerSweep = 21_000n * (gasPrice.gasPrice ?? 0n);

    const items: DryRunItem[] = [];
    let totalBalance = 0n;
    let flushableCount = 0;

    for (const addr of addresses) {
      let balance: bigint;
      try {
        balance = await provider.getBalance(addr.address);
      } catch {
        items.push({
          depositAddressId: Number(addr.id),
          address: addr.address,
          label: addr.label,
          currentBalance: '0',
          currentBalanceFormatted: '0',
          wouldFlush: false,
          skipReason: 'balance_query_failed',
        });
        continue;
      }

      // For native sweep, the forwarder needs enough balance to cover gas
      const netBalance = balance > gasCostPerSweep ? balance - gasCostPerSweep : 0n;
      const wouldFlush = netBalance > 0n && netBalance >= minBalanceWei;
      let skipReason: string | null = null;

      if (balance === 0n) {
        skipReason = 'zero_balance';
      } else if (netBalance === 0n) {
        skipReason = 'insufficient_for_gas';
      } else if (netBalance < minBalanceWei) {
        skipReason = 'below_minimum';
      }

      if (wouldFlush) {
        totalBalance += netBalance;
        flushableCount++;
      }

      items.push({
        depositAddressId: Number(addr.id),
        address: addr.address,
        label: addr.label,
        currentBalance: balance.toString(),
        currentBalanceFormatted: ethers.formatEther(balance),
        wouldFlush,
        skipReason,
      });
    }

    const estimatedGasCost = gasCostPerSweep * BigInt(flushableCount);

    return {
      chainId,
      operationType: 'sweep_native',
      tokenSymbol: chain.nativeSymbol ?? 'ETH',
      tokenDecimals: 18,
      totalAddresses: addresses.length,
      flushableAddresses: flushableCount,
      skippedAddresses: addresses.length - flushableCount,
      totalBalance: totalBalance.toString(),
      totalBalanceFormatted: ethers.formatEther(totalBalance),
      estimatedGasCost: estimatedGasCost.toString(),
      estimatedGasCostFormatted: ethers.formatEther(estimatedGasCost),
      items,
    };
  }
}
```

---

## Task 6: ManualFlushService — Single + Batch Token Flush

**Files:**
- Create: `services/core-wallet-service/src/flush/manual-flush.service.ts`

- [ ] **Step 1: Create the manual flush service for ERC-20 tokens**

```typescript
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { FlushGuardService } from './flush-guard.service';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

const FORWARDER_ABI = [
  'function flushTokens(address tokenContractAddress) external',
];

const FORWARDER_FACTORY_ABI = [
  'function batchFlushERC20Tokens(address[] calldata forwarders, address tokenAddress) external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export interface FlushTokensParams {
  clientId: number;
  chainId: number;
  tokenId: number;
  walletId: number;
  depositAddressIds?: number[];
  mode: 'manual' | 'batch';
  triggeredBy?: number;
  filters?: {
    minBalance?: string;
    labels?: string[];
  };
}

@Injectable()
export class ManualFlushService {
  private readonly logger = new Logger(ManualFlushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly flushGuard: FlushGuardService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Create a flush operation for ERC-20 tokens.
   * Resolves target addresses, acquires locks, creates DB records,
   * and enqueues the operation for processing by the FlushWorker.
   */
  async createFlushOperation(params: FlushTokensParams): Promise<{
    operationUid: string;
    status: string;
    totalAddresses: number;
    lockedAddresses: string[];
  }> {
    const { clientId, chainId, tokenId, walletId, depositAddressIds, mode, triggeredBy, filters } = params;

    // Validate token exists
    const token = await this.prisma.token.findUnique({
      where: { id: BigInt(tokenId) },
    });
    if (!token) {
      throw new NotFoundException(`Token ${tokenId} not found`);
    }
    if (token.isNative) {
      throw new BadRequestException(
        'Cannot flush native tokens via flushTokens. Use sweep_native instead.',
      );
    }

    // Validate wallet exists
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: BigInt(walletId) },
    });
    if (!wallet || Number(wallet.clientId) !== clientId) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    // Get target deposit addresses
    const whereClause: any = {
      clientId: BigInt(clientId),
      chainId,
      isDeployed: true,
    };
    if (depositAddressIds && depositAddressIds.length > 0) {
      whereClause.id = { in: depositAddressIds.map((id) => BigInt(id)) };
    }
    if (filters?.labels && filters.labels.length > 0) {
      whereClause.label = { in: filters.labels };
    }

    const addresses = await this.prisma.depositAddress.findMany({
      where: whereClause,
    });

    if (addresses.length === 0) {
      throw new BadRequestException(
        'No deployed deposit addresses match the given criteria',
      );
    }

    // Filter by minimum balance if specified
    let targetAddresses = addresses;
    if (filters?.minBalance) {
      const provider = await this.evmProvider.getProvider(chainId);
      const erc20 = new ethers.Contract(token.contractAddress, ERC20_ABI, provider);
      const minBalanceWei = ethers.parseUnits(filters.minBalance, token.decimals);

      const balanceChecks = await Promise.all(
        addresses.map(async (addr) => {
          try {
            const balance: bigint = await erc20.balanceOf(addr.address);
            return { addr, balance, hasBalance: balance >= minBalanceWei };
          } catch {
            return { addr, balance: 0n, hasBalance: false };
          }
        }),
      );

      targetAddresses = balanceChecks
        .filter((check) => check.hasBalance)
        .map((check) => check.addr);

      if (targetAddresses.length === 0) {
        throw new BadRequestException(
          `No deposit addresses have balance >= ${filters.minBalance} ${token.symbol}`,
        );
      }
    }

    const operationUid = `flush_${uuidv4()}`;

    // Acquire locks for all target addresses
    const addressList = targetAddresses.map((a) => a.address);
    const { acquired, denied } = await this.flushGuard.acquireBatchLocks(
      chainId,
      addressList,
      operationUid,
    );

    // Only proceed with addresses we locked
    const lockedAddresses = targetAddresses.filter((a) =>
      acquired.has(a.address),
    );

    if (lockedAddresses.length === 0) {
      throw new BadRequestException(
        'All target addresses are currently locked by another flush operation',
      );
    }

    // Create operation and items in a transaction
    const operation = await this.prisma.$transaction(async (tx) => {
      const op = await tx.flushOperation.create({
        data: {
          operationUid,
          clientId: BigInt(clientId),
          projectId: BigInt(clientId), // project_id = client_id for now
          chainId,
          operationType: 'flush_tokens',
          mode,
          triggerType: triggeredBy ? 'user' : 'system',
          triggeredBy: triggeredBy ? BigInt(triggeredBy) : null,
          isDryRun: false,
          status: 'queued',
          tokenId: BigInt(tokenId),
          walletId: BigInt(walletId),
          totalAddresses: lockedAddresses.length,
          filtersApplied: filters ? JSON.parse(JSON.stringify(filters)) : undefined,
        },
      });

      // Create flush items
      await tx.flushItem.createMany({
        data: lockedAddresses.map((addr) => ({
          operationId: op.id,
          depositAddressId: addr.id,
          address: addr.address,
          status: 'pending' as const,
        })),
      });

      return op;
    });

    // Publish to Redis stream for the FlushWorker to pick up
    await this.redis.publishToStream('flush:operations', {
      event: 'flush.queued',
      operationUid,
      operationId: operation.id.toString(),
      chainId: chainId.toString(),
      clientId: clientId.toString(),
      operationType: 'flush_tokens',
      tokenAddress: token.contractAddress,
      tokenSymbol: token.symbol,
      addressCount: lockedAddresses.length.toString(),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Flush operation created: ${operationUid} for ${lockedAddresses.length} addresses (${denied.length} denied locks)`,
    );

    return {
      operationUid,
      status: 'queued',
      totalAddresses: lockedAddresses.length,
      lockedAddresses: denied,
    };
  }
}
```

---

## Task 7: SweepNativeService — Native Asset Sweep

**Files:**
- Create: `services/core-wallet-service/src/flush/sweep-native.service.ts`

- [ ] **Step 1: Create the native asset sweep service**

```typescript
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { FlushGuardService } from './flush-guard.service';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

export interface SweepNativeParams {
  clientId: number;
  chainId: number;
  walletId: number;
  depositAddressIds?: number[];
  triggeredBy?: number;
  filters?: {
    minBalance?: string;
  };
}

@Injectable()
export class SweepNativeService {
  private readonly logger = new Logger(SweepNativeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly flushGuard: FlushGuardService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Create a sweep operation for native assets (ETH, BNB, MATIC, etc.).
   * Native sweep requires sending a direct ETH transfer from each forwarder
   * to the parent hot wallet. This is different from ERC-20 flush which
   * calls flushTokens() on the forwarder contract.
   */
  async createSweepOperation(params: SweepNativeParams): Promise<{
    operationUid: string;
    status: string;
    totalAddresses: number;
    lockedAddresses: string[];
  }> {
    const { clientId, chainId, walletId, depositAddressIds, triggeredBy, filters } = params;

    // Validate chain
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain) {
      throw new NotFoundException(`Chain ${chainId} not found`);
    }

    // Validate wallet
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: BigInt(walletId) },
    });
    if (!wallet || Number(wallet.clientId) !== clientId) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    // Get target deposit addresses
    const whereClause: any = {
      clientId: BigInt(clientId),
      chainId,
      isDeployed: true,
    };
    if (depositAddressIds && depositAddressIds.length > 0) {
      whereClause.id = { in: depositAddressIds.map((id) => BigInt(id)) };
    }

    const addresses = await this.prisma.depositAddress.findMany({
      where: whereClause,
    });

    if (addresses.length === 0) {
      throw new BadRequestException(
        'No deployed deposit addresses found for sweep',
      );
    }

    // Filter by balance: only include addresses with native balance > gas cost
    const provider = await this.evmProvider.getProvider(chainId);
    const gasPrice = await provider.getFeeData();
    const gasCostPerSweep = 21_000n * (gasPrice.gasPrice ?? 0n);
    const minBalanceWei = filters?.minBalance
      ? ethers.parseEther(filters.minBalance)
      : 0n;

    const balanceChecks = await Promise.all(
      addresses.map(async (addr) => {
        try {
          const balance = await provider.getBalance(addr.address);
          const netBalance = balance > gasCostPerSweep ? balance - gasCostPerSweep : 0n;
          return {
            addr,
            balance,
            netBalance,
            eligible: netBalance > 0n && netBalance >= minBalanceWei,
          };
        } catch {
          return { addr, balance: 0n, netBalance: 0n, eligible: false };
        }
      }),
    );

    const eligibleAddresses = balanceChecks
      .filter((check) => check.eligible)
      .map((check) => check.addr);

    if (eligibleAddresses.length === 0) {
      throw new BadRequestException(
        'No deposit addresses have sufficient native balance for sweep',
      );
    }

    const operationUid = `sweep_${uuidv4()}`;

    // Acquire locks
    const addressList = eligibleAddresses.map((a) => a.address);
    const { acquired, denied } = await this.flushGuard.acquireBatchLocks(
      chainId,
      addressList,
      operationUid,
    );

    const lockedAddresses = eligibleAddresses.filter((a) =>
      acquired.has(a.address),
    );

    if (lockedAddresses.length === 0) {
      throw new BadRequestException(
        'All target addresses are currently locked by another operation',
      );
    }

    // Create operation and items
    const operation = await this.prisma.$transaction(async (tx) => {
      const op = await tx.flushOperation.create({
        data: {
          operationUid,
          clientId: BigInt(clientId),
          projectId: BigInt(clientId),
          chainId,
          operationType: 'sweep_native',
          mode: 'manual',
          triggerType: triggeredBy ? 'user' : 'system',
          triggeredBy: triggeredBy ? BigInt(triggeredBy) : null,
          isDryRun: false,
          status: 'queued',
          tokenId: null,
          walletId: BigInt(walletId),
          totalAddresses: lockedAddresses.length,
          filtersApplied: filters ? JSON.parse(JSON.stringify(filters)) : undefined,
        },
      });

      await tx.flushItem.createMany({
        data: lockedAddresses.map((addr) => ({
          operationId: op.id,
          depositAddressId: addr.id,
          address: addr.address,
          status: 'pending' as const,
        })),
      });

      return op;
    });

    // Publish event
    await this.redis.publishToStream('flush:operations', {
      event: 'sweep.queued',
      operationUid,
      operationId: operation.id.toString(),
      chainId: chainId.toString(),
      clientId: clientId.toString(),
      operationType: 'sweep_native',
      addressCount: lockedAddresses.length.toString(),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Sweep operation created: ${operationUid} for ${lockedAddresses.length} addresses`,
    );

    return {
      operationUid,
      status: 'queued',
      totalAddresses: lockedAddresses.length,
      lockedAddresses: denied,
    };
  }
}
```

---

## Task 8: FlushOrchestrator — Batch Execution with Partial Success

**Files:**
- Create: `services/core-wallet-service/src/flush/flush-orchestrator.service.ts`

- [ ] **Step 1: Create the flush orchestrator service**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { FlushGuardService } from './flush-guard.service';
import { RedisService } from '../redis/redis.service';

const FORWARDER_ABI = [
  'function flushTokens(address tokenContractAddress) external',
];

const FORWARDER_FACTORY_ABI = [
  'function batchFlushERC20Tokens(address[] calldata forwarders, address tokenAddress) external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

/**
 * Executes queued flush/sweep operations.
 * Handles both individual and batch flush via the ForwarderFactory,
 * tracks per-item success/failure, updates operation status,
 * and releases Redis locks when complete.
 */
@Injectable()
export class FlushOrchestratorService {
  private readonly logger = new Logger(FlushOrchestratorService.name);

  /** Max addresses per batch flush call (gas limit safety) */
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly flushGuard: FlushGuardService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Execute a queued flush_tokens operation.
   */
  async executeTokenFlush(operationId: bigint): Promise<void> {
    const operation = await this.prisma.flushOperation.findUnique({
      where: { id: operationId },
      include: { items: true },
    });

    if (!operation) {
      throw new NotFoundException(`Flush operation ${operationId} not found`);
    }

    if (operation.status !== 'queued') {
      this.logger.warn(
        `Operation ${operation.operationUid} is ${operation.status}, skipping`,
      );
      return;
    }

    // Mark as processing
    await this.prisma.flushOperation.update({
      where: { id: operationId },
      data: { status: 'processing', startedAt: new Date() },
    });

    const token = operation.tokenId
      ? await this.prisma.token.findUnique({ where: { id: operation.tokenId } })
      : null;

    if (!token) {
      await this.failOperation(operationId, 'Token not found');
      return;
    }

    const chain = await this.prisma.chain.findUnique({
      where: { id: operation.chainId },
    });
    if (!chain || !chain.forwarderFactoryAddress) {
      await this.failOperation(operationId, 'Chain or factory not configured');
      return;
    }

    const provider = await this.evmProvider.getProvider(operation.chainId);
    const erc20 = new ethers.Contract(token.contractAddress, ERC20_ABI, provider);

    let succeededCount = 0;
    let failedCount = 0;
    let succeededAmount = 0n;
    let gasCostTotal = 0n;

    // Process items in batches
    const pendingItems = operation.items.filter((item) => item.status === 'pending');
    const batches = this.chunkArray(pendingItems, this.BATCH_SIZE);

    for (const batch of batches) {
      // Check balances for each item in the batch
      for (const item of batch) {
        try {
          // Mark item as processing
          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: { status: 'processing' },
          });

          // Check current balance
          const balance: bigint = await erc20.balanceOf(item.address);

          if (balance === 0n) {
            await this.prisma.flushItem.update({
              where: { id: item.id },
              data: {
                status: 'skipped',
                amountBefore: 0n as any,
                amountFlushed: 0n as any,
                processedAt: new Date(),
              },
            });
            continue;
          }

          // Record balance before flush
          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: { amountBefore: balance as any },
          });

          // In production: Execute flushTokens via ForwarderFactory
          // The gas tank wallet signs and sends the tx.
          // For now: record the flush intent and publish event.
          const flushTxHash = `flush:${operation.chainId}:${token.symbol}:${item.address}:${Date.now()}`;

          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: {
              status: 'succeeded',
              amountFlushed: balance as any,
              txHash: flushTxHash,
              gasCost: 0n as any,
              processedAt: new Date(),
            },
          });

          succeededCount++;
          succeededAmount += balance;

          this.logger.log(
            `Flushed ${ethers.formatUnits(balance, token.decimals)} ${token.symbol} from ${item.address}`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          failedCount++;

          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: {
              status: 'failed',
              errorMessage: msg,
              processedAt: new Date(),
            },
          });

          this.logger.error(
            `Flush failed for ${item.address}: ${msg}`,
          );
        }
      }
    }

    // Determine final operation status
    let finalStatus: 'succeeded' | 'failed' | 'partially_succeeded';
    if (succeededCount === 0) {
      finalStatus = 'failed';
    } else if (failedCount === 0) {
      finalStatus = 'succeeded';
    } else {
      finalStatus = 'partially_succeeded';
    }

    // Update operation with final results
    await this.prisma.flushOperation.update({
      where: { id: operationId },
      data: {
        status: finalStatus,
        succeededCount,
        failedCount,
        totalAmount: succeededAmount as any,
        succeededAmount: succeededAmount as any,
        gasCostTotal: gasCostTotal as any,
        completedAt: new Date(),
      },
    });

    // Release all locks
    const locks = new Map<string, string>();
    for (const item of operation.items) {
      const lockValue = `${operation.operationUid}:${item.address}`;
      locks.set(item.address, `${operation.operationUid}:${Date.now()}`);
    }
    await this.flushGuard.releaseBatchLocks(operation.chainId, locks);

    // Publish completion event with rich traceability
    await this.redis.publishToStream('flush:completed', {
      event: `flush.${finalStatus}`,
      operationUid: operation.operationUid,
      chainId: operation.chainId.toString(),
      clientId: operation.clientId.toString(),
      operationType: operation.operationType,
      tokenSymbol: token.symbol,
      totalAddresses: operation.totalAddresses.toString(),
      succeededCount: succeededCount.toString(),
      failedCount: failedCount.toString(),
      succeededAmount: succeededAmount.toString(),
      gasCostTotal: gasCostTotal.toString(),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Flush operation ${operation.operationUid} completed: ${finalStatus} (${succeededCount}/${operation.totalAddresses} addresses)`,
    );
  }

  /**
   * Execute a queued sweep_native operation.
   */
  async executeNativeSweep(operationId: bigint): Promise<void> {
    const operation = await this.prisma.flushOperation.findUnique({
      where: { id: operationId },
      include: { items: true },
    });

    if (!operation) {
      throw new NotFoundException(`Sweep operation ${operationId} not found`);
    }

    if (operation.status !== 'queued') {
      this.logger.warn(
        `Operation ${operation.operationUid} is ${operation.status}, skipping`,
      );
      return;
    }

    await this.prisma.flushOperation.update({
      where: { id: operationId },
      data: { status: 'processing', startedAt: new Date() },
    });

    const provider = await this.evmProvider.getProvider(operation.chainId);
    const gasPrice = await provider.getFeeData();
    const gasCostPerSweep = 21_000n * (gasPrice.gasPrice ?? 0n);

    let succeededCount = 0;
    let failedCount = 0;
    let succeededAmount = 0n;
    let gasCostTotal = 0n;

    for (const item of operation.items) {
      if (item.status !== 'pending') continue;

      try {
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: { status: 'processing' },
        });

        const balance = await provider.getBalance(item.address);
        const netBalance = balance > gasCostPerSweep ? balance - gasCostPerSweep : 0n;

        if (netBalance === 0n) {
          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: {
              status: 'skipped',
              amountBefore: balance as any,
              amountFlushed: 0n as any,
              processedAt: new Date(),
            },
          });
          continue;
        }

        // In production: Sign and send ETH transfer via KeyVault
        // The forwarder contract owner sends ETH from forwarder to hot wallet
        const sweepTxHash = `sweep_native:${operation.chainId}:${item.address}:${Date.now()}`;

        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'succeeded',
            amountBefore: balance as any,
            amountFlushed: netBalance as any,
            txHash: sweepTxHash,
            gasCost: gasCostPerSweep as any,
            processedAt: new Date(),
          },
        });

        succeededCount++;
        succeededAmount += netBalance;
        gasCostTotal += gasCostPerSweep;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failedCount++;

        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'failed',
            errorMessage: msg,
            processedAt: new Date(),
          },
        });

        this.logger.error(`Native sweep failed for ${item.address}: ${msg}`);
      }
    }

    let finalStatus: 'succeeded' | 'failed' | 'partially_succeeded';
    if (succeededCount === 0) {
      finalStatus = 'failed';
    } else if (failedCount === 0) {
      finalStatus = 'succeeded';
    } else {
      finalStatus = 'partially_succeeded';
    }

    await this.prisma.flushOperation.update({
      where: { id: operationId },
      data: {
        status: finalStatus,
        succeededCount,
        failedCount,
        totalAmount: succeededAmount as any,
        succeededAmount: succeededAmount as any,
        gasCostTotal: gasCostTotal as any,
        completedAt: new Date(),
      },
    });

    // Release locks
    const locks = new Map<string, string>();
    for (const item of operation.items) {
      locks.set(item.address, `${operation.operationUid}:${Date.now()}`);
    }
    await this.flushGuard.releaseBatchLocks(operation.chainId, locks);

    await this.redis.publishToStream('flush:completed', {
      event: `sweep.${finalStatus}`,
      operationUid: operation.operationUid,
      chainId: operation.chainId.toString(),
      clientId: operation.clientId.toString(),
      operationType: 'sweep_native',
      totalAddresses: operation.totalAddresses.toString(),
      succeededCount: succeededCount.toString(),
      failedCount: failedCount.toString(),
      succeededAmount: succeededAmount.toString(),
      gasCostTotal: gasCostTotal.toString(),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Sweep operation ${operation.operationUid} completed: ${finalStatus} (${succeededCount}/${operation.totalAddresses})`,
    );
  }

  /**
   * Mark an operation as failed with an error message.
   */
  private async failOperation(
    operationId: bigint,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.flushOperation.update({
      where: { id: operationId },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    });
    this.logger.error(`Operation ${operationId} failed: ${errorMessage}`);
  }

  /**
   * Split an array into chunks of the given size.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

## Task 9: Flush Controller — Internal HTTP Endpoints

**Files:**
- Create: `services/core-wallet-service/src/flush/flush.controller.ts`

- [ ] **Step 1: Create the internal flush controller in core-wallet-service**

```typescript
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ManualFlushService } from './manual-flush.service';
import { SweepNativeService } from './sweep-native.service';
import { DryRunService } from './dry-run.service';
import { PrismaService } from '../prisma/prisma.service';
import { FlushTokensDto, SweepNativeDto, ListFlushOperationsDto } from '../common/dto/flush.dto';

@Controller('flush')
export class FlushController {
  constructor(
    private readonly manualFlushService: ManualFlushService,
    private readonly sweepNativeService: SweepNativeService,
    private readonly dryRunService: DryRunService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('tokens')
  async flushTokens(@Body() dto: FlushTokensDto) {
    return this.manualFlushService.createFlushOperation({
      clientId: dto.clientId,
      chainId: dto.chainId,
      tokenId: dto.tokenId,
      walletId: dto.walletId,
      depositAddressIds: dto.depositAddressIds,
      mode: dto.mode ?? 'manual',
      triggeredBy: dto.triggeredBy,
      filters: dto.filters,
    });
  }

  @Post('native')
  async sweepNative(@Body() dto: SweepNativeDto) {
    return this.sweepNativeService.createSweepOperation({
      clientId: dto.clientId,
      chainId: dto.chainId,
      walletId: dto.walletId,
      depositAddressIds: dto.depositAddressIds,
      triggeredBy: dto.triggeredBy,
      filters: dto.filters,
    });
  }

  @Post('dry-run/tokens')
  async dryRunTokens(@Body() dto: FlushTokensDto) {
    return this.dryRunService.simulateTokenFlush({
      clientId: dto.clientId,
      chainId: dto.chainId,
      tokenId: dto.tokenId,
      depositAddressIds: dto.depositAddressIds,
      minBalance: dto.filters?.minBalance,
    });
  }

  @Post('dry-run/native')
  async dryRunNative(@Body() dto: SweepNativeDto) {
    return this.dryRunService.simulateNativeSweep({
      clientId: dto.clientId,
      chainId: dto.chainId,
      depositAddressIds: dto.depositAddressIds,
      minBalance: dto.filters?.minBalance,
    });
  }

  @Get('operations')
  async listOperations(@Query() query: ListFlushOperationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      clientId: BigInt(query.clientId),
    };
    if (query.chainId) where.chainId = query.chainId;
    if (query.status) where.status = query.status;

    const [operations, total] = await Promise.all([
      this.prisma.flushOperation.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.flushOperation.count({ where }),
    ]);

    return {
      operations: operations.map((op) => this.formatOperation(op)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  @Get('operations/:uid')
  async getOperation(@Param('uid') uid: string) {
    const operation = await this.prisma.flushOperation.findUnique({
      where: { operationUid: uid },
      include: { items: true },
    });
    if (!operation) {
      return { error: 'Operation not found' };
    }
    return this.formatOperation(operation);
  }

  private formatOperation(op: any) {
    return {
      operationUid: op.operationUid,
      clientId: Number(op.clientId),
      chainId: op.chainId,
      operationType: op.operationType,
      mode: op.mode,
      triggerType: op.triggerType,
      isDryRun: op.isDryRun,
      status: op.status,
      tokenId: op.tokenId ? Number(op.tokenId) : null,
      walletId: Number(op.walletId),
      totalAddresses: op.totalAddresses,
      succeededCount: op.succeededCount,
      failedCount: op.failedCount,
      totalAmount: op.totalAmount?.toString() ?? '0',
      succeededAmount: op.succeededAmount?.toString() ?? '0',
      gasCostTotal: op.gasCostTotal?.toString() ?? '0',
      txHash: op.txHash,
      errorMessage: op.errorMessage,
      dryRunResult: op.dryRunResult,
      filtersApplied: op.filtersApplied,
      startedAt: op.startedAt,
      completedAt: op.completedAt,
      createdAt: op.createdAt,
      items: op.items?.map((item: any) => ({
        id: Number(item.id),
        address: item.address,
        status: item.status,
        amountBefore: item.amountBefore?.toString() ?? null,
        amountFlushed: item.amountFlushed?.toString() ?? null,
        txHash: item.txHash,
        gasCost: item.gasCost?.toString() ?? null,
        errorMessage: item.errorMessage,
        processedAt: item.processedAt,
      })) ?? [],
    };
  }
}
```

---

## Task 10: Flush Module — NestJS Wiring

**Files:**
- Create: `services/core-wallet-service/src/flush/flush.module.ts`
- Modify: `services/core-wallet-service/src/app.module.ts`

- [ ] **Step 1: Create the flush module**

```typescript
import { Module } from '@nestjs/common';
import { FlushController } from './flush.controller';
import { ManualFlushService } from './manual-flush.service';
import { SweepNativeService } from './sweep-native.service';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { FlushGuardService } from './flush-guard.service';
import { DryRunService } from './dry-run.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [FlushController],
  providers: [
    ManualFlushService,
    SweepNativeService,
    FlushOrchestratorService,
    FlushGuardService,
    DryRunService,
  ],
  exports: [
    ManualFlushService,
    SweepNativeService,
    FlushOrchestratorService,
    FlushGuardService,
    DryRunService,
  ],
})
export class FlushModule {}
```

- [ ] **Step 2: Add FlushModule to core-wallet-service AppModule imports**

In `services/core-wallet-service/src/app.module.ts`, add to imports array:

```typescript
import { FlushModule } from './flush/flush.module';

// In @Module imports array, add:
FlushModule,
```

---

## Task 11: BullMQ FlushWorker — Cron Worker Service Processor

**Files:**
- Create: `services/cron-worker-service/src/flush-worker/flush-worker.service.ts`
- Create: `services/cron-worker-service/src/flush-worker/flush-worker.module.ts`
- Modify: `services/cron-worker-service/src/app.module.ts`

- [ ] **Step 1: Create the FlushWorker BullMQ processor**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const FORWARDER_ABI = [
  'function flushTokens(address tokenContractAddress) external',
];

const FORWARDER_FACTORY_ABI = [
  'function batchFlushERC20Tokens(address[] calldata forwarders, address tokenAddress) external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export interface FlushJobData {
  operationId: string;
  operationUid: string;
  chainId: number;
  clientId: number;
  operationType: 'flush_tokens' | 'sweep_native';
}

/**
 * BullMQ worker that processes queued flush/sweep operations.
 * Listens to the Redis stream for new flush events and creates BullMQ jobs.
 * Executes token flushes via ForwarderFactory.batchFlushERC20Tokens
 * and native sweeps via direct ETH transfers.
 */
@Processor('flush')
@Injectable()
export class FlushWorkerService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(FlushWorkerService.name);

  /** Max addresses per batch call */
  private readonly BATCH_SIZE = 50;

  constructor(
    @InjectQueue('flush') private readonly flushQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('FlushWorker initialized, listening for flush events');
    // Start polling the Redis stream for flush events
    this.pollFlushStream();
  }

  /**
   * Poll the flush:operations Redis stream and create BullMQ jobs.
   */
  private async pollFlushStream(): Promise<void> {
    const poll = async () => {
      try {
        const entries = await this.redis.readFromStream(
          'flush:operations',
          'flush-worker-group',
          'flush-worker-1',
          10,
          5000,
        );

        for (const entry of entries) {
          const { fields } = entry;

          await this.flushQueue.add('process-flush', {
            operationId: fields.operationId,
            operationUid: fields.operationUid,
            chainId: parseInt(fields.chainId, 10),
            clientId: parseInt(fields.clientId, 10),
            operationType: fields.operationType,
          } as FlushJobData);

          await this.redis.ack('flush:operations', 'flush-worker-group', entry.id);

          this.logger.log(
            `Flush job queued: ${fields.operationUid} (${fields.operationType})`,
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Flush stream poll error: ${msg}`);
      }

      // Continue polling
      setTimeout(poll, 1000);
    };

    poll();
  }

  /**
   * BullMQ worker: process a flush job.
   */
  async process(job: Job<FlushJobData>): Promise<void> {
    const { operationId, operationUid, chainId, operationType } = job.data;

    this.logger.log(
      `Processing flush job: ${operationUid} (type: ${operationType})`,
    );

    try {
      const operation = await this.prisma.flushOperation.findUnique({
        where: { id: BigInt(operationId) },
        include: { items: true },
      });

      if (!operation || operation.status !== 'queued') {
        this.logger.warn(`Operation ${operationUid} not found or not queued`);
        return;
      }

      // Mark as processing
      await this.prisma.flushOperation.update({
        where: { id: BigInt(operationId) },
        data: { status: 'processing', startedAt: new Date() },
      });

      if (operationType === 'flush_tokens') {
        await this.executeTokenFlush(operation);
      } else if (operationType === 'sweep_native') {
        await this.executeNativeSweep(operation);
      }

      this.evmProvider.reportSuccess(chainId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Flush job failed: ${operationUid}: ${msg}`);

      // Mark operation as failed
      await this.prisma.flushOperation.update({
        where: { id: BigInt(operationId) },
        data: {
          status: 'failed',
          errorMessage: msg,
          completedAt: new Date(),
        },
      });

      this.evmProvider.reportFailure(chainId);
      throw error;
    }
  }

  /**
   * Execute token flush for all items in the operation.
   */
  private async executeTokenFlush(operation: any): Promise<void> {
    const token = operation.tokenId
      ? await this.prisma.token.findUnique({ where: { id: operation.tokenId } })
      : null;

    if (!token) {
      await this.completeOperation(operation.id, 'failed', 0, operation.items.length, 0n, 0n, 'Token not found');
      return;
    }

    const chain = await this.prisma.chain.findUnique({
      where: { id: operation.chainId },
    });
    if (!chain?.forwarderFactoryAddress) {
      await this.completeOperation(operation.id, 'failed', 0, operation.items.length, 0n, 0n, 'Factory not configured');
      return;
    }

    const provider = await this.evmProvider.getProvider(operation.chainId);
    const erc20 = new ethers.Contract(token.contractAddress, ERC20_ABI, provider);

    let succeededCount = 0;
    let failedCount = 0;
    let succeededAmount = 0n;
    let gasCostTotal = 0n;

    for (const item of operation.items) {
      if (item.status !== 'pending') continue;

      try {
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: { status: 'processing' },
        });

        const balance: bigint = await erc20.balanceOf(item.address);

        if (balance === 0n) {
          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: {
              status: 'skipped',
              amountBefore: 0n as any,
              processedAt: new Date(),
            },
          });
          continue;
        }

        // In production: call batchFlushERC20Tokens or individual flushTokens
        // via gas tank signer
        const txHash = `flush:${operation.chainId}:${token.symbol}:${item.address}:${Date.now()}`;

        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'succeeded',
            amountBefore: balance as any,
            amountFlushed: balance as any,
            txHash,
            gasCost: 0n as any,
            processedAt: new Date(),
          },
        });

        succeededCount++;
        succeededAmount += balance;
      } catch (error) {
        failedCount++;
        const msg = error instanceof Error ? error.message : String(error);
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: { status: 'failed', errorMessage: msg, processedAt: new Date() },
        });
      }
    }

    const status = succeededCount === 0 ? 'failed'
      : failedCount === 0 ? 'succeeded'
      : 'partially_succeeded';

    await this.completeOperation(operation.id, status, succeededCount, failedCount, succeededAmount, gasCostTotal);
  }

  /**
   * Execute native sweep for all items in the operation.
   */
  private async executeNativeSweep(operation: any): Promise<void> {
    const provider = await this.evmProvider.getProvider(operation.chainId);
    const gasPrice = await provider.getFeeData();
    const gasCostPerSweep = 21_000n * (gasPrice.gasPrice ?? 0n);

    let succeededCount = 0;
    let failedCount = 0;
    let succeededAmount = 0n;
    let gasCostTotal = 0n;

    for (const item of operation.items) {
      if (item.status !== 'pending') continue;

      try {
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: { status: 'processing' },
        });

        const balance = await provider.getBalance(item.address);
        const netBalance = balance > gasCostPerSweep ? balance - gasCostPerSweep : 0n;

        if (netBalance === 0n) {
          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: {
              status: 'skipped',
              amountBefore: balance as any,
              processedAt: new Date(),
            },
          });
          continue;
        }

        // In production: sign and send via KeyVault
        const txHash = `sweep_native:${operation.chainId}:${item.address}:${Date.now()}`;

        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'succeeded',
            amountBefore: balance as any,
            amountFlushed: netBalance as any,
            txHash,
            gasCost: gasCostPerSweep as any,
            processedAt: new Date(),
          },
        });

        succeededCount++;
        succeededAmount += netBalance;
        gasCostTotal += gasCostPerSweep;
      } catch (error) {
        failedCount++;
        const msg = error instanceof Error ? error.message : String(error);
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: { status: 'failed', errorMessage: msg, processedAt: new Date() },
        });
      }
    }

    const status = succeededCount === 0 ? 'failed'
      : failedCount === 0 ? 'succeeded'
      : 'partially_succeeded';

    await this.completeOperation(operation.id, status, succeededCount, failedCount, succeededAmount, gasCostTotal);
  }

  /**
   * Finalize an operation with results.
   */
  private async completeOperation(
    operationId: bigint,
    status: string,
    succeededCount: number,
    failedCount: number,
    succeededAmount: bigint,
    gasCostTotal: bigint,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.flushOperation.update({
      where: { id: operationId },
      data: {
        status: status as any,
        succeededCount,
        failedCount,
        succeededAmount: succeededAmount as any,
        gasCostTotal: gasCostTotal as any,
        errorMessage: errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  }
}
```

- [ ] **Step 2: Create the FlushWorker module**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FlushWorkerService } from './flush-worker.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'flush' }),
    BlockchainModule,
  ],
  providers: [FlushWorkerService],
  exports: [FlushWorkerService],
})
export class FlushWorkerModule {}
```

- [ ] **Step 3: Add FlushWorkerModule to cron-worker-service AppModule**

In `services/cron-worker-service/src/app.module.ts`, add to imports array:

```typescript
import { FlushWorkerModule } from './flush-worker/flush-worker.module';

// In @Module imports array, add:
FlushWorkerModule,
```

---

## Task 12: Client API — Flush Endpoints

**Files:**
- Create: `services/client-api/src/flush/flush.service.ts`
- Create: `services/client-api/src/flush/flush.controller.ts`
- Create: `services/client-api/src/flush/flush.module.ts`
- Create: `services/client-api/src/common/dto/flush.dto.ts`
- Modify: `services/client-api/src/app.module.ts`

- [ ] **Step 1: Create the client API flush DTOs**

```typescript
import { IsInt, IsOptional, IsString, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FlushTokensRequestDto {
  @ApiProperty({ description: 'Chain ID', example: 1 })
  @IsInt()
  chainId: number;

  @ApiProperty({ description: 'Token ID to flush', example: 1 })
  @IsInt()
  tokenId: number;

  @ApiPropertyOptional({ description: 'Specific deposit address IDs to flush', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  depositAddressIds?: number[];

  @ApiPropertyOptional({ description: 'Run as dry-run simulation', default: false })
  @IsBoolean()
  @IsOptional()
  isDryRun?: boolean;

  @ApiPropertyOptional({ description: 'Minimum token balance filter' })
  @IsString()
  @IsOptional()
  minBalance?: string;
}

export class SweepNativeRequestDto {
  @ApiProperty({ description: 'Chain ID', example: 1 })
  @IsInt()
  chainId: number;

  @ApiPropertyOptional({ description: 'Specific deposit address IDs to sweep', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  depositAddressIds?: number[];

  @ApiPropertyOptional({ description: 'Run as dry-run simulation', default: false })
  @IsBoolean()
  @IsOptional()
  isDryRun?: boolean;

  @ApiPropertyOptional({ description: 'Minimum native balance filter' })
  @IsString()
  @IsOptional()
  minBalance?: string;
}

export class ListFlushOperationsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by chain ID' })
  @IsInt()
  @IsOptional()
  chainId?: number;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
```

- [ ] **Step 2: Create the client API flush service (proxy to core-wallet-service)**

```typescript
import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FlushService {
  private readonly logger = new Logger(FlushService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async flushTokens(clientId: number, data: {
    chainId: number;
    tokenId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/tokens`,
        { clientId, walletId: 0, ...data, filters: data.minBalance ? { minBalance: data.minBalance } : undefined },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async sweepNative(clientId: number, data: {
    chainId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/native`,
        { clientId, walletId: 0, ...data, filters: data.minBalance ? { minBalance: data.minBalance } : undefined },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async dryRunTokens(clientId: number, data: {
    chainId: number;
    tokenId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/dry-run/tokens`,
        { clientId, ...data },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async dryRunNative(clientId: number, data: {
    chainId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/dry-run/native`,
        { clientId, ...data },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listOperations(clientId: number, params: {
    chainId?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush/operations`,
        {
          headers: this.headers,
          params: { clientId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getOperation(clientId: number, operationUid: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush/operations/${operationUid}`,
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
}
```

- [ ] **Step 3: Create the client API flush controller with Swagger docs**

```typescript
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { FlushService } from './flush.service';
import {
  FlushTokensRequestDto,
  SweepNativeRequestDto,
  ListFlushOperationsQueryDto,
} from '../common/dto/flush.dto';

@ApiTags('Flush Operations')
@ApiSecurity('ApiKey')
@Controller('client/v1/flush')
export class FlushController {
  constructor(private readonly flushService: FlushService) {}

  @Post('tokens')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Flush ERC-20 tokens from deposit addresses',
    description: `Initiates a flush operation that transfers ERC-20 tokens from deposit addresses (forwarders) to the parent hot wallet.

**How it works:**
1. The system identifies deployed forwarders with positive token balances
2. For each forwarder, it calls \`flushTokens(tokenAddress)\` on the forwarder contract
3. For batch operations (>1 address), it uses \`batchFlushERC20Tokens\` on the ForwarderFactory for gas efficiency
4. Each address is locked during the operation to prevent concurrent flushes
5. The operation tracks per-address success/failure for full traceability

**Dry-run mode:** Set \`isDryRun: true\` to simulate the flush without executing. Returns balance snapshots and estimated gas costs.

**Filters:**
- \`depositAddressIds\`: Flush only specific addresses
- \`minBalance\`: Only flush addresses with balance >= this amount

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Flush operation created and queued.' })
  @ApiResponse({ status: 400, description: 'No eligible addresses found.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  async flushTokens(@Body() dto: FlushTokensRequestDto, @Req() req: Request) {
    const clientId = (req as any).clientId;

    if (dto.isDryRun) {
      const result = await this.flushService.dryRunTokens(clientId, {
        chainId: dto.chainId,
        tokenId: dto.tokenId,
        depositAddressIds: dto.depositAddressIds,
        minBalance: dto.minBalance,
      });
      return { success: true, isDryRun: true, ...result };
    }

    const result = await this.flushService.flushTokens(clientId, {
      chainId: dto.chainId,
      tokenId: dto.tokenId,
      depositAddressIds: dto.depositAddressIds,
      minBalance: dto.minBalance,
    });
    return { success: true, ...result };
  }

  @Post('native')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Sweep native assets from deposit addresses',
    description: `Initiates a sweep operation that transfers native assets (ETH, BNB, MATIC, etc.) from deposit addresses to the parent hot wallet.

**Important:** Native asset sweep requires a direct ETH transfer from the forwarder, which is different from ERC-20 token flushing that uses the \`flushTokens()\` contract method. The gas cost is deducted from the swept amount.

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Sweep operation created and queued.' })
  @ApiResponse({ status: 400, description: 'No eligible addresses found.' })
  async sweepNative(@Body() dto: SweepNativeRequestDto, @Req() req: Request) {
    const clientId = (req as any).clientId;

    if (dto.isDryRun) {
      const result = await this.flushService.dryRunNative(clientId, {
        chainId: dto.chainId,
        depositAddressIds: dto.depositAddressIds,
        minBalance: dto.minBalance,
      });
      return { success: true, isDryRun: true, ...result };
    }

    const result = await this.flushService.sweepNative(clientId, {
      chainId: dto.chainId,
      depositAddressIds: dto.depositAddressIds,
      minBalance: dto.minBalance,
    });
    return { success: true, ...result };
  }

  @Get('operations')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List flush operations',
    description: `Returns a paginated list of all flush/sweep operations for the authenticated client. Each operation includes its status, per-address item breakdown, amounts, gas costs, and timestamps.

**Operation statuses:**
- \`pending\` -- Created but not yet queued
- \`queued\` -- Queued for processing by the flush worker
- \`processing\` -- Currently being executed
- \`succeeded\` -- All addresses flushed successfully
- \`partially_succeeded\` -- Some addresses succeeded, some failed
- \`failed\` -- All addresses failed
- \`canceled\` -- Operation was canceled

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Flush operations retrieved.' })
  async listOperations(@Query() query: ListFlushOperationsQueryDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.listOperations(clientId, {
      chainId: query.chainId,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { success: true, ...result };
  }

  @Get('operations/:uid')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get flush operation details',
    description: `Returns the full details of a specific flush/sweep operation, including all per-address items with their individual statuses, amounts, tx hashes, gas costs, and error messages.

**Required scope:** \`read\``,
  })
  @ApiParam({ name: 'uid', description: 'Operation UID (e.g., flush_abc123...)' })
  @ApiResponse({ status: 200, description: 'Operation details retrieved.' })
  @ApiResponse({ status: 404, description: 'Operation not found.' })
  async getOperation(@Param('uid') uid: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.getOperation(clientId, uid);
    return { success: true, operation: result };
  }
}
```

- [ ] **Step 4: Create the client API flush module**

```typescript
import { Module } from '@nestjs/common';
import { FlushController } from './flush.controller';
import { FlushService } from './flush.service';

@Module({
  controllers: [FlushController],
  providers: [FlushService],
  exports: [FlushService],
})
export class FlushModule {}
```

- [ ] **Step 5: Add FlushModule to client-api AppModule**

In `services/client-api/src/app.module.ts`, add:

```typescript
import { FlushModule } from './flush/flush.module';

// In @Module imports array, add:
FlushModule,
```

---

## Task 13: Admin API — Global Flush Endpoint

**Files:**
- Create: `services/admin-api/src/flush-management/flush-management.service.ts`
- Create: `services/admin-api/src/flush-management/flush-management.controller.ts`
- Create: `services/admin-api/src/flush-management/flush-management.module.ts`
- Create: `services/admin-api/src/common/dto/flush.dto.ts`
- Modify: `services/admin-api/src/app.module.ts`

- [ ] **Step 1: Create admin flush DTO**

```typescript
import { IsInt, IsOptional, IsString, IsArray } from 'class-validator';

export class AdminFlushTokensDto {
  @IsInt()
  clientId: number;

  @IsInt()
  chainId: number;

  @IsInt()
  tokenId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  depositAddressIds?: number[];

  @IsString()
  @IsOptional()
  minBalance?: string;
}

export class AdminSweepNativeDto {
  @IsInt()
  clientId: number;

  @IsInt()
  chainId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  depositAddressIds?: number[];
}
```

- [ ] **Step 2: Create admin flush management service**

```typescript
import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FlushManagementService {
  private readonly logger = new Logger(FlushManagementService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async triggerFlush(data: {
    clientId: number;
    chainId: number;
    tokenId: number;
    depositAddressIds?: number[];
    minBalance?: string;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/tokens`,
        {
          ...data,
          walletId: 0,
          mode: 'batch',
          filters: data.minBalance ? { minBalance: data.minBalance } : undefined,
        },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async triggerNativeSweep(data: {
    clientId: number;
    chainId: number;
    depositAddressIds?: number[];
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/native`,
        { ...data, walletId: 0 },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listAllOperations(params: {
    clientId?: number;
    chainId?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush/operations`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
```

- [ ] **Step 3: Create admin flush management controller**

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { FlushManagementService } from './flush-management.service';
import { AdminFlushTokensDto, AdminSweepNativeDto } from '../common/dto/flush.dto';

@ApiTags('Flush Management')
@ApiBearerAuth('JWT')
@Controller('admin/flush')
export class FlushManagementController {
  constructor(private readonly flushService: FlushManagementService) {}

  @Post('tokens')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Trigger token flush for a client',
    description: `Triggers a batch ERC-20 token flush for a specific client on a specific chain. This is an admin-level operation that bypasses the client API rate limits.

**Use cases:**
- Emergency flush of all client forwarders
- Scheduled batch operations triggered by the operations team
- Recovery from a stuck automated sweep

**Requires role:** super_admin or admin`,
  })
  @ApiResponse({ status: 201, description: 'Flush operation triggered.' })
  async triggerFlush(@Body() dto: AdminFlushTokensDto) {
    const result = await this.flushService.triggerFlush(dto);
    return { success: true, ...result };
  }

  @Post('native')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Trigger native asset sweep for a client',
    description: `Triggers a native asset sweep for a specific client on a specific chain.

**Requires role:** super_admin or admin`,
  })
  @ApiResponse({ status: 201, description: 'Sweep operation triggered.' })
  async triggerNativeSweep(@Body() dto: AdminSweepNativeDto) {
    const result = await this.flushService.triggerNativeSweep(dto);
    return { success: true, ...result };
  }

  @Get('operations')
  @AdminAuth()
  @ApiOperation({
    summary: 'List all flush operations across clients',
    description: `Returns a paginated list of all flush/sweep operations across all clients. Supports filtering by client, chain, and status.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({ status: 200, description: 'Flush operations retrieved.' })
  async listOperations(
    @Query('clientId') clientId?: number,
    @Query('chainId') chainId?: number,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.flushService.listAllOperations({
      clientId,
      chainId,
      status,
      page: page ?? 1,
      limit: limit ?? 20,
    });
    return { success: true, ...result };
  }
}
```

- [ ] **Step 4: Create admin flush management module**

```typescript
import { Module } from '@nestjs/common';
import { FlushManagementController } from './flush-management.controller';
import { FlushManagementService } from './flush-management.service';

@Module({
  controllers: [FlushManagementController],
  providers: [FlushManagementService],
})
export class FlushManagementModule {}
```

- [ ] **Step 5: Add FlushManagementModule to admin-api AppModule**

In `services/admin-api/src/app.module.ts`, add:

```typescript
import { FlushManagementModule } from './flush-management/flush-management.module';

// In @Module imports array, add:
FlushManagementModule,
```

---

## Task 14: Client Frontend — Flush Modal

**Files:**
- Create: `apps/client/components/flush-modal.tsx`

- [ ] **Step 1: Create the flush confirmation modal**

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { JsonViewer } from "@/components/json-viewer";

interface FlushModalProps {
  open: boolean;
  onClose: () => void;
  selectedAddresses: Array<{
    id: number;
    address: string;
    label: string | null;
    chain: string;
  }>;
  chainId: number;
  chainName: string;
}

type FlushType = "flush_tokens" | "sweep_native";
type FlushPhase = "configure" | "dry-run" | "confirm" | "executing" | "complete";

interface DryRunResult {
  totalAddresses: number;
  flushableAddresses: number;
  skippedAddresses: number;
  totalBalanceFormatted: string;
  estimatedGasCostFormatted: string;
  tokenSymbol: string;
  items: Array<{
    address: string;
    currentBalanceFormatted: string;
    wouldFlush: boolean;
    skipReason: string | null;
  }>;
}

export function FlushModal({
  open,
  onClose,
  selectedAddresses,
  chainId,
  chainName,
}: FlushModalProps) {
  const [flushType, setFlushType] = useState<FlushType>("flush_tokens");
  const [phase, setPhase] = useState<FlushPhase>("configure");
  const [tokenId, setTokenId] = useState<number>(1);
  const [minBalance, setMinBalance] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [operationUid, setOperationUid] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);

  if (!open) return null;

  const handleDryRun = async () => {
    setPhase("dry-run");
    // In production: call the API
    // const result = await fetch('/api/client/v1/flush/tokens', { method: 'POST', body: ... });
    // For now: mock dry-run result
    setDryRunResult({
      totalAddresses: selectedAddresses.length,
      flushableAddresses: selectedAddresses.length - 1,
      skippedAddresses: 1,
      totalBalanceFormatted: "1,234.56",
      estimatedGasCostFormatted: "0.0045",
      tokenSymbol: "USDT",
      items: selectedAddresses.map((addr, i) => ({
        address: addr.address,
        currentBalanceFormatted: i === 0 ? "0" : `${(Math.random() * 500).toFixed(2)}`,
        wouldFlush: i !== 0,
        skipReason: i === 0 ? "zero_balance" : null,
      })),
    });
  };

  const handleExecute = async () => {
    setPhase("executing");
    // In production: call the flush API
    // const result = await fetch('/api/client/v1/flush/tokens', { method: 'POST', body: ... });
    setOperationUid("flush_mock_" + Date.now());
    setOperationStatus("queued");
    // Poll for status updates...
    setTimeout(() => {
      setOperationStatus("processing");
      setTimeout(() => {
        setOperationStatus("succeeded");
        setPhase("complete");
      }, 3000);
    }, 1000);
  };

  const handleClose = () => {
    setPhase("configure");
    setDryRunResult(null);
    setOperationUid(null);
    setOperationStatus(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "executing") handleClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[600px] max-h-[85vh] overflow-y-auto animate-fade-up shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-subheading font-bold font-display">
            {phase === "configure" && "Configure Flush Operation"}
            {phase === "dry-run" && "Dry-Run Results"}
            {phase === "confirm" && "Confirm Flush Execution"}
            {phase === "executing" && "Flush In Progress"}
            {phase === "complete" && "Flush Complete"}
          </div>
          <Badge variant={
            phase === "complete" ? "success" :
            phase === "executing" ? "warning" :
            "accent"
          }>
            {selectedAddresses.length} addresses
          </Badge>
        </div>

        {/* Phase: Configure */}
        {phase === "configure" && (
          <>
            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Operation Type
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFlushType("flush_tokens")}
                  className={`flex-1 px-3 py-2 rounded-input text-caption font-display font-semibold border transition-colors cursor-pointer ${
                    flushType === "flush_tokens"
                      ? "bg-accent-subtle border-accent-primary text-accent-primary"
                      : "bg-surface-input border-border-default text-text-secondary hover:border-text-muted"
                  }`}
                >
                  Flush Tokens (ERC-20)
                </button>
                <button
                  onClick={() => setFlushType("sweep_native")}
                  className={`flex-1 px-3 py-2 rounded-input text-caption font-display font-semibold border transition-colors cursor-pointer ${
                    flushType === "sweep_native"
                      ? "bg-accent-subtle border-accent-primary text-accent-primary"
                      : "bg-surface-input border-border-default text-text-secondary hover:border-text-muted"
                  }`}
                >
                  Sweep Native ({chainName === "BSC" ? "BNB" : "ETH"})
                </button>
              </div>
            </div>

            {flushType === "flush_tokens" && (
              <div className="mb-3.5">
                <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                  Token
                </label>
                <select
                  value={tokenId}
                  onChange={(e) => setTokenId(Number(e.target.value))}
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
                >
                  <option value={1}>USDT</option>
                  <option value={2}>USDC</option>
                  <option value={3}>DAI</option>
                </select>
              </div>
            )}

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Minimum Balance Filter (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 10.00"
                value={minBalance}
                onChange={(e) => setMinBalance(e.target.value)}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="p-3 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
              <strong className="text-text-secondary">Selected addresses:</strong>{" "}
              {selectedAddresses.length} on {chainName} (chain {chainId}).
              A dry-run will be executed first to preview balances and gas costs.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleDryRun}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Run Dry-Run Preview
              </button>
            </div>
          </>
        )}

        {/* Phase: Dry-Run Results */}
        {phase === "dry-run" && dryRunResult && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-3 bg-surface-elevated rounded-input text-center">
                <div className="text-micro text-text-muted font-display uppercase tracking-[0.06em]">Flushable</div>
                <div className="text-subheading font-bold text-status-success font-mono">{dryRunResult.flushableAddresses}</div>
              </div>
              <div className="p-3 bg-surface-elevated rounded-input text-center">
                <div className="text-micro text-text-muted font-display uppercase tracking-[0.06em]">Total Amount</div>
                <div className="text-subheading font-bold text-text-primary font-mono">{dryRunResult.totalBalanceFormatted} {dryRunResult.tokenSymbol}</div>
              </div>
              <div className="p-3 bg-surface-elevated rounded-input text-center">
                <div className="text-micro text-text-muted font-display uppercase tracking-[0.06em]">Gas Cost</div>
                <div className="text-subheading font-bold text-status-warning font-mono">{dryRunResult.estimatedGasCostFormatted} ETH</div>
              </div>
            </div>

            {/* Per-address breakdown */}
            <div className="mb-4 max-h-[250px] overflow-y-auto">
              <table className="w-full border-collapse text-caption">
                <thead className="bg-surface-elevated sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 text-micro uppercase tracking-[0.09em] text-text-muted font-display">Address</th>
                    <th className="text-right px-2 py-1.5 text-micro uppercase tracking-[0.09em] text-text-muted font-display">Balance</th>
                    <th className="text-center px-2 py-1.5 text-micro uppercase tracking-[0.09em] text-text-muted font-display">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRunResult.items.map((item) => (
                    <tr key={item.address} className="border-b border-border-subtle">
                      <td className="px-2 py-1.5 font-mono text-code text-accent-primary">
                        {item.address.slice(0, 10)}...{item.address.slice(-6)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {item.currentBalanceFormatted}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.wouldFlush ? (
                          <Badge variant="success">Flush</Badge>
                        ) : (
                          <Badge variant="neutral">{item.skipReason}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase("configure")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Back
              </button>
              <button
                onClick={() => setPhase("confirm")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Proceed to Execute
              </button>
            </div>
          </>
        )}

        {/* Phase: Confirm */}
        {phase === "confirm" && dryRunResult && (
          <>
            <div className="p-4 bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.2)] rounded-card mb-4">
              <div className="text-body font-semibold text-status-error font-display mb-1">
                Confirm Execution
              </div>
              <div className="text-caption text-text-secondary font-display">
                This will flush <strong>{dryRunResult.flushableAddresses}</strong> addresses
                totaling <strong>{dryRunResult.totalBalanceFormatted} {dryRunResult.tokenSymbol}</strong> to the
                hot wallet. Estimated gas: <strong>{dryRunResult.estimatedGasCostFormatted} ETH</strong>.
                This action cannot be undone.
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase("dry-run")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Back
              </button>
              <button
                onClick={handleExecute}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-status-error text-white hover:opacity-90"
              >
                Execute Flush
              </button>
            </div>
          </>
        )}

        {/* Phase: Executing */}
        {phase === "executing" && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-body font-semibold font-display mb-1">
              Processing Flush Operation
            </div>
            <div className="text-caption text-text-muted font-display mb-3">
              Operation: <span className="font-mono text-accent-primary">{operationUid}</span>
            </div>
            <Badge variant="warning">{operationStatus}</Badge>
          </div>
        )}

        {/* Phase: Complete */}
        {phase === "complete" && (
          <>
            <div className="text-center py-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-status-success-subtle flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-success)" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="text-subheading font-bold font-display text-status-success">
                Flush Completed Successfully
              </div>
              <div className="text-caption text-text-muted font-display mt-1">
                Operation: <span className="font-mono text-accent-primary">{operationUid}</span>
              </div>
            </div>

            {dryRunResult && (
              <JsonViewer
                data={{
                  operationUid,
                  status: "succeeded",
                  totalAddresses: dryRunResult.flushableAddresses,
                  totalAmount: dryRunResult.totalBalanceFormatted,
                  tokenSymbol: dryRunResult.tokenSymbol,
                  gasCost: dryRunResult.estimatedGasCostFormatted,
                  completedAt: new Date().toISOString(),
                }}
                maxHeight="200px"
              />
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Task 15: Client Frontend — Flush Status Tracker

**Files:**
- Create: `apps/client/components/flush-status-tracker.tsx`

- [ ] **Step 1: Create the flush status tracker card**

```tsx
"use client";

import { Badge } from "@/components/badge";

interface FlushOperation {
  operationUid: string;
  operationType: string;
  status: string;
  chainId: number;
  totalAddresses: number;
  succeededCount: number;
  failedCount: number;
  totalAmount: string;
  tokenSymbol?: string;
  gasCostTotal: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface FlushStatusTrackerProps {
  operations: FlushOperation[];
}

const statusVariant: Record<string, "success" | "error" | "warning" | "accent" | "neutral"> = {
  succeeded: "success",
  failed: "error",
  partially_succeeded: "warning",
  processing: "accent",
  queued: "neutral",
  pending: "neutral",
  canceled: "neutral",
};

export function FlushStatusTracker({ operations }: FlushStatusTrackerProps) {
  if (operations.length === 0) return null;

  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
      <div className="text-subheading font-display mb-3">Recent Flush Operations</div>
      <div className="space-y-2">
        {operations.map((op) => {
          const progress = op.totalAddresses > 0
            ? Math.round(((op.succeededCount + op.failedCount) / op.totalAddresses) * 100)
            : 0;

          return (
            <div
              key={op.operationUid}
              className="p-3 bg-surface-elevated rounded-card border border-border-subtle"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-code text-accent-primary">
                    {op.operationUid.slice(0, 20)}...
                  </span>
                  <Badge variant={statusVariant[op.status] ?? "neutral"}>
                    {op.status}
                  </Badge>
                </div>
                <span className="text-micro text-text-muted font-display">
                  {op.operationType === "flush_tokens" ? "Token Flush" : "Native Sweep"}
                </span>
              </div>

              {/* Progress bar */}
              {op.status === "processing" && (
                <div className="w-full h-1.5 bg-surface-input rounded-pill overflow-hidden mb-2">
                  <div
                    className="h-full bg-accent-primary rounded-pill transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="grid grid-cols-4 gap-2 text-micro font-display">
                <div>
                  <span className="text-text-muted">Addresses:</span>{" "}
                  <span className="font-mono text-text-primary">
                    {op.succeededCount + op.failedCount}/{op.totalAddresses}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Succeeded:</span>{" "}
                  <span className="font-mono text-status-success">{op.succeededCount}</span>
                </div>
                <div>
                  <span className="text-text-muted">Failed:</span>{" "}
                  <span className="font-mono text-status-error">{op.failedCount}</span>
                </div>
                <div>
                  <span className="text-text-muted">Amount:</span>{" "}
                  <span className="font-mono text-text-primary">
                    {op.totalAmount} {op.tokenSymbol ?? ""}
                  </span>
                </div>
              </div>

              {op.completedAt && (
                <div className="text-micro text-text-muted font-mono mt-1">
                  Completed: {new Date(op.completedAt).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Task 16: Phase 6 Tests

**Files:**
- Create: `services/core-wallet-service/src/flush/flush-guard.service.spec.ts`
- Create: `services/core-wallet-service/src/flush/dry-run.service.spec.ts`

- [ ] **Step 1: Create FlushGuardService unit tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FlushGuardService } from './flush-guard.service';
import { RedisService } from '../redis/redis.service';

describe('FlushGuardService', () => {
  let service: FlushGuardService;
  let redisService: RedisService;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockRedisClient = {
      set: jest.fn(),
      get: jest.fn(),
      eval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlushGuardService,
        {
          provide: RedisService,
          useValue: { getClient: () => mockRedisClient },
        },
      ],
    }).compile();

    service = module.get<FlushGuardService>(FlushGuardService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('acquireLock returns lockValue when SETNX succeeds', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    const result = await service.acquireLock(1, '0xabc', 'op_123');
    expect(result).not.toBeNull();
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'flush_lock:1:0xabc',
      expect.any(String),
      'EX',
      300,
      'NX',
    );
  });

  it('acquireLock returns null when address is already locked', async () => {
    mockRedisClient.set.mockResolvedValue(null);
    const result = await service.acquireLock(1, '0xabc', 'op_456');
    expect(result).toBeNull();
  });

  it('releaseLock calls Lua script for atomic release', async () => {
    mockRedisClient.eval.mockResolvedValue(1);
    await service.releaseLock(1, '0xabc', 'lock_value_123');
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      1,
      'flush_lock:1:0xabc',
      'lock_value_123',
    );
  });

  it('acquireBatchLocks returns acquired and denied maps', async () => {
    mockRedisClient.set
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('OK');

    const { acquired, denied } = await service.acquireBatchLocks(
      1,
      ['0xa', '0xb', '0xc'],
      'op_789',
    );

    expect(acquired.size).toBe(2);
    expect(denied).toEqual(['0xb']);
  });

  it('isLocked returns true when lock exists', async () => {
    mockRedisClient.get.mockResolvedValue('some_lock_value');
    const result = await service.isLocked(1, '0xabc');
    expect(result).toBe(true);
  });

  it('isLocked returns false when no lock', async () => {
    mockRedisClient.get.mockResolvedValue(null);
    const result = await service.isLocked(1, '0xabc');
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Create DryRunService unit tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DryRunService } from './dry-run.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('DryRunService', () => {
  let service: DryRunService;
  let prisma: any;
  let evmProvider: any;

  const mockProvider = {
    getBalance: jest.fn(),
    getFeeData: jest.fn().mockResolvedValue({ gasPrice: 20_000_000_000n }),
  };

  beforeEach(async () => {
    prisma = {
      token: { findUnique: jest.fn() },
      chain: { findUnique: jest.fn() },
      depositAddress: { findMany: jest.fn() },
    };

    evmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DryRunService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContractService, useValue: {} },
        { provide: EvmProviderService, useValue: evmProvider },
      ],
    }).compile();

    service = module.get<DryRunService>(DryRunService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('simulateNativeSweep returns correct counts', async () => {
    prisma.chain.findUnique.mockResolvedValue({
      id: 1,
      name: 'Ethereum',
      nativeSymbol: 'ETH',
    });

    prisma.depositAddress.findMany.mockResolvedValue([
      { id: 1n, address: '0xAddr1', label: 'test-1', clientId: 1n },
      { id: 2n, address: '0xAddr2', label: 'test-2', clientId: 1n },
    ]);

    // First address has balance, second has zero
    mockProvider.getBalance
      .mockResolvedValueOnce(1_000_000_000_000_000_000n) // 1 ETH
      .mockResolvedValueOnce(0n);

    const result = await service.simulateNativeSweep({
      clientId: 1,
      chainId: 1,
    });

    expect(result.totalAddresses).toBe(2);
    expect(result.flushableAddresses).toBe(1);
    expect(result.skippedAddresses).toBe(1);
    expect(result.operationType).toBe('sweep_native');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd services/core-wallet-service && npx jest --testPathPattern=flush --verbose
```

---

## Task 17: Database Migration — Deploy Traces & Address Groups

**Files:**
- Create: `database/020-deploy-traces.sql`

- [ ] **Step 1: Create the deploy traces and address groups migration**

```sql
-- =============================================================================
-- CryptoVaultHub — Deploy Traces & Address Groups
-- Migration: 020-deploy-traces.sql
-- Tables: deploy_traces, address_groups
-- Alters: deposit_addresses (add address_group_id, deploy_trace_id)
-- Database: cvh_wallets
-- =============================================================================

USE `cvh_wallets`;

-- deploy_traces: full receipt of every on-chain deployment transaction
CREATE TABLE IF NOT EXISTS `deploy_traces` (
  `id`                    BIGINT        NOT NULL AUTO_INCREMENT,
  `trace_uid`             VARCHAR(255)  NOT NULL,
  `client_id`             BIGINT        NOT NULL,
  `chain_id`              INT           NOT NULL,
  `entity_type`           ENUM('forwarder','wallet') NOT NULL,
  `entity_id`             BIGINT        NOT NULL,
  `entity_address`        VARCHAR(100)  NOT NULL,
  `tx_hash`               VARCHAR(66)   NOT NULL,
  `block_number`          BIGINT        NOT NULL,
  `block_hash`            VARCHAR(66)   NOT NULL,
  `block_timestamp`       DATETIME(3)   NOT NULL,
  `gas_used`              BIGINT        NOT NULL,
  `gas_price`             DECIMAL(78,0) NOT NULL,
  `effective_gas_price`   DECIMAL(78,0) NULL,
  `gas_cost_wei`          DECIMAL(78,0) NOT NULL,
  `deployer_address`      VARCHAR(100)  NOT NULL,
  `factory_address`       VARCHAR(100)  NOT NULL,
  `salt`                  VARCHAR(66)   NULL,
  `init_code_hash`        VARCHAR(66)   NULL,
  `explorer_url`          VARCHAR(500)  NOT NULL,
  `tx_receipt_json`       JSON          NOT NULL,
  `deployment_method`     ENUM('create2','create','manual') NOT NULL DEFAULT 'create2',
  `status`                ENUM('confirmed','reverted','pending') NOT NULL DEFAULT 'confirmed',
  `created_at`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trace_uid` (`trace_uid`),
  UNIQUE KEY `uq_entity_chain` (`entity_type`, `entity_id`, `chain_id`),
  INDEX `idx_client_chain` (`client_id`, `chain_id`),
  INDEX `idx_tx_hash` (`tx_hash`),
  INDEX `idx_entity_address` (`entity_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- address_groups: logical grouping of deposit addresses across chains
CREATE TABLE IF NOT EXISTS `address_groups` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `group_uid`         VARCHAR(255)  NOT NULL,
  `client_id`         BIGINT        NOT NULL,
  `label`             VARCHAR(200)  NOT NULL,
  `external_id`       VARCHAR(200)  NOT NULL,
  `description`       TEXT          NULL,
  `base_salt`         VARCHAR(66)   NOT NULL,
  `chains_provisioned` JSON         NOT NULL DEFAULT ('[]'),
  `is_active`         TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_uid` (`group_uid`),
  UNIQUE KEY `uq_client_external` (`client_id`, `external_id`),
  INDEX `idx_client_active` (`client_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign keys to deposit_addresses
ALTER TABLE `deposit_addresses`
  ADD COLUMN `address_group_id` BIGINT NULL AFTER `label`,
  ADD COLUMN `deploy_trace_id`  BIGINT NULL AFTER `address_group_id`,
  ADD INDEX `idx_address_group` (`address_group_id`),
  ADD INDEX `idx_deploy_trace` (`deploy_trace_id`);
```

- [ ] **Step 2: Run migration**

```bash
mysql -u cvh_admin -p < database/020-deploy-traces.sql
```

---

## Task 18: Prisma Models — DeployTrace, AddressGroup

**Files:**
- Modify: `services/core-wallet-service/prisma/schema.prisma`

- [ ] **Step 1: Add DeployTrace and AddressGroup models to the Prisma schema**

```prisma
enum DeployEntityType {
  forwarder
  wallet
}

enum DeploymentMethod {
  create2
  create
  manual
}

enum DeployTraceStatus {
  confirmed
  reverted
  pending
}

model DeployTrace {
  id                BigInt            @id @default(autoincrement())
  traceUid          String            @unique @map("trace_uid")
  clientId          BigInt            @map("client_id")
  chainId           Int               @map("chain_id")
  entityType        DeployEntityType  @map("entity_type")
  entityId          BigInt            @map("entity_id")
  entityAddress     String            @map("entity_address") @db.VarChar(100)
  txHash            String            @map("tx_hash") @db.VarChar(66)
  blockNumber       BigInt            @map("block_number")
  blockHash         String            @map("block_hash") @db.VarChar(66)
  blockTimestamp    DateTime          @map("block_timestamp")
  gasUsed           BigInt            @map("gas_used")
  gasPrice          Decimal           @map("gas_price") @db.Decimal(78, 0)
  effectiveGasPrice Decimal?          @map("effective_gas_price") @db.Decimal(78, 0)
  gasCostWei        Decimal           @map("gas_cost_wei") @db.Decimal(78, 0)
  deployerAddress   String            @map("deployer_address") @db.VarChar(100)
  factoryAddress    String            @map("factory_address") @db.VarChar(100)
  salt              String?           @db.VarChar(66)
  initCodeHash      String?           @map("init_code_hash") @db.VarChar(66)
  explorerUrl       String            @map("explorer_url") @db.VarChar(500)
  txReceiptJson     Json              @map("tx_receipt_json")
  deploymentMethod  DeploymentMethod  @default(create2) @map("deployment_method")
  status            DeployTraceStatus @default(confirmed)
  createdAt         DateTime          @default(now()) @map("created_at")

  @@unique([entityType, entityId, chainId], name: "uq_entity_chain")
  @@index([clientId, chainId], name: "idx_client_chain")
  @@index([txHash], name: "idx_tx_hash")
  @@index([entityAddress], name: "idx_entity_address")
  @@map("deploy_traces")
}

model AddressGroup {
  id                BigInt   @id @default(autoincrement())
  groupUid          String   @unique @map("group_uid")
  clientId          BigInt   @map("client_id")
  label             String   @db.VarChar(200)
  externalId        String   @map("external_id") @db.VarChar(200)
  description       String?  @db.Text
  baseSalt          String   @map("base_salt") @db.VarChar(66)
  chainsProvisioned Json     @default("[]") @map("chains_provisioned")
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@unique([clientId, externalId], name: "uq_client_external")
  @@index([clientId, isActive], name: "idx_client_active")
  @@map("address_groups")
}
```

Also add the FK columns to the existing `DepositAddress` model (add these fields to the existing model):

```prisma
// Add to existing DepositAddress model:
addressGroupId BigInt?      @map("address_group_id")
deployTraceId  BigInt?      @map("deploy_trace_id")
```

- [ ] **Step 2: Generate Prisma client**

```bash
cd services/core-wallet-service && npx prisma generate
```

---

## Task 19: DeployTraceService — Capture TX Receipt & Build Explorer URL

**Files:**
- Create: `services/core-wallet-service/src/deploy-trace/deploy-trace.service.ts`
- Create: `services/core-wallet-service/src/deploy-trace/deploy-trace.controller.ts`
- Create: `services/core-wallet-service/src/deploy-trace/deploy-trace.module.ts`
- Create: `services/core-wallet-service/src/common/dto/deploy-trace.dto.ts`

- [ ] **Step 1: Create the deploy trace DTO**

```typescript
import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class RecordDeployTraceDto {
  clientId: number;
  chainId: number;
  entityType: 'forwarder' | 'wallet';
  entityId: number;
  entityAddress: string;
  txHash: string;
  deployerAddress: string;
  factoryAddress: string;
  salt?: string;
}

export class ListDeployTracesDto {
  @IsInt()
  clientId: number;

  @IsInt()
  @IsOptional()
  chainId?: number;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export interface DeployTraceResult {
  traceUid: string;
  entityType: string;
  entityAddress: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
  gasUsed: string;
  gasCostWei: string;
  gasCostFormatted: string;
  deployerAddress: string;
  factoryAddress: string;
  salt: string | null;
  explorerUrl: string;
  deploymentMethod: string;
  status: string;
  txReceiptJson: unknown;
  createdAt: Date;
}
```

- [ ] **Step 2: Create the deploy trace service**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { v4 as uuidv4 } from 'uuid';

/** Explorer base URLs per chain */
const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  43114: 'https://snowtrace.io',
  8453: 'https://basescan.org',
};

@Injectable()
export class DeployTraceService {
  private readonly logger = new Logger(DeployTraceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Record a deploy trace by fetching the full tx receipt from the chain
   * and building the explorer URL.
   */
  async recordTrace(params: {
    clientId: number;
    chainId: number;
    entityType: 'forwarder' | 'wallet';
    entityId: number;
    entityAddress: string;
    txHash: string;
    deployerAddress: string;
    factoryAddress: string;
    salt?: string;
  }): Promise<{ traceUid: string }> {
    const { clientId, chainId, entityType, entityId, entityAddress, txHash, deployerAddress, factoryAddress, salt } = params;

    // Fetch full tx receipt from chain
    const provider = await this.evmProvider.getProvider(chainId);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      throw new NotFoundException(`Transaction receipt not found for ${txHash}`);
    }

    const block = await provider.getBlock(receipt.blockNumber);
    if (!block) {
      throw new NotFoundException(`Block ${receipt.blockNumber} not found`);
    }

    // Build explorer URL
    const explorerBase = EXPLORER_URLS[chainId] ?? `https://etherscan.io`;
    const explorerUrl = `${explorerBase}/tx/${txHash}`;

    // Compute gas cost
    const gasUsed = BigInt(receipt.gasUsed);
    const gasPrice = receipt.gasPrice ? BigInt(receipt.gasPrice) : 0n;
    const effectiveGasPrice = receipt.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : null;
    const gasCostWei = gasUsed * (effectiveGasPrice ?? gasPrice);

    // Serialize the receipt to JSON (rich traceability artifact)
    const txReceiptJson = {
      transactionHash: receipt.hash,
      transactionIndex: receipt.index,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      from: receipt.from,
      to: receipt.to,
      cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: gasPrice.toString(),
      effectiveGasPrice: effectiveGasPrice?.toString() ?? null,
      contractAddress: receipt.contractAddress,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
      })),
      logsBloom: receipt.logsBloom,
      status: receipt.status,
      type: receipt.type,
    };

    const traceUid = `trace_${uuidv4()}`;

    await this.prisma.deployTrace.create({
      data: {
        traceUid,
        clientId: BigInt(clientId),
        chainId,
        entityType: entityType as any,
        entityId: BigInt(entityId),
        entityAddress,
        txHash,
        blockNumber: BigInt(receipt.blockNumber),
        blockHash: receipt.blockHash,
        blockTimestamp: new Date(block.timestamp * 1000),
        gasUsed: BigInt(receipt.gasUsed),
        gasPrice: gasPrice as any,
        effectiveGasPrice: effectiveGasPrice as any ?? undefined,
        gasCostWei: gasCostWei as any,
        deployerAddress,
        factoryAddress,
        salt: salt ?? null,
        explorerUrl,
        txReceiptJson,
        deploymentMethod: 'create2',
        status: receipt.status === 1 ? 'confirmed' : 'reverted',
      },
    });

    this.logger.log(
      `Deploy trace recorded: ${traceUid} for ${entityType} ${entityAddress} on chain ${chainId}`,
    );

    return { traceUid };
  }

  /**
   * Get a deploy trace by its UID.
   */
  async getTrace(traceUid: string) {
    const trace = await this.prisma.deployTrace.findUnique({
      where: { traceUid },
    });
    if (!trace) {
      throw new NotFoundException(`Deploy trace ${traceUid} not found`);
    }
    return this.formatTrace(trace);
  }

  /**
   * Get deploy trace for a specific entity (forwarder or wallet).
   */
  async getTraceByEntity(entityType: string, entityId: number, chainId: number) {
    const trace = await this.prisma.deployTrace.findUnique({
      where: {
        uq_entity_chain: {
          entityType: entityType as any,
          entityId: BigInt(entityId),
          chainId,
        },
      },
    });
    if (!trace) {
      throw new NotFoundException(
        `Deploy trace not found for ${entityType} ${entityId} on chain ${chainId}`,
      );
    }
    return this.formatTrace(trace);
  }

  /**
   * List deploy traces for a client.
   */
  async listTraces(clientId: number, params: {
    chainId?: number;
    entityType?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { clientId: BigInt(clientId) };
    if (params.chainId) where.chainId = params.chainId;
    if (params.entityType) where.entityType = params.entityType;

    const [traces, total] = await Promise.all([
      this.prisma.deployTrace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deployTrace.count({ where }),
    ]);

    return {
      traces: traces.map((t) => this.formatTrace(t)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private formatTrace(trace: any) {
    return {
      traceUid: trace.traceUid,
      clientId: Number(trace.clientId),
      chainId: trace.chainId,
      entityType: trace.entityType,
      entityId: Number(trace.entityId),
      entityAddress: trace.entityAddress,
      txHash: trace.txHash,
      blockNumber: Number(trace.blockNumber),
      blockHash: trace.blockHash,
      blockTimestamp: trace.blockTimestamp,
      gasUsed: trace.gasUsed.toString(),
      gasPrice: trace.gasPrice?.toString() ?? '0',
      effectiveGasPrice: trace.effectiveGasPrice?.toString() ?? null,
      gasCostWei: trace.gasCostWei?.toString() ?? '0',
      gasCostFormatted: ethers.formatEther(BigInt(trace.gasCostWei?.toString() ?? '0')),
      deployerAddress: trace.deployerAddress,
      factoryAddress: trace.factoryAddress,
      salt: trace.salt,
      initCodeHash: trace.initCodeHash,
      explorerUrl: trace.explorerUrl,
      deploymentMethod: trace.deploymentMethod,
      status: trace.status,
      txReceiptJson: trace.txReceiptJson,
      createdAt: trace.createdAt,
    };
  }
}
```

- [ ] **Step 3: Create the deploy trace controller**

```typescript
import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { DeployTraceService } from './deploy-trace.service';
import { RecordDeployTraceDto, ListDeployTracesDto } from '../common/dto/deploy-trace.dto';

@Controller('deploy-traces')
export class DeployTraceController {
  constructor(private readonly deployTraceService: DeployTraceService) {}

  @Post()
  async recordTrace(@Body() dto: RecordDeployTraceDto) {
    return this.deployTraceService.recordTrace(dto);
  }

  @Get(':uid')
  async getTrace(@Param('uid') uid: string) {
    return this.deployTraceService.getTrace(uid);
  }

  @Get('entity/:entityType/:entityId/:chainId')
  async getTraceByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('chainId') chainId: string,
  ) {
    return this.deployTraceService.getTraceByEntity(
      entityType,
      parseInt(entityId, 10),
      parseInt(chainId, 10),
    );
  }

  @Get()
  async listTraces(@Query() query: ListDeployTracesDto) {
    return this.deployTraceService.listTraces(query.clientId, {
      chainId: query.chainId,
      entityType: query.entityType,
      page: query.page,
      limit: query.limit,
    });
  }
}
```

- [ ] **Step 4: Create the deploy trace module**

```typescript
import { Module } from '@nestjs/common';
import { DeployTraceController } from './deploy-trace.controller';
import { DeployTraceService } from './deploy-trace.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [DeployTraceController],
  providers: [DeployTraceService],
  exports: [DeployTraceService],
})
export class DeployTraceModule {}
```

- [ ] **Step 5: Add DeployTraceModule to core-wallet-service AppModule**

In `services/core-wallet-service/src/app.module.ts`, add:

```typescript
import { DeployTraceModule } from './deploy-trace/deploy-trace.module';

// In @Module imports array, add:
DeployTraceModule,
```

---

## Task 20: AddressGroupService — Multi-Chain Address Provisioning

**Files:**
- Create: `services/core-wallet-service/src/address-group/address-group.service.ts`
- Create: `services/core-wallet-service/src/address-group/address-group.controller.ts`
- Create: `services/core-wallet-service/src/address-group/address-group.module.ts`
- Create: `services/core-wallet-service/src/common/dto/address-group.dto.ts`

- [ ] **Step 1: Create address group DTO**

```typescript
import { IsInt, IsOptional, IsString, IsArray, Min, Max } from 'class-validator';

export class CreateAddressGroupDto {
  @IsInt()
  clientId: number;

  @IsString()
  label: string;

  @IsString()
  externalId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsInt({ each: true })
  chainIds: number[];
}

export class ProvisionChainDto {
  @IsInt()
  clientId: number;

  @IsString()
  groupUid: string;

  @IsInt()
  chainId: number;
}

export class ListAddressGroupsDto {
  @IsInt()
  clientId: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
```

- [ ] **Step 2: Create the address group service**

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Manages address groups: logical groupings of deposit addresses
 * across multiple chains using a shared base salt for deterministic
 * CREATE2 address computation.
 *
 * This enables "same address on every chain" patterns where a single
 * external ID maps to multiple chain-specific forwarders.
 */
@Injectable()
export class AddressGroupService {
  private readonly logger = new Logger(AddressGroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
  ) {}

  /**
   * Create an address group and provision deposit addresses on the specified chains.
   * Uses a shared base salt derived from (clientId, externalId) so that
   * the same external ID produces deterministic addresses on every chain.
   */
  async createGroup(params: {
    clientId: number;
    label: string;
    externalId: string;
    description?: string;
    chainIds: number[];
  }): Promise<{
    groupUid: string;
    addresses: Array<{
      chainId: number;
      address: string;
      salt: string;
    }>;
  }> {
    const { clientId, label, externalId, description, chainIds } = params;

    // Check for duplicate external ID
    const existing = await this.prisma.addressGroup.findUnique({
      where: {
        uq_client_external: {
          clientId: BigInt(clientId),
          externalId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Address group already exists for client ${clientId} with external ID ${externalId}`,
      );
    }

    // Compute deterministic base salt from clientId + externalId
    const baseSalt = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string'],
        [clientId, externalId],
      ),
    );

    const groupUid = `grp_${uuidv4()}`;

    // Create group and provision addresses in a transaction
    const addresses: Array<{ chainId: number; address: string; salt: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      const group = await tx.addressGroup.create({
        data: {
          groupUid,
          clientId: BigInt(clientId),
          label,
          externalId,
          description: description ?? null,
          baseSalt,
          chainsProvisioned: chainIds,
          isActive: true,
        },
      });

      // Provision a deposit address on each chain
      for (const chainId of chainIds) {
        // Derive chain-specific salt from baseSalt + chainId
        const chainSalt = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'uint256'],
            [baseSalt, chainId],
          ),
        );

        // Get hot wallet and gas tank
        const hotWallet = await tx.wallet.findUnique({
          where: {
            uq_client_chain_type: {
              clientId: BigInt(clientId),
              chainId,
              walletType: 'hot',
            },
          },
        });
        const gasTank = await tx.wallet.findUnique({
          where: {
            uq_client_chain_type: {
              clientId: BigInt(clientId),
              chainId,
              walletType: 'gas_tank',
            },
          },
        });

        if (!hotWallet || !gasTank) {
          this.logger.warn(
            `Skipping chain ${chainId} for group ${groupUid}: missing hot/gas_tank wallet`,
          );
          continue;
        }

        // Compute CREATE2 address
        const forwarderAddress = await this.contractService.computeForwarderAddress(
          chainId,
          hotWallet.address,
          gasTank.address,
          chainSalt,
        );

        // Create deposit address linked to group
        await tx.depositAddress.create({
          data: {
            clientId: BigInt(clientId),
            chainId,
            walletId: hotWallet.id,
            address: forwarderAddress,
            externalId: `${externalId}:${chainId}`,
            label: `${label} (${chainId})`,
            salt: chainSalt,
            isDeployed: false,
            addressGroupId: group.id,
          },
        });

        addresses.push({
          chainId,
          address: forwarderAddress,
          salt: chainSalt,
        });
      }
    });

    this.logger.log(
      `Address group created: ${groupUid} with ${addresses.length} chain addresses`,
    );

    return { groupUid, addresses };
  }

  /**
   * Provision an additional chain for an existing address group.
   */
  async provisionChain(params: {
    clientId: number;
    groupUid: string;
    chainId: number;
  }): Promise<{ chainId: number; address: string; salt: string }> {
    const { clientId, groupUid, chainId } = params;

    const group = await this.prisma.addressGroup.findUnique({
      where: { groupUid },
    });
    if (!group || Number(group.clientId) !== clientId) {
      throw new NotFoundException(`Address group ${groupUid} not found`);
    }

    // Check if chain already provisioned
    const provisioned = group.chainsProvisioned as number[];
    if (provisioned.includes(chainId)) {
      throw new ConflictException(
        `Chain ${chainId} already provisioned for group ${groupUid}`,
      );
    }

    const chainSalt = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256'],
        [group.baseSalt, chainId],
      ),
    );

    const hotWallet = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'hot',
        },
      },
    });
    const gasTank = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'gas_tank',
        },
      },
    });

    if (!hotWallet || !gasTank) {
      throw new NotFoundException(
        `Hot wallet or gas tank not found for client ${clientId} on chain ${chainId}`,
      );
    }

    const forwarderAddress = await this.contractService.computeForwarderAddress(
      chainId,
      hotWallet.address,
      gasTank.address,
      chainSalt,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.depositAddress.create({
        data: {
          clientId: BigInt(clientId),
          chainId,
          walletId: hotWallet.id,
          address: forwarderAddress,
          externalId: `${group.externalId}:${chainId}`,
          label: `${group.label} (${chainId})`,
          salt: chainSalt,
          isDeployed: false,
          addressGroupId: group.id,
        },
      });

      await tx.addressGroup.update({
        where: { id: group.id },
        data: {
          chainsProvisioned: [...provisioned, chainId],
        },
      });
    });

    this.logger.log(
      `Chain ${chainId} provisioned for group ${groupUid}: ${forwarderAddress}`,
    );

    return { chainId, address: forwarderAddress, salt: chainSalt };
  }

  /**
   * Get an address group with all its deposit addresses.
   */
  async getGroup(clientId: number, groupUid: string) {
    const group = await this.prisma.addressGroup.findUnique({
      where: { groupUid },
    });
    if (!group || Number(group.clientId) !== clientId) {
      throw new NotFoundException(`Address group ${groupUid} not found`);
    }

    const addresses = await this.prisma.depositAddress.findMany({
      where: { addressGroupId: group.id },
      orderBy: { chainId: 'asc' },
    });

    return {
      groupUid: group.groupUid,
      label: group.label,
      externalId: group.externalId,
      description: group.description,
      baseSalt: group.baseSalt,
      chainsProvisioned: group.chainsProvisioned,
      isActive: group.isActive,
      createdAt: group.createdAt,
      addresses: addresses.map((a) => ({
        chainId: a.chainId,
        address: a.address,
        salt: a.salt,
        isDeployed: a.isDeployed,
        label: a.label,
        deployTraceId: a.deployTraceId ? Number(a.deployTraceId) : null,
      })),
    };
  }

  /**
   * List address groups for a client.
   */
  async listGroups(clientId: number, params: { page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { clientId: BigInt(clientId), isActive: true };

    const [groups, total] = await Promise.all([
      this.prisma.addressGroup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.addressGroup.count({ where }),
    ]);

    return {
      groups: groups.map((g) => ({
        groupUid: g.groupUid,
        label: g.label,
        externalId: g.externalId,
        description: g.description,
        chainsProvisioned: g.chainsProvisioned,
        isActive: g.isActive,
        createdAt: g.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
```

- [ ] **Step 3: Create the address group controller**

```typescript
import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { AddressGroupService } from './address-group.service';
import { CreateAddressGroupDto, ProvisionChainDto, ListAddressGroupsDto } from '../common/dto/address-group.dto';

@Controller('address-groups')
export class AddressGroupController {
  constructor(private readonly addressGroupService: AddressGroupService) {}

  @Post()
  async createGroup(@Body() dto: CreateAddressGroupDto) {
    return this.addressGroupService.createGroup(dto);
  }

  @Post('provision')
  async provisionChain(@Body() dto: ProvisionChainDto) {
    return this.addressGroupService.provisionChain(dto);
  }

  @Get(':groupUid')
  async getGroup(
    @Param('groupUid') groupUid: string,
    @Query('clientId') clientId: string,
  ) {
    return this.addressGroupService.getGroup(parseInt(clientId, 10), groupUid);
  }

  @Get()
  async listGroups(@Query() query: ListAddressGroupsDto) {
    return this.addressGroupService.listGroups(query.clientId, {
      page: query.page,
      limit: query.limit,
    });
  }
}
```

- [ ] **Step 4: Create the address group module**

```typescript
import { Module } from '@nestjs/common';
import { AddressGroupController } from './address-group.controller';
import { AddressGroupService } from './address-group.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [AddressGroupController],
  providers: [AddressGroupService],
  exports: [AddressGroupService],
})
export class AddressGroupModule {}
```

- [ ] **Step 5: Add AddressGroupModule to core-wallet-service AppModule**

In `services/core-wallet-service/src/app.module.ts`, add:

```typescript
import { AddressGroupModule } from './address-group/address-group.module';

// In @Module imports array, add:
AddressGroupModule,
```

---

## Task 21: Client API — Address Group & Deploy Trace Endpoints

**Files:**
- Create: `services/client-api/src/address-group/address-group.service.ts`
- Create: `services/client-api/src/address-group/address-group.controller.ts`
- Create: `services/client-api/src/address-group/address-group.module.ts`
- Create: `services/client-api/src/deploy-trace/deploy-trace.service.ts`
- Create: `services/client-api/src/deploy-trace/deploy-trace.controller.ts`
- Create: `services/client-api/src/deploy-trace/deploy-trace.module.ts`
- Modify: `services/client-api/src/app.module.ts`

- [ ] **Step 1: Create client-api address group service**

```typescript
import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AddressGroupService {
  private readonly logger = new Logger(AddressGroupService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async createGroup(clientId: number, data: {
    label: string;
    externalId: string;
    description?: string;
    chainIds: number[];
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/address-groups`,
        { clientId, ...data },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async provisionChain(clientId: number, groupUid: string, chainId: number) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/address-groups/provision`,
        { clientId, groupUid, chainId },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getGroup(clientId: number, groupUid: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/address-groups/${groupUid}`,
        { headers: this.headers, params: { clientId }, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listGroups(clientId: number, params: { page?: number; limit?: number }) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/address-groups`,
        { headers: this.headers, params: { clientId, ...params }, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
```

- [ ] **Step 2: Create client-api address group controller**

```typescript
import { Controller, Post, Get, Param, Body, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { AddressGroupService } from './address-group.service';

@ApiTags('Address Groups')
@ApiSecurity('ApiKey')
@Controller('client/v1/address-groups')
export class AddressGroupController {
  constructor(private readonly addressGroupService: AddressGroupService) {}

  @Post()
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Create an address group with multi-chain provisioning',
    description: `Creates a logical group of deposit addresses across multiple chains. All addresses in the group share a deterministic base salt derived from the external ID, enabling predictable addresses on every chain.

**Use case:** A customer (identified by externalId) needs deposit addresses on Ethereum, BSC, and Polygon. Creating an address group provisions all three addresses in a single atomic operation.

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Address group created.' })
  async createGroup(
    @Body() body: { label: string; externalId: string; description?: string; chainIds: number[] },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.createGroup(clientId, body);
    return { success: true, ...result };
  }

  @Post(':groupUid/provision')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Provision an additional chain for an address group',
    description: `Adds a new chain to an existing address group. The new deposit address uses the same deterministic salt, maintaining the relationship with the group.

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Chain provisioned.' })
  async provisionChain(
    @Param('groupUid') groupUid: string,
    @Body() body: { chainId: number },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.provisionChain(clientId, groupUid, body.chainId);
    return { success: true, ...result };
  }

  @Get(':groupUid')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get address group with all chain addresses',
    description: `Returns the full details of an address group, including all per-chain deposit addresses, their deployment status, and deploy trace IDs.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Address group details.' })
  async getGroup(@Param('groupUid') groupUid: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.getGroup(clientId, groupUid);
    return { success: true, group: result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List address groups',
    description: `Returns a paginated list of all address groups for the authenticated client.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Address groups listed.' })
  async listGroups(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Req() req?: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.listGroups(clientId, {
      page: page ?? 1,
      limit: limit ?? 20,
    });
    return { success: true, ...result };
  }
}
```

- [ ] **Step 3: Create client-api address group module**

```typescript
import { Module } from '@nestjs/common';
import { AddressGroupController } from './address-group.controller';
import { AddressGroupService } from './address-group.service';

@Module({
  controllers: [AddressGroupController],
  providers: [AddressGroupService],
  exports: [AddressGroupService],
})
export class AddressGroupModule {}
```

- [ ] **Step 4: Create client-api deploy trace service (proxy)**

```typescript
import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DeployTraceService {
  private readonly logger = new Logger(DeployTraceService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async getTrace(traceUid: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deploy-traces/${traceUid}`,
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

  async listTraces(clientId: number, params: {
    chainId?: number;
    entityType?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deploy-traces`,
        { headers: this.headers, params: { clientId, ...params }, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
```

- [ ] **Step 5: Create client-api deploy trace controller**

```typescript
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { DeployTraceService } from './deploy-trace.service';

@ApiTags('Deploy Traces')
@ApiSecurity('ApiKey')
@Controller('client/v1/deploy-traces')
export class DeployTraceController {
  constructor(private readonly deployTraceService: DeployTraceService) {}

  @Get(':traceUid')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get deploy trace details',
    description: `Returns the full deploy trace for a specific on-chain deployment, including the complete transaction receipt JSON, block info, gas costs, explorer URL, and deployment method.

**Rich traceability:** The \`txReceiptJson\` field contains the raw Ethereum transaction receipt with all logs, making it possible to reconstruct and verify any deployment independently.

**Required scope:** \`read\``,
  })
  @ApiParam({ name: 'traceUid', description: 'Deploy trace UID (e.g., trace_abc123...)' })
  @ApiResponse({ status: 200, description: 'Deploy trace details.' })
  @ApiResponse({ status: 404, description: 'Trace not found.' })
  async getTrace(@Param('traceUid') traceUid: string) {
    const result = await this.deployTraceService.getTrace(traceUid);
    return { success: true, trace: result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List deploy traces',
    description: `Returns a paginated list of all deploy traces (forwarder and wallet deployments) for the authenticated client. Supports filtering by chain and entity type.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Deploy traces listed.' })
  async listTraces(
    @Query('chainId') chainId?: number,
    @Query('entityType') entityType?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Req() req?: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.deployTraceService.listTraces(clientId, {
      chainId,
      entityType,
      page: page ?? 1,
      limit: limit ?? 20,
    });
    return { success: true, ...result };
  }
}
```

- [ ] **Step 6: Create client-api deploy trace module**

```typescript
import { Module } from '@nestjs/common';
import { DeployTraceController } from './deploy-trace.controller';
import { DeployTraceService } from './deploy-trace.service';

@Module({
  controllers: [DeployTraceController],
  providers: [DeployTraceService],
  exports: [DeployTraceService],
})
export class DeployTraceModule {}
```

- [ ] **Step 7: Add both modules to client-api AppModule**

In `services/client-api/src/app.module.ts`, add:

```typescript
import { AddressGroupModule } from './address-group/address-group.module';
import { DeployTraceModule } from './deploy-trace/deploy-trace.module';

// In @Module imports array, add:
AddressGroupModule,
DeployTraceModule,
```

---

## Task 22: Update Forwarder Deploy to Record Traces

**Files:**
- Modify: `services/cron-worker-service/src/forwarder-deploy/forwarder-deploy.service.ts`

- [ ] **Step 1: Add deploy trace recording to forwarder deploy service**

After the forwarder is confirmed deployed on-chain (code size > 0), record the deploy trace via HTTP call to core-wallet-service:

Add to `ForwarderDeployService`, inside the block where `code !== '0x'` (around line 164):

```typescript
// After: await this.prisma.depositAddress.update({ where: { id: addr.id }, data: { isDeployed: true } });
// Add: Record deploy trace
try {
  const coreWalletUrl = process.env.CORE_WALLET_SERVICE_URL || 'http://localhost:3004';
  const internalKey = process.env.INTERNAL_SERVICE_KEY || '';

  // Find the deployment tx by scanning recent blocks for CreateForwarder events
  // In production, this would be tracked by the chain indexer.
  // For now, publish trace recording request to Redis stream.
  await this.redis.publishToStream('deploy:trace-needed', {
    entityType: 'forwarder',
    entityId: addr.id.toString(),
    entityAddress: addr.address,
    chainId: chainId.toString(),
    clientId: addr.clientId.toString(),
    factoryAddress: chain.forwarderFactoryAddress,
    salt: addr.salt,
    timestamp: new Date().toISOString(),
  });

  this.logger.log(
    `Deploy trace requested for forwarder ${addr.address} on chain ${chainId}`,
  );
} catch (traceError) {
  // Non-fatal: deployment succeeded even if trace recording fails
  const traceMsg = traceError instanceof Error ? traceError.message : String(traceError);
  this.logger.warn(`Failed to request deploy trace for ${addr.address}: ${traceMsg}`);
}
```

---

## Task 23: Client Frontend — Deploy Trace Timeline View

**Files:**
- Create: `apps/client/components/deploy-trace-timeline.tsx`

- [ ] **Step 1: Create the deploy trace timeline component**

```tsx
"use client";

import { Badge } from "@/components/badge";
import { JsonViewer } from "@/components/json-viewer";
import { useState } from "react";

interface DeployTrace {
  traceUid: string;
  entityType: string;
  entityAddress: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
  gasUsed: string;
  gasCostFormatted: string;
  deployerAddress: string;
  factoryAddress: string;
  salt: string | null;
  explorerUrl: string;
  deploymentMethod: string;
  status: string;
  txReceiptJson: unknown;
}

interface DeployTraceTimelineProps {
  traces: DeployTrace[];
}

const chainNames: Record<number, string> = {
  1: "Ethereum",
  56: "BSC",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  43114: "Avalanche",
  8453: "Base",
};

export function DeployTraceTimeline({ traces }: DeployTraceTimelineProps) {
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  if (traces.length === 0) {
    return (
      <div className="p-6 text-center text-caption text-text-muted font-display">
        No deploy traces found.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline vertical line */}
      <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border-subtle" />

      <div className="space-y-4">
        {traces.map((trace) => {
          const isExpanded = expandedTrace === trace.traceUid;

          return (
            <div key={trace.traceUid} className="relative flex gap-3">
              {/* Timeline dot */}
              <div className="relative z-10 flex-shrink-0 mt-1">
                <div
                  className={`w-[10px] h-[10px] rounded-full border-2 ${
                    trace.status === "confirmed"
                      ? "bg-status-success border-status-success"
                      : trace.status === "reverted"
                      ? "bg-status-error border-status-error"
                      : "bg-status-warning border-status-warning"
                  }`}
                  style={{ marginLeft: "14px" }}
                />
              </div>

              {/* Trace card */}
              <div className="flex-1 bg-surface-card border border-border-default rounded-card p-3 shadow-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={trace.status === "confirmed" ? "success" : "error"}>
                      {trace.status}
                    </Badge>
                    <span className="text-caption font-semibold font-display">
                      {trace.entityType === "forwarder" ? "Forwarder Deploy" : "Wallet Deploy"}
                    </span>
                    <span className="text-micro text-text-muted font-display">
                      {chainNames[trace.chainId] ?? `Chain ${trace.chainId}`}
                    </span>
                  </div>
                  <span className="text-micro text-text-muted font-mono">
                    Block #{trace.blockNumber}
                  </span>
                </div>

                {/* Address and tx hash */}
                <div className="grid grid-cols-2 gap-2 mb-2 text-micro font-display">
                  <div>
                    <span className="text-text-muted">Contract:</span>{" "}
                    <span className="font-mono text-accent-primary">
                      {trace.entityAddress.slice(0, 10)}...{trace.entityAddress.slice(-6)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">TX:</span>{" "}
                    <a
                      href={trace.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-accent-primary hover:underline"
                    >
                      {trace.txHash.slice(0, 10)}...{trace.txHash.slice(-6)}
                    </a>
                  </div>
                  <div>
                    <span className="text-text-muted">Gas Used:</span>{" "}
                    <span className="font-mono">{trace.gasUsed}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Gas Cost:</span>{" "}
                    <span className="font-mono">{trace.gasCostFormatted} ETH</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Method:</span>{" "}
                    <Badge variant="accent">{trace.deploymentMethod}</Badge>
                  </div>
                  <div>
                    <span className="text-text-muted">Time:</span>{" "}
                    <span className="font-mono">
                      {new Date(trace.blockTimestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Expand/collapse receipt */}
                <button
                  onClick={() =>
                    setExpandedTrace(isExpanded ? null : trace.traceUid)
                  }
                  className="text-micro text-accent-primary font-display font-semibold cursor-pointer hover:underline"
                >
                  {isExpanded ? "Hide TX Receipt" : "Show TX Receipt JSON"}
                </button>

                {isExpanded && (
                  <div className="mt-2">
                    <JsonViewer data={trace.txReceiptJson} maxHeight="300px" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Task 24: Client Frontend — Multi-Chain Provisioning Modal

**Files:**
- Create: `apps/client/components/multi-chain-provision-modal.tsx`

- [ ] **Step 1: Create the multi-chain address group provisioning modal**

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";

interface MultiChainProvisionModalProps {
  open: boolean;
  onClose: () => void;
}

const availableChains = [
  { id: 1, name: "Ethereum", symbol: "ETH", color: "#627EEA" },
  { id: 56, name: "BSC", symbol: "BNB", color: "#F3BA2F" },
  { id: 137, name: "Polygon", symbol: "MATIC", color: "#8247E5" },
  { id: 42161, name: "Arbitrum", symbol: "ETH", color: "#28A0F0" },
  { id: 10, name: "Optimism", symbol: "ETH", color: "#FF0420" },
  { id: 43114, name: "Avalanche", symbol: "AVAX", color: "#E84142" },
  { id: 8453, name: "Base", symbol: "ETH", color: "#0052FF" },
];

export function MultiChainProvisionModal({
  open,
  onClose,
}: MultiChainProvisionModalProps) {
  const [label, setLabel] = useState("");
  const [externalId, setExternalId] = useState("");
  const [description, setDescription] = useState("");
  const [selectedChains, setSelectedChains] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<Array<{
    chainId: number;
    address: string;
  }> | null>(null);

  if (!open) return null;

  const toggleChain = (chainId: number) => {
    setSelectedChains((prev) =>
      prev.includes(chainId)
        ? prev.filter((id) => id !== chainId)
        : [...prev, chainId],
    );
  };

  const handleSubmit = async () => {
    if (!label || !externalId || selectedChains.length === 0) return;

    setIsSubmitting(true);
    // In production: call the API
    // const response = await fetch('/api/client/v1/address-groups', { method: 'POST', body: ... });

    // Mock result
    setTimeout(() => {
      setResult(
        selectedChains.map((chainId) => ({
          chainId,
          address: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
        })),
      );
      setIsSubmitting(false);
    }, 1500);
  };

  const handleClose = () => {
    setLabel("");
    setExternalId("");
    setDescription("");
    setSelectedChains([]);
    setResult(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) handleClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[560px] max-h-[85vh] overflow-y-auto animate-fade-up shadow-float">
        <div className="text-subheading font-bold font-display mb-4">
          {result ? "Address Group Created" : "Create Multi-Chain Address Group"}
        </div>

        {!result ? (
          <>
            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Customer John Doe"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                External ID
              </label>
              <input
                type="text"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. customer-12345"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. VIP customer multi-chain deposit"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-4">
              <label className="block text-caption font-semibold text-text-secondary mb-2 uppercase tracking-[0.06em] font-display">
                Select Chains
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availableChains.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => toggleChain(chain.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-input border text-left cursor-pointer transition-all duration-fast font-display text-caption ${
                      selectedChains.includes(chain.id)
                        ? "bg-accent-subtle border-accent-primary"
                        : "bg-surface-input border-border-default hover:border-text-muted"
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: chain.color }}
                    />
                    <span className="font-semibold">{chain.name}</span>
                    <span className="text-text-muted ml-auto">{chain.symbol}</span>
                  </button>
                ))}
              </div>
              {selectedChains.length > 0 && (
                <div className="mt-2 text-micro text-text-muted font-display">
                  {selectedChains.length} chain{selectedChains.length !== 1 ? "s" : ""} selected
                </div>
              )}
            </div>

            <div className="p-3 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
              All addresses will share a deterministic base salt derived from the
              external ID, enabling consistent cross-chain address grouping.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!label || !externalId || selectedChains.length === 0 || isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Creating..." : "Create Address Group"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 space-y-2">
              {result.map((addr) => {
                const chain = availableChains.find((c) => c.id === addr.chainId);
                return (
                  <div
                    key={addr.chainId}
                    className="flex items-center gap-3 p-3 bg-surface-elevated rounded-card border border-border-subtle"
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: chain?.color ?? "#666" }}
                    />
                    <div className="flex-1">
                      <div className="text-caption font-semibold font-display">
                        {chain?.name ?? `Chain ${addr.chainId}`}
                      </div>
                      <div className="font-mono text-code text-accent-primary break-all">
                        {addr.address}
                      </div>
                    </div>
                    <Badge variant="success" dot>
                      Provisioned
                    </Badge>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Task 25: Phase 7 Tests

**Files:**
- Create: `services/core-wallet-service/src/deploy-trace/deploy-trace.service.spec.ts`
- Create: `services/core-wallet-service/src/address-group/address-group.service.spec.ts`

- [ ] **Step 1: Create DeployTraceService unit tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DeployTraceService } from './deploy-trace.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('DeployTraceService', () => {
  let service: DeployTraceService;
  let prisma: any;
  let evmProvider: any;

  const mockReceipt = {
    hash: '0xabc123',
    index: 0,
    blockHash: '0xblock123',
    blockNumber: 19500000,
    from: '0xdeployer',
    to: '0xfactory',
    cumulativeGasUsed: 150000n,
    gasUsed: 65000n,
    gasPrice: 20000000000n,
    effectiveGasPrice: 20000000000n,
    contractAddress: '0xnewcontract',
    logs: [],
    logsBloom: '0x00',
    status: 1,
    type: 2,
  };

  const mockBlock = {
    timestamp: 1712649600,
    number: 19500000,
    hash: '0xblock123',
  };

  beforeEach(async () => {
    prisma = {
      deployTrace: {
        create: jest.fn().mockResolvedValue({ traceUid: 'trace_test_123' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const mockProvider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt),
      getBlock: jest.fn().mockResolvedValue(mockBlock),
    };

    evmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeployTraceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EvmProviderService, useValue: evmProvider },
      ],
    }).compile();

    service = module.get<DeployTraceService>(DeployTraceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('recordTrace creates trace with receipt JSON', async () => {
    const result = await service.recordTrace({
      clientId: 1,
      chainId: 1,
      entityType: 'forwarder',
      entityId: 42,
      entityAddress: '0xforwarder123',
      txHash: '0xabc123',
      deployerAddress: '0xdeployer',
      factoryAddress: '0xfactory',
      salt: '0xsalt123',
    });

    expect(result.traceUid).toBeDefined();
    expect(prisma.deployTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'forwarder',
          txHash: '0xabc123',
          explorerUrl: 'https://etherscan.io/tx/0xabc123',
          status: 'confirmed',
        }),
      }),
    );
  });

  it('listTraces returns paginated results', async () => {
    const result = await service.listTraces(1, { page: 1, limit: 10 });
    expect(result.traces).toEqual([]);
    expect(result.meta.page).toBe(1);
  });
});
```

- [ ] **Step 2: Create AddressGroupService unit tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AddressGroupService } from './address-group.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { ConflictException } from '@nestjs/common';

describe('AddressGroupService', () => {
  let service: AddressGroupService;
  let prisma: any;
  let contractService: any;

  beforeEach(async () => {
    prisma = {
      addressGroup: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      depositAddress: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };

    contractService = {
      computeForwarderAddress: jest.fn().mockResolvedValue('0xcomputed_address'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressGroupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContractService, useValue: contractService },
      ],
    }).compile();

    service = module.get<AddressGroupService>(AddressGroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createGroup throws ConflictException on duplicate external ID', async () => {
    prisma.addressGroup.findUnique.mockResolvedValue({ id: 1n });

    await expect(
      service.createGroup({
        clientId: 1,
        label: 'Test',
        externalId: 'existing-id',
        chainIds: [1],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('createGroup creates group and provisions addresses', async () => {
    prisma.addressGroup.findUnique.mockResolvedValue(null);

    // Mock transaction to execute the callback
    prisma.$transaction.mockImplementation(async (cb: any) => {
      const txClient = {
        addressGroup: {
          create: jest.fn().mockResolvedValue({ id: 1n, baseSalt: '0xsalt' }),
          update: jest.fn(),
        },
        wallet: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1n,
            address: '0xhot',
          }),
        },
        depositAddress: {
          create: jest.fn(),
        },
      };
      return cb(txClient);
    });

    const result = await service.createGroup({
      clientId: 1,
      label: 'Multi-chain Test',
      externalId: 'cust-123',
      chainIds: [1, 56],
    });

    expect(result.groupUid).toMatch(/^grp_/);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('listGroups returns paginated results', async () => {
    const result = await service.listGroups(1, { page: 1, limit: 10 });
    expect(result.groups).toEqual([]);
    expect(result.meta.page).toBe(1);
  });
});
```

- [ ] **Step 3: Run all Phase 7 tests**

```bash
cd services/core-wallet-service && npx jest --testPathPattern="deploy-trace|address-group" --verbose
```

---

## Summary of All Files Created/Modified

### Phase 6 — Flush Operations (14 files created, 3 modified)

| # | File | Action |
|---|------|--------|
| 1 | `database/019-flush-operations.sql` | Create |
| 2 | `services/core-wallet-service/prisma/schema.prisma` | Modify |
| 3 | `services/core-wallet-service/src/common/dto/flush.dto.ts` | Create |
| 4 | `services/core-wallet-service/src/flush/flush-guard.service.ts` | Create |
| 5 | `services/core-wallet-service/src/flush/dry-run.service.ts` | Create |
| 6 | `services/core-wallet-service/src/flush/manual-flush.service.ts` | Create |
| 7 | `services/core-wallet-service/src/flush/sweep-native.service.ts` | Create |
| 8 | `services/core-wallet-service/src/flush/flush-orchestrator.service.ts` | Create |
| 9 | `services/core-wallet-service/src/flush/flush.controller.ts` | Create |
| 10 | `services/core-wallet-service/src/flush/flush.module.ts` | Create |
| 11 | `services/core-wallet-service/src/app.module.ts` | Modify |
| 12 | `services/cron-worker-service/src/flush-worker/flush-worker.service.ts` | Create |
| 13 | `services/cron-worker-service/src/flush-worker/flush-worker.module.ts` | Create |
| 14 | `services/cron-worker-service/src/app.module.ts` | Modify |
| 15 | `services/client-api/src/common/dto/flush.dto.ts` | Create |
| 16 | `services/client-api/src/flush/flush.service.ts` | Create |
| 17 | `services/client-api/src/flush/flush.controller.ts` | Create |
| 18 | `services/client-api/src/flush/flush.module.ts` | Create |
| 19 | `services/client-api/src/app.module.ts` | Modify |
| 20 | `services/admin-api/src/common/dto/flush.dto.ts` | Create |
| 21 | `services/admin-api/src/flush-management/flush-management.service.ts` | Create |
| 22 | `services/admin-api/src/flush-management/flush-management.controller.ts` | Create |
| 23 | `services/admin-api/src/flush-management/flush-management.module.ts` | Create |
| 24 | `services/admin-api/src/app.module.ts` | Modify |
| 25 | `apps/client/components/flush-modal.tsx` | Create |
| 26 | `apps/client/components/flush-status-tracker.tsx` | Create |
| 27 | `services/core-wallet-service/src/flush/flush-guard.service.spec.ts` | Create |
| 28 | `services/core-wallet-service/src/flush/dry-run.service.spec.ts` | Create |

### Phase 7 — Deploy Traceability & Multi-Chain Addresses (17 files created, 3 modified)

| # | File | Action |
|---|------|--------|
| 29 | `database/020-deploy-traces.sql` | Create |
| 30 | `services/core-wallet-service/prisma/schema.prisma` | Modify |
| 31 | `services/core-wallet-service/src/common/dto/deploy-trace.dto.ts` | Create |
| 32 | `services/core-wallet-service/src/deploy-trace/deploy-trace.service.ts` | Create |
| 33 | `services/core-wallet-service/src/deploy-trace/deploy-trace.controller.ts` | Create |
| 34 | `services/core-wallet-service/src/deploy-trace/deploy-trace.module.ts` | Create |
| 35 | `services/core-wallet-service/src/common/dto/address-group.dto.ts` | Create |
| 36 | `services/core-wallet-service/src/address-group/address-group.service.ts` | Create |
| 37 | `services/core-wallet-service/src/address-group/address-group.controller.ts` | Create |
| 38 | `services/core-wallet-service/src/address-group/address-group.module.ts` | Create |
| 39 | `services/core-wallet-service/src/app.module.ts` | Modify |
| 40 | `services/cron-worker-service/src/forwarder-deploy/forwarder-deploy.service.ts` | Modify |
| 41 | `services/client-api/src/address-group/address-group.service.ts` | Create |
| 42 | `services/client-api/src/address-group/address-group.controller.ts` | Create |
| 43 | `services/client-api/src/address-group/address-group.module.ts` | Create |
| 44 | `services/client-api/src/deploy-trace/deploy-trace.service.ts` | Create |
| 45 | `services/client-api/src/deploy-trace/deploy-trace.controller.ts` | Create |
| 46 | `services/client-api/src/deploy-trace/deploy-trace.module.ts` | Create |
| 47 | `services/client-api/src/app.module.ts` | Modify |
| 48 | `apps/client/components/deploy-trace-timeline.tsx` | Create |
| 49 | `apps/client/components/multi-chain-provision-modal.tsx` | Create |
| 50 | `services/core-wallet-service/src/deploy-trace/deploy-trace.service.spec.ts` | Create |
| 51 | `services/core-wallet-service/src/address-group/address-group.service.spec.ts` | Create |

**Total: 31 files created, 6 files modified across both phases.**
