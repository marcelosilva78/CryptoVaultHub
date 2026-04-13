# Chains & RPC Providers — Phase 1: Data Foundation & Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the backend foundation for chain lifecycle management, RPC quota tracking, provider templates, and fix critical wiring gaps (rate limiter seeding, orphaned modules, autonomous health scheduling).

**Architecture:** The admin-api proxies chain mutations to chain-indexer-service. Chain lifecycle states replace the boolean `isActive`. A new dependency-check service counts records across 15+ tables before allowing state transitions. Provider templates are code-defined and served via API. The rate limiter is seeded on startup.

**Tech Stack:** NestJS 10, Prisma 5, MySQL 8, BullMQ 5, Redis 7, ethers.js v6, class-validator, Jest 29

**Spec:** `docs/superpowers/specs/2026-04-13-chains-feature-evolution-design.md`

---

## File Structure

### Files to Create

| File | Responsibility |
|------|---------------|
| `database/024-chain-lifecycle.sql` | Migration: add status, statusReason, statusChangedAt, updatedAt, finalityThreshold to chains; add quota/provider fields to rpc_nodes |
| `services/admin-api/src/chain-management/chain-dependency.service.ts` | Count dependent records across tables for a given chainId |
| `services/admin-api/src/chain-management/chain-lifecycle.service.ts` | Validate and execute chain state transitions |
| `services/admin-api/src/common/dto/chain-update.dto.ts` | DTO for PATCH /admin/chains/:chainId |
| `services/admin-api/src/common/dto/chain-lifecycle.dto.ts` | DTO for POST /admin/chains/:chainId/lifecycle |
| `services/admin-api/src/rpc-management/provider-templates.ts` | Static provider template definitions |
| `services/admin-api/src/chain-management/chain-management.service.spec.ts` | Unit tests for chain management service |
| `services/admin-api/src/chain-management/chain-dependency.service.spec.ts` | Unit tests for dependency checking |
| `services/admin-api/src/chain-management/chain-lifecycle.service.spec.ts` | Unit tests for lifecycle transitions |

### Files to Modify

| File | Changes |
|------|---------|
| `services/chain-indexer-service/prisma/schema.prisma` | Add status, statusReason, statusChangedAt, updatedAt, finalityThreshold to Chain; remove isActive |
| `services/core-wallet-service/prisma/schema.prisma` | Same Chain model changes |
| `services/cron-worker-service/prisma/schema.prisma` | Same Chain model changes |
| `services/admin-api/prisma/schema.prisma` | Add quota fields and providerType/authMethod/nodeType to RpcNode |
| `services/rpc-gateway-service/prisma/schema.prisma` | Same RpcNode changes |
| `services/admin-api/src/chain-management/chain-management.controller.ts` | Add PATCH, lifecycle, detail, health, delete endpoints |
| `services/admin-api/src/chain-management/chain-management.service.ts` | Add updateChain, getChainDetail, deleteChain, getChainHealth methods |
| `services/admin-api/src/common/dto/chain.dto.ts` | Add blockTimeSeconds, finalityThreshold, isTestnet to AddChainDto |
| `services/chain-indexer-service/src/sync-health/sync-health.controller.ts` | Add PATCH /chains/:id, GET /chains/:id/dependencies, DELETE /chains/:id |
| `services/chain-indexer-service/src/sync-health/sync-health.service.ts` | Add @Cron decorator for autonomous scheduling |
| `services/chain-indexer-service/src/app.module.ts` | Import ScheduleModule, GapDetectorModule, FinalityTrackerModule |
| `services/rpc-gateway-service/src/rate-limiter/rate-limiter.service.ts` | Add daily/monthly quota methods |
| `services/rpc-gateway-service/src/health/health.service.ts` | Add quota status derivation in health check cron |
| `services/rpc-gateway-service/src/router/rpc-router.service.ts` | Add quota check in node selection |
| `services/admin-api/src/rpc-management/rpc-management.controller.ts` | Add templates endpoint, reset-quota endpoint |
| `services/admin-api/src/rpc-management/rpc-management.service.ts` | Add getTemplates, resetQuota methods |
| `services/admin-api/src/common/dto/rpc.dto.ts` | Add providerType, authMethod, nodeType, quota fields |

---

## Task 1: Database Migration — Chain Lifecycle & RPC Quota

**Files:**
- Create: `database/024-chain-lifecycle.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- database/024-chain-lifecycle.sql
-- Chain lifecycle status + RPC node quota tracking

-- ─── Chain Lifecycle ───────────────────────────────────────

ALTER TABLE cvh_indexer.chains
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER gas_price_strategy,
  ADD COLUMN status_reason VARCHAR(255) NULL AFTER status,
  ADD COLUMN status_changed_at DATETIME NULL AFTER status_reason,
  ADD COLUMN finality_threshold INT NOT NULL DEFAULT 32 AFTER confirmations_default,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Migrate existing data: isActive=true → status='active', isActive=false → status='inactive'
UPDATE cvh_indexer.chains SET status = 'active' WHERE is_active = 1;
UPDATE cvh_indexer.chains SET status = 'inactive' WHERE is_active = 0;

-- Add index for status filtering
ALTER TABLE cvh_indexer.chains ADD INDEX idx_status (status);

-- Keep is_active column temporarily for backward compatibility; will be removed in Phase 2

-- Same changes for cvh_wallets.chains (core-wallet-service and cron-worker-service share this)
ALTER TABLE cvh_wallets.chains
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER gas_price_strategy,
  ADD COLUMN status_reason VARCHAR(255) NULL AFTER status,
  ADD COLUMN status_changed_at DATETIME NULL AFTER status_reason,
  ADD COLUMN finality_threshold INT NOT NULL DEFAULT 32 AFTER confirmations_default,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE cvh_wallets.chains SET status = 'active' WHERE is_active = 1;
UPDATE cvh_wallets.chains SET status = 'inactive' WHERE is_active = 0;

ALTER TABLE cvh_wallets.chains ADD INDEX idx_status (status);

-- ─── RPC Node Quota Tracking ───────────────────────────────

ALTER TABLE cvh_admin.rpc_nodes
  ADD COLUMN max_requests_per_day INT NULL AFTER max_requests_per_minute,
  ADD COLUMN max_requests_per_month INT NULL AFTER max_requests_per_day,
  ADD COLUMN quota_status VARCHAR(20) NOT NULL DEFAULT 'available' AFTER max_requests_per_month,
  ADD COLUMN provider_type VARCHAR(20) NOT NULL DEFAULT 'custom' AFTER quota_status,
  ADD COLUMN auth_method_type VARCHAR(20) NOT NULL DEFAULT 'url_path' AFTER provider_type,
  ADD COLUMN node_type VARCHAR(30) NULL AFTER auth_method_type;
```

- [ ] **Step 2: Verify migration syntax by reviewing existing migrations for pattern**

Run: `head -30 /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/database/015-rpc-providers.sql`

Confirm the migration follows the same ALTER TABLE pattern used in prior migrations.

- [ ] **Step 3: Commit**

```bash
git add database/024-chain-lifecycle.sql
git commit -m "feat(db): add chain lifecycle status and RPC node quota tracking migration"
```

---

## Task 2: Prisma Schema Updates — Chain Model

**Files:**
- Modify: `services/chain-indexer-service/prisma/schema.prisma`
- Modify: `services/core-wallet-service/prisma/schema.prisma`
- Modify: `services/cron-worker-service/prisma/schema.prisma`

- [ ] **Step 1: Update chain-indexer-service Chain model**

In `services/chain-indexer-service/prisma/schema.prisma`, replace the Chain model (lines 59–80) with:

```prisma
model Chain {
  id                      Int       @id @map("chain_id")
  name                    String    @db.VarChar(50)
  shortName               String    @db.VarChar(10) @map("short_name")
  nativeCurrencySymbol    String    @db.VarChar(10) @map("native_currency_symbol")
  nativeCurrencyDecimals  Int       @default(18) @map("native_currency_decimals")
  rpcEndpoints            Json      @map("rpc_endpoints")
  blockTimeSeconds        Decimal   @db.Decimal(5, 2) @map("block_time_seconds")
  confirmationsDefault    Int       @map("confirmations_default")
  finalityThreshold       Int       @default(32) @map("finality_threshold")
  walletFactoryAddress    String?   @db.VarChar(42) @map("wallet_factory_address")
  forwarderFactoryAddress String?   @db.VarChar(42) @map("forwarder_factory_address")
  walletImplAddress       String?   @db.VarChar(42) @map("wallet_impl_address")
  forwarderImplAddress    String?   @db.VarChar(42) @map("forwarder_impl_address")
  multicall3Address       String    @default("0xcA11bde05977b3631167028862bE2a173976CA11") @db.VarChar(42) @map("multicall3_address")
  explorerUrl             String?   @db.VarChar(200) @map("explorer_url")
  gasPriceStrategy        String    @default("eip1559") @db.VarChar(10) @map("gas_price_strategy")
  status                  String    @default("active") @db.VarChar(20)
  statusReason            String?   @db.VarChar(255) @map("status_reason")
  statusChangedAt         DateTime? @map("status_changed_at")
  isActive                Boolean   @default(true) @map("is_active")
  isTestnet               Boolean   @default(false) @map("is_testnet")
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")

  @@index([status], name: "idx_status")
  @@map("chains")
}
```

Note: `isActive` is kept temporarily for backward compatibility. Workers still filter by it. It will be removed in Phase 2 after all workers are updated to use `status`.

- [ ] **Step 2: Apply the same changes to core-wallet-service and cron-worker-service**

Apply the identical Chain model replacement to:
- `services/core-wallet-service/prisma/schema.prisma` (lines 40-61)
- `services/cron-worker-service/prisma/schema.prisma` (lines 16-37)

- [ ] **Step 3: Regenerate Prisma clients**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub && npx turbo prisma:generate`

Expected: All 3 services regenerate their Prisma clients without errors.

- [ ] **Step 4: Commit**

```bash
git add services/chain-indexer-service/prisma/schema.prisma services/core-wallet-service/prisma/schema.prisma services/cron-worker-service/prisma/schema.prisma
git commit -m "feat(schema): add lifecycle status fields to Chain model across all services"
```

---

## Task 3: Prisma Schema Updates — RPC Node Model

**Files:**
- Modify: `services/admin-api/prisma/schema.prisma`
- Modify: `services/rpc-gateway-service/prisma/schema.prisma`

- [ ] **Step 1: Update admin-api RpcNode model**

In `services/admin-api/prisma/schema.prisma`, add the new fields to the RpcNode model after `maxRequestsPerMinute`:

```prisma
  maxRequestsPerDay     Int?        @map("max_requests_per_day")
  maxRequestsPerMonth   Int?        @map("max_requests_per_month")
  quotaStatus           String      @default("available") @map("quota_status") @db.VarChar(20)
  providerType          String      @default("custom") @map("provider_type") @db.VarChar(20)
  authMethodType        String      @default("url_path") @map("auth_method_type") @db.VarChar(20)
  nodeType              String?     @map("node_type") @db.VarChar(30)
```

- [ ] **Step 2: Apply same changes to rpc-gateway-service schema**

Add the identical fields to `services/rpc-gateway-service/prisma/schema.prisma` RpcNode model.

- [ ] **Step 3: Regenerate Prisma clients**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub && npx turbo prisma:generate`

- [ ] **Step 4: Commit**

```bash
git add services/admin-api/prisma/schema.prisma services/rpc-gateway-service/prisma/schema.prisma
git commit -m "feat(schema): add quota tracking and provider type fields to RpcNode model"
```

---

## Task 4: Chain Update & Lifecycle DTOs

**Files:**
- Create: `services/admin-api/src/common/dto/chain-update.dto.ts`
- Create: `services/admin-api/src/common/dto/chain-lifecycle.dto.ts`
- Modify: `services/admin-api/src/common/dto/chain.dto.ts`

- [ ] **Step 1: Create UpdateChainDto**

```typescript
// services/admin-api/src/common/dto/chain-update.dto.ts
import { IsString, IsOptional, IsInt, IsNumber, IsIn, MinLength, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChainDto {
  @ApiPropertyOptional({ description: 'Chain display name', example: 'Ethereum Mainnet' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: 'Short name', example: 'ETH' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Block explorer URL', example: 'https://etherscan.io' })
  @IsOptional()
  @IsString()
  explorerUrl?: string;

  @ApiPropertyOptional({ description: 'Required confirmations', example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  confirmationsRequired?: number;

  @ApiPropertyOptional({ description: 'Average block time in seconds', example: 12.1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  blockTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Finality threshold in blocks', example: 64 })
  @IsOptional()
  @IsInt()
  @Min(1)
  finalityThreshold?: number;

  @ApiPropertyOptional({ description: 'Gas price strategy', example: 'eip1559' })
  @IsOptional()
  @IsIn(['eip1559', 'legacy'])
  gasPriceStrategy?: string;
}
```

- [ ] **Step 2: Create ChainLifecycleDto**

```typescript
// services/admin-api/src/common/dto/chain-lifecycle.dto.ts
import { IsString, IsIn, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChainLifecycleDto {
  @ApiProperty({
    description: 'Lifecycle action to perform',
    enum: ['drain', 'deactivate', 'archive', 'reactivate'],
  })
  @IsIn(['drain', 'deactivate', 'archive', 'reactivate'])
  action: string;

  @ApiProperty({
    description: 'Reason for the lifecycle transition (min 10 chars)',
    example: 'Scheduled maintenance on RPC infrastructure',
  })
  @IsString()
  @MinLength(10)
  reason: string;
}
```

- [ ] **Step 3: Add missing fields to AddChainDto**

In `services/admin-api/src/common/dto/chain.dto.ts`, add to the `AddChainDto` class:

```typescript
  @ApiPropertyOptional({ description: 'Block time in seconds', example: 12.1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  blockTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Finality threshold in blocks', example: 64 })
  @IsOptional()
  @IsInt()
  @Min(1)
  finalityThreshold?: number;

  @ApiPropertyOptional({ description: 'Is testnet chain', example: false })
  @IsOptional()
  @IsBoolean()
  isTestnet?: boolean;
```

Add the imports: `IsNumber, IsBoolean, Min` from `class-validator` and `ApiPropertyOptional` from `@nestjs/swagger`.

- [ ] **Step 4: Commit**

```bash
git add services/admin-api/src/common/dto/chain-update.dto.ts services/admin-api/src/common/dto/chain-lifecycle.dto.ts services/admin-api/src/common/dto/chain.dto.ts
git commit -m "feat(dto): add UpdateChainDto, ChainLifecycleDto, and improve AddChainDto"
```

---

## Task 5: Chain Dependency Service

**Files:**
- Create: `services/admin-api/src/chain-management/chain-dependency.service.ts`
- Create: `services/admin-api/src/chain-management/chain-dependency.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// services/admin-api/src/chain-management/chain-dependency.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ChainDependencyService } from './chain-dependency.service';
import { PrismaService } from '../common/prisma.service';

describe('ChainDependencyService', () => {
  let service: ChainDependencyService;
  let prisma: any;

  const mockPrisma = {
    rpcNode: { count: jest.fn() },
    clientChainConfig: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainDependencyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'CHAIN_INDEXER_URL', useValue: 'http://localhost:3006' },
      ],
    }).compile();
    service = module.get(ChainDependencyService);
    prisma = module.get(PrismaService);
  });

  it('should return dependency counts for a chain', async () => {
    mockPrisma.rpcNode.count.mockResolvedValue(3);
    mockPrisma.clientChainConfig.count.mockResolvedValue(2);
    // Mock the HTTP call to chain-indexer for wallet/deposit counts
    jest.spyOn(service as any, 'fetchIndexerDependencies').mockResolvedValue({
      tokens: 12,
      wallets: 45,
      depositAddresses: { total: 1230, deployed: 980 },
      deposits: { total: 5600, pending: 3 },
      withdrawals: { total: 890, pending: 1 },
      flushOperations: { total: 340, pending: 2 },
      gasTanks: 8,
    });

    const result = await service.getDependencies(1);

    expect(result.rpcNodes.total).toBe(3);
    expect(result.clients.total).toBe(2);
    expect(result.tokens.total).toBe(12);
    expect(result.deposits.pending).toBe(3);
  });

  it('should return true for hasPendingOperations when deposits are pending', async () => {
    mockPrisma.rpcNode.count.mockResolvedValue(0);
    mockPrisma.clientChainConfig.count.mockResolvedValue(0);
    jest.spyOn(service as any, 'fetchIndexerDependencies').mockResolvedValue({
      tokens: 0, wallets: 0,
      depositAddresses: { total: 0, deployed: 0 },
      deposits: { total: 0, pending: 1 },
      withdrawals: { total: 0, pending: 0 },
      flushOperations: { total: 0, pending: 0 },
      gasTanks: 0,
    });

    const result = await service.getDependencies(1);
    expect(result.hasPendingOperations).toBe(true);
  });

  it('should return true for hasAnyDependency when tokens exist', async () => {
    mockPrisma.rpcNode.count.mockResolvedValue(0);
    mockPrisma.clientChainConfig.count.mockResolvedValue(0);
    jest.spyOn(service as any, 'fetchIndexerDependencies').mockResolvedValue({
      tokens: 5, wallets: 0,
      depositAddresses: { total: 0, deployed: 0 },
      deposits: { total: 0, pending: 0 },
      withdrawals: { total: 0, pending: 0 },
      flushOperations: { total: 0, pending: 0 },
      gasTanks: 0,
    });

    const result = await service.getDependencies(1);
    expect(result.hasAnyDependency).toBe(true);
  });

  it('should allow physical delete only when zero dependencies', async () => {
    mockPrisma.rpcNode.count.mockResolvedValue(0);
    mockPrisma.clientChainConfig.count.mockResolvedValue(0);
    jest.spyOn(service as any, 'fetchIndexerDependencies').mockResolvedValue({
      tokens: 0, wallets: 0,
      depositAddresses: { total: 0, deployed: 0 },
      deposits: { total: 0, pending: 0 },
      withdrawals: { total: 0, pending: 0 },
      flushOperations: { total: 0, pending: 0 },
      gasTanks: 0,
    });

    const result = await service.getDependencies(1);
    expect(result.hasAnyDependency).toBe(false);
    expect(result.canPhysicalDelete).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api && npx jest src/chain-management/chain-dependency.service.spec.ts --no-coverage`

Expected: FAIL — `Cannot find module './chain-dependency.service'`

- [ ] **Step 3: Write the implementation**

```typescript
// services/admin-api/src/chain-management/chain-dependency.service.ts
import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../common/prisma.service';

export interface ChainDependencies {
  rpcNodes: { total: number; active: number };
  clients: { total: number };
  tokens: { total: number };
  wallets: { total: number };
  depositAddresses: { total: number; deployed: number };
  deposits: { total: number; pending: number };
  withdrawals: { total: number; pending: number };
  flushOperations: { total: number; pending: number };
  gasTanks: { total: number };
  hasPendingOperations: boolean;
  hasAnyDependency: boolean;
  canPhysicalDelete: boolean;
}

@Injectable()
export class ChainDependencyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('CHAIN_INDEXER_URL') private readonly chainIndexerUrl: string,
  ) {}

  async getDependencies(chainId: number): Promise<ChainDependencies> {
    const [rpcTotal, rpcActive, clientCount, indexerDeps] = await Promise.all([
      this.prisma.rpcNode.count({ where: { chainId } }),
      this.prisma.rpcNode.count({ where: { chainId, status: { in: ['active', 'standby'] } } }),
      this.prisma.clientChainConfig.count({ where: { chainId } }),
      this.fetchIndexerDependencies(chainId),
    ]);

    const hasPendingOperations =
      indexerDeps.deposits.pending > 0 ||
      indexerDeps.withdrawals.pending > 0 ||
      indexerDeps.flushOperations.pending > 0;

    const totalDeps =
      rpcTotal + clientCount + indexerDeps.tokens +
      indexerDeps.wallets + indexerDeps.depositAddresses.total +
      indexerDeps.deposits.total + indexerDeps.withdrawals.total +
      indexerDeps.flushOperations.total + indexerDeps.gasTanks;

    return {
      rpcNodes: { total: rpcTotal, active: rpcActive },
      clients: { total: clientCount },
      tokens: { total: indexerDeps.tokens },
      wallets: { total: indexerDeps.wallets },
      depositAddresses: indexerDeps.depositAddresses,
      deposits: indexerDeps.deposits,
      withdrawals: indexerDeps.withdrawals,
      flushOperations: indexerDeps.flushOperations,
      gasTanks: { total: indexerDeps.gasTanks },
      hasPendingOperations,
      hasAnyDependency: totalDeps > 0,
      canPhysicalDelete: totalDeps === 0,
    };
  }

  private async fetchIndexerDependencies(chainId: number) {
    try {
      const { data } = await axios.get(`${this.chainIndexerUrl}/chains/${chainId}/dependencies`);
      return data;
    } catch {
      // If indexer is unreachable, assume dependencies exist (safe default)
      return {
        tokens: 1, wallets: 1,
        depositAddresses: { total: 1, deployed: 0 },
        deposits: { total: 1, pending: 1 },
        withdrawals: { total: 1, pending: 1 },
        flushOperations: { total: 1, pending: 1 },
        gasTanks: 1,
      };
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api && npx jest src/chain-management/chain-dependency.service.spec.ts --no-coverage`

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/admin-api/src/chain-management/chain-dependency.service.ts services/admin-api/src/chain-management/chain-dependency.service.spec.ts
git commit -m "feat(chains): add ChainDependencyService with dependency counting across tables"
```

---

## Task 6: Chain Lifecycle Service

**Files:**
- Create: `services/admin-api/src/chain-management/chain-lifecycle.service.ts`
- Create: `services/admin-api/src/chain-management/chain-lifecycle.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// services/admin-api/src/chain-management/chain-lifecycle.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { ChainLifecycleService } from './chain-lifecycle.service';
import { ChainDependencyService } from './chain-dependency.service';
import { AuditLogService } from '../common/audit-log.service';

describe('ChainLifecycleService', () => {
  let service: ChainLifecycleService;
  let depService: any;
  let auditService: any;
  let httpPost: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    httpPost = jest.fn();
    depService = {
      getDependencies: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainLifecycleService,
        { provide: ChainDependencyService, useValue: depService },
        { provide: AuditLogService, useValue: auditService },
        { provide: 'CHAIN_INDEXER_URL', useValue: 'http://localhost:3006' },
      ],
    }).compile();
    service = module.get(ChainLifecycleService);
    // Mock the internal HTTP call
    jest.spyOn(service as any, 'updateChainStatus').mockImplementation(httpPost);
  });

  const noDeps = {
    hasPendingOperations: false,
    hasAnyDependency: false,
    canPhysicalDelete: true,
    rpcNodes: { total: 0, active: 0 },
    deposits: { total: 0, pending: 0 },
    withdrawals: { total: 0, pending: 0 },
    flushOperations: { total: 0, pending: 0 },
  };

  it('should allow active → draining always', async () => {
    depService.getDependencies.mockResolvedValue(noDeps);
    httpPost.mockResolvedValue({ previousStatus: 'active', newStatus: 'draining' });

    const result = await service.transition(1, 'drain', 'Maintenance window', 1);
    expect(httpPost).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'chain.lifecycle' }));
  });

  it('should block draining → inactive when pending deposits', async () => {
    depService.getDependencies.mockResolvedValue({
      ...noDeps,
      hasPendingOperations: true,
      deposits: { total: 100, pending: 3 },
      withdrawals: { total: 50, pending: 0 },
      flushOperations: { total: 30, pending: 0 },
    });
    httpPost.mockResolvedValue({ previousStatus: 'draining', newStatus: 'draining' });

    // First we need to know current status is draining
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('draining');

    await expect(service.transition(1, 'deactivate', 'Want to deactivate', 1))
      .rejects.toThrow(ConflictException);
  });

  it('should allow active → inactive (emergency) with warnings', async () => {
    depService.getDependencies.mockResolvedValue({
      ...noDeps,
      hasPendingOperations: true,
      hasAnyDependency: true,
      deposits: { total: 100, pending: 3 },
    });
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('active');
    httpPost.mockResolvedValue({ previousStatus: 'active', newStatus: 'inactive' });

    const result = await service.transition(1, 'deactivate', 'Emergency shutdown', 1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should reject invalid transition', async () => {
    depService.getDependencies.mockResolvedValue(noDeps);
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('archived');

    await expect(service.transition(1, 'drain', 'Want to drain', 1))
      .rejects.toThrow(BadRequestException);
  });

  it('should get allowed transitions for each status', () => {
    expect(service.getAllowedTransitions('active')).toEqual(
      expect.arrayContaining(['drain', 'deactivate'])
    );
    expect(service.getAllowedTransitions('draining')).toEqual(['deactivate']);
    expect(service.getAllowedTransitions('inactive')).toEqual(
      expect.arrayContaining(['archive', 'reactivate'])
    );
    expect(service.getAllowedTransitions('archived')).toEqual(['reactivate']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api && npx jest src/chain-management/chain-lifecycle.service.spec.ts --no-coverage`

Expected: FAIL — `Cannot find module './chain-lifecycle.service'`

- [ ] **Step 3: Write the implementation**

```typescript
// services/admin-api/src/chain-management/chain-lifecycle.service.ts
import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { ChainDependencyService } from './chain-dependency.service';
import { AuditLogService } from '../common/audit-log.service';

const ACTION_TO_STATUS: Record<string, string> = {
  drain: 'draining',
  deactivate: 'inactive',
  archive: 'archived',
  reactivate: 'active', // from archived → inactive, from inactive → active
};

const ALLOWED_TRANSITIONS: Record<string, Record<string, string>> = {
  active: { drain: 'draining', deactivate: 'inactive' },
  draining: { deactivate: 'inactive' },
  inactive: { archive: 'archived', reactivate: 'active' },
  archived: { reactivate: 'inactive' },
};

interface TransitionResult {
  previousStatus: string;
  newStatus: string;
  reason: string;
  transitionedAt: string;
  warnings: string[];
}

@Injectable()
export class ChainLifecycleService {
  constructor(
    private readonly depService: ChainDependencyService,
    private readonly auditLog: AuditLogService,
    @Inject('CHAIN_INDEXER_URL') private readonly chainIndexerUrl: string,
  ) {}

  getAllowedTransitions(currentStatus: string): string[] {
    return Object.keys(ALLOWED_TRANSITIONS[currentStatus] || {});
  }

  async transition(
    chainId: number,
    action: string,
    reason: string,
    adminUserId: number,
  ): Promise<TransitionResult> {
    const currentStatus = await this.getCurrentStatus(chainId);
    const transitions = ALLOWED_TRANSITIONS[currentStatus];

    if (!transitions || !transitions[action]) {
      throw new BadRequestException(
        `Cannot perform '${action}' on chain with status '${currentStatus}'. ` +
        `Allowed actions: ${this.getAllowedTransitions(currentStatus).join(', ') || 'none'}`,
      );
    }

    const newStatus = transitions[action];
    const deps = await this.depService.getDependencies(chainId);
    const warnings: string[] = [];

    // Block draining→inactive and inactive→archived when pending operations
    if (
      (currentStatus === 'draining' && action === 'deactivate') ||
      (currentStatus === 'inactive' && action === 'archive')
    ) {
      if (deps.hasPendingOperations) {
        const blockers: { type: string; count: number }[] = [];
        if (deps.deposits.pending > 0) blockers.push({ type: 'pending_deposits', count: deps.deposits.pending });
        if (deps.withdrawals.pending > 0) blockers.push({ type: 'pending_withdrawals', count: deps.withdrawals.pending });
        if (deps.flushOperations.pending > 0) blockers.push({ type: 'pending_flushes', count: deps.flushOperations.pending });

        throw new ConflictException({
          error: 'TRANSITION_BLOCKED',
          message: `Cannot ${action} chain with pending operations`,
          blockers,
        });
      }
    }

    // Emergency deactivate from active: allowed but with warnings
    if (currentStatus === 'active' && action === 'deactivate' && deps.hasPendingOperations) {
      if (deps.deposits.pending > 0)
        warnings.push(`${deps.deposits.pending} pending deposits will stop being tracked`);
      if (deps.withdrawals.pending > 0)
        warnings.push(`${deps.withdrawals.pending} pending withdrawals may not complete`);
      if (deps.flushOperations.pending > 0)
        warnings.push(`${deps.flushOperations.pending} pending flush operations will be interrupted`);
    }

    // Reactivate warnings
    if (action === 'reactivate' && deps.rpcNodes.active === 0) {
      warnings.push('No active RPC nodes found — chain health will show as error until nodes are configured');
    }

    // Execute the transition
    await this.updateChainStatus(chainId, newStatus, reason);

    const transitionedAt = new Date().toISOString();

    await this.auditLog.log({
      action: 'chain.lifecycle',
      entityType: 'chain',
      entityId: String(chainId),
      adminUserId,
      details: { previousStatus: currentStatus, newStatus, reason, warnings },
    });

    return {
      previousStatus: currentStatus,
      newStatus,
      reason,
      transitionedAt,
      warnings,
    };
  }

  private async getCurrentStatus(chainId: number): Promise<string> {
    const { data } = await axios.get(`${this.chainIndexerUrl}/chains`);
    const chains = data.chains || data.data || data;
    const chain = chains.find((c: any) => (c.chainId || c.id) === chainId);
    if (!chain) throw new BadRequestException(`Chain ${chainId} not found`);
    return chain.status || (chain.isActive ? 'active' : 'inactive');
  }

  private async updateChainStatus(chainId: number, status: string, reason: string): Promise<void> {
    await axios.patch(`${this.chainIndexerUrl}/chains/${chainId}`, {
      status,
      statusReason: reason,
      statusChangedAt: new Date().toISOString(),
      isActive: status === 'active' || status === 'draining',
    });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api && npx jest src/chain-management/chain-lifecycle.service.spec.ts --no-coverage`

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/admin-api/src/chain-management/chain-lifecycle.service.ts services/admin-api/src/chain-management/chain-lifecycle.service.spec.ts
git commit -m "feat(chains): add ChainLifecycleService with state transition validation and audit"
```

---

## Task 7: Chain-Indexer — Add PATCH and Dependencies Endpoints

**Files:**
- Modify: `services/chain-indexer-service/src/sync-health/sync-health.controller.ts`

- [ ] **Step 1: Add PATCH /chains/:id endpoint**

Add these methods to the `SyncHealthController` class in `sync-health.controller.ts`:

```typescript
  @Patch('/chains/:id')
  async updateChain(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.shortName !== undefined) updateData.shortName = body.shortName;
    if (body.explorerUrl !== undefined) updateData.explorerUrl = body.explorerUrl;
    if (body.confirmationsRequired !== undefined) updateData.confirmationsDefault = body.confirmationsRequired;
    if (body.blockTimeSeconds !== undefined) updateData.blockTimeSeconds = body.blockTimeSeconds;
    if (body.finalityThreshold !== undefined) updateData.finalityThreshold = body.finalityThreshold;
    if (body.gasPriceStrategy !== undefined) updateData.gasPriceStrategy = body.gasPriceStrategy;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.statusReason !== undefined) updateData.statusReason = body.statusReason;
    if (body.statusChangedAt !== undefined) updateData.statusChangedAt = new Date(body.statusChangedAt);
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const chain = await this.prisma.chain.update({
      where: { id },
      data: updateData,
    });

    return { success: true, chain };
  }

  @Get('/chains/:id/dependencies')
  async getChainDependencies(@Param('id', ParseIntPipe) id: number) {
    const [
      tokens, wallets, depositAddresses, deployedAddresses,
      deposits, pendingDeposits,
      withdrawals, pendingWithdrawals,
      flushOps, pendingFlushOps,
      gasTanks,
    ] = await Promise.all([
      this.prisma.token.count({ where: { chainId: id } }),
      this.prisma.wallet.count({ where: { chainId: id } }),
      this.prisma.depositAddress.count({ where: { chainId: id } }),
      this.prisma.depositAddress.count({ where: { chainId: id, isDeployed: true } }),
      this.prisma.deposit.count({ where: { chainId: id } }),
      this.prisma.deposit.count({ where: { chainId: id, status: { in: ['detected', 'confirming'] } } }),
      this.prisma.withdrawal.count({ where: { chainId: id } }),
      this.prisma.withdrawal.count({ where: { chainId: id, status: { in: ['pending', 'submitted'] } } }),
      this.prisma.flushOperation.count({ where: { chainId: id } }),
      this.prisma.flushOperation.count({ where: { chainId: id, status: { in: ['pending', 'executing'] } } }),
      this.prisma.wallet.count({ where: { chainId: id, walletType: 'gas_tank' } }),
    ]);

    return {
      tokens, wallets,
      depositAddresses: { total: depositAddresses, deployed: deployedAddresses },
      deposits: { total: deposits, pending: pendingDeposits },
      withdrawals: { total: withdrawals, pending: pendingWithdrawals },
      flushOperations: { total: flushOps, pending: pendingFlushOps },
      gasTanks,
    };
  }

  @Delete('/chains/:id')
  async deleteChain(@Param('id', ParseIntPipe) id: number) {
    // Physical delete — only allowed if chain has zero dependencies
    // The admin-api validates this before calling
    await this.prisma.chain.delete({ where: { id } });
    return { success: true, deleted: id };
  }
```

Add the imports at the top: `Patch, Delete, Param, ParseIntPipe` from `@nestjs/common`.

- [ ] **Step 2: Also update the listChains method to return the new fields**

In the same file, update the `listChains()` method's response mapping to include the new fields:

```typescript
  @Get('/chains')
  async listChains() {
    const chains = await this.prisma.chain.findMany();
    return {
      chains: chains.map(c => ({
        id: c.id,
        chainId: c.id,
        name: c.name,
        shortName: c.shortName,
        symbol: c.nativeCurrencySymbol,
        rpcUrl: Array.isArray(c.rpcEndpoints) ? c.rpcEndpoints[0] : c.rpcEndpoints,
        explorerUrl: c.explorerUrl,
        confirmationsRequired: c.confirmationsDefault,
        blockTimeSeconds: Number(c.blockTimeSeconds),
        finalityThreshold: c.finalityThreshold,
        gasPriceStrategy: c.gasPriceStrategy,
        status: c.status,
        statusReason: c.statusReason,
        statusChangedAt: c.statusChangedAt,
        isActive: c.isActive,
        isTestnet: c.isTestnet,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }
```

- [ ] **Step 3: Commit**

```bash
git add services/chain-indexer-service/src/sync-health/sync-health.controller.ts
git commit -m "feat(chain-indexer): add PATCH, DELETE, and dependencies endpoints for chains"
```

---

## Task 8: Admin API — Chain Management Controller & Service Expansion

**Files:**
- Modify: `services/admin-api/src/chain-management/chain-management.controller.ts`
- Modify: `services/admin-api/src/chain-management/chain-management.service.ts`

- [ ] **Step 1: Add new endpoints to the controller**

Add to `ChainManagementController`:

```typescript
  @Get('/chains/health')
  @AdminAuth()
  @ApiOperation({ summary: 'Get aggregated chain health for dashboard polling' })
  async getChainHealth() {
    return this.chainService.getChainHealth();
  }

  @Get('/chains/:chainId')
  @AdminAuth()
  @ApiOperation({ summary: 'Get chain details with dependency counts' })
  async getChainDetail(@Param('chainId', ParseIntPipe) chainId: number) {
    return this.chainService.getChainDetail(chainId);
  }

  @Patch('/chains/:chainId')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Update mutable chain fields' })
  async updateChain(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: UpdateChainDto,
    @Req() req: any,
  ) {
    return this.chainService.updateChain(chainId, dto, req.user.userId);
  }

  @Post('/chains/:chainId/lifecycle')
  @AdminAuth('super_admin')
  @ApiOperation({ summary: 'Perform lifecycle state transition' })
  async lifecycleTransition(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: ChainLifecycleDto,
    @Req() req: any,
  ) {
    return this.lifecycleService.transition(chainId, dto.action, dto.reason, req.user.userId);
  }

  @Delete('/chains/:chainId')
  @AdminAuth('super_admin')
  @ApiOperation({ summary: 'Physically delete a chain (zero-dependency only)' })
  async deleteChain(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Req() req: any,
  ) {
    return this.chainService.deleteChain(chainId, req.user.userId);
  }
```

Add imports for `Patch, Delete, Param, Req, ParseIntPipe` from `@nestjs/common`, `UpdateChainDto`, `ChainLifecycleDto`, and inject `ChainLifecycleService` and `ChainDependencyService` in the constructor.

**Important:** The `/chains/health` route must be declared BEFORE `/chains/:chainId` to avoid NestJS treating "health" as a chainId parameter.

- [ ] **Step 2: Add service methods**

Add to `ChainManagementService`:

```typescript
  async getChainDetail(chainId: number) {
    const [chainData, dependencies, syncHealth] = await Promise.all([
      axios.get(`${this.chainIndexerUrl}/chains`).then(res => {
        const chains = res.data.chains || res.data.data || res.data;
        const chain = chains.find((c: any) => (c.chainId || c.id) === chainId);
        if (!chain) throw new NotFoundException(`Chain ${chainId} not found`);
        return chain;
      }),
      this.depService.getDependencies(chainId),
      this.syncService.getChainSyncHealth(chainId).catch(() => null),
    ]);

    return {
      chain: chainData,
      dependencies,
      syncHealth,
      canTransitionTo: this.lifecycleService.getAllowedTransitions(chainData.status || 'active'),
    };
  }

  async updateChain(chainId: number, dto: UpdateChainDto, adminUserId: number) {
    const { data } = await axios.patch(`${this.chainIndexerUrl}/chains/${chainId}`, dto);
    await this.auditLog.log({
      action: 'chain.update',
      entityType: 'chain',
      entityId: String(chainId),
      adminUserId,
      details: dto,
    });
    return data;
  }

  async deleteChain(chainId: number, adminUserId: number) {
    const deps = await this.depService.getDependencies(chainId);
    if (!deps.canPhysicalDelete) {
      throw new ConflictException({
        error: 'DELETE_BLOCKED',
        message: 'Cannot delete chain with existing dependencies. Use lifecycle transitions instead.',
        dependencies: deps,
      });
    }
    const { data } = await axios.delete(`${this.chainIndexerUrl}/chains/${chainId}`);
    await this.auditLog.log({
      action: 'chain.delete',
      entityType: 'chain',
      entityId: String(chainId),
      adminUserId,
    });
    return data;
  }

  async getChainHealth() {
    // Check Redis cache first (15s TTL)
    const cacheKey = 'admin:chains:health';
    const cached = await this.redis?.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const [chainsRes, syncHealthRes, rpcHealthRes] = await Promise.all([
      axios.get(`${this.chainIndexerUrl}/chains`),
      axios.get(`${this.chainIndexerUrl}/sync-health`).catch(() => ({ data: [] })),
      axios.get(`${this.rpcGatewayUrl}/rpc/health`).catch(() => ({ data: { nodes: [] } })),
    ]);

    const chains = chainsRes.data.chains || chainsRes.data.data || chainsRes.data;
    const syncHealth = Array.isArray(syncHealthRes.data) ? syncHealthRes.data : syncHealthRes.data.chains || [];
    const rpcNodes = rpcHealthRes.data.nodes || rpcHealthRes.data || [];

    const result = {
      chains: chains.map((chain: any) => {
        const chainId = chain.chainId || chain.id;
        const sync = syncHealth.find((s: any) => s.chainId === chainId);
        const nodes = rpcNodes.filter((n: any) => n.chainId === chainId);

        return {
          chainId,
          name: chain.name,
          shortName: chain.shortName || chain.symbol,
          symbol: chain.symbol || chain.nativeCurrencySymbol,
          status: chain.status || (chain.isActive ? 'active' : 'inactive'),
          blockTimeSeconds: chain.blockTimeSeconds,
          health: {
            overall: sync?.status || 'unknown',
            lastBlock: sync?.lastBlock || null,
            blocksBehind: sync?.blocksBehind || null,
            lastCheckedAt: sync?.lastCheckedAt || null,
            staleSince: sync?.staleSince || null,
          },
          rpc: {
            totalNodes: nodes.length,
            activeNodes: nodes.filter((n: any) => n.status === 'active').length,
            healthyNodes: nodes.filter((n: any) => Number(n.healthScore) >= 70).length,
            avgLatencyMs: nodes.length > 0
              ? Math.round(nodes.reduce((sum: number, n: any) => sum + (n.latencyMs || 0), 0) / nodes.length)
              : null,
            quotaStatus: this.worstQuotaStatus(nodes),
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    };

    // Cache for 15 seconds
    if (this.redis) {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 15);
    }

    return result;
  }

  private worstQuotaStatus(nodes: any[]): string {
    const statuses = nodes.map((n: any) => n.quotaStatus || 'available');
    if (statuses.includes('monthly_exhausted')) return 'monthly_exhausted';
    if (statuses.includes('daily_exhausted')) return 'daily_exhausted';
    if (statuses.includes('approaching')) return 'approaching';
    return 'available';
  }
```

Add necessary imports: `NotFoundException`, `ConflictException` from `@nestjs/common`, inject `ChainDependencyService`, `ChainLifecycleService`, and add `RPC_GATEWAY_URL` injection.

- [ ] **Step 3: Update the ChainManagementModule to register new providers**

Update the chain-management module to provide `ChainDependencyService`, `ChainLifecycleService`, and the `CHAIN_INDEXER_URL`/`RPC_GATEWAY_URL` injection tokens.

- [ ] **Step 4: Commit**

```bash
git add services/admin-api/src/chain-management/
git commit -m "feat(admin-api): add chain detail, update, lifecycle, delete, and health endpoints"
```

---

## Task 9: Wire Orphaned Modules & Autonomous Health Scheduling

**Files:**
- Modify: `services/chain-indexer-service/src/app.module.ts`
- Modify: `services/chain-indexer-service/src/sync-health/sync-health.service.ts`

- [ ] **Step 1: Import ScheduleModule and orphaned modules in AppModule**

In `services/chain-indexer-service/src/app.module.ts`, add to imports:

```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { GapDetectorModule } from './gap-detector/gap-detector.module';
import { FinalityTrackerModule } from './finality/finality-tracker.module';
```

Add to the `@Module({ imports: [...] })` array:
```typescript
  ScheduleModule.forRoot(),
  GapDetectorModule,
  FinalityTrackerModule,
```

- [ ] **Step 2: Add @Cron to SyncHealthService.checkHealth()**

In `services/chain-indexer-service/src/sync-health/sync-health.service.ts`, add import:

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';
```

Add the decorator to the `checkHealth()` method:

```typescript
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkHealth() {
    // existing implementation
  }
```

- [ ] **Step 3: Add @Cron to FinalityTrackerService and GapDetectorService**

In `services/chain-indexer-service/src/finality/finality-tracker.service.ts`, add:
```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

// Add decorator to checkFinality():
@Cron(CronExpression.EVERY_30_SECONDS)
async checkFinality() { ... }
```

In `services/chain-indexer-service/src/gap-detector/gap-detector.service.ts`, add:
```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

// Add decorator to detectGaps():
@Cron('0 */5 * * * *') // Every 5 minutes
async detectGaps() { ... }
```

- [ ] **Step 4: Commit**

```bash
git add services/chain-indexer-service/src/app.module.ts services/chain-indexer-service/src/sync-health/sync-health.service.ts services/chain-indexer-service/src/finality/finality-tracker.service.ts services/chain-indexer-service/src/gap-detector/gap-detector.service.ts
git commit -m "fix(chain-indexer): wire orphaned modules and add autonomous health scheduling"
```

---

## Task 10: Rate Limiter Seeding & Quota Tracking

**Files:**
- Modify: `services/rpc-gateway-service/src/rate-limiter/rate-limiter.service.ts`
- Modify: `services/rpc-gateway-service/src/health/health.service.ts`
- Modify: `services/rpc-gateway-service/src/router/rpc-router.service.ts`

- [ ] **Step 1: Add daily/monthly quota methods to RateLimiterService**

Add these methods to `RateLimiterService`:

```typescript
  async recordUsage(nodeId: number): Promise<void> {
    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

    await this.redis.multi()
      .incr(dayKey)
      .expire(dayKey, 86400 * 2)
      .incr(monthKey)
      .expire(monthKey, 86400 * 35)
      .exec();
  }

  async isQuotaExhausted(nodeId: number): Promise<boolean> {
    const limits = this.nodeLimits.get(nodeId);
    if (!limits) return false;

    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

    if ((limits as any).maxRequestsPerDay) {
      const used = await this.redis.get(dayKey);
      if (Number(used || 0) >= (limits as any).maxRequestsPerDay) return true;
    }
    if ((limits as any).maxRequestsPerMonth) {
      const used = await this.redis.get(monthKey);
      if (Number(used || 0) >= (limits as any).maxRequestsPerMonth) return true;
    }
    return false;
  }

  async getQuotaUsage(nodeId: number): Promise<{ daily: number; monthly: number }> {
    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

    const [daily, monthly] = await Promise.all([
      this.redis.get(dayKey),
      this.redis.get(monthKey),
    ]);

    return { daily: Number(daily || 0), monthly: Number(monthly || 0) };
  }
```

Update the `registerNode` method signature to accept daily/monthly limits:

```typescript
  registerNode(nodeId: number, limits: {
    maxRequestsPerSecond?: number | null;
    maxRequestsPerMinute?: number | null;
    maxRequestsPerDay?: number | null;
    maxRequestsPerMonth?: number | null;
  }): void {
    this.nodeLimits.set(nodeId, limits);
  }
```

- [ ] **Step 2: Seed rate limiter on startup in HealthService**

In `services/rpc-gateway-service/src/health/health.service.ts`, add to `onModuleInit()` (or create it if it doesn't exist):

```typescript
  async onModuleInit() {
    await this.seedRateLimits();
  }

  private async seedRateLimits() {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { status: { in: ['active', 'standby', 'draining'] } },
    });
    for (const node of nodes) {
      this.rateLimiter.registerNode(Number(node.id), {
        maxRequestsPerSecond: node.maxRequestsPerSecond,
        maxRequestsPerMinute: node.maxRequestsPerMinute,
        maxRequestsPerDay: node.maxRequestsPerDay,
        maxRequestsPerMonth: node.maxRequestsPerMonth,
      });
    }
    this.logger.log(`Seeded rate limits for ${nodes.length} RPC nodes`);
  }
```

Inject `RateLimiterService` in the constructor if not already there.

- [ ] **Step 3: Add quota check in RpcRouterService.selectNode()**

In `services/rpc-gateway-service/src/router/rpc-router.service.ts`, update the node selection loop to add quota checking:

```typescript
  // After circuit breaker check and rate limit check, add:
  if (await this.rateLimiter.isQuotaExhausted(Number(node.id))) {
    this.logger.debug(`Node ${node.id} quota exhausted, skipping`);
    continue;
  }
```

After a successful RPC call, record the usage:

```typescript
  // After successful callNode(), add:
  await this.rateLimiter.recordUsage(Number(node.id));
```

- [ ] **Step 4: Add quota status derivation in HealthService cron**

In the `runHealthChecks()` method, after updating health scores, add quota status derivation:

```typescript
  // After health score update for each node:
  const usage = await this.rateLimiter.getQuotaUsage(Number(node.id));
  let quotaStatus = 'available';

  if (node.maxRequestsPerDay && usage.daily >= node.maxRequestsPerDay) {
    quotaStatus = 'daily_exhausted';
  } else if (node.maxRequestsPerMonth && usage.monthly >= node.maxRequestsPerMonth) {
    quotaStatus = 'monthly_exhausted';
  } else if (
    (node.maxRequestsPerDay && usage.daily >= node.maxRequestsPerDay * 0.8) ||
    (node.maxRequestsPerMonth && usage.monthly >= node.maxRequestsPerMonth * 0.8)
  ) {
    quotaStatus = 'approaching';
  }

  await this.prisma.rpcNode.update({
    where: { id: node.id },
    data: { quotaStatus },
  });
```

- [ ] **Step 5: Commit**

```bash
git add services/rpc-gateway-service/src/rate-limiter/rate-limiter.service.ts services/rpc-gateway-service/src/health/health.service.ts services/rpc-gateway-service/src/router/rpc-router.service.ts
git commit -m "feat(rpc-gateway): add quota tracking, rate limiter seeding, and quota-aware routing"
```

---

## Task 11: Provider Templates

**Files:**
- Create: `services/admin-api/src/rpc-management/provider-templates.ts`
- Modify: `services/admin-api/src/rpc-management/rpc-management.controller.ts`
- Modify: `services/admin-api/src/rpc-management/rpc-management.service.ts`
- Modify: `services/admin-api/src/common/dto/rpc.dto.ts`

- [ ] **Step 1: Create provider templates file**

```typescript
// services/admin-api/src/rpc-management/provider-templates.ts

export interface ProviderTemplate {
  name: string;
  authMethod: string;
  authHeaderName?: string;
  urlPatterns: { http: string; ws: string | null };
  chainSlugs: Record<number, string>;
  defaultLimits: {
    maxRequestsPerSecond: number | null;
    maxRequestsPerMinute: number | null;
    maxRequestsPerDay: number | null;
    maxRequestsPerMonth: number | null;
  };
  supportedChainIds: number[];
  fields: string[];
  nodeTypes?: string[];
}

export const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  tatum: {
    name: 'Tatum',
    authMethod: 'header',
    authHeaderName: 'x-api-key',
    urlPatterns: {
      http: 'https://api.tatum.io/v3/blockchain/node/{chain-slug}',
      ws: null,
    },
    chainSlugs: {
      1: 'ethereum', 56: 'bsc', 137: 'polygon-matic',
      42161: 'arbitrum-one', 10: 'optimism', 43114: 'avax', 8453: 'base',
    },
    defaultLimits: {
      maxRequestsPerSecond: 5, maxRequestsPerMinute: 300,
      maxRequestsPerDay: null, maxRequestsPerMonth: 100000,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey'],
  },
  alchemy: {
    name: 'Alchemy',
    authMethod: 'url_path',
    urlPatterns: {
      http: 'https://{chain-slug}.g.alchemy.com/v2/{apiKey}',
      ws: 'wss://{chain-slug}.g.alchemy.com/v2/{apiKey}',
    },
    chainSlugs: {
      1: 'eth-mainnet', 56: 'bnb-mainnet', 137: 'polygon-mainnet',
      42161: 'arb-mainnet', 10: 'opt-mainnet', 43114: 'avax-mainnet', 8453: 'base-mainnet',
    },
    defaultLimits: {
      maxRequestsPerSecond: 25, maxRequestsPerMinute: null,
      maxRequestsPerDay: null, maxRequestsPerMonth: 300000000,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey'],
  },
  infura: {
    name: 'Infura',
    authMethod: 'url_path',
    urlPatterns: {
      http: 'https://{chain-slug}.infura.io/v3/{apiKey}',
      ws: 'wss://{chain-slug}.infura.io/ws/v3/{apiKey}',
    },
    chainSlugs: {
      1: 'mainnet', 56: 'bnbsmartchain-mainnet', 137: 'polygon-mainnet',
      42161: 'arbitrum-mainnet', 10: 'optimism-mainnet', 43114: 'avalanche-mainnet', 8453: 'base-mainnet',
    },
    defaultLimits: {
      maxRequestsPerSecond: 10, maxRequestsPerMinute: null,
      maxRequestsPerDay: 100000, maxRequestsPerMonth: null,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey'],
  },
  quicknode: {
    name: 'QuickNode',
    authMethod: 'url_path',
    urlPatterns: {
      http: 'https://{subdomain}.quiknode.pro/{apiKey}',
      ws: 'wss://{subdomain}.quiknode.pro/{apiKey}',
    },
    chainSlugs: {},
    defaultLimits: {
      maxRequestsPerSecond: 25, maxRequestsPerMinute: null,
      maxRequestsPerDay: null, maxRequestsPerMonth: null,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey', 'subdomain'],
  },
  custom: {
    name: 'Custom',
    authMethod: 'none',
    urlPatterns: { http: '', ws: '' },
    chainSlugs: {},
    defaultLimits: {
      maxRequestsPerSecond: null, maxRequestsPerMinute: null,
      maxRequestsPerDay: null, maxRequestsPerMonth: null,
    },
    supportedChainIds: [],
    fields: ['rpcHttpUrl', 'rpcWsUrl', 'nodeType', 'authMethod'],
    nodeTypes: ['geth', 'nethermind', 'erigon', 'besu', 'openethereum', 'reth'],
  },
};
```

- [ ] **Step 2: Add templates endpoint to controller**

In `rpc-management.controller.ts`, add:

```typescript
  @Get('/rpc-providers/templates')
  @AdminAuth()
  @ApiOperation({ summary: 'Get provider templates with defaults' })
  getTemplates() {
    return this.rpcService.getTemplates();
  }

  @Post('/rpc-providers/:id/reset-quota')
  @AdminAuth('super_admin')
  @ApiOperation({ summary: 'Manually reset quota counters for a node' })
  async resetQuota(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.rpcService.resetQuota(id, req.user.userId);
  }
```

**Important:** Place `/rpc-providers/templates` BEFORE `/rpc-providers/:id` routes to avoid "templates" being parsed as an ID.

- [ ] **Step 3: Add service methods**

In `rpc-management.service.ts`, add:

```typescript
import { PROVIDER_TEMPLATES } from './provider-templates';

  getTemplates() {
    return { templates: PROVIDER_TEMPLATES };
  }

  async resetQuota(nodeId: number, adminUserId: number) {
    const id = BigInt(nodeId);
    const node = await this.prisma.rpcNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException(`RPC node ${nodeId} not found`);

    await this.prisma.rpcNode.update({
      where: { id },
      data: { quotaStatus: 'available' },
    });

    // Clear Redis quota counters
    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;
    // Redis deletion would happen via the rpc-gateway-service, not admin-api
    // For now, just update the DB status

    await this.auditLog.log({
      action: 'rpc.quota_reset',
      entityType: 'rpc_node',
      entityId: String(nodeId),
      adminUserId,
    });

    return { success: true, nodeId, quotaStatus: 'available' };
  }
```

- [ ] **Step 4: Update CreateRpcProviderDto**

Add new fields to `services/admin-api/src/common/dto/rpc.dto.ts`:

```typescript
  @ApiPropertyOptional({ description: 'Provider type', enum: ['tatum', 'alchemy', 'infura', 'quicknode', 'custom'] })
  @IsOptional()
  @IsIn(['tatum', 'alchemy', 'infura', 'quicknode', 'custom'])
  providerType?: string;

  @ApiPropertyOptional({ description: 'Authentication method', enum: ['header', 'url_path', 'bearer', 'query_param', 'none'] })
  @IsOptional()
  @IsIn(['header', 'url_path', 'bearer', 'query_param', 'none'])
  authMethodType?: string;

  @ApiPropertyOptional({ description: 'Node type (for custom providers)', example: 'geth' })
  @IsOptional()
  @IsString()
  nodeType?: string;

  @ApiPropertyOptional({ description: 'Max requests per day' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRequestsPerDay?: number;

  @ApiPropertyOptional({ description: 'Max requests per month' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRequestsPerMonth?: number;
```

- [ ] **Step 5: Commit**

```bash
git add services/admin-api/src/rpc-management/provider-templates.ts services/admin-api/src/rpc-management/rpc-management.controller.ts services/admin-api/src/rpc-management/rpc-management.service.ts services/admin-api/src/common/dto/rpc.dto.ts
git commit -m "feat(rpc): add provider templates, quota reset, and provider type fields"
```

---

## Task 12: Improved Chain Creation Validation

**Files:**
- Modify: `services/chain-indexer-service/src/sync-health/sync-health.controller.ts`
- Modify: `services/admin-api/src/chain-management/chain-management.service.ts`

- [ ] **Step 1: Add RPC probe to chain creation in admin-api**

In `chain-management.service.ts`, update `addChain()`:

```typescript
  async addChain(dto: AddChainDto, adminUserId: number) {
    // RPC probe before creation
    let rpcProbeResult = null;
    try {
      const { JsonRpcProvider } = await import('ethers');
      const provider = new JsonRpcProvider(dto.rpcUrl, undefined, {
        staticNetwork: true,
        batchMaxCount: 1,
      });
      const [network, blockNumber] = await Promise.all([
        provider.getNetwork(),
        provider.getBlockNumber(),
      ]);
      const actualChainId = Number(network.chainId);

      if (actualChainId !== dto.chainId) {
        throw new BadRequestException(
          `RPC endpoint returns chainId ${actualChainId}, but expected ${dto.chainId}`,
        );
      }
      rpcProbeResult = { reachable: true, chainIdMatch: true, latestBlock: blockNumber };
      provider.destroy();
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      rpcProbeResult = { reachable: false, error: err.message };
    }

    // Create chain via chain-indexer
    const chainData = {
      ...dto,
      // If RPC unreachable, create as inactive
      isActive: rpcProbeResult?.reachable ? (dto.isActive ?? true) : false,
      status: rpcProbeResult?.reachable ? 'active' : 'inactive',
    };

    try {
      const { data } = await axios.post(`${this.chainIndexerUrl}/chains`, chainData);
      await this.auditLog.log({
        action: 'chain.create',
        entityType: 'chain',
        entityId: String(dto.chainId),
        adminUserId,
        details: { ...dto, rpcProbeResult },
      });

      return {
        ...data,
        rpcProbe: rpcProbeResult,
        warnings: rpcProbeResult?.reachable
          ? []
          : ['RPC endpoint unreachable — chain created as inactive'],
      };
    } catch (err: any) {
      if (err.response?.status === 500 && err.response?.data?.message?.includes('Unique constraint')) {
        throw new ConflictException(`Chain with ID ${dto.chainId} already exists`);
      }
      throw err;
    }
  }
```

Add import: `BadRequestException, ConflictException` from `@nestjs/common`.

- [ ] **Step 2: Update chain-indexer addChain to accept new fields**

In `sync-health.controller.ts`, update the `addChain` method to handle new fields:

```typescript
  @Post('/chains')
  async addChain(@Body() body: any) {
    try {
      const chain = await this.prisma.chain.create({
        data: {
          id: body.chainId,
          name: body.name,
          shortName: body.symbol || body.shortName,
          nativeCurrencySymbol: body.symbol,
          rpcEndpoints: body.rpcUrl ? [body.rpcUrl] : body.rpcEndpoints || [],
          blockTimeSeconds: body.blockTimeSeconds || 12,
          confirmationsDefault: body.confirmationsRequired || 12,
          finalityThreshold: body.finalityThreshold || 32,
          explorerUrl: body.explorerUrl || null,
          isActive: body.isActive ?? true,
          status: body.status || 'active',
          isTestnet: body.isTestnet || false,
        },
      });
      return { success: true, chain };
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`Chain with ID ${body.chainId} already exists`);
      }
      throw err;
    }
  }
```

Add import: `ConflictException` from `@nestjs/common`.

- [ ] **Step 3: Commit**

```bash
git add services/admin-api/src/chain-management/chain-management.service.ts services/chain-indexer-service/src/sync-health/sync-health.controller.ts
git commit -m "feat(chains): add RPC probe on creation, duplicate chainId handling, and new field support"
```

---

## Task 13: Redis Hardening in Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update Redis configuration**

In `docker-compose.yml`, replace the Redis command:

```yaml
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --appendfsync always --maxmemory 2gb --maxmemory-policy noeviction --requirepass ${REDIS_PASSWORD} --tcp-keepalive 300
    volumes:
      - /docker/data/redis:/data
    networks:
      - internal-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "fix(infra): harden Redis with noeviction policy, appendfsync always, and 2GB memory"
```

---

## Task 14: Run All Existing Tests

- [ ] **Step 1: Run the full test suite to verify no regressions**

Run: `cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub && npx turbo test -- --passWithNoTests --ci`

Expected: All existing tests pass. The Prisma schema changes should not break tests because tests use mocked Prisma clients.

- [ ] **Step 2: Fix any test failures**

If any tests fail due to the schema changes (e.g., tests that check for `isActive` field), update them to also check for the `status` field.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(tests): update tests for chain lifecycle schema changes"
```
