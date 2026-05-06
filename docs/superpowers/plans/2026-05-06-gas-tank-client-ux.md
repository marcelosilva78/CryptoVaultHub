# Gas Tank Client UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clients full visibility and self-service over gas tanks: dedicated `/gas-tanks` page, dashboard widget, top-up flow with QR + auto-poll, low-balance alerts (banner + webhook + email-stub), and gas consumption history.

**Architecture:** Two new tables in `cvh_wallets` (`gas_tank_transactions`, `gas_tank_alert_config`). cron-worker instruments tx submitters and adds a receipt reconciler. New `gas-tanks` module in `client-api` exposes 6 endpoints. notification-service consumes the existing `gas_tank:alerts` Redis stream and dispatches `gas_tank.low_balance` webhooks. Frontend gets a `/gas-tanks` page, dashboard widget, sidebar entry, and supporting modals.

**Tech Stack:** NestJS, Prisma (cross-DB), MySQL 8 (numbered SQL migrations), TypeScript, Next.js 14 (App Router), TanStack Query, lucide-react, ethers v6, Web3 Secret Storage v3 keystores.

**Companion specs:**
- Requirements: `docs/superpowers/specs/2026-05-05-gas-tank-client-ux-requirements.md`
- Design: `docs/superpowers/specs/2026-05-06-gas-tank-client-ux-design.md`

**Conventions in this repo (do not violate):**
- Migrations live in `database/0NN-*.sql` and are picked up automatically by `database/migrate.sh`. Use `043-` as the next prefix.
- Prisma schemas are kept in sync with the SQL by hand (no Prisma Migrate). After SQL changes, edit each consumer's `schema.prisma` and run `npx prisma generate` in that service.
- client-api modules typically proxy via HTTP to core-wallet-service (`WalletService` is the reference pattern). New gas-tanks DB reads can use `AdminDatabaseService` directly because they query `cvh_wallets` cross-DB (the same pattern this service already uses).
- All client routes mount under `Controller('client/v1/...')` and use `@ClientAuth(scope)` + `@CurrentClientId()`/`@CurrentProjectId()` decorators.
- Frontend API calls go through `lib/api.ts` and hit Next.js's `/api/proxy/*` catch-all, which adds the JWT cookie and forwards to client-api.

---

## File Structure

**New files:**
- `database/043-gas-tank-client-ux.sql` — both new tables + indexes
- `services/core-wallet-service/prisma/schema.prisma` — append `GasTankTransaction`, `GasTankAlertConfig` models (modify)
- `services/cron-worker-service/src/gas-tank/gas-tank-tx-logger.service.ts` — log-on-submit helper
- `services/cron-worker-service/src/gas-tank/gas-tank-tx-logger.service.spec.ts`
- `services/cron-worker-service/src/gas-tank/gas-tank-receipt-reconciler.service.ts` — cron, fills receipts
- `services/cron-worker-service/src/gas-tank/gas-tank-receipt-reconciler.service.spec.ts`
- `services/client-api/src/gas-tanks/gas-tanks.module.ts`
- `services/client-api/src/gas-tanks/gas-tanks.controller.ts`
- `services/client-api/src/gas-tanks/gas-tanks.service.ts`
- `services/client-api/src/gas-tanks/gas-tanks.service.spec.ts`
- `services/client-api/src/gas-tanks/dto/update-alert-config.dto.ts`
- `services/client-api/src/gas-tanks/dto/export-keystore.dto.ts`
- `services/notification-service/src/gas-tank-alerts/gas-tank-alerts.consumer.ts`
- `services/notification-service/src/gas-tank-alerts/gas-tank-alerts.consumer.spec.ts`
- `services/notification-service/src/gas-tank-alerts/gas-tank-alerts.module.ts`
- `apps/client/app/gas-tanks/page.tsx`
- `apps/client/components/gas-tanks/gas-tank-card.tsx`
- `apps/client/components/gas-tanks/gas-tank-history-table.tsx`
- `apps/client/components/gas-tanks/gas-tank-history-page.tsx`
- `apps/client/components/gas-tanks/topup-modal.tsx`
- `apps/client/components/gas-tanks/alert-config-modal.tsx`
- `apps/client/components/gas-tanks/export-keystore-modal.tsx`
- `apps/client/components/gas-tanks/gas-tank-summary.tsx` — dashboard widget

**Modified files:**
- `services/cron-worker-service/src/forwarder-deploy/forwarder-deploy.service.ts` — call logger on submit
- `services/cron-worker-service/src/sweep/transaction-submitter.service.ts` — call logger on submit
- `services/cron-worker-service/src/gas-tank/gas-tank.service.ts` — read threshold per (project,chain), de-dup, log internal topups
- `services/cron-worker-service/src/gas-tank/gas-tank.module.ts` — register new providers
- `services/core-wallet-service/src/wallet/wallet.service.ts` (or equivalent deploy path) — call logger on wallet deploy
- `services/client-api/src/app.module.ts` — register `GasTanksModule`
- `services/client-api/src/webhook/webhook.service.ts` (or shared DTO) — add `'gas_tank.low_balance'` event type
- `services/client-api/src/project-setup/project-setup.service.ts` — insert default `GasTankAlertConfig` row when gas tank is created
- `services/notification-service/src/app.module.ts` — register `GasTankAlertsModule`
- `apps/client/lib/api.ts` — add gas-tank wrappers
- `apps/client/components/sidebar.tsx` — add Gas Tanks entry under OPERATIONS
- `apps/client/app/page.tsx` — mount `<GasTankSummary />` and critical banner

---

## Task 1: Database migration (new tables)

**Files:**
- Create: `database/043-gas-tank-client-ux.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 043-gas-tank-client-ux.sql
-- Adds gas_tank_transactions (history) and gas_tank_alert_config (per-chain alert prefs).

USE cvh_wallets;

CREATE TABLE IF NOT EXISTS gas_tank_transactions (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  wallet_id       BIGINT       NOT NULL,
  project_id      BIGINT       NOT NULL,
  chain_id        INT          NOT NULL,
  tx_hash         VARCHAR(66)  NOT NULL,
  operation_type  VARCHAR(32)  NOT NULL, -- deploy_wallet | deploy_forwarder | sweep | flush | topup_internal | other
  to_address      VARCHAR(42)  NULL,
  gas_used        BIGINT       NULL,
  gas_price_wei   VARCHAR(80)  NOT NULL,
  gas_cost_wei    VARCHAR(80)  NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'submitted', -- submitted | confirmed | failed
  block_number    BIGINT       NULL,
  metadata        JSON         NULL,
  submitted_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at    DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY idx_proj_chain_time (project_id, chain_id, submitted_at DESC),
  KEY idx_wallet_time     (wallet_id, submitted_at DESC),
  KEY idx_tx_hash         (tx_hash),
  KEY idx_status_submitted (status, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gas_tank_alert_config (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  project_id      BIGINT       NOT NULL,
  chain_id        INT          NOT NULL,
  threshold_wei   VARCHAR(80)  NOT NULL,
  email_enabled   TINYINT(1)   NOT NULL DEFAULT 0,
  webhook_enabled TINYINT(1)   NOT NULL DEFAULT 1,
  last_alert_at   DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_proj_chain (project_id, chain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: create a default alert config row for every existing gas tank wallet,
-- using a placeholder threshold of 0.001 ETH expressed in wei. Clients edit later.
INSERT INTO gas_tank_alert_config (project_id, chain_id, threshold_wei, webhook_enabled)
SELECT DISTINCT w.project_id, w.chain_id, '1000000000000000', 1
FROM wallets w
WHERE w.wallet_type = 'gas_tank'
  AND NOT EXISTS (
    SELECT 1 FROM gas_tank_alert_config c
    WHERE c.project_id = w.project_id AND c.chain_id = w.chain_id
  );
```

- [ ] **Step 2: Apply migration on dev DB**

Run: `cd database && ./migrate.sh --from 43`
Expected: `043-gas-tank-client-ux.sql ... OK`

- [ ] **Step 3: Verify tables exist**

Run: `mysql -h localhost -u root cvh_wallets -e "SHOW TABLES LIKE 'gas_tank_%'"`
Expected: two rows — `gas_tank_alert_config`, `gas_tank_transactions`.

- [ ] **Step 4: Commit**

```bash
git add database/043-gas-tank-client-ux.sql
git commit -m "feat(db): gas_tank_transactions + gas_tank_alert_config tables"
```

---

## Task 2: Prisma schema update (core-wallet-service)

**Files:**
- Modify: `services/core-wallet-service/prisma/schema.prisma` — append two models

- [ ] **Step 1: Append models**

Add at the end of `schema.prisma`:

```prisma
// Gas Tank Transaction History (cvh_wallets)
model GasTankTransaction {
  id            BigInt    @id @default(autoincrement())
  walletId      BigInt    @map("wallet_id")
  projectId     BigInt    @map("project_id")
  chainId       Int       @map("chain_id")
  txHash        String    @db.VarChar(66) @map("tx_hash")
  operationType String    @db.VarChar(32) @map("operation_type")
  toAddress     String?   @db.VarChar(42) @map("to_address")
  gasUsed       BigInt?   @map("gas_used")
  gasPriceWei   String    @db.VarChar(80) @map("gas_price_wei")
  gasCostWei    String?   @db.VarChar(80) @map("gas_cost_wei")
  status        String    @default("submitted") @db.VarChar(16)
  blockNumber   BigInt?   @map("block_number")
  metadata      Json?
  submittedAt   DateTime  @default(now()) @map("submitted_at")
  confirmedAt   DateTime? @map("confirmed_at")

  @@index([projectId, chainId, submittedAt(sort: Desc)], name: "idx_proj_chain_time")
  @@index([walletId, submittedAt(sort: Desc)], name: "idx_wallet_time")
  @@index([txHash], name: "idx_tx_hash")
  @@index([status, submittedAt], name: "idx_status_submitted")
  @@map("gas_tank_transactions")
}

// Gas Tank Alert Configuration (cvh_wallets)
model GasTankAlertConfig {
  id              BigInt    @id @default(autoincrement())
  projectId       BigInt    @map("project_id")
  chainId         Int       @map("chain_id")
  thresholdWei    String    @db.VarChar(80) @map("threshold_wei")
  emailEnabled    Boolean   @default(false) @map("email_enabled")
  webhookEnabled  Boolean   @default(true)  @map("webhook_enabled")
  lastAlertAt     DateTime? @map("last_alert_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@unique([projectId, chainId])
  @@map("gas_tank_alert_config")
}
```

- [ ] **Step 2: Regenerate prisma client (core-wallet)**

Run: `cd services/core-wallet-service && npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 3: Mirror models into all consuming services**

For each of these services, append the same two models to their `prisma/schema.prisma` (so cross-DB Prisma clients can read them):

- `services/cron-worker-service/prisma/schema.prisma`
- `services/client-api/prisma/schema.prisma` (if it exists; otherwise skip and use `core-wallet-service`'s client via shared package — check the existing `AdminDatabaseService` to see which schema it imports from)
- `services/notification-service/prisma/schema.prisma`

Then run `npx prisma generate` in each.

- [ ] **Step 4: Type-check**

Run: `pnpm -r --filter ./services/core-wallet-service --filter ./services/cron-worker-service --filter ./services/client-api --filter ./services/notification-service typecheck` (or the equivalent project script — fall back to `tsc --noEmit` per service).
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add services/*/prisma/schema.prisma
git commit -m "feat(prisma): GasTankTransaction + GasTankAlertConfig models"
```

---

## Task 3: cron-worker — GasTankTxLogger service (TDD)

**Files:**
- Create: `services/cron-worker-service/src/gas-tank/gas-tank-tx-logger.service.ts`
- Create: `services/cron-worker-service/src/gas-tank/gas-tank-tx-logger.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// gas-tank-tx-logger.service.spec.ts
import { Test } from '@nestjs/testing';
import { GasTankTxLoggerService, OperationType } from './gas-tank-tx-logger.service';

describe('GasTankTxLoggerService', () => {
  const prismaMock = { gasTankTransaction: { create: jest.fn() } };
  let service: GasTankTxLoggerService;

  beforeEach(async () => {
    prismaMock.gasTankTransaction.create.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GasTankTxLoggerService,
        { provide: 'PRISMA_CLIENT', useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(GasTankTxLoggerService);
  });

  it('logSubmit creates a row with status=submitted', async () => {
    await service.logSubmit({
      walletId: 1n, projectId: 2n, chainId: 137,
      txHash: '0xabc', operationType: 'sweep' as OperationType,
      gasPriceWei: '30000000000', toAddress: '0xdef',
    });
    expect(prismaMock.gasTankTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 1n, projectId: 2n, chainId: 137,
        txHash: '0xabc', operationType: 'sweep',
        gasPriceWei: '30000000000', status: 'submitted',
      }),
    });
  });

  it('logSubmit swallows DB errors (never blocks the caller)', async () => {
    prismaMock.gasTankTransaction.create.mockRejectedValue(new Error('boom'));
    await expect(service.logSubmit({
      walletId: 1n, projectId: 2n, chainId: 1, txHash: '0x', operationType: 'other', gasPriceWei: '0',
    })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `cd services/cron-worker-service && pnpm jest gas-tank-tx-logger`
Expected: `Cannot find module './gas-tank-tx-logger.service'`

- [ ] **Step 3: Implement service**

```typescript
// gas-tank-tx-logger.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma-client';

export type OperationType =
  | 'deploy_wallet'
  | 'deploy_forwarder'
  | 'sweep'
  | 'flush'
  | 'topup_internal'
  | 'other';

export interface LogSubmitInput {
  walletId: bigint;
  projectId: bigint;
  chainId: number;
  txHash: string;
  operationType: OperationType;
  toAddress?: string;
  gasPriceWei: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class GasTankTxLoggerService {
  private readonly logger = new Logger(GasTankTxLoggerService.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async logSubmit(input: LogSubmitInput): Promise<void> {
    try {
      await this.prisma.gasTankTransaction.create({
        data: {
          walletId: input.walletId,
          projectId: input.projectId,
          chainId: input.chainId,
          txHash: input.txHash,
          operationType: input.operationType,
          toAddress: input.toAddress,
          gasPriceWei: input.gasPriceWei,
          status: 'submitted',
          metadata: input.metadata as never,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to log gas-tank tx ${input.txHash} (${input.operationType}): ${(err as Error).message}`,
      );
    }
  }
}
```

> **Note on `PRISMA_CLIENT` token:** the cron-worker module already provides a Prisma client. Inspect `gas-tank.module.ts` and use the same injection token used by `gas-tank.service.ts`. Adjust the test mock provider accordingly.

- [ ] **Step 4: Run test → pass**

Run: `pnpm jest gas-tank-tx-logger`
Expected: 2 passing.

- [ ] **Step 5: Register provider in `gas-tank.module.ts`**

Add `GasTankTxLoggerService` to `providers` and `exports`.

- [ ] **Step 6: Commit**

```bash
git add services/cron-worker-service/src/gas-tank/gas-tank-tx-logger.service.ts \
        services/cron-worker-service/src/gas-tank/gas-tank-tx-logger.service.spec.ts \
        services/cron-worker-service/src/gas-tank/gas-tank.module.ts
git commit -m "feat(cron-worker): GasTankTxLoggerService"
```

---

## Task 4: Instrument tx submitters with the logger

**Files:**
- Modify: `services/cron-worker-service/src/forwarder-deploy/forwarder-deploy.service.ts`
- Modify: `services/cron-worker-service/src/sweep/transaction-submitter.service.ts`
- Modify: `services/cron-worker-service/src/gas-tank/gas-tank.service.ts` (existing internal-topup path)
- Modify: wallet-deploy submitter (locate via `grep -rn "gasTank\|gas_tank" services/cron-worker-service/src services/core-wallet-service/src --include='*.ts' | grep -i 'sendTransaction\|sendRawTransaction'`)

- [ ] **Step 1: Locate each submission site**

For each service file, find the line where the gas-tank-funded transaction is broadcast (typically after `wallet.sendTransaction(...)` or `provider.broadcastTransaction(...)`). Note: this is where `txHash` is first known.

- [ ] **Step 2: Inject `GasTankTxLoggerService` into each constructor**

```typescript
constructor(
  // ... existing deps,
  private readonly gasTankTxLogger: GasTankTxLoggerService,
) {}
```

Make sure each module imports `GasTankModule` (or the logger is exported from a shared module).

- [ ] **Step 3: Call `logSubmit` after each broadcast**

Example (sweep submitter):

```typescript
const tx = await wallet.sendTransaction(txReq);
await this.gasTankTxLogger.logSubmit({
  walletId: gasTank.id,
  projectId: gasTank.projectId,
  chainId,
  txHash: tx.hash,
  operationType: 'sweep',
  toAddress: txReq.to ?? undefined,
  gasPriceWei: (txReq.maxFeePerGas ?? txReq.gasPrice ?? 0n).toString(),
  metadata: { jobId, addressId },
});
```

Apply analogous calls in:
- `forwarder-deploy.service.ts` → `operation_type: 'deploy_forwarder'`
- `gas-tank.service.ts` → `operation_type: 'topup_internal'`
- wallet-deploy submitter → `operation_type: 'deploy_wallet'`

- [ ] **Step 4: Add a sweep-vs-flush discriminator**

In the sweep submitter, if the call site has a `flushOperationId` (or equivalent flag from the job), pass `operationType: 'flush'` instead of `'sweep'`. Inspect the existing job DTO to find the flag.

- [ ] **Step 5: Run cron-worker tests**

Run: `cd services/cron-worker-service && pnpm jest`
Expected: existing suites pass; if any spec asserts on constructor args, update mocks to include the new `gasTankTxLogger`.

- [ ] **Step 6: Commit**

```bash
git add services/cron-worker-service/src
git commit -m "feat(cron-worker): instrument gas-tank tx submitters with logger"
```

---

## Task 5: GasTankReceiptReconciler service (TDD, cron job)

**Files:**
- Create: `services/cron-worker-service/src/gas-tank/gas-tank-receipt-reconciler.service.ts`
- Create: `services/cron-worker-service/src/gas-tank/gas-tank-receipt-reconciler.service.spec.ts`
- Modify: `services/cron-worker-service/src/gas-tank/gas-tank.module.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// gas-tank-receipt-reconciler.service.spec.ts
import { Test } from '@nestjs/testing';
import { GasTankReceiptReconcilerService } from './gas-tank-receipt-reconciler.service';

const submittedRow = (overrides = {}) => ({
  id: 1n, txHash: '0xabc', chainId: 137, status: 'submitted',
  submittedAt: new Date(Date.now() - 60_000), gasPriceWei: '30000000000',
  ...overrides,
});

describe('GasTankReceiptReconcilerService', () => {
  const prisma = {
    gasTankTransaction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const rpcGateway = { getTransactionReceipt: jest.fn() };
  let svc: GasTankReceiptReconcilerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        GasTankReceiptReconcilerService,
        { provide: 'PRISMA_CLIENT', useValue: prisma },
        { provide: 'RPC_GATEWAY', useValue: rpcGateway },
      ],
    }).compile();
    svc = mod.get(GasTankReceiptReconcilerService);
  });

  it('marks confirmed when receipt available', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([submittedRow()]);
    rpcGateway.getTransactionReceipt.mockResolvedValue({
      status: 1, gasUsed: 21000n, effectiveGasPrice: 30000000000n, blockNumber: 100n,
    });
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: expect.objectContaining({
        status: 'confirmed', gasUsed: 21000n, gasCostWei: '630000000000000',
        blockNumber: 100n, confirmedAt: expect.any(Date),
      }),
    });
  });

  it('marks failed when receipt status=0', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([submittedRow()]);
    rpcGateway.getTransactionReceipt.mockResolvedValue({ status: 0, gasUsed: 21000n, effectiveGasPrice: 30000000000n, blockNumber: 100n });
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('leaves submitted when receipt is null and tx is younger than max-age', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([submittedRow({ submittedAt: new Date() })]);
    rpcGateway.getTransactionReceipt.mockResolvedValue(null);
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).not.toHaveBeenCalled();
  });

  it('marks failed when receipt is null and tx is older than max-age', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([submittedRow({ submittedAt: new Date(Date.now() - 11 * 60_000) })]);
    rpcGateway.getTransactionReceipt.mockResolvedValue(null);
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `pnpm jest gas-tank-receipt-reconciler`

- [ ] **Step 3: Implement service**

```typescript
// gas-tank-receipt-reconciler.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '../generated/prisma-client';

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — after this, treat as failed/dropped
const BATCH_SIZE = 50;

interface RpcGateway {
  getTransactionReceipt(chainId: number, txHash: string): Promise<{
    status: number; gasUsed: bigint; effectiveGasPrice: bigint; blockNumber: bigint;
  } | null>;
}

@Injectable()
export class GasTankReceiptReconcilerService {
  private readonly logger = new Logger(GasTankReceiptReconcilerService.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject('RPC_GATEWAY') private readonly rpc: RpcGateway,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async reconcile() {
    try { await this.reconcileBatch(); }
    catch (err) { this.logger.warn(`reconcile error: ${(err as Error).message}`); }
  }

  async reconcileBatch() {
    const rows = await this.prisma.gasTankTransaction.findMany({
      where: { status: 'submitted', submittedAt: { lt: new Date(Date.now() - 15_000) } },
      orderBy: { submittedAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of rows) {
      const receipt = await this.rpc.getTransactionReceipt(row.chainId, row.txHash);
      const ageMs = Date.now() - row.submittedAt.getTime();

      if (!receipt) {
        if (ageMs > MAX_AGE_MS) {
          await this.prisma.gasTankTransaction.update({
            where: { id: row.id },
            data: { status: 'failed', confirmedAt: new Date() },
          });
        }
        continue;
      }

      const gasCostWei = (receipt.gasUsed * receipt.effectiveGasPrice).toString();
      await this.prisma.gasTankTransaction.update({
        where: { id: row.id },
        data: {
          status: receipt.status === 1 ? 'confirmed' : 'failed',
          gasUsed: receipt.gasUsed,
          gasCostWei,
          blockNumber: receipt.blockNumber,
          confirmedAt: new Date(),
        },
      });
    }
  }
}
```

> The `RPC_GATEWAY` provider should wrap the existing `SharedRpcRateLimiter` + provider factory. Inspect how other reconcilers in cron-worker fetch receipts and reuse that mechanism — bind it under the `'RPC_GATEWAY'` token in the module.

- [ ] **Step 4: Register in module**

In `gas-tank.module.ts`, add `GasTankReceiptReconcilerService` to providers. Ensure `ScheduleModule.forRoot()` is already imported (it is, since `gas-tank.service.ts` uses cron). Bind the `'RPC_GATEWAY'` provider via `useFactory`.

- [ ] **Step 5: Run test → pass**

Run: `pnpm jest gas-tank-receipt-reconciler`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add services/cron-worker-service/src/gas-tank/gas-tank-receipt-reconciler.service.* \
        services/cron-worker-service/src/gas-tank/gas-tank.module.ts
git commit -m "feat(cron-worker): GasTankReceiptReconcilerService"
```

---

## Task 6: Augment existing low-balance alert pipeline

**Files:**
- Modify: `services/cron-worker-service/src/gas-tank/gas-tank.service.ts`

- [ ] **Step 1: Read per-chain threshold instead of global config**

Replace the current global threshold lookup with:

```typescript
const cfg = await this.prisma.gasTankAlertConfig.findUnique({
  where: { projectId_chainId: { projectId: tank.projectId, chainId } },
});
const thresholdWei = cfg?.thresholdWei
  ? BigInt(cfg.thresholdWei)
  : ethers.parseEther(this.config.get<string>('GAS_TANK_DEFAULT_THRESHOLD_ETH', '0.001'));
```

- [ ] **Step 2: Add 1-hour de-dup before publishing to the stream**

```typescript
const recentlyAlerted =
  cfg?.lastAlertAt && Date.now() - cfg.lastAlertAt.getTime() < 60 * 60 * 1000;

if (isLow && !recentlyAlerted) {
  await this.redis.publishToStream('gas_tank:alerts', {
    projectId: tank.projectId.toString(),
    chainId,
    address: tank.address,
    balanceWei: balance.toString(),
    thresholdWei: thresholdWei.toString(),
    timestamp: new Date().toISOString(),
  });
  if (cfg) {
    await this.prisma.gasTankAlertConfig.update({
      where: { id: cfg.id },
      data: { lastAlertAt: new Date() },
    });
  }
}
```

- [ ] **Step 3: Update test fixtures**

Run: `pnpm jest gas-tank.service` and update mock surfaces (`prisma.gasTankAlertConfig.findUnique`, `update`) and assertions for de-dup.

- [ ] **Step 4: Verify all gas-tank tests pass**

Run: `pnpm jest src/gas-tank`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add services/cron-worker-service/src/gas-tank/gas-tank.service.ts \
        services/cron-worker-service/src/gas-tank/gas-tank.service.spec.ts
git commit -m "feat(cron-worker): per-chain gas-tank threshold + 1h alert de-dup"
```

---

## Task 7: notification-service — gas-tank-alerts consumer (TDD)

**Files:**
- Create: `services/notification-service/src/gas-tank-alerts/gas-tank-alerts.module.ts`
- Create: `services/notification-service/src/gas-tank-alerts/gas-tank-alerts.consumer.ts`
- Create: `services/notification-service/src/gas-tank-alerts/gas-tank-alerts.consumer.spec.ts`
- Modify: `services/notification-service/src/app.module.ts`

- [ ] **Step 1: Inspect existing webhook delivery pipeline**

Run: `grep -rn "WebhookDelivery\|enqueueWebhook\|webhook.*event" services/notification-service/src --include='*.ts' | head -20`
Identify the function used to dispatch a webhook event (e.g., `WebhookDispatcherService.enqueue(eventType, payload, projectId)`). Use that exact API in step 3.

- [ ] **Step 2: Write the failing test**

```typescript
// gas-tank-alerts.consumer.spec.ts
import { Test } from '@nestjs/testing';
import { GasTankAlertsConsumer } from './gas-tank-alerts.consumer';

describe('GasTankAlertsConsumer', () => {
  const dispatcher = { enqueue: jest.fn() };
  const prisma = { gasTankAlertConfig: { findUnique: jest.fn() } };
  const logger = { log: jest.fn(), warn: jest.fn() };
  let consumer: GasTankAlertsConsumer;

  beforeEach(async () => {
    jest.clearAllMocks();
    const m = await Test.createTestingModule({
      providers: [
        GasTankAlertsConsumer,
        { provide: 'WEBHOOK_DISPATCHER', useValue: dispatcher },
        { provide: 'PRISMA_CLIENT', useValue: prisma },
      ],
    }).compile();
    consumer = m.get(GasTankAlertsConsumer);
  });

  const event = {
    projectId: '7', chainId: 137, address: '0xabc',
    balanceWei: '100', thresholdWei: '1000', timestamp: '2026-05-06T00:00:00Z',
  };

  it('dispatches webhook when webhookEnabled=true', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({ webhookEnabled: true, emailEnabled: false });
    await consumer.handleAlert(event);
    expect(dispatcher.enqueue).toHaveBeenCalledWith(
      'gas_tank.low_balance',
      expect.objectContaining({ projectId: 7, chainId: 137, address: '0xabc' }),
      7,
    );
  });

  it('skips webhook when webhookEnabled=false', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({ webhookEnabled: false, emailEnabled: false });
    await consumer.handleAlert(event);
    expect(dispatcher.enqueue).not.toHaveBeenCalled();
  });

  it('logs email-stub when emailEnabled=true (does not actually send)', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({ webhookEnabled: false, emailEnabled: true });
    const logSpy = jest.spyOn((consumer as any).logger, 'log');
    await consumer.handleAlert(event);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[email-stub]'));
  });
});
```

- [ ] **Step 3: Implement consumer**

```typescript
// gas-tank-alerts.consumer.ts
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma-client';

interface WebhookDispatcher {
  enqueue(eventType: string, payload: Record<string, unknown>, projectId: number): Promise<void>;
}

interface RawAlert {
  projectId: string; chainId: number; address: string;
  balanceWei: string; thresholdWei: string; timestamp: string;
}

@Injectable()
export class GasTankAlertsConsumer implements OnModuleInit {
  private readonly logger = new Logger(GasTankAlertsConsumer.name);

  constructor(
    @Inject('WEBHOOK_DISPATCHER') private readonly dispatcher: WebhookDispatcher,
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject('REDIS_STREAM_CONSUMER') private readonly redis: {
      consume(stream: string, group: string, handler: (msg: RawAlert) => Promise<void>): Promise<void>;
    },
  ) {}

  async onModuleInit() {
    await this.redis.consume('gas_tank:alerts', 'notification-service', (msg) => this.handleAlert(msg));
  }

  async handleAlert(event: RawAlert): Promise<void> {
    const projectId = Number(event.projectId);
    const cfg = await this.prisma.gasTankAlertConfig.findUnique({
      where: { projectId_chainId: { projectId: BigInt(projectId), chainId: event.chainId } },
    });

    if (cfg?.webhookEnabled) {
      const payload = {
        projectId, chainId: event.chainId, address: event.address,
        balanceWei: event.balanceWei, thresholdWei: event.thresholdWei,
        timestamp: event.timestamp,
      };
      await this.dispatcher.enqueue('gas_tank.low_balance', payload, projectId);
    }

    if (cfg?.emailEnabled) {
      this.logger.log(`[email-stub] would send gas-tank low-balance email to project ${projectId} chain ${event.chainId}`);
    }
  }
}
```

> Adjust `WEBHOOK_DISPATCHER` token + interface to match what step 1 found. If the existing dispatcher takes a different signature (e.g., `dispatch({ eventType, payload, projectId })`), use that.

- [ ] **Step 4: Module wiring**

```typescript
// gas-tank-alerts.module.ts
import { Module } from '@nestjs/common';
import { GasTankAlertsConsumer } from './gas-tank-alerts.consumer';

@Module({ providers: [GasTankAlertsConsumer] })
export class GasTankAlertsModule {}
```

Add `GasTankAlertsModule` to `app.module.ts` imports.

- [ ] **Step 5: Run test → pass**

Run: `cd services/notification-service && pnpm jest gas-tank-alerts`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add services/notification-service/src/gas-tank-alerts \
        services/notification-service/src/app.module.ts
git commit -m "feat(notifications): consume gas_tank:alerts → dispatch webhook"
```

---

## Task 8: Webhook event-type registration

**Files:**
- Modify: webhook event-type enum/list in client-api or shared package

- [ ] **Step 1: Locate the registry**

Run: `grep -rn "deposit.detected\|withdrawal.broadcast\|test.ping\|forwarder.deployed" services/ packages/ --include='*.ts' | head -10`
The most-mentioned file is the canonical event-type list.

- [ ] **Step 2: Add the new event**

Add `'gas_tank.low_balance'` to the enum/array. Update OpenAPI / Swagger description in `webhook.controller.ts` to mention it.

- [ ] **Step 3: Add a webhook payload sample**

If the codebase has a `webhook-event-samples.ts` (or equivalent for `test.ping` payloads), add:

```typescript
'gas_tank.low_balance': {
  projectId: 1,
  chainId: 137,
  address: '0xGasTankAddress',
  balanceWei: '500000000000000',
  thresholdWei: '1000000000000000',
  timestamp: new Date().toISOString(),
},
```

- [ ] **Step 4: Type-check**

Run: `pnpm -r typecheck` (or `tsc --noEmit` per affected service).
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -p
git commit -m "feat(webhooks): register gas_tank.low_balance event type"
```

---

## Task 9: client-api `gas-tanks` module — read endpoints (TDD)

**Files:**
- Create: `services/client-api/src/gas-tanks/gas-tanks.module.ts`
- Create: `services/client-api/src/gas-tanks/gas-tanks.controller.ts`
- Create: `services/client-api/src/gas-tanks/gas-tanks.service.ts`
- Create: `services/client-api/src/gas-tanks/gas-tanks.service.spec.ts`
- Modify: `services/client-api/src/app.module.ts`

- [ ] **Step 1: Write failing tests for the service**

```typescript
// gas-tanks.service.spec.ts
import { Test } from '@nestjs/testing';
import { GasTanksService } from './gas-tanks.service';

describe('GasTanksService', () => {
  const adminDb = {
    wallet: { findMany: jest.fn() },
    chain: { findMany: jest.fn() },
    gasTankAlertConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    gasTankTransaction: { findMany: jest.fn(), count: jest.fn() },
  };
  const balance = { getNativeBalance: jest.fn(), getFeeData: jest.fn() };
  let svc: GasTanksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        GasTanksService,
        { provide: 'ADMIN_DB', useValue: adminDb },
        { provide: 'BALANCE_SERVICE', useValue: balance },
      ],
    }).compile();
    svc = mod.get(GasTanksService);
  });

  it('list returns gas tanks with status, eta ops, and threshold', async () => {
    adminDb.wallet.findMany.mockResolvedValue([
      { id: 1n, projectId: 9n, chainId: 137, address: '0xgt', walletType: 'gas_tank' },
    ]);
    adminDb.chain.findMany.mockResolvedValue([{ id: 137, name: 'Polygon', nativeCurrencySymbol: 'MATIC' }]);
    adminDb.gasTankAlertConfig.findUnique.mockResolvedValue({
      thresholdWei: '1000000000000000', emailEnabled: false, webhookEnabled: true,
    });
    balance.getNativeBalance.mockResolvedValue(500_000_000_000_000n); // 0.0005 — below threshold
    balance.getFeeData.mockResolvedValue({ gasPriceWei: 30_000_000_000n });

    const out = await svc.list(9);
    expect(out).toEqual([expect.objectContaining({
      chainId: 137, chainName: 'Polygon', address: '0xgt',
      balanceWei: '500000000000000', thresholdWei: '1000000000000000',
      status: 'critical',
      estimatedOpsRemaining: Math.floor(500_000_000_000_000 / (30_000_000_000 * 21000)),
    })]);
  });

  it('history returns paginated rows for the project+chain', async () => {
    adminDb.gasTankTransaction.findMany.mockResolvedValue([
      { id: 1n, txHash: '0xh', operationType: 'sweep', status: 'confirmed', submittedAt: new Date() },
    ]);
    adminDb.gasTankTransaction.count.mockResolvedValue(1);
    const out = await svc.getHistory(9, 137, { limit: 50, offset: 0 });
    expect(out.total).toBe(1);
    expect(out.rows).toHaveLength(1);
  });

  it('builds EIP-681 topup URI', async () => {
    adminDb.wallet.findMany.mockResolvedValue([{ id: 1n, address: '0xgt', chainId: 137, projectId: 9n, walletType: 'gas_tank' }]);
    const out = await svc.getTopupUri(9, 137);
    expect(out.eip681Uri).toBe('ethereum:0xgt@137');
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `cd services/client-api && pnpm jest gas-tanks`

- [ ] **Step 3: Implement service**

```typescript
// gas-tanks.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminDatabaseService } from '../prisma/admin-database.service';

interface BalanceService {
  getNativeBalance(chainId: number, address: string): Promise<bigint>;
  getFeeData(chainId: number): Promise<{ gasPriceWei: bigint }>;
}

@Injectable()
export class GasTanksService {
  constructor(
    @Inject(AdminDatabaseService) private readonly db: AdminDatabaseService,
    @Inject('BALANCE_SERVICE') private readonly balance: BalanceService,
  ) {}

  async list(projectId: number) {
    const tanks = await this.db.wallet.findMany({
      where: { projectId: BigInt(projectId), walletType: 'gas_tank' },
    });
    if (tanks.length === 0) return [];
    const chainIds = [...new Set(tanks.map((t) => t.chainId))];
    const chains = await this.db.chain.findMany({ where: { id: { in: chainIds } } });
    const chainMap = new Map(chains.map((c) => [c.id, c]));

    return Promise.all(
      tanks.map(async (t) => {
        const cfg = await this.db.gasTankAlertConfig.findUnique({
          where: { projectId_chainId: { projectId: BigInt(projectId), chainId: t.chainId } },
        });
        const balanceWei = await this.balance.getNativeBalance(t.chainId, t.address);
        const fee = await this.balance.getFeeData(t.chainId);
        const thresholdWei = cfg?.thresholdWei ?? '0';
        const status = this.computeStatus(balanceWei, BigInt(thresholdWei));
        const eta = fee.gasPriceWei > 0n ? Number(balanceWei / (fee.gasPriceWei * 21000n)) : 0;
        const chain = chainMap.get(t.chainId);
        return {
          chainId: t.chainId,
          chainName: chain?.name ?? `Chain ${t.chainId}`,
          nativeSymbol: chain?.nativeCurrencySymbol ?? 'ETH',
          address: t.address,
          derivationPath: `m/44'/60'/1000'/${t.chainId}/0`,
          balanceWei: balanceWei.toString(),
          gasPriceWei: fee.gasPriceWei.toString(),
          thresholdWei,
          estimatedOpsRemaining: eta,
          status,
          alertConfig: cfg
            ? { emailEnabled: cfg.emailEnabled, webhookEnabled: cfg.webhookEnabled }
            : { emailEnabled: false, webhookEnabled: true },
        };
      }),
    );
  }

  computeStatus(balance: bigint, threshold: bigint): 'ok' | 'low' | 'critical' {
    if (threshold === 0n) return 'ok';
    if (balance < threshold) return 'critical';
    if (balance < threshold * 2n) return 'low';
    return 'ok';
  }

  async getHistory(
    projectId: number,
    chainId: number,
    opts: { limit: number; offset: number; type?: string; from?: Date; to?: Date },
  ) {
    const where: any = { projectId: BigInt(projectId), chainId };
    if (opts.type) where.operationType = opts.type;
    if (opts.from || opts.to) {
      where.submittedAt = {};
      if (opts.from) where.submittedAt.gte = opts.from;
      if (opts.to) where.submittedAt.lte = opts.to;
    }
    const [rows, total] = await Promise.all([
      this.db.gasTankTransaction.findMany({
        where, orderBy: { submittedAt: 'desc' },
        take: opts.limit, skip: opts.offset,
      }),
      this.db.gasTankTransaction.count({ where }),
    ]);
    return { rows, total };
  }

  async getTopupUri(projectId: number, chainId: number) {
    const tank = await this.db.wallet.findFirst({
      where: { projectId: BigInt(projectId), chainId, walletType: 'gas_tank' },
    });
    if (!tank) throw new NotFoundException(`Gas tank not found for chain ${chainId}`);
    return {
      address: tank.address,
      chainId,
      eip681Uri: `ethereum:${tank.address}@${chainId}`,
    };
  }
}
```

- [ ] **Step 4: Wire `BALANCE_SERVICE` provider**

In `gas-tanks.module.ts`, register a factory that calls core-wallet-service via HTTP (mirror `WalletService`'s axios pattern). Endpoints to call:
- `GET ${CORE_WALLET}/wallets/balance/:chainId/:address` → returns `{ balance: string }`
- `GET ${CORE_WALLET}/wallets/fee-data/:chainId` → returns `{ gasPriceWei: string }`

```typescript
// gas-tanks.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GasTanksController } from './gas-tanks.controller';
import { GasTanksService } from './gas-tanks.service';

@Module({
  controllers: [GasTanksController],
  providers: [
    GasTanksService,
    {
      provide: 'BALANCE_SERVICE',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const baseUrl = cfg.get<string>('CORE_WALLET_SERVICE_URL', 'http://localhost:3004');
        const headers = { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
        return {
          async getNativeBalance(chainId: number, address: string) {
            const { data } = await axios.get(`${baseUrl}/wallets/balance/${chainId}/${address}`, { headers, timeout: 10000 });
            return BigInt(data.balance ?? data.balanceWei ?? '0');
          },
          async getFeeData(chainId: number) {
            const { data } = await axios.get(`${baseUrl}/wallets/fee-data/${chainId}`, { headers, timeout: 10000 });
            return { gasPriceWei: BigInt(data.gasPriceWei ?? data.maxFeePerGas ?? '0') };
          },
        };
      },
    },
  ],
})
export class GasTanksModule {}
```

- [ ] **Step 5: Implement controller — read endpoints only**

```typescript
// gas-tanks.controller.ts (read endpoints)
import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientAuth, CurrentProjectId } from '../common/decorators';
import { GasTanksService } from './gas-tanks.service';

@ApiTags('Gas Tanks')
@ApiSecurity('ApiKey')
@Controller('client/v1/gas-tanks')
export class GasTanksController {
  constructor(private readonly service: GasTanksService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({ summary: 'List gas tanks for the active project (live balance)' })
  @ApiResponse({ status: 200, description: 'OK' })
  async list(@CurrentProjectId() projectId: number) {
    const gasTanks = await this.service.list(projectId);
    return { success: true, gasTanks };
  }

  @Get(':chainId/history')
  @ClientAuth('read')
  @ApiOperation({ summary: 'Gas tank transaction history (paginated)' })
  async history(
    @CurrentProjectId() projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.service.getHistory(projectId, chainId, {
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true, ...result };
  }

  @Get(':chainId/topup-uri')
  @ClientAuth('read')
  @ApiOperation({ summary: 'EIP-681 top-up URI + address for QR rendering' })
  async topupUri(
    @CurrentProjectId() projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const data = await this.service.getTopupUri(projectId, chainId);
    return { success: true, ...data };
  }
}
```

- [ ] **Step 6: Register module in `app.module.ts`**

Add `GasTanksModule` to imports.

- [ ] **Step 7: Run tests → pass + smoke-test endpoints**

Run: `pnpm jest gas-tanks`
Then: start client-api locally and `curl -H "Authorization: Bearer <token>" http://localhost:3002/client/v1/gas-tanks` — should return JSON.

- [ ] **Step 8: Commit**

```bash
git add services/client-api/src/gas-tanks services/client-api/src/app.module.ts
git commit -m "feat(client-api): gas-tanks module with read endpoints"
```

---

## Task 10: client-api alert-config endpoints (TDD)

**Files:**
- Create: `services/client-api/src/gas-tanks/dto/update-alert-config.dto.ts`
- Modify: `services/client-api/src/gas-tanks/gas-tanks.service.ts` — add methods
- Modify: `services/client-api/src/gas-tanks/gas-tanks.controller.ts` — add endpoints
- Modify: `services/client-api/src/gas-tanks/gas-tanks.service.spec.ts` — add tests

- [ ] **Step 1: Write the DTO**

```typescript
// dto/update-alert-config.dto.ts
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAlertConfigDto {
  @ApiPropertyOptional({ description: 'Threshold in wei (string, max 80 chars)' })
  @IsOptional() @IsString() @Matches(/^\d{1,80}$/)
  thresholdWei?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() webhookEnabled?: boolean;
}
```

- [ ] **Step 2: Add failing tests**

```typescript
// in gas-tanks.service.spec.ts
it('getAlertConfig returns existing row', async () => {
  adminDb.gasTankAlertConfig.findUnique.mockResolvedValue({
    thresholdWei: '500', emailEnabled: false, webhookEnabled: true,
  });
  const out = await svc.getAlertConfig(9, 137);
  expect(out).toEqual({ thresholdWei: '500', emailEnabled: false, webhookEnabled: true });
});

it('getAlertConfig returns defaults when row missing', async () => {
  adminDb.gasTankAlertConfig.findUnique.mockResolvedValue(null);
  const out = await svc.getAlertConfig(9, 137);
  expect(out.webhookEnabled).toBe(true);
  expect(out.emailEnabled).toBe(false);
});

it('updateAlertConfig upserts the row', async () => {
  adminDb.gasTankAlertConfig.upsert.mockResolvedValue({});
  await svc.updateAlertConfig(9, 137, { thresholdWei: '999', webhookEnabled: false });
  expect(adminDb.gasTankAlertConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { projectId_chainId: { projectId: 9n, chainId: 137 } },
    update: { thresholdWei: '999', webhookEnabled: false },
    create: expect.objectContaining({ projectId: 9n, chainId: 137, thresholdWei: '999', webhookEnabled: false }),
  }));
});
```

- [ ] **Step 3: Run tests → fail**

Run: `pnpm jest gas-tanks`

- [ ] **Step 4: Implement methods**

```typescript
// in gas-tanks.service.ts
async getAlertConfig(projectId: number, chainId: number) {
  const row = await this.db.gasTankAlertConfig.findUnique({
    where: { projectId_chainId: { projectId: BigInt(projectId), chainId } },
  });
  return {
    thresholdWei: row?.thresholdWei ?? '0',
    emailEnabled: row?.emailEnabled ?? false,
    webhookEnabled: row?.webhookEnabled ?? true,
  };
}

async updateAlertConfig(
  projectId: number,
  chainId: number,
  patch: { thresholdWei?: string; emailEnabled?: boolean; webhookEnabled?: boolean },
) {
  await this.db.gasTankAlertConfig.upsert({
    where: { projectId_chainId: { projectId: BigInt(projectId), chainId } },
    update: { ...patch },
    create: {
      projectId: BigInt(projectId),
      chainId,
      thresholdWei: patch.thresholdWei ?? '0',
      emailEnabled: patch.emailEnabled ?? false,
      webhookEnabled: patch.webhookEnabled ?? true,
    },
  });
  return this.getAlertConfig(projectId, chainId);
}
```

- [ ] **Step 5: Add controller endpoints**

```typescript
// in gas-tanks.controller.ts
import { Body, Patch } from '@nestjs/common';
import { UpdateAlertConfigDto } from './dto/update-alert-config.dto';

@Get(':chainId/alert-config')
@ClientAuth('read')
async getAlertConfig(
  @CurrentProjectId() projectId: number,
  @Param('chainId', ParseIntPipe) chainId: number,
) {
  return { success: true, config: await this.service.getAlertConfig(projectId, chainId) };
}

@Patch(':chainId/alert-config')
@ClientAuth('write')
async updateAlertConfig(
  @CurrentProjectId() projectId: number,
  @Param('chainId', ParseIntPipe) chainId: number,
  @Body() body: UpdateAlertConfigDto,
) {
  return { success: true, config: await this.service.updateAlertConfig(projectId, chainId, body) };
}
```

- [ ] **Step 6: Run tests → pass**

Run: `pnpm jest gas-tanks`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add services/client-api/src/gas-tanks
git commit -m "feat(client-api): gas-tank alert-config endpoints"
```

---

## Task 11: Default alert-config row at gas-tank creation

**Files:**
- Modify: `services/client-api/src/project-setup/project-setup.service.ts` (or core-wallet-service equivalent — wherever the gas tank wallet is inserted)

- [ ] **Step 1: Locate the insertion site**

Run: `grep -n "wallet_type.*gas_tank\|walletType.*gas_tank" services/*/src -r --include='*.ts'`
The file that does the `INSERT` (or Prisma `create`) of the gas tank wallet is the right place.

- [ ] **Step 2: After the gas-tank wallet insert, also create the alert-config row**

```typescript
const gasTank = await tx.wallet.create({ data: { /* ... */ walletType: 'gas_tank' } });
const fee = await this.balanceService.getFeeData(chainId);
const defaultThreshold = (fee.gasPriceWei * 21000n * 10n).toString(); // 10 native transfers
await tx.gasTankAlertConfig.create({
  data: {
    projectId: BigInt(projectId),
    chainId,
    thresholdWei: defaultThreshold,
    webhookEnabled: true,
    emailEnabled: false,
  },
});
```

> Wrap inside the existing transaction so failure rolls back the wallet too. If `getFeeData` is unavailable in this code path, fall back to `'1000000000000000'` (0.001 ETH).

- [ ] **Step 3: Update the project-setup spec**

Add: assert that creating a gas tank inserts the alert-config row.

- [ ] **Step 4: Run tests**

Run: `pnpm jest project-setup`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add services/client-api/src/project-setup
git commit -m "feat(setup): seed gas_tank_alert_config when gas tank is created"
```

---

## Task 12: client-api keystore-export endpoint (TDD, security-critical)

**Files:**
- Create: `services/client-api/src/gas-tanks/dto/export-keystore.dto.ts`
- Create: `services/client-api/src/gas-tanks/keystore.helper.ts`
- Create: `services/client-api/src/gas-tanks/keystore.helper.spec.ts`
- Modify: `services/client-api/src/gas-tanks/gas-tanks.service.ts`
- Modify: `services/client-api/src/gas-tanks/gas-tanks.controller.ts`

- [ ] **Step 1: DTO**

```typescript
// dto/export-keystore.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExportKeystoreDto {
  @ApiProperty({ description: 'Project mnemonic (12 or 24 words)' })
  @IsString() @MinLength(20)
  mnemonic!: string;

  @ApiProperty({ description: 'Password to encrypt the keystore' })
  @IsString() @MinLength(8)
  password!: string;
}
```

- [ ] **Step 2: Write failing test for keystore.helper**

```typescript
// keystore.helper.spec.ts
import { deriveGasTankKeystore } from './keystore.helper';
import { Wallet } from 'ethers';

describe('deriveGasTankKeystore', () => {
  const mnemonic = 'test test test test test test test test test test test junk';

  it('produces a Web3 Secret Storage v3 JSON', async () => {
    const json = await deriveGasTankKeystore(mnemonic, 137, 'pw1234567');
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
    expect(parsed.crypto.cipher).toBe('aes-128-ctr');
  });

  it('round-trips: keystore decrypts back to the gas-tank private key', async () => {
    const json = await deriveGasTankKeystore(mnemonic, 137, 'pw1234567');
    const restored = await Wallet.fromEncryptedJson(json, 'pw1234567');
    // Independent derivation
    const expected = Wallet.fromPhrase(mnemonic).deriveChild(0); // adjust path below in impl
    expect(restored.address).toBe(expected.address);
  });
});
```

- [ ] **Step 3: Implement helper**

```typescript
// keystore.helper.ts
import { HDNodeWallet, Mnemonic, Wallet } from 'ethers';

const path = (chainId: number) => `m/44'/60'/1000'/${chainId}/0`;

export async function deriveGasTankKeystore(
  mnemonic: string,
  chainId: number,
  password: string,
): Promise<string> {
  const hd = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic.trim()), path(chainId));
  const wallet = new Wallet(hd.privateKey);
  const json = await wallet.encrypt(password);
  // Best-effort scrub of in-memory secrets — JS GC will eventually reclaim, but null out our refs.
  (hd as any).privateKey = undefined;
  return json;
}
```

> Update the test's `expected` derivation to match the same path: `HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), path(137))`.

- [ ] **Step 4: Run helper tests → pass**

Run: `pnpm jest keystore.helper`

- [ ] **Step 5: Add service method + controller endpoint**

```typescript
// in gas-tanks.service.ts
import { deriveGasTankKeystore } from './keystore.helper';

async exportKeystore(projectId: number, chainId: number, mnemonic: string, password: string) {
  const json = await deriveGasTankKeystore(mnemonic, chainId, password);
  // audit (no secret material in the payload)
  this.auditLogger?.emit('gas_tank.keystore_exported', { projectId, chainId });
  return { keystore: JSON.parse(json) };
}
```

```typescript
// in gas-tanks.controller.ts
import { Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ExportKeystoreDto } from './dto/export-keystore.dto';

@Post(':chainId/export-keystore')
@ClientAuth('write')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@ApiOperation({
  summary: 'Encrypt the gas-tank private key as a Web3 Secret Storage v3 JSON',
  description: 'Mnemonic is processed in-memory only — never logged or persisted. Rate-limited to 5/min.',
})
async exportKeystore(
  @CurrentProjectId() projectId: number,
  @Param('chainId', ParseIntPipe) chainId: number,
  @Body() body: ExportKeystoreDto,
) {
  return { success: true, ...(await this.service.exportKeystore(projectId, chainId, body.mnemonic, body.password)) };
}
```

> If `@nestjs/throttler` is not yet installed, install per package.json convention. If a different rate-limit primitive is in use elsewhere (`grep -rn "@Throttle\|RateLimit" services/client-api/src`), use that.

- [ ] **Step 6: Audit-log integration**

Find the existing audit logger (`grep -rn "auditLogger\|AuditLog\b" services/client-api/src`). Inject it into `GasTanksService` (or use the same pattern as a reference module). The audit event has only `projectId` and `chainId` — never the mnemonic or keystore.

- [ ] **Step 7: Verify mnemonic is never logged**

Skim `gas-tanks.service.ts`, `gas-tanks.controller.ts`, request-logging interceptors, validation pipes for any `console.log`/`logger.log` that could leak the body. The interceptor must redact `password` and `mnemonic` fields from `gas_tank/export-keystore` requests; if the global interceptor doesn't already redact, add a redaction list.

- [ ] **Step 8: Run all client-api tests**

Run: `pnpm jest`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add services/client-api/src/gas-tanks
git commit -m "feat(client-api): keystore export endpoint (rate-limited, audit-logged)"
```

---

## Task 13: Frontend API wrappers

**Files:**
- Modify: `apps/client/lib/api.ts`

- [ ] **Step 1: Add wrappers**

Append:

```typescript
// gas-tank API wrappers
export const gasTanksApi = {
  list: () => apiFetch<{ success: boolean; gasTanks: GasTank[] }>('/v1/gas-tanks'),
  history: (chainId: number, opts: { limit?: number; offset?: number; type?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(opts).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
    return apiFetch<{ success: boolean; rows: GasTankTx[]; total: number }>(`/v1/gas-tanks/${chainId}/history${qs ? `?${qs}` : ''}`);
  },
  topupUri: (chainId: number) =>
    apiFetch<{ success: boolean; address: string; chainId: number; eip681Uri: string }>(`/v1/gas-tanks/${chainId}/topup-uri`),
  getAlertConfig: (chainId: number) =>
    apiFetch<{ success: boolean; config: AlertConfig }>(`/v1/gas-tanks/${chainId}/alert-config`),
  updateAlertConfig: (chainId: number, body: Partial<AlertConfig>) =>
    apiFetch<{ success: boolean; config: AlertConfig }>(`/v1/gas-tanks/${chainId}/alert-config`, { method: 'PATCH', body: JSON.stringify(body) }),
  exportKeystore: (chainId: number, body: { mnemonic: string; password: string }) =>
    apiFetch<{ success: boolean; keystore: object }>(`/v1/gas-tanks/${chainId}/export-keystore`, { method: 'POST', body: JSON.stringify(body) }),
};

export interface GasTank {
  chainId: number; chainName: string; nativeSymbol: string;
  address: string; derivationPath: string;
  balanceWei: string; gasPriceWei: string; thresholdWei: string;
  estimatedOpsRemaining: number;
  status: 'ok' | 'low' | 'critical';
  alertConfig: { emailEnabled: boolean; webhookEnabled: boolean };
}
export interface GasTankTx {
  id: string; txHash: string; operationType: string;
  toAddress?: string | null; gasUsed?: string | null;
  gasPriceWei: string; gasCostWei?: string | null;
  status: 'submitted' | 'confirmed' | 'failed';
  blockNumber?: string | null;
  submittedAt: string; confirmedAt?: string | null;
}
export interface AlertConfig { thresholdWei: string; emailEnabled: boolean; webhookEnabled: boolean; }
```

> Ensure `apiFetch` is the existing helper exported from this file. Don't introduce a new HTTP wrapper.

- [ ] **Step 2: Type-check**

Run: `cd apps/client && pnpm typecheck` (or `tsc --noEmit`).
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/lib/api.ts
git commit -m "feat(client): gas-tank API wrappers"
```

---

## Task 14: `/gas-tanks` page + GasTankCard

**Files:**
- Create: `apps/client/app/gas-tanks/page.tsx`
- Create: `apps/client/components/gas-tanks/gas-tank-card.tsx`

- [ ] **Step 1: Write the card component**

```tsx
// gas-tank-card.tsx
'use client';
import { useState } from 'react';
import { Fuel, Copy, Download, Bell, History as HistoryIcon } from 'lucide-react';
import { GasTank } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';

interface Props {
  tank: GasTank;
  onTopUp: () => void;
  onExport: () => void;
  onConfigureAlerts: () => void;
  onViewHistory: () => void;
}

const statusColor: Record<GasTank['status'], string> = {
  ok: 'bg-green-500/10 text-green-400 border-green-500/30',
  low: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function formatBalance(wei: string, decimals = 18) {
  const n = Number(BigInt(wei)) / 10 ** decimals;
  return n < 0.0001 ? n.toExponential(2) : n.toFixed(6);
}

export function GasTankCard({ tank, onTopUp, onExport, onConfigureAlerts, onViewHistory }: Props) {
  const [showPath, setShowPath] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2"><Fuel className="h-5 w-5 text-blue-400" /></div>
          <div>
            <h3 className="text-lg font-semibold">{tank.chainName}</h3>
            <p className="text-sm text-zinc-400">Chain ID {tank.chainId}</p>
          </div>
        </div>
        <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusColor[tank.status]}`}>
          {tank.status.toUpperCase()}
        </span>
      </div>

      <div className="font-mono text-sm break-all flex items-center gap-2">
        <span className="text-zinc-300">{tank.address}</span>
        <CopyButton value={tank.address} />
      </div>

      <button onClick={() => setShowPath(s => !s)} className="text-xs text-zinc-500 hover:text-zinc-300">
        {showPath ? '▼' : '▶'} Derivation: <code>{showPath ? tank.derivationPath : '(hidden)'}</code>
      </button>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <p className="text-xs text-zinc-500">Balance</p>
          <p className="text-2xl font-semibold">
            {formatBalance(tank.balanceWei)} <span className="text-sm text-zinc-400">{tank.nativeSymbol}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Est. operations remaining</p>
          <p className="text-2xl font-semibold">{tank.estimatedOpsRemaining.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button onClick={onTopUp} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500">
          Top Up
        </button>
        <button onClick={onConfigureAlerts} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
          <Bell className="h-4 w-4" /> Alerts
        </button>
        <button onClick={onExport} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
          <Download className="h-4 w-4" /> Keystore
        </button>
        <button onClick={onViewHistory} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
          <HistoryIcon className="h-4 w-4" /> History
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

```tsx
// app/gas-tanks/page.tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gasTanksApi, GasTank } from '@/lib/api';
import { LayoutShell } from '@/components/layout-shell';
import { GasTankCard } from '@/components/gas-tanks/gas-tank-card';
import { TopupModal } from '@/components/gas-tanks/topup-modal';
import { AlertConfigModal } from '@/components/gas-tanks/alert-config-modal';
import { ExportKeystoreModal } from '@/components/gas-tanks/export-keystore-modal';
import { GasTankHistoryTable } from '@/components/gas-tanks/gas-tank-history-table';

type ModalKind = 'topup' | 'alerts' | 'keystore' | 'history' | null;

export default function GasTanksPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['gas-tanks'],
    queryFn: () => gasTanksApi.list(),
    refetchInterval: 30_000,
  });
  const [active, setActive] = useState<{ tank: GasTank; modal: ModalKind } | null>(null);
  const open = (tank: GasTank, modal: ModalKind) => setActive({ tank, modal });
  const close = () => setActive(null);

  return (
    <LayoutShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-bold">Gas Tanks</h1>
          <p className="text-sm text-zinc-400">Wallets that fund deploys, sweeps, flushes, and forwarder operations.</p>
        </header>

        {isLoading && <p className="text-zinc-500">Loading…</p>}
        {error && <p className="text-red-400">Failed to load gas tanks.</p>}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {data?.gasTanks.map((tank) => (
            <GasTankCard
              key={tank.chainId}
              tank={tank}
              onTopUp={() => open(tank, 'topup')}
              onConfigureAlerts={() => open(tank, 'alerts')}
              onExport={() => open(tank, 'keystore')}
              onViewHistory={() => open(tank, 'history')}
            />
          ))}
        </div>

        {active?.modal === 'topup' && <TopupModal tank={active.tank} onClose={close} />}
        {active?.modal === 'alerts' && <AlertConfigModal tank={active.tank} onClose={close} />}
        {active?.modal === 'keystore' && <ExportKeystoreModal tank={active.tank} onClose={close} />}
        {active?.modal === 'history' && <GasTankHistoryTable tank={active.tank} onClose={close} />}
      </div>
    </LayoutShell>
  );
}
```

- [ ] **Step 3: Run dev server and verify rendering**

Run: `cd apps/client && pnpm dev`
Visit: `http://localhost:3000/gas-tanks` (after logging in).
Expected: cards render with live balances. Buttons open placeholder modals — implemented in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/client/app/gas-tanks apps/client/components/gas-tanks/gas-tank-card.tsx
git commit -m "feat(client): gas-tanks page + card component"
```

---

## Task 15: Top-up modal with auto-poll

**Files:**
- Create: `apps/client/components/gas-tanks/topup-modal.tsx`

- [ ] **Step 1: Implement**

```tsx
// topup-modal.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { GasTank, gasTanksApi } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { QrCode } from '@/components/qr-code';

interface Props { tank: GasTank; onClose: () => void; }

function formatNative(wei: string) { return (Number(BigInt(wei)) / 1e18).toFixed(6); }

export function TopupModal({ tank, onClose }: Props) {
  const { data: uri } = useQuery({
    queryKey: ['topup-uri', tank.chainId],
    queryFn: () => gasTanksApi.topupUri(tank.chainId),
  });
  const startBalance = useRef(BigInt(tank.balanceWei));
  const [funded, setFunded] = useState(false);

  const { data: live } = useQuery({
    queryKey: ['gas-tanks-poll', tank.chainId],
    queryFn: () => gasTanksApi.list(),
    refetchInterval: 15_000,
    enabled: !funded,
  });
  const current = live?.gasTanks.find((t) => t.chainId === tank.chainId);

  useEffect(() => {
    if (!current) return;
    if (BigInt(current.balanceWei) > startBalance.current) {
      setFunded(true);
      // stop polling after 60s of stability
      const t = setTimeout(() => onClose(), 60_000);
      return () => clearTimeout(t);
    }
  }, [current, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top Up Gas Tank — {tank.chainName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        {uri && (
          <div className="flex justify-center bg-white p-4 rounded-lg">
            <QrCode value={uri.eip681Uri} size={200} />
          </div>
        )}

        <div>
          <p className="text-xs text-zinc-500 mb-1">Address</p>
          <div className="font-mono text-sm break-all flex items-center gap-2">
            <span>{tank.address}</span>
            <CopyButton value={tank.address} />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-800 p-3">
          <p className="text-xs text-zinc-500">Live balance ({tank.nativeSymbol})</p>
          <p className="text-2xl font-semibold">{current ? formatNative(current.balanceWei) : '…'}</p>
          {funded && <p className="mt-2 text-sm text-green-400">✓ Funded! Closing automatically.</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

Open the modal in the browser. Confirm QR renders and balance polls every 15s.

- [ ] **Step 3: Commit**

```bash
git add apps/client/components/gas-tanks/topup-modal.tsx
git commit -m "feat(client): gas-tank top-up modal with QR + auto-poll"
```

---

## Task 16: Alert-config modal

**Files:**
- Create: `apps/client/components/gas-tanks/alert-config-modal.tsx`

- [ ] **Step 1: Implement**

```tsx
// alert-config-modal.tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { GasTank, gasTanksApi } from '@/lib/api';

interface Props { tank: GasTank; onClose: () => void; }
type Unit = 'wei' | 'gwei' | 'ether';

function fromWei(wei: string, unit: Unit) {
  const n = BigInt(wei);
  if (unit === 'wei') return n.toString();
  if (unit === 'gwei') return (Number(n) / 1e9).toString();
  return (Number(n) / 1e18).toString();
}
function toWei(value: string, unit: Unit) {
  if (unit === 'wei') return value.replace(/\D/g, '') || '0';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '0';
  if (unit === 'gwei') return BigInt(Math.floor(n * 1e9)).toString();
  return BigInt(Math.floor(n * 1e18)).toString();
}

export function AlertConfigModal({ tank, onClose }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['alert-config', tank.chainId],
    queryFn: () => gasTanksApi.getAlertConfig(tank.chainId),
  });
  const [unit, setUnit] = useState<Unit>('ether');
  const [thresholdInput, setThresholdInput] = useState<string>(() => fromWei(data?.config.thresholdWei ?? tank.thresholdWei, 'ether'));
  const [emailEnabled, setEmailEnabled] = useState<boolean>(data?.config.emailEnabled ?? false);
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(data?.config.webhookEnabled ?? true);

  const mut = useMutation({
    mutationFn: () => gasTanksApi.updateAlertConfig(tank.chainId, {
      thresholdWei: toWei(thresholdInput, unit),
      emailEnabled, webhookEnabled,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gas-tanks'] });
      qc.invalidateQueries({ queryKey: ['alert-config', tank.chainId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configure Alerts — {tank.chainName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        <div>
          <label className="text-xs text-zinc-500">Low-balance threshold</label>
          <div className="flex gap-2">
            <input value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)}
                   className="flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}
                    className="rounded-md bg-zinc-800 px-3 py-2 text-sm">
              <option value="ether">{tank.nativeSymbol}</option>
              <option value="gwei">gwei</option>
              <option value="wei">wei</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={webhookEnabled} onChange={(e) => setWebhookEnabled(e.target.checked)} />
          Send <code>gas_tank.low_balance</code> webhook events
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
          Email notification <span className="text-xs">(coming soon)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-white/5">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test save → reload → values persist**

- [ ] **Step 3: Commit**

```bash
git add apps/client/components/gas-tanks/alert-config-modal.tsx
git commit -m "feat(client): gas-tank alert-config modal"
```

---

## Task 17: Export-keystore modal

**Files:**
- Create: `apps/client/components/gas-tanks/export-keystore-modal.tsx`

- [ ] **Step 1: Implement (two-step modal)**

```tsx
// export-keystore-modal.tsx
'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, AlertTriangle } from 'lucide-react';
import { GasTank, gasTanksApi } from '@/lib/api';

interface Props { tank: GasTank; onClose: () => void; }

export function ExportKeystoreModal({ tank, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');

  const mut = useMutation({
    mutationFn: () => gasTanksApi.exportKeystore(tank.chainId, { mnemonic: mnemonic.trim(), password }),
    onSuccess: (res) => {
      const blob = new Blob([JSON.stringify(res.keystore, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gas-tank-${tank.chainId}-${tank.address.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMnemonic(''); setPassword('');
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Export Keystore — {tank.chainName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        {step === 1 && (
          <>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-yellow-300">
                <AlertTriangle className="h-4 w-4" /> Security notice
              </div>
              <p className="mt-2 text-zinc-300">
                The keystore is generated by the server from your mnemonic. Your mnemonic is sent over TLS,
                used in-memory only, and is <strong>never stored or logged</strong>. The endpoint is
                rate-limited and audit-logged. The downloaded JSON is encrypted with the password you choose.
              </p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setStep(2)} className="rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500">
                I understand, continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <label className="block text-xs text-zinc-500">Project mnemonic</label>
            <textarea value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} rows={3}
                      autoComplete="off" spellCheck={false}
                      className="w-full rounded-md bg-zinc-800 px-3 py-2 font-mono text-sm" />
            <label className="block text-xs text-zinc-500">Keystore password (≥ 8 chars)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm" />
            {mut.error && <p className="text-sm text-red-400">{(mut.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setStep(1)} className="rounded-md px-3 py-2 text-sm hover:bg-white/5">Back</button>
              <button onClick={() => mut.mutate()}
                      disabled={mut.isPending || mnemonic.split(/\s+/).length < 12 || password.length < 8}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 disabled:opacity-50">
                {mut.isPending ? 'Encrypting…' : 'Download keystore'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the download produces a valid v3 keystore (manual)**

Decrypt with `ethers.Wallet.fromEncryptedJson(json, password)` in a Node REPL → address matches the gas tank's.

- [ ] **Step 3: Commit**

```bash
git add apps/client/components/gas-tanks/export-keystore-modal.tsx
git commit -m "feat(client): gas-tank keystore export modal"
```

---

## Task 18: History table component (modal + full page)

**Files:**
- Create: `apps/client/components/gas-tanks/gas-tank-history-table.tsx`
- Create: `apps/client/components/gas-tanks/gas-tank-history-page.tsx`

- [ ] **Step 1: History table (used inside the card modal — last 5)**

```tsx
// gas-tank-history-table.tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink } from 'lucide-react';
import { GasTank, GasTankTx, gasTanksApi } from '@/lib/api';
import Link from 'next/link';

interface Props { tank: GasTank; onClose: () => void; }

const opLabel: Record<string, string> = {
  deploy_wallet: 'Wallet deploy',
  deploy_forwarder: 'Forwarder deploy',
  sweep: 'Sweep',
  flush: 'Flush',
  topup_internal: 'Internal top-up',
  other: 'Other',
};

export function GasTankHistoryTable({ tank, onClose }: Props) {
  const { data } = useQuery({
    queryKey: ['gas-tank-history', tank.chainId, 5],
    queryFn: () => gasTanksApi.history(tank.chainId, { limit: 5, offset: 0 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Gas Spend — {tank.chainName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-2">When</th><th>Type</th><th>Status</th><th>Gas cost</th><th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r: GasTankTx) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="py-2">{new Date(r.submittedAt).toLocaleString()}</td>
                <td>{opLabel[r.operationType] ?? r.operationType}</td>
                <td>{r.status}</td>
                <td className="font-mono text-xs">
                  {r.gasCostWei ? (Number(BigInt(r.gasCostWei)) / 1e18).toFixed(6) + ' ' + tank.nativeSymbol : '—'}
                </td>
                <td>
                  <a className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                     href={`https://etherscan.io/tx/${r.txHash}`} target="_blank" rel="noreferrer">
                    {r.txHash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No gas spend yet.</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end">
          <Link href={`/gas-tanks/${tank.chainId}/history`} className="text-sm text-blue-400 hover:underline">
            View full history →
          </Link>
        </div>
      </div>
    </div>
  );
}
```

> **Explorer URL:** the hard-coded `etherscan.io` is wrong for non-Ethereum chains. Wire the explorer URL from the `chains` table (already returned by `/v1/chains` somewhere in this app — `grep -rn "explorerUrl" apps/client/lib`). If not yet exposed, extend the `GasTank` type to include `explorerUrl` and add it in the backend response (Task 9 step 3 — `chain.explorerUrl`).

- [ ] **Step 2: Full history page**

Create `apps/client/app/gas-tanks/[chainId]/history/page.tsx` rendering filters (operation_type select, date range pickers) + paginated table backed by `gasTanksApi.history`. Reuse the row template from the modal.

- [ ] **Step 3: Smoke-test**

Confirm table loads in the modal and the link navigates to the full-history page.

- [ ] **Step 4: Commit**

```bash
git add apps/client/components/gas-tanks/gas-tank-history-table.tsx \
        apps/client/app/gas-tanks
git commit -m "feat(client): gas-tank history table + full-history page"
```

---

## Task 19: Dashboard widget + critical banner

**Files:**
- Create: `apps/client/components/gas-tanks/gas-tank-summary.tsx`
- Modify: `apps/client/app/page.tsx`

- [ ] **Step 1: Implement summary widget**

```tsx
// gas-tank-summary.tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Fuel, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { GasTank, gasTanksApi } from '@/lib/api';
import { TopupModal } from './topup-modal';

const dot: Record<GasTank['status'], string> = {
  ok: 'bg-green-400', low: 'bg-yellow-400', critical: 'bg-red-400',
};

export function GasTankSummary() {
  const { data } = useQuery({
    queryKey: ['gas-tanks'],
    queryFn: () => gasTanksApi.list(),
    refetchInterval: 30_000,
  });
  const [topup, setTopup] = useState<GasTank | null>(null);
  const tanks = data?.gasTanks ?? [];
  const critical = tanks.filter((t) => t.status === 'critical');

  return (
    <section className="space-y-3">
      {critical.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span><strong>{critical.length}</strong> gas tank{critical.length > 1 ? 's' : ''} below threshold. Top up to keep operations running.</span>
          <Link href="/gas-tanks" className="ml-auto text-red-300 hover:underline">Manage →</Link>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <header className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 font-semibold"><Fuel className="h-4 w-4" /> Gas Tanks</h3>
          <Link href="/gas-tanks" className="text-xs text-blue-400 hover:underline">View all</Link>
        </header>
        <ul className="divide-y divide-white/5">
          {tanks.map((t) => (
            <li key={t.chainId} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${dot[t.status]}`} />
                <span className="text-sm">{t.chainName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs">{(Number(BigInt(t.balanceWei)) / 1e18).toFixed(4)} {t.nativeSymbol}</span>
                <button onClick={() => setTopup(t)} className="text-xs text-blue-400 hover:underline">Top up</button>
              </div>
            </li>
          ))}
          {tanks.length === 0 && <li className="py-3 text-center text-xs text-zinc-500">No gas tanks yet.</li>}
        </ul>
      </div>

      {topup && <TopupModal tank={topup} onClose={() => setTopup(null)} />}
    </section>
  );
}
```

- [ ] **Step 2: Mount on dashboard**

In `apps/client/app/page.tsx`, add `<GasTankSummary />` below the custody balance section.

- [ ] **Step 3: Smoke-test**

Visit `/`. Confirm widget renders with live data. Force a critical tank by lowering threshold via API, refresh, confirm banner appears.

- [ ] **Step 4: Commit**

```bash
git add apps/client/components/gas-tanks/gas-tank-summary.tsx apps/client/app/page.tsx
git commit -m "feat(client): gas-tank dashboard widget + critical banner"
```

---

## Task 20: Sidebar entry

**Files:**
- Modify: `apps/client/components/sidebar.tsx`

- [ ] **Step 1: Add menu item under OPERATIONS**

```tsx
import { Fuel } from 'lucide-react';
// inside the OPERATIONS group:
{ label: 'Gas Tanks', href: '/gas-tanks', icon: Fuel },
```

> Match the exact shape of items already in the OPERATIONS group; if items use `{ name, path, Icon }` instead, follow that. Verify by reading the surrounding entries.

- [ ] **Step 2: Smoke-test active-state highlighting**

Click "Gas Tanks" → only Gas Tanks item is highlighted (recent fix in commit `5b30869` should keep this clean; verify still works).

- [ ] **Step 3: Commit**

```bash
git add apps/client/components/sidebar.tsx
git commit -m "feat(client): Gas Tanks sidebar entry under OPERATIONS"
```

---

## Task 21: End-to-end smoke pass + docs

**Files:**
- Modify: `docs/superpowers/specs/2026-05-05-gas-tank-client-ux-requirements.md` (or a status note)

- [ ] **Step 1: Run all service test suites**

Run: `pnpm -r test`
Expected: green across the affected services.

- [ ] **Step 2: Manual smoke checklist**

Run dev stack: `docker compose up -d`. Then:

- [ ] Login to client portal.
- [ ] Sidebar shows "Gas Tanks" under OPERATIONS.
- [ ] `/gas-tanks` lists one card per chain in the active project. Balances are non-zero where funded.
- [ ] Status pills color-coded correctly (force a `critical` by PATCHing threshold up, observe banner on dashboard).
- [ ] "Top Up" modal QR scans correctly (test with a mobile wallet on testnet).
- [ ] "Top Up" auto-poll: send funds → modal shows "Funded!" within 15-30s.
- [ ] "Configure Alerts" modal loads current values, saves successfully.
- [ ] "History" modal lists rows after running a sweep/forwarder-deploy job (trigger one manually if needed).
- [ ] "Export Keystore" downloads JSON; decrypt in `ethers.Wallet.fromEncryptedJson` to confirm address match.
- [ ] Webhook test: register an endpoint with `gas_tank.low_balance` event, lower threshold to force an alert, confirm webhook delivery + payload shape.

- [ ] **Step 3: Mark spec status complete**

Append a status note to `2026-05-05-gas-tank-client-ux-requirements.md` (or write a delivery note in `docs/superpowers/notes/`):

```markdown
> **Delivered 2026-05-06.** Implementation plan: `docs/superpowers/plans/2026-05-06-gas-tank-client-ux.md`. Email notification path is stubbed (logged only, no SMTP integration).
```

- [ ] **Step 4: Final commit**

```bash
git add -p
git commit -m "docs: mark gas tank client UX as delivered (email stubbed)"
```

---

## Self-Review Notes

Spec coverage:
- Item 1 (Dashboard widget) → Task 19. ✓
- Item 2 (Gas Tanks page) → Tasks 9, 10, 14, 18, 20. ✓
- Item 3 (Top-up flow) → Task 15. ✓
- Item 4 (Low balance alerts) → Tasks 1, 6, 7, 8, 11, 16; email stubbed (documented). ✓
- Item 5 (Gas consumption history) → Tasks 1, 3, 4, 5, 9, 18. ✓

Risk addressed inline: keystore export security (Task 12), reconciler dropped-tx max-age (Task 5), explorer URL per chain (Task 18 callout), sidebar shape match (Task 20 callout).

Open assumptions the implementer may need to confirm at execution time:
- Exact Prisma client injection token in cron-worker (`'PRISMA_CLIENT'` is a placeholder; match what `gas-tank.module.ts` uses today).
- Exact webhook dispatcher API in notification-service (Task 7 step 1 — discover before coding).
- `apiFetch` helper name in `apps/client/lib/api.ts` (Task 13 — match existing helper).
- Audit-log mechanism (Task 12 step 6 — discover before coding).
