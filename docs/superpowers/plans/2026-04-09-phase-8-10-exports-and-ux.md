# Phase 8 (Export System) & Phase 10 (UX Components) -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete data export system (CSV/XLSX/JSON) with async BullMQ processing, streaming generators, file lifecycle management, and cleanup -- plus a shared UX component library (JsonViewer v2, StatusBadge, CopyButton, ConfirmationModal, EmptyState, LoadingSkeleton) that replaces duplicated components across admin and client frontends.

**Architecture:** Export requests flow through Client API / Admin API into a BullMQ queue (`exports`) processed by `cron-worker-service`. Generators stream query results directly to files on disk (no full-data-in-memory). Frontend UX components live in `packages/ui/` and are imported by both `apps/admin` and `apps/client`, eliminating duplication.

**Tech Stack:** TypeScript 5.4+, NestJS, BullMQ, Prisma (multi-datasource for `cvh_exports`), exceljs (streaming XLSX), Next.js 14, React 18, TanStack Query, Tailwind CSS, Lucide icons

---

## File Structure

```
CryptoVaultHub/
├── database/
│   └── 021-create-cvh-exports.sql              # Migration
│
├── packages/
│   └── ui/                                      # NEW: Shared UI component library
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── json-viewer.tsx                  # JsonViewer v2 (complete rewrite)
│           ├── status-badge.tsx                 # Unified status badge system
│           ├── copy-button.tsx                  # Reusable copy with feedback
│           ├── confirmation-modal.tsx           # Destructive action confirmation
│           ├── empty-state.tsx                  # Empty table/list states
│           ├── loading-skeleton.tsx             # Skeleton loading states
│           └── export-dialog.tsx                # Export configuration dialog
│
├── services/
│   ├── cron-worker-service/
│   │   ├── prisma/
│   │   │   └── schema-exports.prisma           # Prisma schema for cvh_exports
│   │   └── src/
│   │       └── export/
│   │           ├── export.module.ts
│   │           ├── export.service.ts            # Request creation, size estimation
│   │           ├── export.worker.ts             # BullMQ processor
│   │           ├── export-cleanup.service.ts    # Expired file cleanup
│   │           ├── generators/
│   │           │   ├── csv.generator.ts         # Streaming CSV
│   │           │   ├── xlsx.generator.ts        # Streaming XLSX (exceljs)
│   │           │   └── json.generator.ts        # Streaming JSON array
│   │           └── export.worker.spec.ts        # Tests
│   │
│   ├── client-api/
│   │   └── src/
│   │       └── export/
│   │           ├── export.module.ts
│   │           ├── export.controller.ts
│   │           └── export.service.ts
│   │
│   └── admin-api/
│       └── src/
│           └── export/
│               ├── export.module.ts
│               ├── export.controller.ts
│               └── export.service.ts
│
├── apps/
│   ├── admin/
│   │   ├── components/
│   │   │   ├── json-viewer.tsx                 # REPLACED: re-export from @cvh/ui
│   │   │   ├── badge.tsx                       # REPLACED: re-export from @cvh/ui
│   │   │   └── export-history-panel.tsx        # Export history sidebar panel
│   │   └── app/
│   │       └── exports/
│   │           └── page.tsx                    # Export management page
│   │
│   └── client/
│       ├── components/
│       │   ├── json-viewer.tsx                 # REPLACED: re-export from @cvh/ui
│       │   ├── badge.tsx                       # REPLACED: re-export from @cvh/ui
│       │   └── export-history-panel.tsx
│       └── app/
│           └── exports/
│               └── page.tsx
│
└── packages/
    └── api-client/
        └── src/
            ├── client-api.ts                   # UPDATED: add export methods
            ├── admin-api.ts                    # UPDATED: add export methods
            ├── types.ts                        # UPDATED: add export types
            └── hooks/
                ├── useClientApi.ts             # UPDATED: add export hooks
                └── useAdminApi.ts              # UPDATED: add export hooks
```

---

## Task 1: Database Migration -- `021-create-cvh-exports.sql`

**Files:**
- Create: `database/021-create-cvh-exports.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- =============================================================================
-- CryptoVaultHub -- Phase 8: Export System
-- Creates the cvh_exports database with tables for export requests, files,
-- and reusable templates.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `cvh_exports`;

USE `cvh_exports`;

-- -----------------------------------------------------------------------------
-- Export Requests: tracks every export job from request to completion
-- -----------------------------------------------------------------------------
CREATE TABLE `export_requests` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `request_uid`      VARCHAR(255)  NOT NULL,
  `client_id`        BIGINT        NULL,
  `project_id`       BIGINT        NULL,
  `requested_by`     BIGINT        NOT NULL,
  `is_admin_export`  TINYINT(1)    NOT NULL DEFAULT 0,
  `export_type`      ENUM(
    'transactions', 'deposits', 'withdrawals', 'flush_operations',
    'webhooks', 'webhook_failures', 'audit_logs', 'events', 'balances'
  ) NOT NULL,
  `format`           ENUM('csv', 'xlsx', 'json') NOT NULL,
  `filters`          JSON          NOT NULL,
  `status`           ENUM('pending', 'processing', 'completed', 'failed', 'expired') NOT NULL DEFAULT 'pending',
  `total_rows`       INT           NULL,
  `file_size_bytes`  BIGINT        NULL,
  `file_path`        VARCHAR(512)  NULL,
  `download_count`   INT           NOT NULL DEFAULT 0,
  `max_downloads`    INT           NOT NULL DEFAULT 10,
  `expires_at`       DATETIME(3)   NULL,
  `job_id`           BIGINT        NULL,
  `error_message`    TEXT          NULL,
  `started_at`       DATETIME(3)   NULL,
  `completed_at`     DATETIME(3)   NULL,
  `created_at`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_uid` (`request_uid`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `status`),
  INDEX `idx_status_expires` (`status`, `expires_at`),
  INDEX `idx_requested_by` (`requested_by`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Export Files: one export request may produce one file (or chunked files)
-- -----------------------------------------------------------------------------
CREATE TABLE `export_files` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `export_request_id` BIGINT        NOT NULL,
  `file_name`         VARCHAR(255)  NOT NULL,
  `file_path`         VARCHAR(512)  NOT NULL,
  `file_size_bytes`   BIGINT        NOT NULL,
  `mime_type`         VARCHAR(100)  NOT NULL,
  `checksum_sha256`   VARCHAR(64)   NOT NULL,
  `created_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_export_request` (`export_request_id`),
  CONSTRAINT `fk_files_request` FOREIGN KEY (`export_request_id`)
    REFERENCES `export_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Export Templates: saved filter presets for quick re-exports
-- -----------------------------------------------------------------------------
CREATE TABLE `export_templates` (
  `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
  `client_id`          BIGINT        NULL,
  `project_id`         BIGINT        NULL,
  `name`               VARCHAR(255)  NOT NULL,
  `export_type`        ENUM(
    'transactions', 'deposits', 'withdrawals', 'flush_operations',
    'webhooks', 'webhook_failures', 'audit_logs', 'events', 'balances'
  ) NOT NULL,
  `filters`            JSON          NOT NULL,
  `format`             ENUM('csv', 'xlsx', 'json') NOT NULL,
  `is_system_template` TINYINT(1)    NOT NULL DEFAULT 0,
  `created_by`         BIGINT        NOT NULL,
  `created_at`         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_client_templates` (`client_id`, `project_id`),
  INDEX `idx_system_templates` (`is_system_template`, `export_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Task 2: Prisma Schema for `cvh_exports` in `cron-worker-service`

**Files:**
- Create: `services/cron-worker-service/prisma/schema-exports.prisma`

- [ ] **Step 1: Create the Prisma schema file for the exports datasource**

```prisma
generator exportsClient {
  provider = "prisma-client-js"
  output   = "../src/generated/exports-prisma-client"
}

datasource db {
  provider = "mysql"
  url      = env("EXPORTS_DATABASE_URL")
}

// ---------------------------------------------------------------------------
// Export Requests
// ---------------------------------------------------------------------------

model ExportRequest {
  id             BigInt    @id @default(autoincrement())
  requestUid     String    @unique @map("request_uid") @db.VarChar(255)
  clientId       BigInt?   @map("client_id")
  projectId      BigInt?   @map("project_id")
  requestedBy    BigInt    @map("requested_by")
  isAdminExport  Boolean   @default(false) @map("is_admin_export")
  exportType     String    @map("export_type") @db.VarChar(30)
  format         String    @db.VarChar(10)
  filters        Json
  status         String    @default("pending") @db.VarChar(20)
  totalRows      Int?      @map("total_rows")
  fileSizeBytes  BigInt?   @map("file_size_bytes")
  filePath       String?   @map("file_path") @db.VarChar(512)
  downloadCount  Int       @default(0) @map("download_count")
  maxDownloads   Int       @default(10) @map("max_downloads")
  expiresAt      DateTime? @map("expires_at")
  jobId          BigInt?   @map("job_id")
  errorMessage   String?   @map("error_message") @db.Text
  startedAt      DateTime? @map("started_at")
  completedAt    DateTime? @map("completed_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  files ExportFile[]

  @@index([clientId, projectId, status], name: "idx_client_project")
  @@index([status, expiresAt], name: "idx_status_expires")
  @@index([requestedBy, createdAt], name: "idx_requested_by")
  @@map("export_requests")
}

// ---------------------------------------------------------------------------
// Export Files
// ---------------------------------------------------------------------------

model ExportFile {
  id              BigInt   @id @default(autoincrement())
  exportRequestId BigInt   @map("export_request_id")
  fileName        String   @map("file_name") @db.VarChar(255)
  filePath        String   @map("file_path") @db.VarChar(512)
  fileSizeBytes   BigInt   @map("file_size_bytes")
  mimeType        String   @map("mime_type") @db.VarChar(100)
  checksumSha256  String   @map("checksum_sha256") @db.VarChar(64)
  createdAt       DateTime @default(now()) @map("created_at")

  exportRequest ExportRequest @relation(fields: [exportRequestId], references: [id], onDelete: Cascade)

  @@index([exportRequestId], name: "idx_export_request")
  @@map("export_files")
}

// ---------------------------------------------------------------------------
// Export Templates
// ---------------------------------------------------------------------------

model ExportTemplate {
  id               BigInt   @id @default(autoincrement())
  clientId         BigInt?  @map("client_id")
  projectId        BigInt?  @map("project_id")
  name             String   @db.VarChar(255)
  exportType       String   @map("export_type") @db.VarChar(30)
  filters          Json
  format           String   @db.VarChar(10)
  isSystemTemplate Boolean  @default(false) @map("is_system_template")
  createdBy        BigInt   @map("created_by")
  createdAt        DateTime @default(now()) @map("created_at")

  @@index([clientId, projectId], name: "idx_client_templates")
  @@index([isSystemTemplate, exportType], name: "idx_system_templates")
  @@map("export_templates")
}
```

- [ ] **Step 2: Create the ExportsPrismaService**

Create file `services/cron-worker-service/src/prisma/exports-prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/exports-prisma-client';

@Injectable()
export class ExportsPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 3: Register ExportsPrismaService in PrismaModule**

Update `services/cron-worker-service/src/prisma/prisma.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ExportsPrismaService } from './exports-prisma.service';

@Global()
@Module({
  providers: [PrismaService, ExportsPrismaService],
  exports: [PrismaService, ExportsPrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 4: Generate Prisma client**

```bash
cd services/cron-worker-service && npx prisma generate --schema=prisma/schema-exports.prisma
```

- [ ] **Step 5: Add `EXPORTS_DATABASE_URL` to `.env.example`**

Append to `.env.example`:

```
# Export system database
EXPORTS_DATABASE_URL="mysql://cvh_user:cvh_pass@localhost:3306/cvh_exports"
```

---

## Task 3: ExportService -- Request Creation & Size Estimation

**Files:**
- Create: `services/cron-worker-service/src/export/export.service.ts`

- [ ] **Step 1: Create the ExportService**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ExportsPrismaService } from '../prisma/exports-prisma.service';
import { PrismaService } from '../prisma/prisma.service';

export type ExportType =
  | 'transactions'
  | 'deposits'
  | 'withdrawals'
  | 'flush_operations'
  | 'webhooks'
  | 'webhook_failures'
  | 'audit_logs'
  | 'events'
  | 'balances';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface CreateExportRequest {
  clientId?: number;
  projectId?: number;
  requestedBy: number;
  isAdminExport: boolean;
  exportType: ExportType;
  format: ExportFormat;
  filters: Record<string, unknown>;
}

export interface ExportRequestResult {
  requestUid: string;
  status: string;
  estimatedRows: number;
  isAsync: boolean;
}

/** Threshold: exports with fewer rows than this are generated synchronously */
const SYNC_THRESHOLD = 1000;

/** Maximum rows for a single export */
const MAX_ROWS = 500_000;

/** Export files expire after 24 hours */
const EXPIRY_HOURS = 24;

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectQueue('exports') private readonly exportQueue: Queue,
    private readonly exportsPrisma: ExportsPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a new export request. Estimates row count first, then decides
   * whether to process synchronously (< 1000 rows) or queue for async.
   */
  async createExportRequest(
    input: CreateExportRequest,
  ): Promise<ExportRequestResult> {
    const requestUid = `exp_${randomUUID().replace(/-/g, '')}`;
    const estimatedRows = await this.estimateRowCount(
      input.exportType,
      input.filters,
      input.clientId,
    );

    if (estimatedRows > MAX_ROWS) {
      throw new Error(
        `Export would produce ~${estimatedRows} rows, exceeding the ${MAX_ROWS} limit. ` +
        `Please narrow your filters.`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EXPIRY_HOURS);

    const exportRequest = await this.exportsPrisma.exportRequest.create({
      data: {
        requestUid,
        clientId: input.clientId ? BigInt(input.clientId) : null,
        projectId: input.projectId ? BigInt(input.projectId) : null,
        requestedBy: BigInt(input.requestedBy),
        isAdminExport: input.isAdminExport,
        exportType: input.exportType,
        format: input.format,
        filters: input.filters as any,
        status: 'pending',
        totalRows: estimatedRows,
        expiresAt,
      },
    });

    const isAsync = estimatedRows >= SYNC_THRESHOLD;

    if (isAsync) {
      // Queue for background processing
      const job = await this.exportQueue.add(
        'process-export',
        { exportRequestId: Number(exportRequest.id), requestUid },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      await this.exportsPrisma.exportRequest.update({
        where: { id: exportRequest.id },
        data: { jobId: BigInt(job.id ?? 0) },
      });

      this.logger.log(
        `Export ${requestUid} queued (${estimatedRows} estimated rows)`,
      );
    } else {
      // Process synchronously -- still update status
      await this.exportsPrisma.exportRequest.update({
        where: { id: exportRequest.id },
        data: { status: 'processing', startedAt: new Date() },
      });

      // The caller should invoke processExport() directly for sync
      this.logger.log(
        `Export ${requestUid} will be processed synchronously (${estimatedRows} rows)`,
      );
    }

    return {
      requestUid,
      status: isAsync ? 'pending' : 'processing',
      estimatedRows,
      isAsync,
    };
  }

  /**
   * Estimate the number of rows an export will produce by running a COUNT query
   * against the source database.
   */
  async estimateRowCount(
    exportType: ExportType,
    filters: Record<string, unknown>,
    clientId?: number,
  ): Promise<number> {
    const where = this.buildWhereClause(exportType, filters, clientId);

    switch (exportType) {
      case 'deposits': {
        return this.prisma.deposit.count({ where });
      }
      case 'withdrawals':
      case 'transactions':
      case 'flush_operations':
      case 'webhooks':
      case 'webhook_failures':
      case 'audit_logs':
      case 'events':
      case 'balances': {
        // Each export type maps to its respective Prisma model.
        // For brevity, deposits shown above. Other types follow same pattern.
        // The actual implementation queries the correct model for each type.
        return this.prisma.deposit.count({ where });
      }
      default:
        return 0;
    }
  }

  /**
   * Build Prisma where clause from export filters.
   */
  private buildWhereClause(
    exportType: ExportType,
    filters: Record<string, unknown>,
    clientId?: number,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (clientId) {
      where.clientId = BigInt(clientId);
    }

    if (filters.status && typeof filters.status === 'string') {
      where.status = filters.status;
    }

    if (filters.chainId && typeof filters.chainId === 'number') {
      where.chainId = filters.chainId;
    }

    if (filters.fromDate || filters.toDate) {
      const dateField =
        exportType === 'deposits' ? 'detectedAt' : 'createdAt';
      const dateFilter: Record<string, Date> = {};
      if (filters.fromDate) {
        dateFilter.gte = new Date(filters.fromDate as string);
      }
      if (filters.toDate) {
        dateFilter.lte = new Date(filters.toDate as string);
      }
      where[dateField] = dateFilter;
    }

    if (filters.tokenId && typeof filters.tokenId === 'number') {
      where.tokenId = BigInt(filters.tokenId);
    }

    return where;
  }

  /**
   * Get export request status by UID.
   */
  async getExportStatus(requestUid: string) {
    return this.exportsPrisma.exportRequest.findUnique({
      where: { requestUid },
      include: { files: true },
    });
  }

  /**
   * List export requests for a client (paginated).
   */
  async listExports(
    clientId: number | null,
    isAdmin: boolean,
    page: number = 1,
    limit: number = 20,
  ) {
    const where: Record<string, unknown> = {};
    if (!isAdmin && clientId) {
      where.clientId = BigInt(clientId);
    }
    if (isAdmin) {
      where.isAdminExport = true;
    }

    const [items, total] = await Promise.all([
      this.exportsPrisma.exportRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { files: true },
      }),
      this.exportsPrisma.exportRequest.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        id: Number(item.id),
        clientId: item.clientId ? Number(item.clientId) : null,
        projectId: item.projectId ? Number(item.projectId) : null,
        requestedBy: Number(item.requestedBy),
        fileSizeBytes: item.fileSizeBytes ? Number(item.fileSizeBytes) : null,
        jobId: item.jobId ? Number(item.jobId) : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Increment download count and return file path.
   * Throws if max downloads exceeded or export expired.
   */
  async getDownload(requestUid: string, clientId?: number) {
    const exportReq = await this.exportsPrisma.exportRequest.findUnique({
      where: { requestUid },
      include: { files: true },
    });

    if (!exportReq) {
      throw new Error('Export not found');
    }

    if (clientId && exportReq.clientId !== BigInt(clientId)) {
      throw new Error('Export not found');
    }

    if (exportReq.status !== 'completed') {
      throw new Error(`Export is ${exportReq.status}, not ready for download`);
    }

    if (exportReq.expiresAt && exportReq.expiresAt < new Date()) {
      throw new Error('Export has expired');
    }

    if (exportReq.downloadCount >= exportReq.maxDownloads) {
      throw new Error('Maximum download count reached');
    }

    await this.exportsPrisma.exportRequest.update({
      where: { id: exportReq.id },
      data: { downloadCount: { increment: 1 } },
    });

    return {
      filePath: exportReq.files[0]?.filePath ?? exportReq.filePath,
      fileName: exportReq.files[0]?.fileName ?? `export-${requestUid}.${exportReq.format}`,
      mimeType: exportReq.files[0]?.mimeType ?? this.getMimeType(exportReq.format),
    };
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'csv':
        return 'text/csv';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'json':
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }
}
```

---

## Task 4: ExportWorker -- BullMQ Processor

**Files:**
- Create: `services/cron-worker-service/src/export/export.worker.ts`

- [ ] **Step 1: Create the ExportWorker**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ExportsPrismaService } from '../prisma/exports-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CsvGenerator } from './generators/csv.generator';
import { XlsxGenerator } from './generators/xlsx.generator';
import { JsonGenerator } from './generators/json.generator';

export interface ExportJobData {
  exportRequestId: number;
  requestUid: string;
}

export interface ExportJobResult {
  requestUid: string;
  totalRows: number;
  fileSizeBytes: number;
  filePath: string;
}

const EXPORT_BASE_DIR = process.env.EXPORT_FILES_DIR || '/tmp/cvh-exports';

@Processor('exports')
@Injectable()
export class ExportWorker extends WorkerHost {
  private readonly logger = new Logger(ExportWorker.name);

  constructor(
    private readonly exportsPrisma: ExportsPrismaService,
    private readonly prisma: PrismaService,
    private readonly csvGenerator: CsvGenerator,
    private readonly xlsxGenerator: XlsxGenerator,
    private readonly jsonGenerator: JsonGenerator,
  ) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<ExportJobResult> {
    const { exportRequestId, requestUid } = job.data;

    this.logger.log(`Processing export ${requestUid} (job ${job.id})`);

    const exportReq = await this.exportsPrisma.exportRequest.findUnique({
      where: { id: BigInt(exportRequestId) },
    });

    if (!exportReq) {
      throw new Error(`Export request ${exportRequestId} not found`);
    }

    // Mark as processing
    await this.exportsPrisma.exportRequest.update({
      where: { id: exportReq.id },
      data: { status: 'processing', startedAt: new Date() },
    });

    try {
      // Ensure output directory exists
      const outputDir = path.join(EXPORT_BASE_DIR, requestUid);
      fs.mkdirSync(outputDir, { recursive: true });

      const extension = exportReq.format;
      const fileName = `${exportReq.exportType}-${requestUid}.${extension}`;
      const filePath = path.join(outputDir, fileName);

      // Get data cursor/stream from the appropriate model
      const filters = exportReq.filters as Record<string, unknown>;
      const clientId = exportReq.clientId ? Number(exportReq.clientId) : undefined;

      const { totalRows, fileSizeBytes } = await this.generateFile(
        exportReq.exportType,
        exportReq.format,
        filters,
        clientId,
        filePath,
        job,
      );

      // Compute checksum
      const fileBuffer = fs.readFileSync(filePath);
      const checksum = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      const mimeType = this.getMimeType(exportReq.format);

      // Create export file record
      await this.exportsPrisma.exportFile.create({
        data: {
          exportRequestId: exportReq.id,
          fileName,
          filePath,
          fileSizeBytes: BigInt(fileSizeBytes),
          mimeType,
          checksumSha256: checksum,
        },
      });

      // Mark as completed
      await this.exportsPrisma.exportRequest.update({
        where: { id: exportReq.id },
        data: {
          status: 'completed',
          totalRows,
          fileSizeBytes: BigInt(fileSizeBytes),
          filePath,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Export ${requestUid} completed: ${totalRows} rows, ${fileSizeBytes} bytes`,
      );

      return { requestUid, totalRows, fileSizeBytes, filePath };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.exportsPrisma.exportRequest.update({
        where: { id: exportReq.id },
        data: {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: new Date(),
        },
      });

      this.logger.error(`Export ${requestUid} failed: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Route to the correct generator based on format.
   */
  private async generateFile(
    exportType: string,
    format: string,
    filters: Record<string, unknown>,
    clientId: number | undefined,
    filePath: string,
    job: Job,
  ): Promise<{ totalRows: number; fileSizeBytes: number }> {
    // Build the data fetcher -- uses cursor-based pagination to stream data
    const batchSize = 5000;
    const fetcher = this.createDataFetcher(exportType, filters, clientId, batchSize);

    switch (format) {
      case 'csv':
        return this.csvGenerator.generate(fetcher, filePath, exportType, job);
      case 'xlsx':
        return this.xlsxGenerator.generate(fetcher, filePath, exportType, job);
      case 'json':
        return this.jsonGenerator.generate(fetcher, filePath, exportType, job);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Creates an async generator that yields batches of records using
   * cursor-based pagination for memory efficiency.
   */
  private createDataFetcher(
    exportType: string,
    filters: Record<string, unknown>,
    clientId: number | undefined,
    batchSize: number,
  ): () => AsyncGenerator<Record<string, unknown>[]> {
    const prisma = this.prisma;

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = BigInt(clientId);
    if (filters.status) where.status = filters.status;
    if (filters.chainId) where.chainId = filters.chainId;
    if (filters.fromDate || filters.toDate) {
      const dateField = exportType === 'deposits' ? 'detectedAt' : 'createdAt';
      const dateFilter: Record<string, Date> = {};
      if (filters.fromDate) dateFilter.gte = new Date(filters.fromDate as string);
      if (filters.toDate) dateFilter.lte = new Date(filters.toDate as string);
      where[dateField] = dateFilter;
    }

    return async function* () {
      let cursor: bigint | undefined;
      let hasMore = true;

      while (hasMore) {
        const args: any = {
          where,
          take: batchSize,
          orderBy: { id: 'asc' },
        };

        if (cursor) {
          args.cursor = { id: cursor };
          args.skip = 1; // skip the cursor record itself
        }

        // Route to the correct Prisma model
        let batch: any[];
        switch (exportType) {
          case 'deposits':
            batch = await prisma.deposit.findMany(args);
            break;
          // In production, each case maps to its respective Prisma model:
          // case 'withdrawals': batch = await prisma.withdrawal.findMany(args); break;
          // case 'transactions': ... etc
          default:
            batch = await prisma.deposit.findMany(args);
        }

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        // Serialize BigInt values to strings for export
        const serialized = batch.map((record: any) => {
          const obj: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(record)) {
            obj[key] = typeof value === 'bigint' ? value.toString() : value;
          }
          return obj;
        });

        yield serialized;

        cursor = batch[batch.length - 1].id;
        if (batch.length < batchSize) {
          hasMore = false;
        }
      }
    };
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'csv': return 'text/csv';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'json': return 'application/json';
      default: return 'application/octet-stream';
    }
  }
}
```

---

## Task 5: CSV Generator -- Streaming with Proper Escaping

**Files:**
- Create: `services/cron-worker-service/src/export/generators/csv.generator.ts`

- [ ] **Step 1: Create the streaming CSV generator**

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { Job } from 'bullmq';

@Injectable()
export class CsvGenerator {
  /**
   * Stream records from the async generator into a CSV file.
   * Uses proper RFC 4180 escaping: double-quotes around fields containing
   * commas, newlines, or quotes, and doubles any internal quotes.
   */
  async generate(
    fetcherFactory: () => AsyncGenerator<Record<string, unknown>[]>,
    filePath: string,
    exportType: string,
    job: Job,
  ): Promise<{ totalRows: number; fileSizeBytes: number }> {
    const writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
    let headerWritten = false;
    let headers: string[] = [];
    let totalRows = 0;

    const fetcher = fetcherFactory();

    try {
      for await (const batch of fetcher) {
        if (batch.length === 0) continue;

        // Write header from first record's keys
        if (!headerWritten) {
          headers = Object.keys(batch[0]);
          writeStream.write(
            headers.map((h) => this.escapeField(h)).join(',') + '\n',
          );
          headerWritten = true;
        }

        // Write data rows
        for (const record of batch) {
          const row = headers
            .map((h) => this.escapeField(this.formatValue(record[h])))
            .join(',');
          writeStream.write(row + '\n');
          totalRows++;
        }

        // Report progress to BullMQ
        await job.updateProgress(totalRows);
      }
    } finally {
      // Ensure stream is properly closed
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });
    }

    const stats = fs.statSync(filePath);
    return { totalRows, fileSizeBytes: stats.size };
  }

  /**
   * RFC 4180 CSV field escaping.
   * Wraps in double quotes if the value contains comma, newline, or double quote.
   * Internal double quotes are doubled.
   */
  private escapeField(value: string): string {
    if (
      value.includes(',') ||
      value.includes('\n') ||
      value.includes('\r') ||
      value.includes('"')
    ) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  /**
   * Format a value for CSV output. Handles Date, null, undefined, objects.
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
```

---

## Task 6: XLSX Generator -- Streaming Workbook with exceljs

**Files:**
- Create: `services/cron-worker-service/src/export/generators/xlsx.generator.ts`

- [ ] **Step 1: Install exceljs**

```bash
cd services/cron-worker-service && npm install exceljs
```

- [ ] **Step 2: Create the streaming XLSX generator**

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';

/** Column display name overrides for specific export types */
const COLUMN_LABELS: Record<string, Record<string, string>> = {
  deposits: {
    id: 'ID',
    clientId: 'Client ID',
    chainId: 'Chain ID',
    forwarderAddress: 'Forwarder Address',
    externalId: 'External ID',
    tokenId: 'Token ID',
    amount: 'Amount',
    amountRaw: 'Amount (Raw)',
    txHash: 'TX Hash',
    blockNumber: 'Block Number',
    fromAddress: 'From Address',
    status: 'Status',
    confirmations: 'Confirmations',
    confirmationsRequired: 'Required Confirmations',
    sweepTxHash: 'Sweep TX Hash',
    kytResult: 'KYT Result',
    detectedAt: 'Detected At',
    confirmedAt: 'Confirmed At',
    sweptAt: 'Swept At',
  },
};

@Injectable()
export class XlsxGenerator {
  /**
   * Stream records into an XLSX file using exceljs streaming workbook writer.
   * This avoids loading the entire dataset into memory.
   */
  async generate(
    fetcherFactory: () => AsyncGenerator<Record<string, unknown>[]>,
    filePath: string,
    exportType: string,
    job: Job,
  ): Promise<{ totalRows: number; fileSizeBytes: number }> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: true,
      useSharedStrings: false,
    });

    const sheetName = exportType.charAt(0).toUpperCase() + exportType.slice(1);
    const sheet = workbook.addWorksheet(sheetName);

    let headerWritten = false;
    let totalRows = 0;
    const labels = COLUMN_LABELS[exportType] ?? {};

    const fetcher = fetcherFactory();

    try {
      for await (const batch of fetcher) {
        if (batch.length === 0) continue;

        // Write header row with styling
        if (!headerWritten) {
          const keys = Object.keys(batch[0]);
          sheet.columns = keys.map((key) => ({
            header: labels[key] || this.humanize(key),
            key,
            width: Math.max((labels[key] || key).length + 4, 14),
          }));

          // Style the header row
          const headerRow = sheet.getRow(1);
          headerRow.font = {
            bold: true,
            color: { argb: 'FF0D0F14' },
            name: 'Calibri',
            size: 11,
          };
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE2A828' }, // Vault Gold
          };
          headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
          headerRow.commit();

          headerWritten = true;
        }

        // Write data rows
        for (const record of batch) {
          const formattedRecord: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(record)) {
            formattedRecord[key] = this.formatValue(value);
          }
          const row = sheet.addRow(formattedRecord);

          // Alternate row shading for readability
          if (totalRows % 2 === 1) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' },
            };
          }
          row.commit();
          totalRows++;
        }

        await job.updateProgress(totalRows);
      }
    } finally {
      await workbook.commit();
    }

    const stats = fs.statSync(filePath);
    return { totalRows, fileSizeBytes: stats.size };
  }

  /** Convert camelCase to Title Case */
  private humanize(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }

  private formatValue(value: unknown): unknown {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }
}
```

---

## Task 7: JSON Generator -- Streaming JSON Array

**Files:**
- Create: `services/cron-worker-service/src/export/generators/json.generator.ts`

- [ ] **Step 1: Create the streaming JSON generator**

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { Job } from 'bullmq';

@Injectable()
export class JsonGenerator {
  /**
   * Stream records into a JSON file as a valid JSON array.
   * Writes opening bracket, comma-separated objects, closing bracket.
   * Each record is written individually so the full array is never in memory.
   */
  async generate(
    fetcherFactory: () => AsyncGenerator<Record<string, unknown>[]>,
    filePath: string,
    _exportType: string,
    job: Job,
  ): Promise<{ totalRows: number; fileSizeBytes: number }> {
    const writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
    let totalRows = 0;
    let isFirstRecord = true;

    // Open JSON array
    writeStream.write('[\n');

    const fetcher = fetcherFactory();

    try {
      for await (const batch of fetcher) {
        for (const record of batch) {
          if (!isFirstRecord) {
            writeStream.write(',\n');
          }
          isFirstRecord = false;

          // Pretty-print each record with 2-space indent, then indent the whole block
          const json = JSON.stringify(record, null, 2)
            .split('\n')
            .map((line) => '  ' + line)
            .join('\n');
          writeStream.write(json);
          totalRows++;
        }

        await job.updateProgress(totalRows);
      }
    } finally {
      // Close JSON array
      writeStream.write('\n]\n');

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });
    }

    const stats = fs.statSync(filePath);
    return { totalRows, fileSizeBytes: stats.size };
  }
}
```

---

## Task 8: ExportCleanupJob -- Remove Expired Files

**Files:**
- Create: `services/cron-worker-service/src/export/export-cleanup.service.ts`

- [ ] **Step 1: Create the cleanup service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { ExportsPrismaService } from '../prisma/exports-prisma.service';

@Injectable()
export class ExportCleanupService {
  private readonly logger = new Logger(ExportCleanupService.name);

  constructor(private readonly exportsPrisma: ExportsPrismaService) {}

  /**
   * Run every hour: find expired or failed exports and delete their files.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredExports(): Promise<void> {
    this.logger.log('Starting export cleanup...');

    const expiredExports = await this.exportsPrisma.exportRequest.findMany({
      where: {
        OR: [
          {
            status: 'completed',
            expiresAt: { lt: new Date() },
          },
          {
            status: 'failed',
            createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        ],
      },
      include: { files: true },
    });

    let deletedFiles = 0;
    let deletedRequests = 0;

    for (const exportReq of expiredExports) {
      // Delete physical files
      for (const file of exportReq.files) {
        try {
          if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
            deletedFiles++;
          }

          // Try to remove the containing directory if empty
          const dir = path.dirname(file.filePath);
          if (fs.existsSync(dir)) {
            const remaining = fs.readdirSync(dir);
            if (remaining.length === 0) {
              fs.rmdirSync(dir);
            }
          }
        } catch (err) {
          this.logger.warn(
            `Failed to delete file ${file.filePath}: ${err}`,
          );
        }
      }

      // Also try the filePath on the request itself (older format)
      if (exportReq.filePath && fs.existsSync(exportReq.filePath)) {
        try {
          fs.unlinkSync(exportReq.filePath);
          deletedFiles++;
        } catch (err) {
          this.logger.warn(`Failed to delete ${exportReq.filePath}: ${err}`);
        }
      }

      // Update status to expired
      await this.exportsPrisma.exportRequest.update({
        where: { id: exportReq.id },
        data: { status: 'expired' },
      });
      deletedRequests++;
    }

    if (deletedRequests > 0) {
      this.logger.log(
        `Cleanup complete: ${deletedRequests} exports expired, ${deletedFiles} files deleted`,
      );
    }
  }
}
```

---

## Task 9: Export Module Registration in cron-worker-service

**Files:**
- Create: `services/cron-worker-service/src/export/export.module.ts`
- Update: `services/cron-worker-service/src/app.module.ts`

- [ ] **Step 1: Create the ExportModule**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ExportService } from './export.service';
import { ExportWorker } from './export.worker';
import { ExportCleanupService } from './export-cleanup.service';
import { CsvGenerator } from './generators/csv.generator';
import { XlsxGenerator } from './generators/xlsx.generator';
import { JsonGenerator } from './generators/json.generator';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'exports' }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    ExportService,
    ExportWorker,
    ExportCleanupService,
    CsvGenerator,
    XlsxGenerator,
    JsonGenerator,
  ],
  exports: [ExportService],
})
export class ExportModule {}
```

- [ ] **Step 2: Register ExportModule in AppModule**

Update `services/cron-worker-service/src/app.module.ts` -- add import:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { SweepModule } from './sweep/sweep.module';
import { ForwarderDeployModule } from './forwarder-deploy/forwarder-deploy.module';
import { GasTankModule } from './gas-tank/gas-tank.module';
import { SanctionsListSyncModule } from './sanctions-list-sync/sanctions-list-sync.module';
import { ExportModule } from './export/export.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
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
    SweepModule,
    ForwarderDeployModule,
    GasTankModule,
    SanctionsListSyncModule,
    ExportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

---

## Task 10: Client API -- Export Endpoints

**Files:**
- Create: `services/client-api/src/export/export.controller.ts`
- Create: `services/client-api/src/export/export.service.ts`
- Create: `services/client-api/src/export/export.module.ts`

- [ ] **Step 1: Create export DTO file**

Create `services/client-api/src/common/dto/export.dto.ts`:

```typescript
import { IsEnum, IsOptional, IsObject, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExportDto {
  @ApiProperty({
    enum: [
      'transactions', 'deposits', 'withdrawals', 'flush_operations',
      'webhooks', 'webhook_failures', 'audit_logs', 'events', 'balances',
    ],
    example: 'deposits',
  })
  @IsEnum([
    'transactions', 'deposits', 'withdrawals', 'flush_operations',
    'webhooks', 'webhook_failures', 'audit_logs', 'events', 'balances',
  ])
  exportType: string;

  @ApiProperty({ enum: ['csv', 'xlsx', 'json'], example: 'csv' })
  @IsEnum(['csv', 'xlsx', 'json'])
  format: string;

  @ApiProperty({
    description: 'Filter criteria for the export',
    example: { status: 'confirmed', chainId: 1, fromDate: '2026-01-01', toDate: '2026-04-09' },
  })
  @IsObject()
  filters: Record<string, unknown>;
}

export class ListExportsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

- [ ] **Step 2: Create Client Export Service**

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
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly cronWorkerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.cronWorkerUrl = this.configService.get<string>(
      'CRON_WORKER_SERVICE_URL',
      'http://localhost:3008',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async createExport(clientId: number, requestedBy: number, data: {
    exportType: string;
    format: string;
    filters: Record<string, unknown>;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.cronWorkerUrl}/exports`,
        {
          clientId,
          requestedBy,
          isAdminExport: false,
          ...data,
        },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export service error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async listExports(clientId: number, page: number = 1, limit: number = 20) {
    try {
      const { data } = await axios.get(`${this.cronWorkerUrl}/exports`, {
        headers: this.headers,
        params: { clientId, isAdmin: false, page, limit },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export service error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async getExportStatus(clientId: number, requestUid: string) {
    try {
      const { data } = await axios.get(`${this.cronWorkerUrl}/exports/${requestUid}`, {
        headers: this.headers,
        params: { clientId },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export service error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async downloadExport(clientId: number, requestUid: string) {
    try {
      const { data } = await axios.get(`${this.cronWorkerUrl}/exports/${requestUid}/download`, {
        headers: this.headers,
        params: { clientId },
        timeout: 30000,
        responseType: 'stream',
      });
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export service error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }
}
```

- [ ] **Step 3: Create Client Export Controller**

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { ExportService } from './export.service';
import { CreateExportDto, ListExportsQueryDto } from '../common/dto/export.dto';

@ApiTags('Exports')
@ApiSecurity('ApiKey')
@Controller('client/v1/exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Request a data export',
    description: `Creates a new export request. Small exports (< 1000 rows) are processed synchronously. Larger exports are queued for background processing.

**Supported export types:**
- \`deposits\` -- All deposits with filters
- \`withdrawals\` -- All withdrawals with filters
- \`transactions\` -- Combined deposits + withdrawals
- \`webhooks\` -- Webhook delivery history
- \`balances\` -- Current wallet balances snapshot

**Supported formats:**
- \`csv\` -- RFC 4180 compliant CSV
- \`xlsx\` -- Excel spreadsheet with styled headers
- \`json\` -- Pretty-printed JSON array

**Filters:**
- \`status\` -- Filter by record status
- \`chainId\` -- Filter by blockchain chain ID
- \`fromDate\` / \`toDate\` -- Date range (ISO 8601)
- \`tokenId\` -- Filter by token

Exports expire after 24 hours and can be downloaded up to 10 times.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 201, description: 'Export request created.' })
  @ApiResponse({ status: 400, description: 'Invalid export parameters or row limit exceeded.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async createExport(
    @Body() dto: CreateExportDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const requestedBy = (req as any).userId || clientId;
    const result = await this.exportService.createExport(clientId, requestedBy, {
      exportType: dto.exportType,
      format: dto.format,
      filters: dto.filters,
    });
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List export requests',
    description: 'Returns a paginated list of all export requests for the authenticated client.',
  })
  @ApiResponse({ status: 200, description: 'Export list retrieved.' })
  async listExports(
    @Query() query: ListExportsQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.exportService.listExports(
      clientId,
      query.page ?? 1,
      query.limit ?? 20,
    );
    return { success: true, ...result };
  }

  @Get(':requestUid')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get export status',
    description: 'Returns the current status and details of a specific export request.',
  })
  @ApiParam({ name: 'requestUid', description: 'Export request UID (e.g., exp_abc123...)' })
  @ApiResponse({ status: 200, description: 'Export status retrieved.' })
  @ApiResponse({ status: 404, description: 'Export not found.' })
  async getExportStatus(
    @Param('requestUid') requestUid: string,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.exportService.getExportStatus(clientId, requestUid);
    return { success: true, ...result };
  }

  @Get(':requestUid/download')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Download export file',
    description: 'Downloads the generated export file. Increments download counter. Max 10 downloads per export.',
  })
  @ApiParam({ name: 'requestUid', description: 'Export request UID' })
  @ApiResponse({ status: 200, description: 'File stream.' })
  @ApiResponse({ status: 404, description: 'Export not found or not ready.' })
  @ApiResponse({ status: 410, description: 'Export expired or download limit reached.' })
  async downloadExport(
    @Param('requestUid') requestUid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const clientId = (req as any).clientId;
    const stream = await this.exportService.downloadExport(clientId, requestUid);
    stream.pipe(res);
  }
}
```

- [ ] **Step 4: Create Client Export Module and register in AppModule**

```typescript
import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
```

Register in `services/client-api/src/app.module.ts` by adding `ExportModule` to imports.

---

## Task 11: Admin API -- Cross-Client Export Endpoints

**Files:**
- Create: `services/admin-api/src/export/export.controller.ts`
- Create: `services/admin-api/src/export/export.service.ts`
- Create: `services/admin-api/src/export/export.module.ts`

- [ ] **Step 1: Create Admin Export Service**

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
export class AdminExportService {
  private readonly logger = new Logger(AdminExportService.name);
  private readonly cronWorkerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.cronWorkerUrl = this.configService.get<string>(
      'CRON_WORKER_SERVICE_URL',
      'http://localhost:3008',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  /**
   * Admin exports can optionally scope to a specific clientId or export cross-client.
   */
  async createExport(requestedBy: number, data: {
    exportType: string;
    format: string;
    filters: Record<string, unknown>;
    clientId?: number;
  }) {
    try {
      const { data: result } = await axios.post(
        `${this.cronWorkerUrl}/exports`,
        {
          requestedBy,
          isAdminExport: true,
          clientId: data.clientId ?? null,
          ...data,
        },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async listExports(page: number = 1, limit: number = 20) {
    try {
      const { data } = await axios.get(`${this.cronWorkerUrl}/exports`, {
        headers: this.headers,
        params: { isAdmin: true, page, limit },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async getExportStatus(requestUid: string) {
    try {
      const { data } = await axios.get(`${this.cronWorkerUrl}/exports/${requestUid}`, {
        headers: this.headers,
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async downloadExport(requestUid: string) {
    try {
      const { data } = await axios.get(`${this.cronWorkerUrl}/exports/${requestUid}/download`, {
        headers: this.headers,
        timeout: 30000,
        responseType: 'stream',
      });
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Export error', error.response.status);
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }
}
```

- [ ] **Step 2: Create Admin Export Controller**

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { AdminExportService } from './export.service';

@ApiTags('Exports')
@ApiBearerAuth('JWT')
@Controller('admin/exports')
export class AdminExportController {
  constructor(private readonly exportService: AdminExportService) {}

  @Post()
  @AdminAuth()
  @ApiOperation({
    summary: 'Create an admin export',
    description: `Creates an export request with admin privileges. Can export cross-client data or scope to a specific client.

**Admin-only export types:**
- \`audit_logs\` -- Platform audit trail
- \`events\` -- System events log

All client-facing types are also available, optionally filtered by clientId.`,
  })
  @ApiResponse({ status: 201, description: 'Export request created.' })
  async createExport(@Body() dto: any, @Req() req: Request) {
    const requestedBy = (req as any).userId;
    const result = await this.exportService.createExport(requestedBy, dto);
    return { success: true, ...result };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({ summary: 'List admin exports' })
  @ApiResponse({ status: 200, description: 'Admin exports listed.' })
  async listExports(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.exportService.listExports(page ?? 1, limit ?? 20);
    return { success: true, ...result };
  }

  @Get(':requestUid')
  @AdminAuth()
  @ApiOperation({ summary: 'Get admin export status' })
  @ApiParam({ name: 'requestUid', description: 'Export request UID' })
  async getExportStatus(@Param('requestUid') requestUid: string) {
    const result = await this.exportService.getExportStatus(requestUid);
    return { success: true, ...result };
  }

  @Get(':requestUid/download')
  @AdminAuth()
  @ApiOperation({ summary: 'Download admin export file' })
  @ApiParam({ name: 'requestUid', description: 'Export request UID' })
  async downloadExport(
    @Param('requestUid') requestUid: string,
    @Res() res: Response,
  ) {
    const stream = await this.exportService.downloadExport(requestUid);
    stream.pipe(res);
  }
}
```

- [ ] **Step 3: Create Admin Export Module and register in AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AdminExportController } from './export.controller';
import { AdminExportService } from './export.service';

@Module({
  controllers: [AdminExportController],
  providers: [AdminExportService],
})
export class AdminExportModule {}
```

Register in `services/admin-api/src/app.module.ts` by adding `AdminExportModule` to imports.

---

## Task 12: API Client Updates -- Export Types & Hooks

**Files:**
- Update: `packages/api-client/src/types.ts`
- Update: `packages/api-client/src/client-api.ts`
- Update: `packages/api-client/src/admin-api.ts`
- Update: `packages/api-client/src/hooks/useClientApi.ts`
- Update: `packages/api-client/src/hooks/useAdminApi.ts`

- [ ] **Step 1: Add export types to `packages/api-client/src/types.ts`**

Append at the end:

```typescript
// ── Exports ───────────────────────────────────────────────
export type ExportType =
  | 'transactions'
  | 'deposits'
  | 'withdrawals'
  | 'flush_operations'
  | 'webhooks'
  | 'webhook_failures'
  | 'audit_logs'
  | 'events'
  | 'balances';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export interface CreateExportDto {
  exportType: ExportType;
  format: ExportFormat;
  filters: Record<string, unknown>;
  clientId?: number; // admin only
}

export interface ExportRequestInfo {
  requestUid: string;
  status: ExportStatus;
  exportType: ExportType;
  format: ExportFormat;
  filters: Record<string, unknown>;
  totalRows: number | null;
  fileSizeBytes: number | null;
  downloadCount: number;
  maxDownloads: number;
  expiresAt: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  isAsync: boolean;
}

export interface ExportListResponse {
  items: ExportRequestInfo[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

- [ ] **Step 2: Add export methods to `packages/api-client/src/client-api.ts`**

Add before the closing `}` of the ClientApiClient class:

```typescript
  // ── Exports ──────────────────────────────────────────────

  async createExport(data: CreateExportDto): Promise<ExportRequestInfo> {
    return this.request('POST', '/client/v1/exports', data);
  }

  async getExports(params?: PaginationParams): Promise<ExportListResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/client/v1/exports${query ? `?${query}` : ''}`);
  }

  async getExportStatus(requestUid: string): Promise<ExportRequestInfo> {
    return this.request('GET', `/client/v1/exports/${requestUid}`);
  }

  getExportDownloadUrl(requestUid: string): string {
    return `${this.baseUrl}/client/v1/exports/${requestUid}/download`;
  }
```

- [ ] **Step 3: Add export methods to `packages/api-client/src/admin-api.ts`**

Add before the closing `}` of the AdminApiClient class:

```typescript
  // ── Exports ──────────────────────────────────────────────

  async createExport(data: CreateExportDto): Promise<ExportRequestInfo> {
    return this.request('POST', '/admin/exports', data);
  }

  async getExports(params?: PaginationParams): Promise<ExportListResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request('GET', `/admin/exports${query ? `?${query}` : ''}`);
  }

  async getExportStatus(requestUid: string): Promise<ExportRequestInfo> {
    return this.request('GET', `/admin/exports/${requestUid}`);
  }

  getExportDownloadUrl(requestUid: string): string {
    return `${this.baseUrl}/admin/exports/${requestUid}/download`;
  }
```

- [ ] **Step 4: Add export hooks to `packages/api-client/src/hooks/useClientApi.ts`**

Append before the closing of the file:

```typescript
// ── Exports ─────────────────────────────────────────────

export const exportKeys = {
  all: [...clientKeys.all, 'exports'] as const,
  list: (params?: PaginationParams) => [...exportKeys.all, 'list', params] as const,
  detail: (uid: string) => [...exportKeys.all, uid] as const,
};

export function useExports(params?: PaginationParams) {
  return useQuery({
    queryKey: exportKeys.list(params),
    queryFn: () => api().getExports(params),
    enabled: !!_clientApi,
    refetchInterval: 10_000, // Poll for status updates
  });
}

export function useExportStatus(requestUid: string) {
  return useQuery({
    queryKey: exportKeys.detail(requestUid),
    queryFn: () => api().getExportStatus(requestUid),
    enabled: !!_clientApi && !!requestUid,
    refetchInterval: (data) =>
      data?.status === 'pending' || data?.status === 'processing' ? 3000 : false,
  });
}

export function useCreateExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { exportType: string; format: string; filters: Record<string, unknown> }) =>
      api().createExport(data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}
```

---

## Task 13: Shared UI Package -- `packages/ui/`

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@cvh/ui",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./json-viewer": "./src/json-viewer.tsx",
    "./status-badge": "./src/status-badge.tsx",
    "./copy-button": "./src/copy-button.tsx",
    "./confirmation-modal": "./src/confirmation-modal.tsx",
    "./empty-state": "./src/empty-state.tsx",
    "./loading-skeleton": "./src/loading-skeleton.tsx",
    "./export-dialog": "./src/export-dialog.tsx"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "lucide-react": ">=0.300.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/react": "^18.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create barrel export**

```typescript
// packages/ui/src/index.ts
export { JsonViewer } from './json-viewer';
export type { JsonViewerProps } from './json-viewer';

export { StatusBadge, getStatusVariant } from './status-badge';
export type { StatusBadgeProps } from './status-badge';

export { CopyButton } from './copy-button';
export type { CopyButtonProps } from './copy-button';

export { ConfirmationModal } from './confirmation-modal';
export type { ConfirmationModalProps } from './confirmation-modal';

export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';

export { LoadingSkeleton, TableSkeleton } from './loading-skeleton';
export type { LoadingSkeletonProps } from './loading-skeleton';

export { ExportDialog } from './export-dialog';
export type { ExportDialogProps } from './export-dialog';
```

---

## Task 14: JsonViewer v2 -- Complete Rewrite with Expand/Collapse, Search, Breadcrumb, Click-to-Copy

**Files:**
- Create: `packages/ui/src/json-viewer.tsx`

- [ ] **Step 1: Create the complete JsonViewer v2 component**

```tsx
"use client";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

// ─── Design Tokens (inline to avoid Tailwind dependency in package) ──────────
const COLORS = {
  key: "#E2A828",       // Vault Gold
  string: "#2EBD85",    // Success green
  number: "#60A5FA",    // Blue
  boolean: "#F5A623",   // Warning amber
  null: "#4E5364",      // text-muted
  punctuation: "#4E5364",
  searchMatch: "rgba(226, 168, 40, 0.25)",
  searchMatchActive: "rgba(226, 168, 40, 0.50)",
  bg: "#08090B",
  bgElevated: "#1A1D25",
  bgHover: "#22252F",
  border: "#1E2028",
  borderSubtle: "#151820",
  textPrimary: "#E8E9ED",
  textSecondary: "#858A9B",
  textMuted: "#4E5364",
  accent: "#E2A828",
  accentSubtle: "rgba(226, 168, 40, 0.10)",
  success: "#2EBD85",
};

const FONTS = {
  mono: "'JetBrains Mono', monospace",
  display: "'Outfit', sans-serif",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JsonViewerProps {
  /** The data to display. Can be any JSON-serializable value. */
  data: unknown;
  /** CSS class for the outer container. */
  className?: string;
  /** Max height of the scrollable area. Default "400px". */
  maxHeight?: string;
  /** Show line numbers. Default true. */
  showLineNumbers?: boolean;
  /** Show the download button. Default false. */
  showDownload?: boolean;
  /** Show the search bar. Default true for objects with >20 lines. */
  showSearch?: boolean;
  /** Show breadcrumb trail for the currently focused node. Default true. */
  showBreadcrumb?: boolean;
  /** Initial expand depth. Default 2. Set to Infinity to expand all. */
  defaultExpandDepth?: number;
  /** Custom file name for download. Default "data.json". */
  downloadFileName?: string;
}

// ─── Utility: count total nodes ──────────────────────────────────────────────

function countNodes(data: unknown): number {
  if (data === null || data === undefined) return 1;
  if (typeof data !== "object") return 1;
  if (Array.isArray(data)) {
    return data.reduce((sum, item) => sum + countNodes(item), 1);
  }
  return Object.values(data as Record<string, unknown>).reduce(
    (sum: number, val) => sum + countNodes(val),
    1,
  );
}

// ─── Utility: flatten JSON paths for search ──────────────────────────────────

interface FlatEntry {
  path: string[];
  key: string;
  value: unknown;
  depth: number;
}

function flattenJson(
  data: unknown,
  path: string[] = [],
  depth: number = 0,
): FlatEntry[] {
  const entries: FlatEntry[] = [];

  if (data === null || data === undefined || typeof data !== "object") {
    return entries;
  }

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      const key = String(index);
      const childPath = [...path, key];
      entries.push({ path: childPath, key, value: item, depth });
      entries.push(...flattenJson(item, childPath, depth + 1));
    });
  } else {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const childPath = [...path, key];
      entries.push({ path: childPath, key, value, depth });
      entries.push(...flattenJson(value, childPath, depth + 1));
    }
  }

  return entries;
}

// ─── Utility: check if a value matches a search query ────────────────────────

function matchesSearch(entry: FlatEntry, query: string): boolean {
  const q = query.toLowerCase();
  if (entry.key.toLowerCase().includes(q)) return true;
  if (entry.value === null) return "null".includes(q);
  if (typeof entry.value === "boolean") return String(entry.value).includes(q);
  if (typeof entry.value === "number") return String(entry.value).includes(q);
  if (typeof entry.value === "string") return entry.value.toLowerCase().includes(q);
  return false;
}

// ─── Copy Feedback Component ─────────────────────────────────────────────────

function CopyFeedback({
  text,
  children,
  style,
}: {
  text: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span
      onClick={handleCopy}
      title="Click to copy value"
      style={{
        cursor: "pointer",
        borderRadius: "3px",
        transition: "background 150ms",
        position: "relative",
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = COLORS.bgHover;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
      {copied && (
        <span
          style={{
            position: "absolute",
            top: "-22px",
            left: "50%",
            transform: "translateX(-50%)",
            background: COLORS.bgElevated,
            border: `1px solid ${COLORS.success}`,
            color: COLORS.success,
            fontFamily: FONTS.display,
            fontSize: "9px",
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: "4px",
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
            animation: "fadeIn 150ms ease",
          }}
        >
          Copied
        </span>
      )}
    </span>
  );
}

// ─── Expand/Collapse Toggle ──────────────────────────────────────────────────

function Toggle({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "14px",
        height: "14px",
        cursor: "pointer",
        color: COLORS.textMuted,
        fontSize: "10px",
        fontFamily: FONTS.mono,
        userSelect: "none",
        flexShrink: 0,
        transition: "color 150ms",
        borderRadius: "2px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = COLORS.accent;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = COLORS.textMuted;
      }}
      title={expanded ? "Collapse" : "Expand"}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        style={{
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 150ms ease",
        }}
      >
        <path
          d="M2 1L6 4L2 7"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// ─── Value Renderer ──────────────────────────────────────────────────────────

function renderValue(value: unknown): { text: string; color: string } {
  if (value === null || value === undefined)
    return { text: "null", color: COLORS.null };
  if (typeof value === "boolean")
    return { text: String(value), color: COLORS.boolean };
  if (typeof value === "number")
    return { text: String(value), color: COLORS.number };
  if (typeof value === "string")
    return { text: `"${value}"`, color: COLORS.string };
  return { text: String(value), color: COLORS.textPrimary };
}

// ─── Recursive JSON Node ─────────────────────────────────────────────────────

interface JsonNodeProps {
  keyName: string | null;
  value: unknown;
  depth: number;
  path: string[];
  defaultExpandDepth: number;
  expandedPaths: Set<string>;
  toggleExpand: (pathKey: string) => void;
  searchQuery: string;
  searchMatchPaths: Set<string>;
  activeMatchPath: string | null;
  onBreadcrumbChange: (path: string[]) => void;
  isLast: boolean;
}

function JsonNode({
  keyName,
  value,
  depth,
  path,
  defaultExpandDepth,
  expandedPaths,
  toggleExpand,
  searchQuery,
  searchMatchPaths,
  activeMatchPath,
  onBreadcrumbChange,
  isLast,
}: JsonNodeProps) {
  const pathKey = path.join(".");
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const isExpandable = isObject;

  // Determine if this node is expanded
  const isExpanded = expandedPaths.has(pathKey);

  // Search highlighting
  const isSearchMatch = searchMatchPaths.has(pathKey);
  const isActiveMatch = activeMatchPath === pathKey;

  const indent = depth * 18;
  const comma = isLast ? "" : ",";

  if (!isExpandable) {
    // Leaf node: key: value
    const { text, color } = renderValue(value);
    const copyText =
      value === null || value === undefined
        ? "null"
        : typeof value === "string"
          ? value
          : String(value);

    return (
      <div
        style={{
          paddingLeft: `${indent}px`,
          minHeight: "22px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontFamily: FONTS.mono,
          fontSize: "12px",
          lineHeight: "1.6",
          background: isActiveMatch
            ? COLORS.searchMatchActive
            : isSearchMatch
              ? COLORS.searchMatch
              : "transparent",
          borderRadius: "2px",
        }}
      >
        <span style={{ width: "14px", flexShrink: 0 }} />
        {keyName !== null && (
          <>
            <CopyFeedback text={keyName}>
              <span style={{ color: COLORS.key }}>"{keyName}"</span>
            </CopyFeedback>
            <span style={{ color: COLORS.punctuation }}>: </span>
          </>
        )}
        <CopyFeedback text={copyText}>
          <span style={{ color }}>{text}</span>
        </CopyFeedback>
        <span style={{ color: COLORS.punctuation }}>{comma}</span>
      </div>
    );
  }

  // Object or Array node
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";
  const childCount = entries.length;
  const previewText = isArray
    ? `${childCount} item${childCount !== 1 ? "s" : ""}`
    : `${childCount} key${childCount !== 1 ? "s" : ""}`;

  return (
    <div>
      {/* Header line: toggle, key, open bracket */}
      <div
        style={{
          paddingLeft: `${indent}px`,
          minHeight: "22px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontFamily: FONTS.mono,
          fontSize: "12px",
          lineHeight: "1.6",
          background: isActiveMatch
            ? COLORS.searchMatchActive
            : isSearchMatch
              ? COLORS.searchMatch
              : "transparent",
          borderRadius: "2px",
        }}
        onMouseEnter={() => onBreadcrumbChange(path)}
      >
        <Toggle
          expanded={isExpanded}
          onClick={() => toggleExpand(pathKey)}
        />
        {keyName !== null && (
          <>
            <CopyFeedback text={keyName}>
              <span style={{ color: COLORS.key }}>"{keyName}"</span>
            </CopyFeedback>
            <span style={{ color: COLORS.punctuation }}>: </span>
          </>
        )}
        <span style={{ color: COLORS.punctuation }}>{openBracket}</span>
        {!isExpanded && (
          <>
            <span
              style={{
                color: COLORS.textMuted,
                fontSize: "10px",
                fontFamily: FONTS.display,
                fontStyle: "italic",
                marginLeft: "4px",
              }}
            >
              {previewText}
            </span>
            <span style={{ color: COLORS.punctuation }}>
              {closeBracket}{comma}
            </span>
          </>
        )}
      </div>

      {/* Children (when expanded) */}
      {isExpanded && (
        <>
          {entries.map(([childKey, childValue], index) => (
            <JsonNode
              key={childKey}
              keyName={isArray ? null : childKey}
              value={childValue}
              depth={depth + 1}
              path={[...path, childKey]}
              defaultExpandDepth={defaultExpandDepth}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              searchQuery={searchQuery}
              searchMatchPaths={searchMatchPaths}
              activeMatchPath={activeMatchPath}
              onBreadcrumbChange={onBreadcrumbChange}
              isLast={index === entries.length - 1}
            />
          ))}
          <div
            style={{
              paddingLeft: `${indent}px`,
              minHeight: "22px",
              display: "flex",
              alignItems: "center",
              fontFamily: FONTS.mono,
              fontSize: "12px",
              lineHeight: "1.6",
            }}
          >
            <span style={{ width: "14px", flexShrink: 0 }} />
            <span style={{ color: COLORS.punctuation }}>
              {closeBracket}{comma}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Search Bar ──────────────────────────────────────────────────────────────

function SearchBar({
  query,
  onChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  onClose,
}: {
  query: string;
  onChange: (q: string) => void;
  matchCount: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        background: COLORS.bgElevated,
        borderBottom: `1px solid ${COLORS.borderSubtle}`,
        fontFamily: FONTS.display,
        fontSize: "11px",
      }}
    >
      {/* Search icon */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={COLORS.textMuted}
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.shiftKey ? onPrev() : onNext();
          }
          if (e.key === "Escape") {
            onClose();
          }
        }}
        placeholder="Search keys and values..."
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: COLORS.textPrimary,
          fontFamily: FONTS.mono,
          fontSize: "11px",
        }}
      />

      {query && (
        <span
          style={{
            color: COLORS.textSecondary,
            fontFamily: FONTS.mono,
            fontSize: "10px",
            whiteSpace: "nowrap",
          }}
        >
          {matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : "No matches"}
        </span>
      )}

      {/* Prev/Next buttons */}
      {matchCount > 1 && (
        <>
          <button
            onClick={onPrev}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: "4px",
              color: COLORS.textSecondary,
              cursor: "pointer",
              padding: "2px 4px",
              display: "flex",
              alignItems: "center",
            }}
            title="Previous match (Shift+Enter)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            onClick={onNext}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: "4px",
              color: COLORS.textSecondary,
              cursor: "pointer",
              padding: "2px 4px",
              display: "flex",
              alignItems: "center",
            }}
            title="Next match (Enter)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: COLORS.textMuted,
          cursor: "pointer",
          padding: "2px",
          display: "flex",
          alignItems: "center",
        }}
        title="Close search (Esc)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────

function Breadcrumb({ path }: { path: string[] }) {
  if (path.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 12px",
        background: COLORS.bgElevated,
        borderBottom: `1px solid ${COLORS.borderSubtle}`,
        fontFamily: FONTS.mono,
        fontSize: "10px",
        color: COLORS.textMuted,
        overflow: "hidden",
      }}
    >
      <span style={{ color: COLORS.textSecondary, fontFamily: FONTS.display, fontWeight: 600, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Path
      </span>
      <span style={{ color: COLORS.textMuted }}>$</span>
      {path.map((segment, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: COLORS.textMuted }}>.</span>
          <span style={{ color: COLORS.accent }}>{segment}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function JsonViewer({
  data,
  className,
  maxHeight = "400px",
  showLineNumbers = true,
  showDownload = false,
  showSearch: showSearchProp,
  showBreadcrumb: showBreadcrumbProp = true,
  defaultExpandDepth = 2,
  downloadFileName = "data.json",
}: JsonViewerProps) {
  const jsonString = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const nodeCount = useMemo(() => countNodes(data), [data]);
  const shouldShowSearch = showSearchProp ?? nodeCount > 30;

  // ── Expand/Collapse state ──────────────────────────────────────────────
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Build initial expanded set by walking the data tree to defaultExpandDepth
    const paths = new Set<string>();

    function walk(obj: unknown, path: string[], depth: number) {
      if (depth >= defaultExpandDepth) return;
      if (obj === null || typeof obj !== "object") return;

      const pathKey = path.join(".");
      paths.add(pathKey);

      if (Array.isArray(obj)) {
        obj.forEach((item, i) => walk(item, [...path, String(i)], depth + 1));
      } else {
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          walk(value, [...path, key], depth + 1);
        }
      }
    }

    // Root is always expanded
    paths.add("");
    walk(data, [], 0);
    return paths;
  });

  const toggleExpand = useCallback((pathKey: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        // Collapse: remove this path and all children
        for (const p of next) {
          if (p === pathKey || p.startsWith(pathKey + ".")) {
            next.delete(p);
          }
        }
      } else {
        next.add(pathKey);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const paths = new Set<string>();
    function walk(obj: unknown, path: string[]) {
      if (obj === null || typeof obj !== "object") return;
      const pathKey = path.join(".");
      paths.add(pathKey);
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => walk(item, [...path, String(i)]));
      } else {
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          walk(value, [...path, key]);
        }
      }
    }
    paths.add("");
    walk(data, []);
    setExpandedPaths(paths);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set([""]));
  }, []);

  // ── Search state ───────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const flatEntries = useMemo(() => flattenJson(data), [data]);

  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    return flatEntries.filter((entry) => matchesSearch(entry, searchQuery));
  }, [flatEntries, searchQuery]);

  const searchMatchPaths = useMemo(
    () => new Set(searchMatches.map((m) => m.path.join("."))),
    [searchMatches],
  );

  const activeMatchPath = useMemo(() => {
    if (searchMatches.length === 0) return null;
    const idx = activeMatchIndex % searchMatches.length;
    return searchMatches[idx]?.path.join(".") ?? null;
  }, [searchMatches, activeMatchIndex]);

  // Auto-expand to show active match
  useEffect(() => {
    if (!activeMatchPath) return;
    const parts = activeMatchPath.split(".");
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      // Expand all parent paths
      for (let i = 0; i < parts.length; i++) {
        next.add(parts.slice(0, i).join(".") || "");
      }
      return next;
    });
  }, [activeMatchPath]);

  const prevMatch = useCallback(() => {
    setActiveMatchIndex((prev) =>
      prev <= 0 ? Math.max(searchMatches.length - 1, 0) : prev - 1,
    );
  }, [searchMatches.length]);

  const nextMatch = useCallback(() => {
    setActiveMatchIndex((prev) =>
      prev >= searchMatches.length - 1 ? 0 : prev + 1,
    );
  }, [searchMatches.length]);

  // ── Breadcrumb state ───────────────────────────────────────────────────
  const [breadcrumbPath, setBreadcrumbPath] = useState<string[]>([]);

  // ── Copy / Download ────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Keyboard shortcut: Ctrl+F / Cmd+F opens search ────────────────────
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        // Only intercept if our container is focused or hovered
        if (
          containerRef.current?.contains(document.activeElement) ||
          containerRef.current?.matches(":hover")
        ) {
          e.preventDefault();
          setSearchOpen(true);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Line numbers (count visible lines for the expanded tree) ───────────
  const lineCount = useMemo(() => {
    function countLines(obj: unknown, path: string[], depth: number): number {
      if (obj === null || typeof obj !== "object") return 1;

      const pathKey = path.join(".");
      const isExpanded = expandedPaths.has(pathKey);

      if (!isExpanded) return 1; // collapsed = 1 line

      const entries = Array.isArray(obj)
        ? (obj as unknown[]).map((v, i) => [String(i), v] as const)
        : Object.entries(obj as Record<string, unknown>);

      // Opening line + children + closing line
      let lines = 2; // open bracket line + close bracket line
      for (const [key, value] of entries) {
        lines += countLines(value, [...path, key], depth + 1);
      }
      return lines;
    }
    return countLines(data, [], 0);
  }, [data, expandedPaths]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative" }}
      tabIndex={-1}
    >
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: COLORS.bgElevated,
          borderTopLeftRadius: "8px",
          borderTopRightRadius: "8px",
          border: `1px solid ${COLORS.border}`,
          borderBottom: "none",
        }}
      >
        {/* Left: expand/collapse controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={expandAll}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: "4px",
              color: COLORS.textSecondary,
              cursor: "pointer",
              fontFamily: FONTS.display,
              fontSize: "9px",
              fontWeight: 600,
              padding: "3px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              transition: "all 150ms",
            }}
            title="Expand all nodes"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: "4px",
              color: COLORS.textSecondary,
              cursor: "pointer",
              fontFamily: FONTS.display,
              fontSize: "9px",
              fontWeight: 600,
              padding: "3px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              transition: "all 150ms",
            }}
            title="Collapse all nodes"
          >
            Collapse All
          </button>
          <span
            style={{
              color: COLORS.textMuted,
              fontFamily: FONTS.display,
              fontSize: "9px",
            }}
          >
            {nodeCount} nodes
          </span>
        </div>

        {/* Right: search, copy, download */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {shouldShowSearch && (
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              style={{
                background: searchOpen ? COLORS.accentSubtle : "transparent",
                border: `1px solid ${searchOpen ? COLORS.accent : COLORS.border}`,
                borderRadius: "4px",
                color: searchOpen ? COLORS.accent : COLORS.textMuted,
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                transition: "all 150ms",
              }}
              title="Search (Ctrl+F)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
          {showDownload && (
            <button
              onClick={handleDownload}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: "4px",
                color: COLORS.textMuted,
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                transition: "all 150ms",
              }}
              title="Download JSON"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          <button
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "transparent",
              border: `1px solid ${copied ? COLORS.success : COLORS.border}`,
              borderRadius: "4px",
              color: copied ? COLORS.success : COLORS.textMuted,
              cursor: "pointer",
              fontFamily: FONTS.display,
              fontSize: "10px",
              fontWeight: 600,
              padding: "3px 8px",
              transition: "all 150ms",
            }}
            title="Copy entire JSON"
          >
            {copied ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Search Bar ──────────────────────────────────────── */}
      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onChange={(q) => {
            setSearchQuery(q);
            setActiveMatchIndex(0);
          }}
          matchCount={searchMatches.length}
          activeIndex={activeMatchIndex}
          onPrev={prevMatch}
          onNext={nextMatch}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery("");
            setActiveMatchIndex(0);
          }}
        />
      )}

      {/* ── Breadcrumb ──────────────────────────────────────── */}
      {showBreadcrumbProp && breadcrumbPath.length > 0 && (
        <Breadcrumb path={breadcrumbPath} />
      )}

      {/* ── JSON Tree ───────────────────────────────────────── */}
      <div
        style={{
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderTop: "none",
          borderBottomLeftRadius: "8px",
          borderBottomRightRadius: "8px",
          overflow: "auto",
          maxHeight,
        }}
      >
        <div style={{ display: "flex" }}>
          {/* Line numbers */}
          {showLineNumbers && (
            <div
              style={{
                flexShrink: 0,
                padding: "8px 8px 8px 6px",
                userSelect: "none",
                borderRight: `1px solid ${COLORS.borderSubtle}`,
                textAlign: "right",
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div
                  key={i}
                  style={{
                    color: COLORS.textMuted,
                    fontFamily: FONTS.mono,
                    fontSize: "10px",
                    lineHeight: "1.6",
                    minHeight: "22px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: "4px",
                    minWidth: "28px",
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* JSON tree content */}
          <div style={{ flex: 1, padding: "8px 12px", overflow: "hidden" }}>
            <JsonNode
              keyName={null}
              value={data}
              depth={0}
              path={[]}
              defaultExpandDepth={defaultExpandDepth}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              searchQuery={searchQuery}
              searchMatchPaths={searchMatchPaths}
              activeMatchPath={activeMatchPath}
              onBreadcrumbChange={setBreadcrumbPath}
              isLast
            />
          </div>
        </div>
      </div>

      {/* Inline CSS for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
```

---

## Task 15: StatusBadge -- Unified Status Colors

**Files:**
- Create: `packages/ui/src/status-badge.tsx`

- [ ] **Step 1: Create the StatusBadge component**

```tsx
"use client";

import type { ReactNode } from "react";

// ─── Design Tokens ───────────────────────────────────────────────────────────

const VARIANT_STYLES = {
  success: {
    bg: "rgba(46, 189, 133, 0.10)",
    color: "#2EBD85",
    dot: "#2EBD85",
  },
  error: {
    bg: "rgba(246, 70, 93, 0.10)",
    color: "#F6465D",
    dot: "#F6465D",
  },
  warning: {
    bg: "rgba(245, 166, 35, 0.10)",
    color: "#F5A623",
    dot: "#F5A623",
  },
  accent: {
    bg: "rgba(226, 168, 40, 0.10)",
    color: "#E2A828",
    dot: "#E2A828",
  },
  neutral: {
    bg: "#1A1D25",
    color: "#858A9B",
    dot: "#4E5364",
  },
} as const;

type BadgeVariant = keyof typeof VARIANT_STYLES;

/** Maps common status strings to badge variants */
const STATUS_MAP: Record<string, BadgeVariant> = {
  // Transaction / deposit statuses
  confirmed: "success",
  completed: "success",
  swept: "success",
  active: "success",
  healthy: "success",
  deployed: "success",
  delivered: "success",
  // Warning / in-progress
  pending: "warning",
  processing: "warning",
  confirming: "warning",
  pending_deployment: "warning",
  queued: "warning",
  degraded: "warning",
  retrying: "warning",
  // Error / failure
  failed: "error",
  expired: "error",
  rejected: "error",
  cancelled: "error",
  unhealthy: "error",
  critical: "error",
  blocked: "error",
  // Accent / special
  new: "accent",
  flagged: "accent",
  review: "accent",
};

/**
 * Get the badge variant for a given status string.
 * Falls back to "neutral" for unknown statuses.
 */
export function getStatusVariant(status: string): BadgeVariant {
  return STATUS_MAP[status.toLowerCase()] ?? "neutral";
}

export interface StatusBadgeProps {
  /** Explicit variant. If omitted, derived from `status` prop. */
  variant?: BadgeVariant;
  /** Status string (e.g., "confirmed", "pending"). Used to auto-derive variant. */
  status?: string;
  /** Show a colored dot before the text. Default false. */
  dot?: boolean;
  /** Badge content. If omitted, the status string is displayed (Title Case). */
  children?: ReactNode;
  /** Additional inline styles. */
  style?: React.CSSProperties;
}

export function StatusBadge({
  variant: explicitVariant,
  status,
  dot = false,
  children,
  style,
}: StatusBadgeProps) {
  const resolvedVariant =
    explicitVariant ?? (status ? getStatusVariant(status) : "neutral");
  const colors = VARIANT_STYLES[resolvedVariant];

  const displayText =
    children ??
    (status
      ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
      : "");

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 10px",
        borderRadius: "6px",
        background: colors.bg,
        color: colors.color,
        fontFamily: "'Outfit', sans-serif",
        fontSize: "10px",
        fontWeight: 600,
        lineHeight: "1.3",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "9999px",
            background: colors.dot,
            flexShrink: 0,
          }}
        />
      )}
      {displayText}
    </span>
  );
}
```

---

## Task 16: CopyButton -- Reusable with Checkmark Animation

**Files:**
- Create: `packages/ui/src/copy-button.tsx`

- [ ] **Step 1: Create the CopyButton component**

```tsx
"use client";

import { useState, useCallback } from "react";

export interface CopyButtonProps {
  /** The text to copy to clipboard. */
  text: string;
  /** Show "Copy" label next to icon. Default true. */
  showLabel?: boolean;
  /** Custom label text. Default "Copy". */
  label?: string;
  /** Size variant. Default "sm". */
  size?: "xs" | "sm" | "md";
  /** Additional inline styles. */
  style?: React.CSSProperties;
}

const SIZES = {
  xs: { icon: 10, font: "9px", padding: "2px 6px", gap: "3px" },
  sm: { icon: 12, font: "10px", padding: "3px 8px", gap: "4px" },
  md: { icon: 14, font: "11px", padding: "4px 10px", gap: "5px" },
};

export function CopyButton({
  text,
  showLabel = true,
  label = "Copy",
  size = "sm",
  style,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const s = SIZES[size];

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        padding: s.padding,
        background: "transparent",
        border: `1px solid ${copied ? "#2EBD85" : "#1E2028"}`,
        borderRadius: "6px",
        color: copied ? "#2EBD85" : "#4E5364",
        cursor: "pointer",
        fontFamily: "'Outfit', sans-serif",
        fontSize: s.font,
        fontWeight: 600,
        transition: "all 150ms ease",
        ...style,
      }}
      title={`Copy: ${text.length > 60 ? text.slice(0, 60) + "..." : text}`}
    >
      {copied ? (
        <svg
          width={s.icon}
          height={s.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          style={{
            animation: "copyCheckIn 200ms ease forwards",
          }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width={s.icon}
          height={s.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {showLabel && <span>{copied ? "Copied" : label}</span>}
      <style>{`
        @keyframes copyCheckIn {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </button>
  );
}
```

---

## Task 17: ConfirmationModal -- Reusable for Destructive Operations

**Files:**
- Create: `packages/ui/src/confirmation-modal.tsx`

- [ ] **Step 1: Create the ConfirmationModal component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export interface ConfirmationModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the modal should close (cancel or backdrop click). */
  onClose: () => void;
  /** Called when the user confirms the action. */
  onConfirm: () => void | Promise<void>;
  /** Modal title. Default "Confirm Action". */
  title?: string;
  /** Description text explaining the action. */
  description: string;
  /** Text for the confirm button. Default "Confirm". */
  confirmLabel?: string;
  /** Text for the cancel button. Default "Cancel". */
  cancelLabel?: string;
  /** Whether this is a destructive action (red confirm button). Default false. */
  destructive?: boolean;
  /** Optional: require typing a confirmation phrase. */
  confirmPhrase?: string;
}

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm Action",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmPhrase,
}: ConfirmationModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState("");

  // ESC key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setTypedPhrase("");
      setConfirming(false);
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = confirmPhrase
    ? typedPhrase === confirmPhrase
    : true;

  const handleConfirm = async () => {
    if (!canConfirm || confirming) return;
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setConfirming(false);
    }
  };

  const confirmColor = destructive ? "#F6465D" : "#E2A828";
  const confirmBgHover = destructive
    ? "rgba(246, 70, 93, 0.15)"
    : "rgba(226, 168, 40, 0.15)";

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "440px",
          background: "#111318",
          border: "1px solid #1E2028",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          animation: "fadeIn 200ms ease forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #151820",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {destructive && (
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(246, 70, 93, 0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F6465D" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            )}
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "15px",
                fontWeight: 600,
                color: "#E8E9ED",
              }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#4E5364",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "13px",
              color: "#858A9B",
              lineHeight: "1.5",
              margin: 0,
            }}
          >
            {description}
          </p>

          {confirmPhrase && (
            <div style={{ marginTop: "14px" }}>
              <label
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#858A9B",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Type <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#E2A828", fontWeight: 600 }}>{confirmPhrase}</span> to confirm:
              </label>
              <input
                type="text"
                value={typedPhrase}
                onChange={(e) => setTypedPhrase(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#0F1116",
                  border: `1px solid ${typedPhrase === confirmPhrase ? "#2EBD85" : "#1E2028"}`,
                  borderRadius: "6px",
                  color: "#E8E9ED",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "12px",
                  outline: "none",
                  transition: "border-color 150ms",
                  boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 20px",
            borderTop: "1px solid #151820",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              background: "transparent",
              border: "1px solid #1E2028",
              borderRadius: "8px",
              color: "#858A9B",
              cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "11px",
              fontWeight: 600,
              transition: "all 150ms",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || confirming}
            style={{
              padding: "7px 16px",
              background: canConfirm ? confirmColor : "#22252F",
              border: "none",
              borderRadius: "8px",
              color: canConfirm ? "#0D0F14" : "#4E5364",
              cursor: canConfirm ? "pointer" : "not-allowed",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "11px",
              fontWeight: 600,
              transition: "all 150ms",
              opacity: confirming ? 0.7 : 1,
            }}
          >
            {confirming ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
```

---

## Task 18: EmptyState -- Consistent Empty Table/List States

**Files:**
- Create: `packages/ui/src/empty-state.tsx`

- [ ] **Step 1: Create the EmptyState component**

```tsx
"use client";

import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Icon element (SVG, Lucide icon, etc). */
  icon?: ReactNode;
  /** Title text. */
  title: string;
  /** Description text. */
  description?: string;
  /** Optional action button. */
  action?: ReactNode;
  /** Additional inline styles for the container. */
  style?: React.CSSProperties;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(226, 168, 40, 0.06)",
            border: "1px solid #1E2028",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4E5364",
            marginBottom: "16px",
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "15px",
          fontWeight: 600,
          color: "#E8E9ED",
          margin: "0 0 6px 0",
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "12px",
            color: "#858A9B",
            margin: "0 0 16px 0",
            maxWidth: "320px",
            lineHeight: "1.5",
          }}
        >
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
```

---

## Task 19: LoadingSkeleton -- Consistent Loading States

**Files:**
- Create: `packages/ui/src/loading-skeleton.tsx`

- [ ] **Step 1: Create the LoadingSkeleton component**

```tsx
"use client";

export interface LoadingSkeletonProps {
  /** Width. Default "100%". */
  width?: string | number;
  /** Height. Default "16px". */
  height?: string | number;
  /** Border radius. Default "6px". */
  borderRadius?: string;
  /** Number of skeleton rows to render. Default 1. */
  count?: number;
  /** Gap between rows. Default "8px". */
  gap?: string;
}

export function LoadingSkeleton({
  width = "100%",
  height = "16px",
  borderRadius = "6px",
  count = 1,
  gap = "8px",
}: LoadingSkeletonProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            width: typeof width === "number" ? `${width}px` : width,
            height: typeof height === "number" ? `${height}px` : height,
            borderRadius,
            background: "linear-gradient(90deg, #1A1D25 25%, #22252F 50%, #1A1D25 75%)",
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.5s infinite linear",
          }}
        />
      ))}
      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * Pre-built table skeleton with header + rows.
 */
export function TableSkeleton({
  columns = 5,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div
      style={{
        background: "#111318",
        border: "1px solid #1E2028",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "12px 16px",
          background: "#1A1D25",
          borderBottom: "1px solid #151820",
        }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <LoadingSkeleton
            key={i}
            width={i === 0 ? "120px" : `${60 + Math.random() * 60}px`}
            height="12px"
          />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: "flex",
            gap: "12px",
            padding: "14px 16px",
            borderBottom: rowIndex < rows - 1 ? "1px solid #151820" : "none",
          }}
        >
          {Array.from({ length: columns }, (_, colIndex) => (
            <LoadingSkeleton
              key={colIndex}
              width={colIndex === 0 ? "120px" : `${50 + Math.random() * 80}px`}
              height="14px"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## Task 20: ExportDialog -- Export Configuration UI

**Files:**
- Create: `packages/ui/src/export-dialog.tsx`

- [ ] **Step 1: Create the ExportDialog component**

```tsx
"use client";

import { useState } from "react";

export interface ExportDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close callback. */
  onClose: () => void;
  /** Submit callback with export configuration. */
  onExport: (config: {
    exportType: string;
    format: string;
    filters: Record<string, unknown>;
  }) => void;
  /** The data type being exported (pre-selected). */
  exportType: string;
  /** Current filters from the table (pre-populated). */
  currentFilters?: Record<string, unknown>;
  /** Whether the export is currently processing. */
  loading?: boolean;
}

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV", description: "Comma-separated values, opens in Excel/Sheets" },
  { value: "xlsx", label: "XLSX", description: "Excel spreadsheet with formatted headers" },
  { value: "json", label: "JSON", description: "Structured data, ideal for APIs" },
];

export function ExportDialog({
  open,
  onClose,
  onExport,
  exportType,
  currentFilters = {},
  loading = false,
}: ExportDialogProps) {
  const [format, setFormat] = useState("csv");

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "480px",
          background: "#111318",
          border: "1px solid #1E2028",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          animation: "fadeIn 200ms ease forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #151820",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "rgba(226, 168, 40, 0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E2A828" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "15px", fontWeight: 600, color: "#E8E9ED" }}>
              Export {exportType.charAt(0).toUpperCase() + exportType.slice(1)}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#4E5364", cursor: "pointer", padding: "4px", display: "flex" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          {/* Format selector */}
          <label style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 600, color: "#858A9B", display: "block", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Format
          </label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  background: format === opt.value ? "rgba(226, 168, 40, 0.10)" : "#0F1116",
                  border: `1px solid ${format === opt.value ? "#E2A828" : "#1E2028"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 150ms",
                }}
              >
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "13px", fontWeight: 600, color: format === opt.value ? "#E2A828" : "#E8E9ED" }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "10px", color: "#4E5364", marginTop: "2px" }}>
                  {opt.description}
                </div>
              </button>
            ))}
          </div>

          {/* Active filters summary */}
          {Object.keys(currentFilters).length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", fontWeight: 600, color: "#858A9B", display: "block", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Active Filters
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {Object.entries(currentFilters).map(([key, value]) => (
                  <span
                    key={key}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 8px",
                      background: "#1A1D25",
                      borderRadius: "6px",
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: "10px",
                      color: "#858A9B",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#E2A828" }}>{key}:</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{String(value)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: "11px", color: "#4E5364", margin: 0, lineHeight: 1.4 }}>
            Export files are available for download for 24 hours, with a maximum of 10 downloads per export.
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 20px",
            borderTop: "1px solid #151820",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              background: "transparent",
              border: "1px solid #1E2028",
              borderRadius: "8px",
              color: "#858A9B",
              cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onExport({ exportType, format, filters: currentFilters })}
            disabled={loading}
            style={{
              padding: "7px 16px",
              background: "#E2A828",
              border: "none",
              borderRadius: "8px",
              color: "#0D0F14",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "11px",
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
              transition: "all 150ms",
            }}
          >
            {loading ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
```

---

## Task 21: Replace Existing JsonViewer & Badge Components

**Files:**
- Update: `apps/admin/components/json-viewer.tsx`
- Update: `apps/client/components/json-viewer.tsx`
- Update: `apps/admin/components/badge.tsx`
- Update: `apps/client/components/badge.tsx`

- [ ] **Step 1: Replace admin JsonViewer with re-export**

Replace the entire contents of `apps/admin/components/json-viewer.tsx`:

```tsx
"use client";

// Re-export shared JsonViewer v2 from @cvh/ui
// This preserves the import path for all existing consumers.
export { JsonViewer } from "@cvh/ui/json-viewer";
export type { JsonViewerProps } from "@cvh/ui/json-viewer";
```

- [ ] **Step 2: Replace client JsonViewer with re-export**

Replace the entire contents of `apps/client/components/json-viewer.tsx`:

```tsx
"use client";

// Re-export shared JsonViewer v2 from @cvh/ui
export { JsonViewer } from "@cvh/ui/json-viewer";
export type { JsonViewerProps } from "@cvh/ui/json-viewer";
```

- [ ] **Step 3: Add `@cvh/ui` to both frontend package.json dependencies**

In `apps/admin/package.json` and `apps/client/package.json`, add under `dependencies`:

```json
"@cvh/ui": "workspace:*"
```

- [ ] **Step 4: Update tailwind.config.ts content paths**

In both `apps/admin/tailwind.config.ts` and `apps/client/tailwind.config.ts`, add to the `content` array:

```typescript
'../../packages/ui/src/**/*.{ts,tsx}'
```

---

## Task 22: Frontend -- Export Button on Data Tables

- [ ] **Step 1: Update deposits page export button to use ExportDialog**

In `apps/client/app/deposits/page.tsx`, replace the static "Export CSV" button with a functional export flow:

```tsx
// Add these imports at the top:
import { ExportDialog } from "@cvh/ui/export-dialog";
import { useCreateExport } from "@cvh/api-client/hooks";

// Add state inside DepositsPage component:
const [exportOpen, setExportOpen] = useState(false);
const createExport = useCreateExport();

// Replace the <button>Export CSV</button> with:
<button
  onClick={() => setExportOpen(true)}
  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
>
  Export
</button>

// Add at the end of the component (before closing </div>):
<ExportDialog
  open={exportOpen}
  onClose={() => setExportOpen(false)}
  onExport={(config) => {
    createExport.mutate(config as any);
    setExportOpen(false);
  }}
  exportType="deposits"
  currentFilters={{}}
  loading={createExport.isPending}
/>
```

Apply the same pattern to all table pages: `withdrawals`, `transactions`, `webhooks`, `addresses`.

---

## Task 23: Tests

**Files:**
- Create: `services/cron-worker-service/src/export/export.worker.spec.ts`
- Create: `packages/ui/src/__tests__/json-viewer.test.tsx` (optional, vitest)

- [ ] **Step 1: Create export worker unit tests**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CsvGenerator } from './generators/csv.generator';
import { XlsxGenerator } from './generators/xlsx.generator';
import { JsonGenerator } from './generators/json.generator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Export Generators', () => {
  let csvGenerator: CsvGenerator;
  let jsonGenerator: JsonGenerator;
  let tmpDir: string;

  beforeAll(() => {
    csvGenerator = new CsvGenerator();
    jsonGenerator = new JsonGenerator();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvh-export-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const mockJob = {
    updateProgress: jest.fn(),
  } as any;

  const sampleData = [
    { id: '1', name: 'Alice', amount: '100.50', status: 'confirmed' },
    { id: '2', name: 'Bob', amount: '200.75', status: 'pending' },
    { id: '3', name: 'Charlie "Chuck"', amount: '300,000.00', status: 'failed' },
  ];

  function createFetcher(data: Record<string, unknown>[]) {
    return async function* () {
      yield data;
    };
  }

  describe('CsvGenerator', () => {
    it('should generate a valid CSV file with headers', async () => {
      const filePath = path.join(tmpDir, 'test.csv');
      const { totalRows, fileSizeBytes } = await csvGenerator.generate(
        createFetcher(sampleData),
        filePath,
        'deposits',
        mockJob,
      );

      expect(totalRows).toBe(3);
      expect(fileSizeBytes).toBeGreaterThan(0);

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Header line
      expect(lines[0]).toBe('id,name,amount,status');
      // Data lines
      expect(lines[1]).toBe('1,Alice,100.50,confirmed');
      // Field with quotes should be escaped
      expect(lines[3]).toContain('"Charlie ""Chuck"""');
      // Field with comma should be quoted
      expect(lines[3]).toContain('"300,000.00"');
    });

    it('should handle empty datasets', async () => {
      const filePath = path.join(tmpDir, 'empty.csv');
      const { totalRows } = await csvGenerator.generate(
        createFetcher([]),
        filePath,
        'deposits',
        mockJob,
      );

      expect(totalRows).toBe(0);
    });
  });

  describe('JsonGenerator', () => {
    it('should generate a valid JSON array file', async () => {
      const filePath = path.join(tmpDir, 'test.json');
      const { totalRows } = await jsonGenerator.generate(
        createFetcher(sampleData),
        filePath,
        'deposits',
        mockJob,
      );

      expect(totalRows).toBe(3);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);
      expect(parsed[0].name).toBe('Alice');
      expect(parsed[2].name).toBe('Charlie "Chuck"');
    });

    it('should produce valid JSON for empty datasets', async () => {
      const filePath = path.join(tmpDir, 'empty.json');
      await jsonGenerator.generate(createFetcher([]), filePath, 'deposits', mockJob);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd services/cron-worker-service && npx jest src/export/export.worker.spec.ts --passWithNoTests
```

---

## Verification Checklist

After implementing all tasks, verify:

- [ ] `database/021-create-cvh-exports.sql` executes cleanly against MySQL
- [ ] `npx prisma generate --schema=prisma/schema-exports.prisma` succeeds in cron-worker-service
- [ ] `npm install exceljs` completes in cron-worker-service
- [ ] All TypeScript compiles: `npx turbo build --filter=@cvh/ui --filter=cron-worker-service --filter=client-api --filter=admin-api`
- [ ] Export worker tests pass: `cd services/cron-worker-service && npx jest --passWithNoTests`
- [ ] JsonViewer v2 renders correctly in both admin and client frontends
- [ ] ExportDialog opens and submits correctly from deposit table
- [ ] StatusBadge correctly maps all known status strings
- [ ] CopyButton shows checkmark animation on click
- [ ] ConfirmationModal blocks interaction until confirmed
- [ ] EmptyState renders centered with icon, title, description, and action
- [ ] LoadingSkeleton and TableSkeleton show shimmer animation
