# Phase 1: Foundation & Phase 9: Impersonation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add multi-project scoping to the entire platform and admin impersonation for support operations.

**Architecture:** Column-level project_id on all tenant-scoped tables with ProjectScopeGuard middleware enforcement. Three-tier impersonation (read_only, support, full_operational) with full audit trail.

**Tech Stack:** NestJS 10.3, MySQL 8, Prisma 5.22, Next.js 14, React Query, Tailwind CSS

---

## Table of Contents

- [Task 1: Migration — Create projects table](#task-1-migration--create-projects-table)
- [Task 2: Migration — Add project_id to all tables + backfill](#task-2-migration--add-project_id-to-all-tables--backfill)
- [Task 3: Prisma schema — Add Project model to admin-api](#task-3-prisma-schema--add-project-model-to-admin-api)
- [Task 4: Prisma schema — Add project_id to all other service schemas](#task-4-prisma-schema--add-project_id-to-all-other-service-schemas)
- [Task 5: Backend — ProjectService in admin-api (CRUD)](#task-5-backend--projectservice-in-admin-api-crud)
- [Task 6: Backend — ProjectScopeGuard for client-api](#task-6-backend--projectscopeguard-for-client-api)
- [Task 7: Backend — Project endpoints in client-api](#task-7-backend--project-endpoints-in-client-api)
- [Task 8: Backend — Update all existing services to include project_id](#task-8-backend--update-all-existing-services-to-include-project_id)
- [Task 9: API Client — Add project methods](#task-9-api-client--add-project-methods)
- [Task 10: Frontend — ProjectContext provider for client app](#task-10-frontend--projectcontext-provider-for-client-app)
- [Task 11: Frontend — ProjectSelector dropdown for client header](#task-11-frontend--projectselector-dropdown-for-client-header)
- [Task 12: Frontend — Update all client pages to use project context](#task-12-frontend--update-all-client-pages-to-use-project-context)
- [Task 13: Tests — Project CRUD, scope guard, isolation](#task-13-tests--project-crud-scope-guard-isolation)
- [Task 14: Migration — Impersonation tables](#task-14-migration--impersonation-tables)
- [Task 15: Prisma schema — Add impersonation models to auth-service](#task-15-prisma-schema--add-impersonation-models-to-auth-service)
- [Task 16: Backend — ImpersonationService in auth-service](#task-16-backend--impersonationservice-in-auth-service)
- [Task 17: Backend — ImpersonationGuard for admin-api](#task-17-backend--impersonationguard-for-admin-api)
- [Task 18: Backend — Impersonation audit middleware](#task-18-backend--impersonation-audit-middleware)
- [Task 19: API Client — Add impersonation methods](#task-19-api-client--add-impersonation-methods)
- [Task 20: Frontend — ImpersonationDropdown for admin header](#task-20-frontend--impersonationdropdown-for-admin-header)
- [Task 21: Frontend — Impersonation visual banner](#task-21-frontend--impersonation-visual-banner)
- [Task 22: Tests — Impersonation flow, audit, permission matrix](#task-22-tests--impersonation-flow-audit-permission-matrix)

---

## Task 1: Migration — Create projects table

**Files:**
- **Create:** `database/013-create-projects.sql`

**Steps:**

- [ ] **1.1** Create `database/013-create-projects.sql`:

```sql
-- =============================================================================
-- CryptoVaultHub — Migration 013: Create projects table
-- Adds multi-project scoping to the platform. Each client can have multiple
-- projects for logical separation of wallets, transactions, and API keys.
-- =============================================================================

USE `cvh_admin`;

CREATE TABLE IF NOT EXISTS `projects` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `description` VARCHAR(500) NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('active','archived','suspended') NOT NULL DEFAULT 'active',
  `settings` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_slug` (`client_id`, `slug`),
  INDEX `idx_client_status` (`client_id`, `status`),
  CONSTRAINT `fk_projects_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Backfill: Create a default project for every existing client
-- =============================================================================

INSERT INTO `projects` (`client_id`, `name`, `slug`, `description`, `is_default`, `status`)
SELECT
  `id`,
  CONCAT(`name`, ' — Default'),
  'default',
  'Auto-created default project during migration',
  1,
  'active'
FROM `clients`;

-- =============================================================================
-- Enforce exactly one default project per client via trigger
-- =============================================================================

DELIMITER //

CREATE TRIGGER `trg_projects_single_default_insert`
BEFORE INSERT ON `projects`
FOR EACH ROW
BEGIN
  IF NEW.is_default = 1 THEN
    UPDATE `projects` SET `is_default` = 0
    WHERE `client_id` = NEW.client_id AND `is_default` = 1;
  END IF;
END//

CREATE TRIGGER `trg_projects_single_default_update`
BEFORE UPDATE ON `projects`
FOR EACH ROW
BEGIN
  IF NEW.is_default = 1 AND OLD.is_default = 0 THEN
    UPDATE `projects` SET `is_default` = 0
    WHERE `client_id` = NEW.client_id AND `is_default` = 1 AND `id` != NEW.id;
  END IF;
END//

DELIMITER ;
```

- [ ] **1.2** Verify migration syntax:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
mysql -u root -p < database/013-create-projects.sql
```

Expected output: no errors, `Query OK` for each statement.

- [ ] **1.3** Verify backfill worked:

```bash
mysql -u root -p -e "SELECT id, client_id, name, slug, is_default FROM cvh_admin.projects;"
```

Expected output: one row per existing client with `is_default = 1` and `slug = 'default'`.

- [ ] **1.4** Commit:

```bash
git add database/013-create-projects.sql
git commit -m "$(cat <<'EOF'
feat(db): add projects table with default backfill (migration 013)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration — Add project_id to all tables + backfill

**Files:**
- **Create:** `database/014-add-project-id.sql`

**Steps:**

- [ ] **2.1** Create `database/014-add-project-id.sql`:

```sql
-- =============================================================================
-- CryptoVaultHub — Migration 014: Add project_id to all tenant-scoped tables
-- Adds project_id column, backfills from default project, then sets NOT NULL.
-- =============================================================================

-- =============================================================================
-- 1. cvh_wallets — wallets, deposit_addresses, whitelisted_addresses
-- =============================================================================

USE `cvh_wallets`;

-- wallets
ALTER TABLE `wallets`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `wallets` w
  JOIN `cvh_admin`.`projects` p ON p.client_id = w.client_id AND p.is_default = 1
  SET w.project_id = p.id;

ALTER TABLE `wallets`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `wallets`
  ADD INDEX `idx_project` (`project_id`);

-- deposit_addresses
ALTER TABLE `deposit_addresses`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `deposit_addresses` da
  JOIN `cvh_admin`.`projects` p ON p.client_id = da.client_id AND p.is_default = 1
  SET da.project_id = p.id;

ALTER TABLE `deposit_addresses`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `deposit_addresses`
  ADD INDEX `idx_project` (`project_id`);

-- whitelisted_addresses
ALTER TABLE `whitelisted_addresses`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `whitelisted_addresses` wa
  JOIN `cvh_admin`.`projects` p ON p.client_id = wa.client_id AND p.is_default = 1
  SET wa.project_id = p.id;

ALTER TABLE `whitelisted_addresses`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `whitelisted_addresses`
  ADD INDEX `idx_project` (`project_id`);

-- =============================================================================
-- 2. cvh_transactions — deposits, withdrawals
-- =============================================================================

USE `cvh_transactions`;

-- deposits
ALTER TABLE `deposits`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `deposits` d
  JOIN `cvh_admin`.`projects` p ON p.client_id = d.client_id AND p.is_default = 1
  SET d.project_id = p.id;

ALTER TABLE `deposits`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `deposits`
  ADD INDEX `idx_project` (`project_id`);

-- withdrawals
ALTER TABLE `withdrawals`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `withdrawals` wd
  JOIN `cvh_admin`.`projects` p ON p.client_id = wd.client_id AND p.is_default = 1
  SET wd.project_id = p.id;

ALTER TABLE `withdrawals`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `withdrawals`
  ADD INDEX `idx_project` (`project_id`);

-- =============================================================================
-- 3. cvh_compliance — screening_results, compliance_alerts
-- =============================================================================

USE `cvh_compliance`;

-- screening_results
ALTER TABLE `screening_results`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `screening_results` sr
  JOIN `cvh_admin`.`projects` p ON p.client_id = sr.client_id AND p.is_default = 1
  SET sr.project_id = p.id;

ALTER TABLE `screening_results`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `screening_results`
  ADD INDEX `idx_project` (`project_id`);

-- compliance_alerts
ALTER TABLE `compliance_alerts`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `compliance_alerts` ca
  JOIN `cvh_admin`.`projects` p ON p.client_id = ca.client_id AND p.is_default = 1
  SET ca.project_id = p.id;

ALTER TABLE `compliance_alerts`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `compliance_alerts`
  ADD INDEX `idx_project` (`project_id`);

-- =============================================================================
-- 4. cvh_auth — api_keys
-- =============================================================================

USE `cvh_auth`;

ALTER TABLE `api_keys`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `api_keys` ak
  JOIN `cvh_admin`.`projects` p ON p.client_id = ak.client_id AND p.is_default = 1
  SET ak.project_id = p.id;

ALTER TABLE `api_keys`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `api_keys`
  ADD INDEX `idx_project` (`project_id`);

-- =============================================================================
-- 5. cvh_notifications — webhooks, webhook_deliveries, email_logs
-- =============================================================================

USE `cvh_notifications`;

-- webhooks
ALTER TABLE `webhooks`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `webhooks` wh
  JOIN `cvh_admin`.`projects` p ON p.client_id = wh.client_id AND p.is_default = 1
  SET wh.project_id = p.id;

ALTER TABLE `webhooks`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `webhooks`
  ADD INDEX `idx_project` (`project_id`);

-- webhook_deliveries
ALTER TABLE `webhook_deliveries`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `webhook_deliveries` wd
  JOIN `cvh_admin`.`projects` p ON p.client_id = wd.client_id AND p.is_default = 1
  SET wd.project_id = p.id;

ALTER TABLE `webhook_deliveries`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `webhook_deliveries`
  ADD INDEX `idx_project` (`project_id`);

-- email_logs
ALTER TABLE `email_logs`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `email_logs` el
  JOIN `cvh_admin`.`projects` p ON p.client_id = el.client_id AND p.is_default = 1
  SET el.project_id = p.id;

ALTER TABLE `email_logs`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `email_logs`
  ADD INDEX `idx_project` (`project_id`);

-- =============================================================================
-- 6. cvh_indexer — monitored_addresses
-- =============================================================================

USE `cvh_indexer`;

ALTER TABLE `monitored_addresses`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

UPDATE `monitored_addresses` ma
  JOIN `cvh_admin`.`projects` p ON p.client_id = ma.client_id AND p.is_default = 1
  SET ma.project_id = p.id;

ALTER TABLE `monitored_addresses`
  MODIFY COLUMN `project_id` BIGINT NOT NULL;

ALTER TABLE `monitored_addresses`
  ADD INDEX `idx_project` (`project_id`);

-- =============================================================================
-- 7. cvh_keyvault — key_vault_audit (NULLABLE project_id)
-- =============================================================================

USE `cvh_keyvault`;

ALTER TABLE `key_vault_audit`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- Best-effort backfill for rows with client_id set
UPDATE `key_vault_audit` kva
  JOIN `cvh_admin`.`projects` p ON p.client_id = kva.client_id AND p.is_default = 1
  SET kva.project_id = p.id
  WHERE kva.client_id IS NOT NULL;

-- NOTE: project_id stays NULLABLE on key_vault_audit since some audit rows
-- are platform-level (no client context)

ALTER TABLE `key_vault_audit`
  ADD INDEX `idx_project` (`project_id`);
```

- [ ] **2.2** Run migration:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
mysql -u root -p < database/014-add-project-id.sql
```

Expected output: no errors, `Query OK` for each ALTER/UPDATE.

- [ ] **2.3** Verify columns were added correctly:

```bash
mysql -u root -p -e "
  SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE COLUMN_NAME = 'project_id'
  AND TABLE_SCHEMA IN ('cvh_wallets','cvh_transactions','cvh_compliance','cvh_auth','cvh_notifications','cvh_indexer','cvh_keyvault')
  ORDER BY TABLE_SCHEMA, TABLE_NAME;
"
```

Expected output: 13 rows, all `NOT NULL` except `cvh_keyvault.key_vault_audit` which is `YES`.

- [ ] **2.4** Commit:

```bash
git add database/014-add-project-id.sql
git commit -m "$(cat <<'EOF'
feat(db): add project_id to all tenant-scoped tables with backfill (migration 014)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Prisma schema — Add Project model to admin-api

**Files:**
- **Modify:** `services/admin-api/prisma/schema.prisma`

**Steps:**

- [ ] **3.1** Add the `Project` model and `ProjectStatus` enum to `services/admin-api/prisma/schema.prisma`. Insert after the `Client` model:

```prisma
enum ProjectStatus {
  active
  archived
  suspended
}

model Project {
  id          BigInt        @id @default(autoincrement())
  clientId    BigInt        @map("client_id")
  name        String        @db.VarChar(200)
  slug        String        @db.VarChar(100)
  description String?       @db.VarChar(500)
  isDefault   Boolean       @default(false) @map("is_default")
  status      ProjectStatus @default(active)
  settings    Json?
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  client Client @relation(fields: [clientId], references: [id])

  @@unique([clientId, slug], name: "uq_client_slug")
  @@index([clientId, status], name: "idx_client_status")
  @@map("projects")
}
```

- [ ] **3.2** Add the `projects` relation to the `Client` model in the same file. Add this field inside the `Client` model:

```prisma
  projects  Project[]
```

- [ ] **3.3** Regenerate Prisma client:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api
npx prisma generate
```

Expected output: `Generated Prisma Client` to `src/generated/prisma-client`.

- [ ] **3.4** Verify the generated types include `Project`:

```bash
grep -l "Project" /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api/src/generated/prisma-client/index.d.ts | head -1
```

Expected output: the file path, confirming `Project` type exists.

- [ ] **3.5** Commit:

```bash
git add services/admin-api/prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(admin-api): add Project model to Prisma schema

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Prisma schema — Add project_id to all other service schemas

**Files:**
- **Modify:** `services/core-wallet-service/prisma/schema.prisma`
- **Modify:** `services/notification-service/prisma/schema.prisma`
- **Modify:** `services/chain-indexer-service/prisma/schema.prisma`
- **Modify:** `services/auth-service/prisma/schema.prisma`
- **Modify:** `services/key-vault-service/prisma/schema.prisma`

**Steps:**

- [ ] **4.1** Add `projectId` to `services/core-wallet-service/prisma/schema.prisma`. For every model that has `clientId`, add `projectId` right after it:

In `Wallet` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

In `DepositAddress` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

In `WhitelistedAddress` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

In `Deposit` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

In `Withdrawal` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

In `ScreeningResult` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

In `ComplianceAlert` model, add after the `clientId` field:
```prisma
  projectId  BigInt   @map("project_id")
```

Add `@@index([projectId], name: "idx_project")` to each of these models.

- [ ] **4.2** Add `projectId` to `services/auth-service/prisma/schema.prisma`. In the `ApiKey` model, add after `clientId`:

```prisma
  projectId    BigInt    @map("project_id")
```

Add `@@index([projectId], name: "idx_project")` to the `ApiKey` model.

- [ ] **4.3** Add `projectId` to `services/notification-service/prisma/schema.prisma`. In the `Webhook` model, add after `clientId`:

```prisma
  projectId  BigInt   @map("project_id")
```

In the `WebhookDelivery` model, add after `clientId`:
```prisma
  projectId  BigInt   @map("project_id")
```

In the `EmailLog` model, add after `clientId`:
```prisma
  projectId  BigInt   @map("project_id")
```

Add `@@index([projectId], name: "idx_project")` to each model.

- [ ] **4.4** Add `projectId` to `services/chain-indexer-service/prisma/schema.prisma`. In the `MonitoredAddress` model, add after `clientId`:

```prisma
  projectId  BigInt   @map("project_id")
```

Add `@@index([projectId], name: "idx_project")` to the model.

- [ ] **4.5** Add `projectId` to `services/key-vault-service/prisma/schema.prisma`. In the `KeyVaultAudit` model, add after `clientId`:

```prisma
  projectId   BigInt?  @map("project_id")
```

Note: nullable for key-vault-audit since some operations are platform-level.

- [ ] **4.6** Regenerate all Prisma clients:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
for svc in core-wallet-service auth-service notification-service chain-indexer-service key-vault-service; do
  echo "Generating $svc..."
  cd services/$svc && npx prisma generate && cd ../..
done
```

Expected output: `Generated Prisma Client` for each service.

- [ ] **4.7** Commit:

```bash
git add services/core-wallet-service/prisma/schema.prisma \
        services/auth-service/prisma/schema.prisma \
        services/notification-service/prisma/schema.prisma \
        services/chain-indexer-service/prisma/schema.prisma \
        services/key-vault-service/prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(prisma): add project_id to all service schemas

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Backend — ProjectService in admin-api (CRUD)

**Files:**
- **Create:** `services/admin-api/src/project-management/project-management.module.ts`
- **Create:** `services/admin-api/src/project-management/project-management.controller.ts`
- **Create:** `services/admin-api/src/project-management/project-management.service.ts`
- **Create:** `services/admin-api/src/common/dto/project.dto.ts`
- **Modify:** `services/admin-api/src/app.module.ts`

**Steps:**

- [ ] **5.1** Create `services/admin-api/src/common/dto/project.dto.ts`:

```typescript
import { IsString, IsOptional, IsEnum, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    description: 'Human-readable project name',
    example: 'Production',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'URL-safe slug (unique per client)',
    example: 'production',
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens only',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Production environment for mainnet operations',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Project-level settings (JSON object)',
    example: { autoSweep: true, confirmationOverride: 12 },
  })
  @IsOptional()
  settings?: Record<string, any>;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'Project name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Project description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Project status',
    enum: ['active', 'archived', 'suspended'],
  })
  @IsOptional()
  @IsEnum(['active', 'archived', 'suspended'] as const)
  status?: 'active' | 'archived' | 'suspended';

  @ApiPropertyOptional({ description: 'Whether this is the default project' })
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Project-level settings (JSON)' })
  @IsOptional()
  settings?: Record<string, any>;
}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['active', 'archived', 'suspended'],
  })
  @IsOptional()
  @IsEnum(['active', 'archived', 'suspended'] as const)
  status?: string;
}
```

- [ ] **5.2** Create `services/admin-api/src/project-management/project-management.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class ProjectManagementService {
  private readonly logger = new Logger(ProjectManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createProject(
    clientId: number,
    data: {
      name: string;
      slug: string;
      description?: string;
      settings?: Record<string, any>;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    // Verify client exists
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(clientId) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    // Check slug uniqueness within client
    const existing = await this.prisma.project.findUnique({
      where: {
        uq_client_slug: {
          clientId: BigInt(clientId),
          slug: data.slug,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Project with slug "${data.slug}" already exists for client ${clientId}`,
      );
    }

    // Check if this is the first project for the client (make it default)
    const projectCount = await this.prisma.project.count({
      where: { clientId: BigInt(clientId) },
    });

    const project = await this.prisma.project.create({
      data: {
        clientId: BigInt(clientId),
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        isDefault: projectCount === 0,
        settings: data.settings ?? undefined,
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.create',
      entityType: 'project',
      entityId: project.id.toString(),
      details: {
        clientId,
        name: data.name,
        slug: data.slug,
        isDefault: projectCount === 0,
      },
      ipAddress,
    });

    this.logger.log(
      `Project created: ${data.slug} (ID: ${project.id}) for client ${clientId}`,
    );

    return this.serializeProject(project);
  }

  async listProjects(
    clientId: number,
    params: { page: number; limit: number; status?: string },
  ) {
    const skip = (params.page - 1) * params.limit;
    const where: any = { clientId: BigInt(clientId) };

    if (params.status) {
      where.status = params.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      items: items.map((p) => this.serializeProject(p)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getProject(clientId: number, projectId: number) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: BigInt(projectId),
        clientId: BigInt(clientId),
      },
    });
    if (!project) {
      throw new NotFoundException(
        `Project ${projectId} not found for client ${clientId}`,
      );
    }
    return this.serializeProject(project);
  }

  async getDefaultProject(clientId: number) {
    const project = await this.prisma.project.findFirst({
      where: {
        clientId: BigInt(clientId),
        isDefault: true,
      },
    });
    if (!project) {
      throw new NotFoundException(
        `No default project found for client ${clientId}`,
      );
    }
    return this.serializeProject(project);
  }

  async updateProject(
    clientId: number,
    projectId: number,
    data: {
      name?: string;
      description?: string;
      status?: string;
      isDefault?: boolean;
      settings?: Record<string, any>;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.project.findFirst({
      where: {
        id: BigInt(projectId),
        clientId: BigInt(clientId),
      },
    });
    if (!existing) {
      throw new NotFoundException(
        `Project ${projectId} not found for client ${clientId}`,
      );
    }

    // Cannot archive the default project
    if (data.status === 'archived' && existing.isDefault) {
      throw new BadRequestException(
        'Cannot archive the default project. Set another project as default first.',
      );
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.settings !== undefined) updateData.settings = data.settings;

    // Handle setting as default — the DB trigger will unset previous default
    if (data.isDefault === true) {
      updateData.isDefault = true;
    }

    const project = await this.prisma.project.update({
      where: { id: BigInt(projectId) },
      data: updateData,
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.update',
      entityType: 'project',
      entityId: projectId.toString(),
      details: { clientId, changes: data },
      ipAddress,
    });

    return this.serializeProject(project);
  }

  async deleteProject(
    clientId: number,
    projectId: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.project.findFirst({
      where: {
        id: BigInt(projectId),
        clientId: BigInt(clientId),
      },
    });
    if (!existing) {
      throw new NotFoundException(
        `Project ${projectId} not found for client ${clientId}`,
      );
    }

    if (existing.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default project. Set another project as default first.',
      );
    }

    // Soft-delete: set status to archived
    const project = await this.prisma.project.update({
      where: { id: BigInt(projectId) },
      data: { status: 'archived' },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.archive',
      entityType: 'project',
      entityId: projectId.toString(),
      details: { clientId },
      ipAddress,
    });

    this.logger.log(
      `Project archived: ${existing.slug} (ID: ${projectId}) for client ${clientId}`,
    );

    return this.serializeProject(project);
  }

  private serializeProject(project: any) {
    return {
      id: project.id.toString(),
      clientId: project.clientId.toString(),
      name: project.name,
      slug: project.slug,
      description: project.description,
      isDefault: project.isDefault,
      status: project.status,
      settings: project.settings,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
```

- [ ] **5.3** Create `services/admin-api/src/project-management/project-management.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { ProjectManagementService } from './project-management.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ListProjectsQueryDto,
} from '../common/dto/project.dto';

@ApiTags('Projects')
@ApiBearerAuth('JWT')
@Controller('admin/clients/:clientId/projects')
export class ProjectManagementController {
  constructor(private readonly projectService: ProjectManagementService) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a project for a client',
    description: `Creates a new project within a client organization for logical scoping of wallets, transactions, API keys, and webhooks.

**Slug rules:** lowercase alphanumeric with hyphens only. Must be unique within the client.

The first project created for a client is automatically marked as default.`,
  })
  @ApiParam({ name: 'clientId', type: 'integer', description: 'Client ID' })
  @ApiBody({ type: CreateProjectDto })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  @ApiResponse({ status: 409, description: 'Slug already exists for this client' })
  async createProject(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: CreateProjectDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const project = await this.projectService.createProject(
      clientId,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, project };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List projects for a client',
    description: 'Returns a paginated list of projects for the specified client, ordered by default status then creation date.',
  })
  @ApiParam({ name: 'clientId', type: 'integer', description: 'Client ID' })
  @ApiResponse({ status: 200, description: 'Paginated list of projects' })
  async listProjects(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() query: ListProjectsQueryDto,
  ) {
    const result = await this.projectService.listProjects(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
    return { success: true, ...result };
  }

  @Get('default')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get the default project for a client',
    description: 'Returns the project marked as default for the given client.',
  })
  @ApiParam({ name: 'clientId', type: 'integer', description: 'Client ID' })
  @ApiResponse({ status: 200, description: 'Default project' })
  @ApiResponse({ status: 404, description: 'No default project found' })
  async getDefaultProject(
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    const project = await this.projectService.getDefaultProject(clientId);
    return { success: true, project };
  }

  @Get(':projectId')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get a project by ID',
    description: 'Returns the full details of a specific project within a client.',
  })
  @ApiParam({ name: 'clientId', type: 'integer', description: 'Client ID' })
  @ApiParam({ name: 'projectId', type: 'integer', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project details' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getProject(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    const project = await this.projectService.getProject(clientId, projectId);
    return { success: true, project };
  }

  @Patch(':projectId')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update a project',
    description: `Updates one or more fields of an existing project. Only provided fields are changed.

**Rules:**
- Cannot archive the default project (set another as default first)
- Setting \`isDefault: true\` will unset the previous default`,
  })
  @ApiParam({ name: 'clientId', type: 'integer', description: 'Client ID' })
  @ApiParam({ name: 'projectId', type: 'integer', description: 'Project ID' })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 400, description: 'Cannot archive default project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async updateProject(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const project = await this.projectService.updateProject(
      clientId,
      projectId,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, project };
  }

  @Delete(':projectId')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive a project (soft delete)',
    description: 'Archives the specified project. Cannot archive the default project.',
  })
  @ApiParam({ name: 'clientId', type: 'integer', description: 'Client ID' })
  @ApiParam({ name: 'projectId', type: 'integer', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project archived' })
  @ApiResponse({ status: 400, description: 'Cannot delete the default project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async deleteProject(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const project = await this.projectService.deleteProject(
      clientId,
      projectId,
      user.userId,
      req.ip,
    );
    return { success: true, project };
  }
}
```

- [ ] **5.4** Create `services/admin-api/src/project-management/project-management.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProjectManagementController } from './project-management.controller';
import { ProjectManagementService } from './project-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [ProjectManagementController],
  providers: [ProjectManagementService, AuditLogService],
  exports: [ProjectManagementService],
})
export class ProjectManagementModule {}
```

- [ ] **5.5** Register `ProjectManagementModule` in `services/admin-api/src/app.module.ts`. Add the import and add it to the imports array:

```typescript
import { ProjectManagementModule } from './project-management/project-management.module';
```

Add `ProjectManagementModule` to the `imports` array alongside the other modules.

- [ ] **5.6** Verify the admin-api compiles:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **5.7** Commit:

```bash
git add services/admin-api/src/project-management/ \
        services/admin-api/src/common/dto/project.dto.ts \
        services/admin-api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(admin-api): add ProjectManagementService with full CRUD endpoints

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Backend — ProjectScopeGuard for client-api

**Files:**
- **Create:** `services/client-api/src/common/guards/project-scope.guard.ts`
- **Modify:** `services/client-api/src/common/decorators.ts`
- **Modify:** `services/client-api/src/common/guards/api-key-auth.guard.ts`

**Steps:**

- [ ] **6.1** Update the `ApiKeyValidation` interface in `services/client-api/src/common/guards/api-key-auth.guard.ts` to include `projectId`:

Add `projectId?: number;` to the `ApiKeyValidation` interface:

```typescript
export interface ApiKeyValidation {
  valid: boolean;
  clientId?: number;
  projectId?: number;
  scopes?: string[];
  ipAllowlist?: string[];
  allowedChains?: number[];
}
```

In the `canActivate` method, attach `projectId` to the request alongside clientId:

Find:
```typescript
    // Attach client info to request
    request.clientId = validation.clientId;
    request.scopes = validation.scopes;
    request.allowedChains = validation.allowedChains;
```

Replace with:
```typescript
    // Attach client info to request
    request.clientId = validation.clientId;
    request.projectId = validation.projectId;
    request.scopes = validation.scopes;
    request.allowedChains = validation.allowedChains;
```

- [ ] **6.2** Create `services/client-api/src/common/guards/project-scope.guard.ts`:

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

/**
 * ProjectScopeGuard ensures that every client-api request has a valid
 * project context. It reads project_id from three sources (in order):
 *
 * 1. X-Project-Id header (explicit override)
 * 2. req.projectId (set by ApiKeyAuthGuard from the API key's bound project)
 * 3. Falls back to the client's default project via auth-service lookup
 *
 * After resolution, it sets `req.projectId` so that downstream services
 * always have a valid project scope.
 */
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  private readonly logger = new Logger(ProjectScopeGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Source 1: Explicit header override
    const headerProjectId = request.headers['x-project-id'];
    if (headerProjectId) {
      const parsed = parseInt(headerProjectId, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new ForbiddenException(
          'Invalid X-Project-Id header: must be a positive integer',
        );
      }
      request.projectId = parsed;
      return true;
    }

    // Source 2: Already set by API key validation (project-scoped API key)
    if (request.projectId) {
      return true;
    }

    // Source 3: No project context — this is acceptable for backwards
    // compatibility during migration. The downstream service will use
    // the client's default project.
    // In a future version, this could be made strict.
    this.logger.debug(
      `No project context for client ${request.clientId}; downstream will resolve default project`,
    );

    // Set a sentinel so downstream code knows to resolve default
    request.projectId = null;
    return true;
  }
}
```

- [ ] **6.3** Update `services/client-api/src/common/decorators.ts` to include the `ProjectScopeGuard`:

```typescript
import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { SCOPES_KEY, ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { ProjectScopeGuard } from './guards/project-scope.guard';

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(SCOPES_KEY, scopes);

export const ClientAuth = (...scopes: string[]) =>
  applyDecorators(
    UseGuards(ApiKeyAuthGuard, ProjectScopeGuard),
    ...(scopes.length > 0 ? [SetMetadata(SCOPES_KEY, scopes)] : []),
  );
```

- [ ] **6.4** Verify client-api compiles:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/client-api
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **6.5** Commit:

```bash
git add services/client-api/src/common/guards/project-scope.guard.ts \
        services/client-api/src/common/guards/api-key-auth.guard.ts \
        services/client-api/src/common/decorators.ts
git commit -m "$(cat <<'EOF'
feat(client-api): add ProjectScopeGuard for multi-project request scoping

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Backend — Project endpoints in client-api

**Files:**
- **Create:** `services/client-api/src/project/project.module.ts`
- **Create:** `services/client-api/src/project/project.controller.ts`
- **Create:** `services/client-api/src/project/project.service.ts`
- **Modify:** `services/client-api/src/app.module.ts`

**Steps:**

- [ ] **7.1** Create `services/client-api/src/project/project.service.ts`:

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
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);
  private readonly adminApiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.adminApiUrl = this.configService.get<string>(
      'ADMIN_API_URL',
      'http://localhost:3001',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    };
  }

  async listProjects(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.adminApiUrl}/internal/clients/${clientId}/projects`,
        {
          headers: this.headers,
          timeout: 10000,
          params: { status: 'active' },
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getProject(clientId: number, projectId: number) {
    try {
      const { data } = await axios.get(
        `${this.adminApiUrl}/internal/clients/${clientId}/projects/${projectId}`,
        {
          headers: this.headers,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getDefaultProject(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.adminApiUrl}/internal/clients/${clientId}/projects/default`,
        {
          headers: this.headers,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
```

- [ ] **7.2** Create `services/client-api/src/project/project.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Param,
  Req,
  ParseIntPipe,
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
import { ProjectService } from './project.service';

@ApiTags('Projects')
@ApiSecurity('ApiKey')
@Controller('client/v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List all active projects',
    description: `Returns all active projects belonging to the authenticated client.

Each project represents a logical scope for wallets, deposit addresses, transactions, webhooks, and API keys. Clients can use the \`X-Project-Id\` header on subsequent requests to scope operations to a specific project.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Active projects retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        projects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1' },
              name: { type: 'string', example: 'Production' },
              slug: { type: 'string', example: 'production' },
              description: { type: 'string', example: 'Mainnet operations', nullable: true },
              isDefault: { type: 'boolean', example: true },
              status: { type: 'string', example: 'active' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async listProjects(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.projectService.listProjects(clientId);
    return { success: true, projects: result };
  }

  @Get('current')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get current project context',
    description: `Returns the project that is currently active for this request.

If the \`X-Project-Id\` header is set, returns that project. Otherwise, returns the client's default project.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Current project context.' })
  async getCurrentProject(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const projectId = (req as any).projectId;

    if (projectId) {
      const project = await this.projectService.getProject(clientId, projectId);
      return { success: true, project };
    }

    const project = await this.projectService.getDefaultProject(clientId);
    return { success: true, project };
  }

  @Get(':projectId')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get a project by ID',
    description: 'Returns the details of a specific project belonging to the authenticated client.',
  })
  @ApiParam({ name: 'projectId', type: 'integer', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project details.' })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  async getProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const project = await this.projectService.getProject(clientId, projectId);
    return { success: true, project };
  }
}
```

- [ ] **7.3** Create `services/client-api/src/project/project.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
```

- [ ] **7.4** Register `ProjectModule` in `services/client-api/src/app.module.ts`:

Add the import:
```typescript
import { ProjectModule } from './project/project.module';
```

Add `ProjectModule` to the `imports` array.

- [ ] **7.5** Verify client-api compiles:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/client-api
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **7.6** Commit:

```bash
git add services/client-api/src/project/ \
        services/client-api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(client-api): add project list/detail endpoints for client portal

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Backend — Update all existing services to include project_id in queries

**Files:**
- **Modify:** `services/client-api/src/wallet/wallet.service.ts`
- **Modify:** `services/client-api/src/wallet/wallet.controller.ts`
- **Modify:** `services/client-api/src/deposit/deposit.controller.ts`
- **Modify:** `services/client-api/src/withdrawal/withdrawal.controller.ts`
- **Modify:** `services/client-api/src/address-book/address-book.controller.ts`
- **Modify:** `services/client-api/src/webhook/webhook.controller.ts`
- **Modify:** `services/client-api/src/api-key/api-key.controller.ts`

**Steps:**

- [ ] **8.1** Update `services/client-api/src/wallet/wallet.service.ts` to accept and pass `projectId`:

In the `listWallets` method, change signature and URL:

```typescript
  async listWallets(clientId: number, projectId: number | null) {
    try {
      const params: Record<string, any> = {};
      if (projectId) params.projectId = projectId;

      const { data } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}`,
        {
          headers: this.headers,
          timeout: 10000,
          params,
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
```

In the `getBalances` method, add `projectId` parameter:

```typescript
  async getBalances(clientId: number, chainId: number, projectId: number | null) {
    try {
      const params: Record<string, any> = {};
      if (projectId) params.projectId = projectId;

      const { data } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}/${chainId}/balances`,
        {
          headers: this.headers,
          timeout: 10000,
          params,
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
```

- [ ] **8.2** Update `services/client-api/src/wallet/wallet.controller.ts` to pass `projectId` from the request:

In `listWallets`:
```typescript
  async listWallets(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const projectId = (req as any).projectId;
    const wallets = await this.walletService.listWallets(clientId, projectId);
    return { success: true, wallets };
  }
```

In `getBalances`:
```typescript
  async getBalances(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const projectId = (req as any).projectId;
    const balances = await this.walletService.getBalances(clientId, chainId, projectId);
    return { success: true, balances };
  }
```

- [ ] **8.3** Apply the same pattern to **all other controllers** in client-api. For each controller, extract `projectId` from `req` and pass it through to the service layer. The pattern is always:

```typescript
const projectId = (req as any).projectId;
```

Apply this to:
- `services/client-api/src/deposit/deposit.controller.ts` — all endpoint handlers
- `services/client-api/src/withdrawal/withdrawal.controller.ts` — all endpoint handlers
- `services/client-api/src/address-book/address-book.controller.ts` — all endpoint handlers
- `services/client-api/src/webhook/webhook.controller.ts` — all endpoint handlers
- `services/client-api/src/api-key/api-key.controller.ts` — all endpoint handlers

For each corresponding service file, update method signatures to accept `projectId: number | null` and pass it as a query parameter or request body field to the downstream service.

- [ ] **8.4** Verify client-api compiles:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/client-api
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **8.5** Commit:

```bash
git add services/client-api/src/
git commit -m "$(cat <<'EOF'
feat(client-api): thread project_id through all service calls

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: API Client — Add project methods

**Files:**
- **Modify:** `packages/api-client/src/admin-api.ts`
- **Modify:** `packages/api-client/src/client-api.ts`
- **Modify:** `packages/api-client/src/types.ts`
- **Modify:** `packages/api-client/src/hooks/useAdminApi.ts`
- **Modify:** `packages/api-client/src/hooks/useClientApi.ts`

**Steps:**

- [ ] **9.1** Add project types to `packages/api-client/src/types.ts`. Add after the existing Client types:

```typescript
// ── Admin/Client: Projects ──────────────────────────────
export interface ProjectInfo {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  status: 'active' | 'archived' | 'suspended';
  settings: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  slug: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: 'active' | 'archived' | 'suspended';
  isDefault?: boolean;
  settings?: Record<string, any>;
}
```

- [ ] **9.2** Add project methods to `packages/api-client/src/admin-api.ts`. Insert after the Clients section:

```typescript
  // ── Projects ────────────────────────────────────────────

  async getProjects(
    clientId: number,
    params?: PaginationParams & { status?: string },
  ): Promise<PaginatedResponse<ProjectInfo>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return this.request('GET', `/admin/clients/${clientId}/projects${query ? `?${query}` : ''}`);
  }

  async getProject(clientId: number, projectId: number): Promise<ProjectInfo> {
    return this.request('GET', `/admin/clients/${clientId}/projects/${projectId}`);
  }

  async getDefaultProject(clientId: number): Promise<ProjectInfo> {
    return this.request('GET', `/admin/clients/${clientId}/projects/default`);
  }

  async createProject(clientId: number, data: CreateProjectDto): Promise<ProjectInfo> {
    return this.request('POST', `/admin/clients/${clientId}/projects`, data);
  }

  async updateProject(
    clientId: number,
    projectId: number,
    data: UpdateProjectDto,
  ): Promise<ProjectInfo> {
    return this.request('PATCH', `/admin/clients/${clientId}/projects/${projectId}`, data);
  }

  async archiveProject(clientId: number, projectId: number): Promise<ProjectInfo> {
    return this.request('DELETE', `/admin/clients/${clientId}/projects/${projectId}`);
  }
```

Add the import for `ProjectInfo`, `CreateProjectDto`, and `UpdateProjectDto` from `./types`.

- [ ] **9.3** Update `packages/api-client/src/client-api.ts` to support project scoping. Modify the constructor and `request` method to support an optional `projectId`:

```typescript
export class ClientApiClient {
  private _projectId: number | null = null;

  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  /** Set the active project ID for all subsequent requests */
  setProjectId(projectId: number | null) {
    this._projectId = projectId;
  }

  get projectId(): number | null {
    return this._projectId;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
    if (this._projectId) {
      headers['X-Project-Id'] = String(this._projectId);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Client API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }
```

Add project-specific methods at the end of the class:

```typescript
  // ── Projects ──────────────────────────────────────────────

  async getProjects(): Promise<ProjectInfo[]> {
    return this.request('GET', '/client/v1/projects');
  }

  async getCurrentProject(): Promise<ProjectInfo> {
    return this.request('GET', '/client/v1/projects/current');
  }

  async getProject(projectId: number): Promise<ProjectInfo> {
    return this.request('GET', `/client/v1/projects/${projectId}`);
  }
```

Add the import for `ProjectInfo` from `./types`.

- [ ] **9.4** Add project hooks to `packages/api-client/src/hooks/useAdminApi.ts`. Add after the `adminKeys` object:

Add to `adminKeys`:
```typescript
  projects: (clientId: number, params?: PaginationParams & { status?: string }) =>
    [...adminKeys.all, 'projects', clientId, params] as const,
  project: (clientId: number, projectId: number) =>
    [...adminKeys.all, 'project', clientId, projectId] as const,
  defaultProject: (clientId: number) =>
    [...adminKeys.all, 'defaultProject', clientId] as const,
```

Add new hooks:
```typescript
// ── Projects ────────────────────────────────────────────

export function useProjects(clientId: number, params?: PaginationParams & { status?: string }) {
  return useQuery({
    queryKey: adminKeys.projects(clientId, params),
    queryFn: () => api().getProjects(clientId, params),
    enabled: !!_adminApi && clientId > 0,
  });
}

export function useProject(clientId: number, projectId: number) {
  return useQuery({
    queryKey: adminKeys.project(clientId, projectId),
    queryFn: () => api().getProject(clientId, projectId),
    enabled: !!_adminApi && clientId > 0 && projectId > 0,
  });
}

export function useDefaultProject(clientId: number) {
  return useQuery({
    queryKey: adminKeys.defaultProject(clientId),
    queryFn: () => api().getDefaultProject(clientId),
    enabled: !!_adminApi && clientId > 0,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: number; data: CreateProjectDto }) =>
      api().createProject(clientId, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.projects(variables.clientId) });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      projectId,
      data,
    }: {
      clientId: number;
      projectId: number;
      data: UpdateProjectDto;
    }) => api().updateProject(clientId, projectId, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.projects(variables.clientId) });
      qc.invalidateQueries({
        queryKey: adminKeys.project(variables.clientId, variables.projectId),
      });
    },
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, projectId }: { clientId: number; projectId: number }) =>
      api().archiveProject(clientId, projectId),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.projects(variables.clientId) });
    },
  });
}
```

Import `CreateProjectDto` and `UpdateProjectDto` from `../types`.

- [ ] **9.5** Add project hooks to `packages/api-client/src/hooks/useClientApi.ts`. Add to `clientKeys`:

```typescript
  projects: () => [...clientKeys.all, 'projects'] as const,
  currentProject: () => [...clientKeys.all, 'currentProject'] as const,
  project: (id: number) => [...clientKeys.all, 'project', id] as const,
```

Add new hooks:
```typescript
// ── Projects ──────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: clientKeys.projects(),
    queryFn: () => api().getProjects(),
    enabled: !!_clientApi,
  });
}

export function useCurrentProject() {
  return useQuery({
    queryKey: clientKeys.currentProject(),
    queryFn: () => api().getCurrentProject(),
    enabled: !!_clientApi,
  });
}

export function useClientProject(projectId: number) {
  return useQuery({
    queryKey: clientKeys.project(projectId),
    queryFn: () => api().getProject(projectId),
    enabled: !!_clientApi && projectId > 0,
  });
}
```

- [ ] **9.6** Verify packages compile:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/packages/api-client
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **9.7** Commit:

```bash
git add packages/api-client/src/
git commit -m "$(cat <<'EOF'
feat(api-client): add project methods and hooks for admin and client APIs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend — ProjectContext provider for client app

**Files:**
- **Create:** `apps/client/lib/project-context.tsx`

**Steps:**

- [ ] **10.1** Create `apps/client/lib/project-context.tsx`:

```typescript
'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  status: string;
}

interface ProjectContextType {
  /** Currently selected project (null while loading) */
  currentProject: Project | null;
  /** All available projects for this client */
  projects: Project[];
  /** Whether the project list is still loading */
  isLoading: boolean;
  /** Switch to a different project by ID */
  switchProject: (projectId: string) => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

const STORAGE_KEY = 'cvh_client_project_id';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const token = localStorage.getItem('cvh_client_token');
        if (!token) {
          setIsLoading(false);
          return;
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_CLIENT_API_URL || 'http://localhost:3002'}/client/v1/projects`,
          {
            headers: { 'X-API-Key': token },
          },
        );

        if (!res.ok) {
          console.error('Failed to load projects:', res.status);
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        const projectList: Project[] = data.projects ?? [];
        setProjects(projectList);

        // Restore last selected project from localStorage, or use default
        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = savedId
          ? projectList.find((p) => p.id === savedId)
          : null;
        const defaultProject =
          saved ?? projectList.find((p) => p.isDefault) ?? projectList[0] ?? null;

        setCurrentProject(defaultProject);
      } catch (err) {
        console.error('Error loading projects:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadProjects();
  }, []);

  const switchProject = useCallback(
    (projectId: string) => {
      const target = projects.find((p) => p.id === projectId);
      if (target) {
        setCurrentProject(target);
        localStorage.setItem(STORAGE_KEY, projectId);
      }
    },
    [projects],
  );

  return (
    <ProjectContext.Provider
      value={{ currentProject, projects, isLoading, switchProject }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx)
    throw new Error('useProject must be used within ProjectProvider');
  return ctx;
};
```

- [ ] **10.2** Wrap the client app layout with `ProjectProvider`. The provider should be nested inside the existing `ClientAuthProvider` in the app layout. Locate the layout file (likely `apps/client/app/layout.tsx` or similar) and wrap children:

```tsx
import { ProjectProvider } from '@/lib/project-context';

// Inside the layout JSX, wrap children with:
<ClientAuthProvider>
  <ProjectProvider>
    {children}
  </ProjectProvider>
</ClientAuthProvider>
```

- [ ] **10.3** Commit:

```bash
git add apps/client/lib/project-context.tsx apps/client/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(client-app): add ProjectContext provider for multi-project support

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Frontend — ProjectSelector dropdown for client header

**Files:**
- **Create:** `apps/client/components/project-selector.tsx`
- **Modify:** `apps/client/components/header.tsx`

**Steps:**

- [ ] **11.1** Create `apps/client/components/project-selector.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { FolderKanban, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/lib/project-context';

export function ProjectSelector() {
  const { currentProject, projects, isLoading, switchProject } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (isLoading || projects.length === 0) {
    return null;
  }

  // If only one project, show it as a static label (no dropdown)
  if (projects.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-button text-caption text-text-secondary font-display">
        <FolderKanban className="w-3.5 h-3.5 text-text-muted" />
        <span className="truncate max-w-[140px]">
          {currentProject?.name ?? 'Project'}
        </span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-button text-caption font-display',
          'border border-border-subtle bg-surface-page',
          'hover:bg-surface-hover hover:border-border-default',
          'transition-all duration-fast',
          isOpen && 'border-accent-primary bg-accent-subtle',
        )}
        title="Switch project"
      >
        <FolderKanban className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
        <span className="truncate max-w-[140px] text-text-primary font-medium">
          {currentProject?.name ?? 'Select project'}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-text-muted transition-transform duration-fast',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1 w-[220px] z-[200]',
            'bg-surface-page border border-border-subtle rounded-card shadow-lg',
            'animate-fade-in overflow-hidden',
          )}
        >
          <div className="px-3 py-2 border-b border-border-subtle">
            <span className="text-micro text-text-muted font-semibold uppercase tracking-[0.1em] font-display">
              Projects
            </span>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {projects.map((project) => {
              const isActive = project.id === currentProject?.id;
              return (
                <button
                  key={project.id}
                  onClick={() => {
                    switchProject(project.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left',
                    'text-caption font-display transition-all duration-fast',
                    isActive
                      ? 'bg-accent-subtle text-accent-primary font-semibold'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  )}
                >
                  <span className="flex-1 truncate">{project.name}</span>
                  {project.isDefault && (
                    <span className="text-micro text-text-muted bg-surface-hover px-1.5 py-0.5 rounded-badge">
                      default
                    </span>
                  )}
                  {isActive && (
                    <Check className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **11.2** Update `apps/client/components/header.tsx` to include the `ProjectSelector`. Add the import and insert the component in the left section of the header, after the breadcrumb:

Add import:
```typescript
import { ProjectSelector } from "@/components/project-selector";
```

Insert after the breadcrumb `<div>` and before the right actions `<div>`, add a separator and the selector:

```tsx
      {/* Center: Project selector */}
      <div className="flex items-center">
        <div className="w-px h-5 bg-border-subtle mx-3" />
        <ProjectSelector />
      </div>
```

- [ ] **11.3** Commit:

```bash
git add apps/client/components/project-selector.tsx \
        apps/client/components/header.tsx
git commit -m "$(cat <<'EOF'
feat(client-app): add ProjectSelector dropdown to client header

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Frontend — Update all client pages to use project context

**Files:**
- **Modify:** All page files in `apps/client/app/` that fetch data

**Steps:**

- [ ] **12.1** The key principle: every page that fetches data (wallets, deposits, withdrawals, addresses, webhooks, API keys) must invalidate and refetch when the project changes. The simplest approach is to include `currentProject?.id` in the React Query key.

Update the `clientKeys` object in `packages/api-client/src/hooks/useClientApi.ts` to accept an optional `projectId` parameter. Every key factory gains an extra segment:

```typescript
export const clientKeys = {
  all: ['client'] as const,
  wallets: (projectId?: string) => [...clientKeys.all, 'wallets', projectId] as const,
  balances: (chainId: number, projectId?: string) => [...clientKeys.all, 'balances', chainId, projectId] as const,
  depositAddresses: (params?: PaginationParams, projectId?: string) => [...clientKeys.all, 'depositAddresses', params, projectId] as const,
  deposits: (params?: DepositsQuery, projectId?: string) => [...clientKeys.all, 'deposits', params, projectId] as const,
  deposit: (id: number) => [...clientKeys.all, 'deposit', id] as const,
  withdrawals: (params?: WithdrawalsQuery, projectId?: string) => [...clientKeys.all, 'withdrawals', params, projectId] as const,
  addresses: (projectId?: string) => [...clientKeys.all, 'addresses', projectId] as const,
  webhooks: (projectId?: string) => [...clientKeys.all, 'webhooks', projectId] as const,
  deliveries: (webhookId: number) => [...clientKeys.all, 'deliveries', webhookId] as const,
  tokens: (chainId?: number) => [...clientKeys.all, 'tokens', chainId] as const,
  health: () => [...clientKeys.all, 'health'] as const,
  projects: () => [...clientKeys.all, 'projects'] as const,
  currentProject: () => [...clientKeys.all, 'currentProject'] as const,
  project: (id: number) => [...clientKeys.all, 'project', id] as const,
};
```

- [ ] **12.2** In each client page component, import `useProject` and use `currentProject?.id` to trigger refetches. Example for the wallets page:

```typescript
import { useProject } from '@/lib/project-context';

export default function WalletsPage() {
  const { currentProject } = useProject();
  // Pass currentProject?.id into hooks that accept projectId
  // The ClientApiClient already sends X-Project-Id via the header
  // React Query keys include projectId so data refetches on project switch
  ...
}
```

- [ ] **12.3** Ensure the `ClientApiClient` singleton is updated whenever the project changes. In the app layout or a dedicated hook, sync the project context to the API client:

Create `apps/client/lib/use-sync-project.ts`:

```typescript
'use client';
import { useEffect } from 'react';
import { useProject } from './project-context';

/**
 * Syncs the current project ID to the ClientApiClient singleton
 * so that all API requests include the X-Project-Id header.
 */
export function useSyncProject(apiClient: { setProjectId: (id: number | null) => void } | null) {
  const { currentProject } = useProject();

  useEffect(() => {
    if (apiClient && currentProject) {
      apiClient.setProjectId(parseInt(currentProject.id, 10));
    } else if (apiClient) {
      apiClient.setProjectId(null);
    }
  }, [apiClient, currentProject]);
}
```

- [ ] **12.4** Commit:

```bash
git add apps/client/ packages/api-client/src/hooks/useClientApi.ts
git commit -m "$(cat <<'EOF'
feat(client-app): integrate project context into all pages and API calls

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Tests — Project CRUD, scope guard, isolation

**Files:**
- **Create:** `services/admin-api/src/project-management/__tests__/project-management.service.spec.ts`
- **Create:** `services/client-api/src/common/guards/__tests__/project-scope.guard.spec.ts`
- **Create:** `services/client-api/src/project/__tests__/project.controller.spec.ts`

**Steps:**

- [ ] **13.1** Create `services/admin-api/src/project-management/__tests__/project-management.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ProjectManagementService } from '../project-management.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit-log.service';

describe('ProjectManagementService', () => {
  let service: ProjectManagementService;
  let prisma: any;
  let auditLog: any;

  beforeEach(async () => {
    prisma = {
      client: {
        findUnique: jest.fn(),
      },
      project: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectManagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<ProjectManagementService>(ProjectManagementService);
  });

  describe('createProject', () => {
    it('should create a project successfully', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: BigInt(1), name: 'Test Client' });
      prisma.project.findUnique.mockResolvedValue(null);
      prisma.project.count.mockResolvedValue(0);
      prisma.project.create.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(1),
        name: 'Production',
        slug: 'production',
        description: null,
        isDefault: true,
        status: 'active',
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createProject(
        1,
        { name: 'Production', slug: 'production' },
        'admin-1',
        '127.0.0.1',
      );

      expect(result.name).toBe('Production');
      expect(result.slug).toBe('production');
      expect(result.isDefault).toBe(true);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'project.create' }),
      );
    });

    it('should throw NotFoundException when client does not exist', async () => {
      prisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.createProject(999, { name: 'Test', slug: 'test' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when slug already exists', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: BigInt(1) });
      prisma.project.findUnique.mockResolvedValue({ id: BigInt(1), slug: 'existing' });

      await expect(
        service.createProject(1, { name: 'Test', slug: 'existing' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should not mark as default when other projects exist', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: BigInt(1) });
      prisma.project.findUnique.mockResolvedValue(null);
      prisma.project.count.mockResolvedValue(2);
      prisma.project.create.mockResolvedValue({
        id: BigInt(3),
        clientId: BigInt(1),
        name: 'Staging',
        slug: 'staging',
        description: null,
        isDefault: false,
        status: 'active',
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createProject(
        1,
        { name: 'Staging', slug: 'staging' },
        'admin-1',
      );

      expect(result.isDefault).toBe(false);
    });
  });

  describe('listProjects', () => {
    it('should return paginated projects', async () => {
      const mockProjects = [
        {
          id: BigInt(1),
          clientId: BigInt(1),
          name: 'Default',
          slug: 'default',
          description: null,
          isDefault: true,
          status: 'active',
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.project.findMany.mockResolvedValue(mockProjects);
      prisma.project.count.mockResolvedValue(1);

      const result = await service.listProjects(1, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].isDefault).toBe(true);
    });

    it('should filter by status', async () => {
      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(0);

      await service.listProjects(1, { page: 1, limit: 20, status: 'archived' });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'archived' }),
        }),
      );
    });
  });

  describe('updateProject', () => {
    it('should prevent archiving the default project', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(1),
        isDefault: true,
        status: 'active',
      });

      await expect(
        service.updateProject(1, 1, { status: 'archived' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteProject', () => {
    it('should prevent deleting the default project', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(1),
        isDefault: true,
      });

      await expect(
        service.deleteProject(1, 1, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should archive a non-default project', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: BigInt(2),
        clientId: BigInt(1),
        isDefault: false,
        slug: 'staging',
      });
      prisma.project.update.mockResolvedValue({
        id: BigInt(2),
        clientId: BigInt(1),
        name: 'Staging',
        slug: 'staging',
        description: null,
        isDefault: false,
        status: 'archived',
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.deleteProject(1, 2, 'admin-1');

      expect(result.status).toBe('archived');
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'project.archive' }),
      );
    });
  });
});
```

- [ ] **13.2** Create `services/client-api/src/common/guards/__tests__/project-scope.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ProjectScopeGuard } from '../project-scope.guard';

function createMockContext(headers: Record<string, string> = {}, request: any = {}): ExecutionContext {
  const req = {
    headers,
    ...request,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as any;
}

describe('ProjectScopeGuard', () => {
  let guard: ProjectScopeGuard;

  beforeEach(() => {
    guard = new ProjectScopeGuard();
  });

  it('should use X-Project-Id header when present', async () => {
    const ctx = createMockContext(
      { 'x-project-id': '42' },
      { clientId: 1 },
    );
    const req = ctx.switchToHttp().getRequest();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.projectId).toBe(42);
  });

  it('should throw ForbiddenException for invalid X-Project-Id', async () => {
    const ctx = createMockContext(
      { 'x-project-id': 'abc' },
      { clientId: 1 },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException for negative X-Project-Id', async () => {
    const ctx = createMockContext(
      { 'x-project-id': '-5' },
      { clientId: 1 },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should keep existing projectId from API key validation', async () => {
    const ctx = createMockContext({}, { clientId: 1, projectId: 10 });
    const req = ctx.switchToHttp().getRequest();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.projectId).toBe(10);
  });

  it('should set projectId to null when no context is available', async () => {
    const ctx = createMockContext({}, { clientId: 1 });
    const req = ctx.switchToHttp().getRequest();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.projectId).toBeNull();
  });
});
```

- [ ] **13.3** Create `services/client-api/src/project/__tests__/project.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectController } from '../project.controller';
import { ProjectService } from '../project.service';
import { ConfigService } from '@nestjs/config';

describe('ProjectController', () => {
  let controller: ProjectController;
  let service: any;

  beforeEach(async () => {
    service = {
      listProjects: jest.fn(),
      getProject: jest.fn(),
      getDefaultProject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        { provide: ProjectService, useValue: service },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();

    controller = module.get<ProjectController>(ProjectController);
  });

  describe('listProjects', () => {
    it('should return projects for the authenticated client', async () => {
      const mockProjects = [
        { id: '1', name: 'Production', slug: 'production', isDefault: true },
      ];
      service.listProjects.mockResolvedValue(mockProjects);

      const req = { clientId: 1, projectId: 1 } as any;
      const result = await controller.listProjects(req);

      expect(result.success).toBe(true);
      expect(result.projects).toEqual(mockProjects);
      expect(service.listProjects).toHaveBeenCalledWith(1);
    });
  });

  describe('getCurrentProject', () => {
    it('should return project from projectId when set', async () => {
      const mockProject = { id: '5', name: 'Staging' };
      service.getProject.mockResolvedValue(mockProject);

      const req = { clientId: 1, projectId: 5 } as any;
      const result = await controller.getCurrentProject(req);

      expect(result.success).toBe(true);
      expect(result.project).toEqual(mockProject);
      expect(service.getProject).toHaveBeenCalledWith(1, 5);
    });

    it('should return default project when no projectId', async () => {
      const mockProject = { id: '1', name: 'Default', isDefault: true };
      service.getDefaultProject.mockResolvedValue(mockProject);

      const req = { clientId: 1, projectId: null } as any;
      const result = await controller.getCurrentProject(req);

      expect(result.success).toBe(true);
      expect(result.project).toEqual(mockProject);
      expect(service.getDefaultProject).toHaveBeenCalledWith(1);
    });
  });
});
```

- [ ] **13.4** Run all tests:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
npx jest services/admin-api/src/project-management/__tests__/ --passWithNoTests
npx jest services/client-api/src/common/guards/__tests__/ --passWithNoTests
npx jest services/client-api/src/project/__tests__/ --passWithNoTests
```

Expected output: all tests pass.

- [ ] **13.5** Commit:

```bash
git add services/admin-api/src/project-management/__tests__/ \
        services/client-api/src/common/guards/__tests__/ \
        services/client-api/src/project/__tests__/
git commit -m "$(cat <<'EOF'
test: add unit tests for project CRUD, scope guard, and controller

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Migration — Impersonation tables

**Files:**
- **Create:** `database/022-impersonation.sql`

**Steps:**

- [ ] **14.1** Create `database/022-impersonation.sql`:

```sql
-- =============================================================================
-- CryptoVaultHub — Migration 022: Impersonation tables
-- Adds admin impersonation session management and rich audit trail for
-- support operations. Three-tier modes: read_only, support, full_operational.
-- =============================================================================

USE `cvh_auth`;

-- =============================================================================
-- 1. Impersonation Sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS `impersonation_sessions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_user_id` BIGINT NOT NULL,
  `target_client_id` BIGINT NOT NULL,
  `target_project_id` BIGINT NULL,
  `mode` ENUM('read_only','support','full_operational') NOT NULL DEFAULT 'read_only',
  `reason` VARCHAR(500) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` DATETIME(3) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_admin` (`admin_user_id`, `started_at` DESC),
  INDEX `idx_target` (`target_client_id`, `target_project_id`),
  INDEX `idx_active` (`admin_user_id`, `ended_at`),
  CONSTRAINT `fk_impersonation_admin` FOREIGN KEY (`admin_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2. Impersonation Audit Log
-- Rich traceability for every action taken during impersonation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `impersonation_audit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT NOT NULL,
  `admin_user_id` BIGINT NOT NULL,
  `target_client_id` BIGINT NOT NULL,
  `target_project_id` BIGINT NULL,
  `action` VARCHAR(200) NOT NULL,
  `resource_type` VARCHAR(100) NULL,
  `resource_id` VARCHAR(100) NULL,
  `request_method` VARCHAR(10) NOT NULL,
  `request_path` VARCHAR(500) NOT NULL,
  `request_body_hash` VARCHAR(64) NULL,
  `response_status` INT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(500) NULL,
  `metadata` JSON NULL,
  `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_session` (`session_id`),
  INDEX `idx_admin_time` (`admin_user_id`, `timestamp` DESC),
  INDEX `idx_target_time` (`target_client_id`, `timestamp` DESC),
  CONSTRAINT `fk_audit_session` FOREIGN KEY (`session_id`)
    REFERENCES `impersonation_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **14.2** Run migration:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
mysql -u root -p < database/022-impersonation.sql
```

Expected output: no errors.

- [ ] **14.3** Verify tables created:

```bash
mysql -u root -p -e "SHOW TABLES FROM cvh_auth LIKE 'impersonation%';"
```

Expected output:
```
+-------------------------------------------+
| Tables_in_cvh_auth (impersonation%)       |
+-------------------------------------------+
| impersonation_audit                       |
| impersonation_sessions                    |
+-------------------------------------------+
```

- [ ] **14.4** Commit:

```bash
git add database/022-impersonation.sql
git commit -m "$(cat <<'EOF'
feat(db): add impersonation_sessions and impersonation_audit tables (migration 022)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Prisma schema — Add impersonation models to auth-service

**Files:**
- **Modify:** `services/auth-service/prisma/schema.prisma`

**Steps:**

- [ ] **15.1** Add the `ImpersonationMode` enum and two models to `services/auth-service/prisma/schema.prisma`:

```prisma
enum ImpersonationMode {
  read_only
  support
  full_operational
}

model ImpersonationSession {
  id              BigInt             @id @default(autoincrement())
  adminUserId     BigInt             @map("admin_user_id")
  targetClientId  BigInt             @map("target_client_id")
  targetProjectId BigInt?            @map("target_project_id")
  mode            ImpersonationMode  @default(read_only)
  reason          String?            @db.VarChar(500)
  startedAt       DateTime           @default(now()) @map("started_at")
  endedAt         DateTime?          @map("ended_at")
  ipAddress       String?            @map("ip_address") @db.VarChar(45)
  userAgent       String?            @map("user_agent") @db.VarChar(500)

  admin  User                  @relation(fields: [adminUserId], references: [id])
  audits ImpersonationAudit[]

  @@index([adminUserId, startedAt(sort: Desc)], name: "idx_admin")
  @@index([targetClientId, targetProjectId], name: "idx_target")
  @@index([adminUserId, endedAt], name: "idx_active")
  @@map("impersonation_sessions")
}

model ImpersonationAudit {
  id              BigInt   @id @default(autoincrement())
  sessionId       BigInt   @map("session_id")
  adminUserId     BigInt   @map("admin_user_id")
  targetClientId  BigInt   @map("target_client_id")
  targetProjectId BigInt?  @map("target_project_id")
  action          String   @db.VarChar(200)
  resourceType    String?  @map("resource_type") @db.VarChar(100)
  resourceId      String?  @map("resource_id") @db.VarChar(100)
  requestMethod   String   @map("request_method") @db.VarChar(10)
  requestPath     String   @map("request_path") @db.VarChar(500)
  requestBodyHash String?  @map("request_body_hash") @db.VarChar(64)
  responseStatus  Int?     @map("response_status")
  ipAddress       String?  @map("ip_address") @db.VarChar(45)
  userAgent       String?  @map("user_agent") @db.VarChar(500)
  metadata        Json?
  timestamp       DateTime @default(now())

  session ImpersonationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId], name: "idx_session")
  @@index([adminUserId, timestamp(sort: Desc)], name: "idx_admin_time")
  @@index([targetClientId, timestamp(sort: Desc)], name: "idx_target_time")
  @@map("impersonation_audit")
}
```

- [ ] **15.2** Add the `impersonationSessions` relation to the `User` model:

```prisma
  impersonationSessions ImpersonationSession[]
```

- [ ] **15.3** Regenerate Prisma client:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/auth-service
npx prisma generate
```

Expected output: `Generated Prisma Client`.

- [ ] **15.4** Commit:

```bash
git add services/auth-service/prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(auth-service): add ImpersonationSession and ImpersonationAudit Prisma models

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Backend — ImpersonationService in auth-service

**Files:**
- **Create:** `services/auth-service/src/impersonation/impersonation.module.ts`
- **Create:** `services/auth-service/src/impersonation/impersonation.service.ts`
- **Create:** `services/auth-service/src/impersonation/impersonation.controller.ts`
- **Create:** `services/auth-service/src/impersonation/dto/impersonation.dto.ts`
- **Modify:** `services/auth-service/src/app.module.ts`

**Steps:**

- [ ] **16.1** Create `services/auth-service/src/impersonation/dto/impersonation.dto.ts`:

```typescript
import { IsNumber, IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartImpersonationDto {
  @ApiProperty({ description: 'Target client ID to impersonate', example: 1 })
  @IsNumber()
  targetClientId: number;

  @ApiPropertyOptional({ description: 'Target project ID (optional)', example: 1 })
  @IsOptional()
  @IsNumber()
  targetProjectId?: number;

  @ApiProperty({
    description: 'Impersonation mode',
    enum: ['read_only', 'support', 'full_operational'],
    example: 'read_only',
  })
  @IsEnum(['read_only', 'support', 'full_operational'] as const)
  mode: 'read_only' | 'support' | 'full_operational';

  @ApiProperty({
    description: 'Reason for impersonation (required for audit)',
    example: 'Investigating deposit issue reported in ticket #1234',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class EndImpersonationDto {
  @ApiProperty({ description: 'Session ID to end', example: 1 })
  @IsNumber()
  sessionId: number;
}
```

- [ ] **16.2** Create `services/auth-service/src/impersonation/impersonation.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

/**
 * Permission matrix for impersonation modes:
 *
 * | Mode              | GET | POST (read) | POST (write) | PUT/PATCH | DELETE |
 * |-------------------|-----|-------------|--------------|-----------|--------|
 * | read_only         | Yes | No          | No           | No        | No     |
 * | support           | Yes | Yes (notes) | No           | Yes (*)   | No     |
 * | full_operational  | Yes | Yes         | Yes          | Yes       | Yes    |
 *
 * (*) support mode can only update specific fields: labels, notes, status flags
 */

const MODE_PERMISSIONS: Record<string, Set<string>> = {
  read_only: new Set(['GET', 'HEAD', 'OPTIONS']),
  support: new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH']),
  full_operational: new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'PUT', 'DELETE']),
};

const MODE_ROLE_REQUIREMENTS: Record<string, string[]> = {
  read_only: ['super_admin', 'admin', 'viewer'],
  support: ['super_admin', 'admin'],
  full_operational: ['super_admin'],
};

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start an impersonation session.
   * Returns a session token that must be included in subsequent requests.
   */
  async startSession(
    adminUserId: number,
    adminRole: string,
    data: {
      targetClientId: number;
      targetProjectId?: number;
      mode: string;
      reason: string;
    },
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Validate role has permission for the requested mode
    const allowedRoles = MODE_ROLE_REQUIREMENTS[data.mode];
    if (!allowedRoles || !allowedRoles.includes(adminRole)) {
      throw new ForbiddenException(
        `Role "${adminRole}" cannot use impersonation mode "${data.mode}". ` +
        `Required: ${allowedRoles?.join(' | ')}`,
      );
    }

    // Check for existing active session for this admin
    const existingActive = await this.prisma.impersonationSession.findFirst({
      where: {
        adminUserId: BigInt(adminUserId),
        endedAt: null,
      },
    });
    if (existingActive) {
      throw new ConflictException(
        `Admin ${adminUserId} already has an active impersonation session (ID: ${existingActive.id}). ` +
        'End the current session before starting a new one.',
      );
    }

    const session = await this.prisma.impersonationSession.create({
      data: {
        adminUserId: BigInt(adminUserId),
        targetClientId: BigInt(data.targetClientId),
        targetProjectId: data.targetProjectId ? BigInt(data.targetProjectId) : null,
        mode: data.mode as any,
        reason: data.reason,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    this.logger.warn(
      `IMPERSONATION STARTED: admin=${adminUserId} target_client=${data.targetClientId} ` +
      `project=${data.targetProjectId ?? 'all'} mode=${data.mode} reason="${data.reason}"`,
    );

    return this.serializeSession(session);
  }

  /**
   * End an active impersonation session.
   */
  async endSession(sessionId: number, adminUserId: number) {
    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        id: BigInt(sessionId),
        adminUserId: BigInt(adminUserId),
        endedAt: null,
      },
    });
    if (!session) {
      throw new NotFoundException(
        `No active session ${sessionId} found for admin ${adminUserId}`,
      );
    }

    const updated = await this.prisma.impersonationSession.update({
      where: { id: BigInt(sessionId) },
      data: { endedAt: new Date() },
    });

    this.logger.warn(
      `IMPERSONATION ENDED: session=${sessionId} admin=${adminUserId} ` +
      `duration=${Date.now() - session.startedAt.getTime()}ms`,
    );

    return this.serializeSession(updated);
  }

  /**
   * Get the active impersonation session for an admin user.
   */
  async getActiveSession(adminUserId: number) {
    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        adminUserId: BigInt(adminUserId),
        endedAt: null,
      },
    });
    return session ? this.serializeSession(session) : null;
  }

  /**
   * Validate that a request method is allowed under the current session's mode.
   */
  isMethodAllowed(mode: string, method: string): boolean {
    const allowed = MODE_PERMISSIONS[mode];
    return allowed ? allowed.has(method.toUpperCase()) : false;
  }

  /**
   * Record an audit entry for an action performed during impersonation.
   */
  async auditAction(data: {
    sessionId: number;
    adminUserId: number;
    targetClientId: number;
    targetProjectId?: number;
    action: string;
    resourceType?: string;
    resourceId?: string;
    requestMethod: string;
    requestPath: string;
    requestBody?: unknown;
    responseStatus?: number;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }) {
    const bodyHash = data.requestBody
      ? createHash('sha256')
          .update(JSON.stringify(data.requestBody))
          .digest('hex')
      : null;

    await this.prisma.impersonationAudit.create({
      data: {
        sessionId: BigInt(data.sessionId),
        adminUserId: BigInt(data.adminUserId),
        targetClientId: BigInt(data.targetClientId),
        targetProjectId: data.targetProjectId ? BigInt(data.targetProjectId) : null,
        action: data.action,
        resourceType: data.resourceType ?? null,
        resourceId: data.resourceId ?? null,
        requestMethod: data.requestMethod,
        requestPath: data.requestPath,
        requestBodyHash: bodyHash,
        responseStatus: data.responseStatus ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  /**
   * List impersonation sessions with pagination and filters.
   */
  async listSessions(params: {
    page: number;
    limit: number;
    adminUserId?: number;
    targetClientId?: number;
    activeOnly?: boolean;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.adminUserId) where.adminUserId = BigInt(params.adminUserId);
    if (params.targetClientId) where.targetClientId = BigInt(params.targetClientId);
    if (params.activeOnly) where.endedAt = null;

    const [items, total] = await Promise.all([
      this.prisma.impersonationSession.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.impersonationSession.count({ where }),
    ]);

    return {
      items: items.map((s) => this.serializeSession(s)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * Get audit trail for a specific session.
   */
  async getSessionAudit(sessionId: number, params: { page: number; limit: number }) {
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.prisma.impersonationAudit.findMany({
        where: { sessionId: BigInt(sessionId) },
        skip,
        take: params.limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.impersonationAudit.count({
        where: { sessionId: BigInt(sessionId) },
      }),
    ]);

    return {
      items: items.map((a) => this.serializeAudit(a)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  private serializeSession(session: any) {
    return {
      id: session.id.toString(),
      adminUserId: session.adminUserId.toString(),
      targetClientId: session.targetClientId.toString(),
      targetProjectId: session.targetProjectId?.toString() ?? null,
      mode: session.mode,
      reason: session.reason,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    };
  }

  private serializeAudit(audit: any) {
    return {
      id: audit.id.toString(),
      sessionId: audit.sessionId.toString(),
      adminUserId: audit.adminUserId.toString(),
      targetClientId: audit.targetClientId.toString(),
      targetProjectId: audit.targetProjectId?.toString() ?? null,
      action: audit.action,
      resourceType: audit.resourceType,
      resourceId: audit.resourceId,
      requestMethod: audit.requestMethod,
      requestPath: audit.requestPath,
      requestBodyHash: audit.requestBodyHash,
      responseStatus: audit.responseStatus,
      ipAddress: audit.ipAddress,
      metadata: audit.metadata,
      timestamp: audit.timestamp,
    };
  }
}
```

- [ ] **16.3** Create `services/auth-service/src/impersonation/impersonation.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ImpersonationService } from './impersonation.service';
import { StartImpersonationDto, EndImpersonationDto } from './dto/impersonation.dto';

@ApiTags('Impersonation')
@ApiBearerAuth('JWT')
@Controller('auth/impersonation')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start an impersonation session',
    description: `Starts an admin impersonation session for a target client.

**Mode permissions:**
- \`read_only\` — Any admin role. Can only perform GET requests.
- \`support\` — admin or super_admin. Can GET, POST (notes), PATCH (labels/status).
- \`full_operational\` — super_admin only. Full access to all client operations.

Only one active session per admin user. Must end current session before starting a new one.`,
  })
  @ApiResponse({ status: 201, description: 'Impersonation session started' })
  @ApiResponse({ status: 403, description: 'Insufficient role for requested mode' })
  @ApiResponse({ status: 409, description: 'Active session already exists' })
  async startSession(@Body() dto: StartImpersonationDto, @Req() req: Request) {
    const user = (req as any).user;
    const session = await this.impersonationService.startSession(
      parseInt(user.userId, 10),
      user.role,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    return { success: true, session };
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End an impersonation session',
    description: 'Ends the specified active impersonation session.',
  })
  @ApiResponse({ status: 200, description: 'Session ended' })
  @ApiResponse({ status: 404, description: 'No active session found' })
  async endSession(@Body() dto: EndImpersonationDto, @Req() req: Request) {
    const user = (req as any).user;
    const session = await this.impersonationService.endSession(
      dto.sessionId,
      parseInt(user.userId, 10),
    );
    return { success: true, session };
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get active impersonation session',
    description: 'Returns the current active impersonation session for the authenticated admin, or null.',
  })
  @ApiResponse({ status: 200, description: 'Active session or null' })
  async getActiveSession(@Req() req: Request) {
    const user = (req as any).user;
    const session = await this.impersonationService.getActiveSession(
      parseInt(user.userId, 10),
    );
    return { success: true, session };
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'List impersonation sessions',
    description: 'Returns a paginated list of impersonation sessions. Supports filtering by admin, target client, and active status.',
  })
  @ApiResponse({ status: 200, description: 'Paginated session list' })
  async listSessions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('adminUserId') adminUserId?: number,
    @Query('targetClientId') targetClientId?: number,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const result = await this.impersonationService.listSessions({
      page: page ?? 1,
      limit: limit ?? 20,
      adminUserId: adminUserId ? Number(adminUserId) : undefined,
      targetClientId: targetClientId ? Number(targetClientId) : undefined,
      activeOnly: activeOnly === 'true',
    });
    return { success: true, ...result };
  }

  @Get('sessions/:sessionId/audit')
  @ApiOperation({
    summary: 'Get audit trail for a session',
    description: 'Returns the full audit trail for a specific impersonation session, with rich traceability details.',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit trail' })
  async getSessionAudit(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.impersonationService.getSessionAudit(sessionId, {
      page: page ?? 1,
      limit: limit ?? 50,
    });
    return { success: true, ...result };
  }
}
```

- [ ] **16.4** Create `services/auth-service/src/impersonation/impersonation.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';

@Module({
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
  exports: [ImpersonationService],
})
export class ImpersonationModule {}
```

- [ ] **16.5** Register `ImpersonationModule` in `services/auth-service/src/app.module.ts`:

Add import:
```typescript
import { ImpersonationModule } from './impersonation/impersonation.module';
```

Add `ImpersonationModule` to the `imports` array.

- [ ] **16.6** Verify auth-service compiles:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/auth-service
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **16.7** Commit:

```bash
git add services/auth-service/src/impersonation/ \
        services/auth-service/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(auth-service): add ImpersonationService with session management and audit trail

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Backend — ImpersonationGuard for admin-api

**Files:**
- **Create:** `services/admin-api/src/common/guards/impersonation.guard.ts`
- **Modify:** `services/admin-api/src/common/decorators.ts`

**Steps:**

- [ ] **17.1** Create `services/admin-api/src/common/guards/impersonation.guard.ts`:

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * ImpersonationGuard checks if the admin user has an active impersonation
 * session. If so, it:
 *
 * 1. Validates the HTTP method is allowed for the session's mode
 * 2. Injects `req.impersonation` context for downstream use
 * 3. Triggers async audit logging via auth-service
 *
 * This guard must run AFTER JwtAuthGuard and AdminRoleGuard.
 */
@Injectable()
export class ImpersonationGuard implements CanActivate {
  private readonly logger = new Logger(ImpersonationGuard.name);
  private readonly authServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const impersonationSessionId = request.headers['x-impersonation-session'];

    // No impersonation header — pass through normally
    if (!impersonationSessionId) {
      request.impersonation = null;
      return true;
    }

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required for impersonation');
    }

    try {
      // Fetch active session from auth-service
      const { data: sessionData } = await axios.get(
        `${this.authServiceUrl}/auth/impersonation/active`,
        {
          headers: {
            Authorization: request.headers['authorization'],
          },
          timeout: 5000,
        },
      );

      const session = sessionData?.session;
      if (!session) {
        throw new ForbiddenException(
          'No active impersonation session found. Start a session first.',
        );
      }

      if (session.id !== impersonationSessionId) {
        throw new ForbiddenException(
          'X-Impersonation-Session header does not match active session',
        );
      }

      // Validate HTTP method is allowed for this mode
      const method = request.method.toUpperCase();
      const modePermissions: Record<string, Set<string>> = {
        read_only: new Set(['GET', 'HEAD', 'OPTIONS']),
        support: new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH']),
        full_operational: new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'PUT', 'DELETE']),
      };

      const allowed = modePermissions[session.mode];
      if (!allowed || !allowed.has(method)) {
        throw new ForbiddenException(
          `Impersonation mode "${session.mode}" does not allow ${method} requests`,
        );
      }

      // Inject impersonation context
      request.impersonation = {
        sessionId: session.id,
        adminUserId: session.adminUserId,
        targetClientId: session.targetClientId,
        targetProjectId: session.targetProjectId,
        mode: session.mode,
      };

      this.logger.debug(
        `Impersonation active: admin=${session.adminUserId} client=${session.targetClientId} mode=${session.mode} path=${request.path}`,
      );

      return true;
    } catch (error: any) {
      if (error instanceof ForbiddenException) throw error;

      this.logger.error(
        `Impersonation validation failed: ${error.message}`,
      );
      throw new ForbiddenException('Failed to validate impersonation session');
    }
  }
}
```

- [ ] **17.2** Update `services/admin-api/src/common/decorators.ts` to support impersonation-aware endpoints. Add a new decorator:

```typescript
import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ADMIN_ROLES_KEY } from './guards/admin-role.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';
import { ImpersonationGuard } from './guards/impersonation.guard';

export const AdminRoles = (...roles: string[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

export const AdminAuth = (...roles: string[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, AdminRoleGuard),
    ...(roles.length > 0 ? [SetMetadata(ADMIN_ROLES_KEY, roles)] : []),
  );

/**
 * Like @AdminAuth but also checks impersonation session validity.
 * Use on endpoints that admins can access while impersonating a client.
 */
export const AdminAuthWithImpersonation = (...roles: string[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, AdminRoleGuard, ImpersonationGuard),
    ...(roles.length > 0 ? [SetMetadata(ADMIN_ROLES_KEY, roles)] : []),
  );
```

- [ ] **17.3** Verify admin-api compiles:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **17.4** Commit:

```bash
git add services/admin-api/src/common/guards/impersonation.guard.ts \
        services/admin-api/src/common/decorators.ts
git commit -m "$(cat <<'EOF'
feat(admin-api): add ImpersonationGuard with mode-based permission enforcement

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Backend — Impersonation audit middleware

**Files:**
- **Create:** `services/admin-api/src/common/interceptors/impersonation-audit.interceptor.ts`
- **Modify:** `services/admin-api/src/app.module.ts`

**Steps:**

- [ ] **18.1** Create `services/admin-api/src/common/interceptors/impersonation-audit.interceptor.ts`:

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import axios from 'axios';
import { createHash } from 'crypto';

/**
 * Interceptor that records every admin action taken during an impersonation
 * session into the impersonation_audit table via auth-service.
 *
 * Runs AFTER the request completes (in the tap() operator) so that
 * the response status is available. Audit logging is fire-and-forget
 * to avoid impacting response latency.
 */
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ImpersonationAuditInterceptor.name);
  private readonly authServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const impersonation = request.impersonation;

    // Not an impersonation request — pass through
    if (!impersonation) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          this.recordAudit(request, response.statusCode, impersonation);
        },
        error: (err) => {
          const status = err?.status || err?.getStatus?.() || 500;
          this.recordAudit(request, status, impersonation);
        },
      }),
    );
  }

  private recordAudit(
    request: any,
    responseStatus: number,
    impersonation: {
      sessionId: string;
      adminUserId: string;
      targetClientId: string;
      targetProjectId: string | null;
      mode: string;
    },
  ) {
    // Derive action from the route handler name or path
    const handler = request.route?.path || request.path;
    const action = `${request.method} ${handler}`;

    // Extract resource info from path segments
    const pathParts = request.path.split('/').filter(Boolean);
    let resourceType: string | undefined;
    let resourceId: string | undefined;
    if (pathParts.length >= 3) {
      resourceType = pathParts[pathParts.length - 2];
      resourceId = pathParts[pathParts.length - 1];
      // Only treat as resourceId if it looks like a number or UUID
      if (!/^[0-9a-f-]+$/i.test(resourceId)) {
        resourceType = pathParts[pathParts.length - 1];
        resourceId = undefined;
      }
    }

    const payload = {
      sessionId: parseInt(impersonation.sessionId, 10),
      adminUserId: parseInt(impersonation.adminUserId, 10),
      targetClientId: parseInt(impersonation.targetClientId, 10),
      targetProjectId: impersonation.targetProjectId
        ? parseInt(impersonation.targetProjectId, 10)
        : undefined,
      action,
      resourceType,
      resourceId,
      requestMethod: request.method,
      requestPath: request.path,
      requestBody: request.body && Object.keys(request.body).length > 0
        ? request.body
        : undefined,
      responseStatus,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      metadata: {
        queryParams: request.query,
        impersonationMode: impersonation.mode,
      },
    };

    // Fire-and-forget audit log via auth-service internal endpoint
    axios
      .post(
        `${this.authServiceUrl}/auth/impersonation/audit`,
        payload,
        {
          headers: {
            'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
          },
          timeout: 5000,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to record impersonation audit: ${err.message}`,
          {
            sessionId: impersonation.sessionId,
            action,
            path: request.path,
          },
        );
      });
  }
}
```

- [ ] **18.2** Register the interceptor globally in `services/admin-api/src/app.module.ts`:

Add import:
```typescript
import { ImpersonationAuditInterceptor } from './common/interceptors/impersonation-audit.interceptor';
```

Add to the `providers` array:
```typescript
    {
      provide: APP_INTERCEPTOR,
      useClass: ImpersonationAuditInterceptor,
    },
```

- [ ] **18.3** Add the internal audit endpoint to `services/auth-service/src/impersonation/impersonation.controller.ts`. Add this method:

```typescript
  @Post('audit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record impersonation audit entry (internal)',
    description: 'Internal endpoint used by admin-api to record audit entries during impersonation.',
  })
  async recordAudit(@Body() data: any) {
    await this.impersonationService.auditAction(data);
    return { success: true };
  }
```

- [ ] **18.4** Verify both services compile:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/admin-api && npx tsc --noEmit
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/services/auth-service && npx tsc --noEmit
```

Expected output: no compilation errors for either service.

- [ ] **18.5** Commit:

```bash
git add services/admin-api/src/common/interceptors/impersonation-audit.interceptor.ts \
        services/admin-api/src/app.module.ts \
        services/auth-service/src/impersonation/impersonation.controller.ts
git commit -m "$(cat <<'EOF'
feat(admin-api): add ImpersonationAuditInterceptor for rich action traceability

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: API Client — Add impersonation methods

**Files:**
- **Modify:** `packages/api-client/src/admin-api.ts`
- **Modify:** `packages/api-client/src/types.ts`
- **Modify:** `packages/api-client/src/hooks/useAdminApi.ts`

**Steps:**

- [ ] **19.1** Add impersonation types to `packages/api-client/src/types.ts`:

```typescript
// ── Admin: Impersonation ────────────────────────────────
export type ImpersonationMode = 'read_only' | 'support' | 'full_operational';

export interface ImpersonationSession {
  id: string;
  adminUserId: string;
  targetClientId: string;
  targetProjectId: string | null;
  mode: ImpersonationMode;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  ipAddress: string | null;
}

export interface StartImpersonationDto {
  targetClientId: number;
  targetProjectId?: number;
  mode: ImpersonationMode;
  reason: string;
}

export interface ImpersonationAuditEntry {
  id: string;
  sessionId: string;
  adminUserId: string;
  targetClientId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  requestMethod: string;
  requestPath: string;
  requestBodyHash: string | null;
  responseStatus: number | null;
  ipAddress: string | null;
  metadata: Record<string, any> | null;
  timestamp: string;
}

export interface ImpersonationSessionsQuery extends PaginationParams {
  adminUserId?: number;
  targetClientId?: number;
  activeOnly?: boolean;
}
```

- [ ] **19.2** Add impersonation methods to `packages/api-client/src/admin-api.ts`:

First, add `_impersonationSessionId` field and setter at the class level:

```typescript
  private _impersonationSessionId: string | null = null;

  /** Set the active impersonation session ID for all subsequent requests */
  setImpersonationSession(sessionId: string | null) {
    this._impersonationSessionId = sessionId;
  }
```

Update the `request` method to include the impersonation header:

```typescript
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
    if (this._impersonationSessionId) {
      headers['X-Impersonation-Session'] = this._impersonationSessionId;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Admin API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }
```

Add impersonation endpoint methods (these call auth-service through admin-api proxy or directly):

```typescript
  // ── Impersonation ───────────────────────────────────────

  async startImpersonation(data: StartImpersonationDto): Promise<ImpersonationSession> {
    const result = await this.request<{ session: ImpersonationSession }>(
      'POST',
      '/admin/impersonation/start',
      data,
    );
    // Auto-set the session header for subsequent requests
    this.setImpersonationSession(result.session.id);
    return result.session;
  }

  async endImpersonation(sessionId: number): Promise<ImpersonationSession> {
    const result = await this.request<{ session: ImpersonationSession }>(
      'POST',
      '/admin/impersonation/end',
      { sessionId },
    );
    this.setImpersonationSession(null);
    return result.session;
  }

  async getActiveImpersonation(): Promise<ImpersonationSession | null> {
    const result = await this.request<{ session: ImpersonationSession | null }>(
      'GET',
      '/admin/impersonation/active',
    );
    return result.session;
  }

  async getImpersonationSessions(
    params?: ImpersonationSessionsQuery,
  ): Promise<PaginatedResponse<ImpersonationSession>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.adminUserId) qs.set('adminUserId', String(params.adminUserId));
    if (params?.targetClientId) qs.set('targetClientId', String(params.targetClientId));
    if (params?.activeOnly) qs.set('activeOnly', 'true');
    const query = qs.toString();
    return this.request('GET', `/admin/impersonation/sessions${query ? `?${query}` : ''}`);
  }

  async getImpersonationAudit(
    sessionId: number,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<ImpersonationAuditEntry>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request(
      'GET',
      `/admin/impersonation/sessions/${sessionId}/audit${query ? `?${query}` : ''}`,
    );
  }
```

Add the necessary type imports at the top.

- [ ] **19.3** Add impersonation hooks to `packages/api-client/src/hooks/useAdminApi.ts`:

Add to `adminKeys`:
```typescript
  impersonationActive: () => [...adminKeys.all, 'impersonation', 'active'] as const,
  impersonationSessions: (params?: ImpersonationSessionsQuery) =>
    [...adminKeys.all, 'impersonation', 'sessions', params] as const,
  impersonationAudit: (sessionId: number, params?: PaginationParams) =>
    [...adminKeys.all, 'impersonation', 'audit', sessionId, params] as const,
```

Add hooks:
```typescript
// ── Impersonation ───────────────────────────────────────

export function useActiveImpersonation() {
  return useQuery({
    queryKey: adminKeys.impersonationActive(),
    queryFn: () => api().getActiveImpersonation(),
    enabled: !!_adminApi,
    refetchInterval: 30_000, // poll to detect if session was ended elsewhere
  });
}

export function useStartImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StartImpersonationDto) => api().startImpersonation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.impersonationActive() });
    },
  });
}

export function useEndImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api().endImpersonation(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.impersonationActive() });
    },
  });
}

export function useImpersonationSessions(params?: ImpersonationSessionsQuery) {
  return useQuery({
    queryKey: adminKeys.impersonationSessions(params),
    queryFn: () => api().getImpersonationSessions(params),
    enabled: !!_adminApi,
  });
}

export function useImpersonationAudit(sessionId: number, params?: PaginationParams) {
  return useQuery({
    queryKey: adminKeys.impersonationAudit(sessionId, params),
    queryFn: () => api().getImpersonationAudit(sessionId, params),
    enabled: !!_adminApi && sessionId > 0,
  });
}
```

Import `StartImpersonationDto`, `ImpersonationSessionsQuery` from `../types`.

- [ ] **19.4** Verify packages compile:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/packages/api-client
npx tsc --noEmit
```

Expected output: no compilation errors.

- [ ] **19.5** Commit:

```bash
git add packages/api-client/src/
git commit -m "$(cat <<'EOF'
feat(api-client): add impersonation methods, types, and React Query hooks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Frontend — ImpersonationDropdown for admin header

**Files:**
- **Create:** `apps/admin/components/impersonation-dropdown.tsx`
- **Create:** `apps/admin/lib/impersonation-context.tsx`
- **Modify:** `apps/admin/components/header.tsx`

**Steps:**

- [ ] **20.1** Create `apps/admin/lib/impersonation-context.tsx`:

```typescript
'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

interface ImpersonationSession {
  id: string;
  adminUserId: string;
  targetClientId: string;
  targetProjectId: string | null;
  mode: 'read_only' | 'support' | 'full_operational';
  reason: string;
  startedAt: string;
}

interface ImpersonationContextType {
  /** Current active impersonation session, or null */
  session: ImpersonationSession | null;
  /** Whether impersonation is active */
  isImpersonating: boolean;
  /** Start impersonation */
  startImpersonation: (data: {
    targetClientId: number;
    targetProjectId?: number;
    mode: 'read_only' | 'support' | 'full_operational';
    reason: string;
  }) => Promise<void>;
  /** End current impersonation */
  endImpersonation: () => Promise<void>;
  /** Refresh session state from server */
  refreshSession: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | null>(null);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ImpersonationSession | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001';

  const getToken = () => localStorage.getItem('cvh_admin_token') || '';

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/impersonation/active`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session ?? null);
      }
    } catch (err) {
      console.error('Failed to refresh impersonation session:', err);
    }
  }, [apiUrl]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const startImpersonation = useCallback(
    async (data: {
      targetClientId: number;
      targetProjectId?: number;
      mode: 'read_only' | 'support' | 'full_operational';
      reason: string;
    }) => {
      const res = await fetch(`${apiUrl}/admin/impersonation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to start impersonation');
      }
      const result = await res.json();
      setSession(result.session);
    },
    [apiUrl],
  );

  const endImpersonation = useCallback(async () => {
    if (!session) return;
    const res = await fetch(`${apiUrl}/admin/impersonation/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ sessionId: parseInt(session.id, 10) }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to end impersonation');
    }
    setSession(null);
  }, [apiUrl, session]);

  return (
    <ImpersonationContext.Provider
      value={{
        session,
        isImpersonating: session !== null,
        startImpersonation,
        endImpersonation,
        refreshSession,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export const useImpersonation = () => {
  const ctx = useContext(ImpersonationContext);
  if (!ctx)
    throw new Error('useImpersonation must be used within ImpersonationProvider');
  return ctx;
};
```

- [ ] **20.2** Create `apps/admin/components/impersonation-dropdown.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { Eye, ChevronDown, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImpersonation } from '@/lib/impersonation-context';

const MODE_CONFIG = {
  read_only: {
    label: 'Read Only',
    icon: Eye,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950',
    description: 'View client data without making changes',
  },
  support: {
    label: 'Support',
    icon: ShieldCheck,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950',
    description: 'View + update labels, notes, status flags',
  },
  full_operational: {
    label: 'Full Operational',
    icon: ShieldAlert,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-950',
    description: 'Full access to all client operations',
  },
} as const;

interface Props {
  clients: Array<{ id: number; name: string }>;
}

export function ImpersonationDropdown({ clients }: Props) {
  const { isImpersonating, startImpersonation } = useImpersonation();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'client' | 'mode' | 'reason'>('client');
  const [selectedClient, setSelectedClient] = useState<{ id: number; name: string } | null>(null);
  const [selectedMode, setSelectedMode] = useState<'read_only' | 'support' | 'full_operational'>('read_only');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        resetForm();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function resetForm() {
    setStep('client');
    setSelectedClient(null);
    setSelectedMode('read_only');
    setReason('');
    setError(null);
  }

  async function handleSubmit() {
    if (!selectedClient || !reason.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await startImpersonation({
        targetClientId: selectedClient.id,
        mode: selectedMode,
        reason: reason.trim(),
      });
      setIsOpen(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to start impersonation');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isImpersonating) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) resetForm();
        }}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-button text-caption font-display',
          'border border-border-subtle',
          'hover:bg-surface-hover hover:border-border-default',
          'transition-all duration-fast',
          isOpen && 'border-accent-primary',
        )}
        title="Impersonate client"
      >
        <Eye className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-text-secondary">Impersonate</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-text-muted transition-transform duration-fast',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-[320px] z-[200] bg-surface-page border border-border-subtle rounded-card shadow-lg animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <h3 className="text-caption font-semibold text-text-primary font-display">
              {step === 'client' && 'Select Client'}
              {step === 'mode' && `Impersonate ${selectedClient?.name}`}
              {step === 'reason' && 'Provide Reason'}
            </h3>
            <p className="text-micro text-text-muted mt-0.5">
              {step === 'client' && 'Choose the client to impersonate'}
              {step === 'mode' && 'Select the access level'}
              {step === 'reason' && 'Required for audit trail'}
            </p>
          </div>

          <div className="p-3">
            {/* Step 1: Client selection */}
            {step === 'client' && (
              <div className="max-h-[240px] overflow-y-auto space-y-1">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client);
                      setStep('mode');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-button text-caption text-left text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all duration-fast"
                  >
                    <Shield className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                    <span className="truncate">{client.name}</span>
                  </button>
                ))}
                {clients.length === 0 && (
                  <p className="text-caption text-text-muted text-center py-4">
                    No clients available
                  </p>
                )}
              </div>
            )}

            {/* Step 2: Mode selection */}
            {step === 'mode' && (
              <div className="space-y-2">
                {(Object.entries(MODE_CONFIG) as Array<[keyof typeof MODE_CONFIG, (typeof MODE_CONFIG)[keyof typeof MODE_CONFIG]]>).map(
                  ([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = selectedMode === key;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedMode(key as any);
                          setStep('reason');
                        }}
                        className={cn(
                          'w-full flex items-start gap-3 px-3 py-2.5 rounded-button text-left transition-all duration-fast',
                          isSelected
                            ? `${config.bg} border border-current`
                            : 'hover:bg-surface-hover border border-transparent',
                        )}
                      >
                        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
                        <div>
                          <div className="text-caption font-semibold text-text-primary">
                            {config.label}
                          </div>
                          <div className="text-micro text-text-muted mt-0.5">
                            {config.description}
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
                <button
                  onClick={() => setStep('client')}
                  className="text-micro text-text-muted hover:text-text-primary mt-2"
                >
                  Back
                </button>
              </div>
            )}

            {/* Step 3: Reason input */}
            {step === 'reason' && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {(() => {
                      const config = MODE_CONFIG[selectedMode];
                      const Icon = config.icon;
                      return (
                        <>
                          <Icon className={cn('w-3.5 h-3.5', config.color)} />
                          <span className="text-caption font-medium text-text-primary">
                            {config.label}
                          </span>
                          <span className="text-micro text-text-muted">
                            for {selectedClient?.name}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Investigating deposit issue #1234..."
                    className="w-full h-20 px-3 py-2 rounded-button border border-border-subtle bg-surface-page text-caption text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent-primary transition-colors"
                    maxLength={500}
                    autoFocus
                  />
                  <div className="text-micro text-text-muted text-right mt-1">
                    {reason.length}/500
                  </div>
                </div>

                {error && (
                  <div className="text-micro text-status-error bg-status-error-subtle px-3 py-2 rounded-button">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep('mode')}
                    className="flex-1 py-2 text-caption text-text-muted hover:text-text-primary rounded-button hover:bg-surface-hover transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!reason.trim() || isSubmitting}
                    className={cn(
                      'flex-1 py-2 text-caption font-semibold rounded-button transition-all',
                      'bg-accent-primary text-accent-text hover:bg-accent-hover',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {isSubmitting ? 'Starting...' : 'Start Session'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **20.3** Update `apps/admin/components/header.tsx` to include the impersonation dropdown. Add the import and insert it in the right actions area, before the theme toggle:

Add imports:
```typescript
import { ImpersonationDropdown } from "@/components/impersonation-dropdown";
import { useImpersonation } from "@/lib/impersonation-context";
```

Insert the dropdown before the theme toggle button (inside the right actions div):

```tsx
        {/* Impersonation trigger */}
        <ImpersonationDropdown clients={[]} />

        {/* Separator */}
        <div className="w-px h-5 bg-border-subtle" />
```

Note: The `clients` prop will be populated by passing data from a React Query hook (e.g., `useClients()`). For now, pass an empty array; the actual data wiring will happen when the admin client list page is updated.

- [ ] **20.4** Wrap the admin app layout with `ImpersonationProvider`. In the admin layout file (e.g., `apps/admin/app/layout.tsx`), add:

```typescript
import { ImpersonationProvider } from '@/lib/impersonation-context';
```

Wrap children with `<ImpersonationProvider>`.

- [ ] **20.5** Commit:

```bash
git add apps/admin/components/impersonation-dropdown.tsx \
        apps/admin/lib/impersonation-context.tsx \
        apps/admin/components/header.tsx \
        apps/admin/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(admin-app): add impersonation dropdown with 3-step wizard (client/mode/reason)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Frontend — Impersonation visual banner

**Files:**
- **Create:** `apps/admin/components/impersonation-banner.tsx`
- **Modify:** `apps/admin/components/layout-shell.tsx`

**Steps:**

- [ ] **21.1** Create `apps/admin/components/impersonation-banner.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Eye, X, Clock, Shield, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImpersonation } from '@/lib/impersonation-context';

const MODE_STYLES = {
  read_only: {
    bg: 'bg-blue-600',
    border: 'border-blue-700',
    icon: Eye,
    label: 'READ ONLY',
  },
  support: {
    bg: 'bg-amber-600',
    border: 'border-amber-700',
    icon: ShieldCheck,
    label: 'SUPPORT',
  },
  full_operational: {
    bg: 'bg-red-600',
    border: 'border-red-700',
    icon: ShieldAlert,
    label: 'FULL OPERATIONAL',
  },
} as const;

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);

  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export function ImpersonationBanner() {
  const { session, isImpersonating, endImpersonation } = useImpersonation();
  const [isEnding, setIsEnding] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [elapsed, setElapsed] = useState('');

  // Update elapsed time every 30s
  useState(() => {
    if (!session) return;
    const update = () => setElapsed(formatDuration(session.startedAt));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  });

  if (!isImpersonating || !session) return null;

  const style = MODE_STYLES[session.mode as keyof typeof MODE_STYLES] || MODE_STYLES.read_only;
  const Icon = style.icon;

  async function handleEnd() {
    setIsEnding(true);
    try {
      await endImpersonation();
    } catch (err) {
      console.error('Failed to end impersonation:', err);
    } finally {
      setIsEnding(false);
      setShowConfirm(false);
    }
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[999]',
        style.bg,
        'text-white shadow-lg',
      )}
    >
      <div className="flex items-center justify-between px-6 py-2">
        {/* Left: Mode + Client info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/20 text-[11px] font-bold tracking-wider uppercase">
            <Icon className="w-3.5 h-3.5" />
            <span>{style.label}</span>
          </div>

          <div className="w-px h-4 bg-white/30" />

          <span className="text-[13px] font-medium">
            Impersonating Client #{session.targetClientId}
            {session.targetProjectId && ` / Project #${session.targetProjectId}`}
          </span>

          <div className="w-px h-4 bg-white/30" />

          <div className="flex items-center gap-1 text-[11px] text-white/80">
            <Clock className="w-3 h-3" />
            <span>{elapsed || '0m'}</span>
          </div>
        </div>

        {/* Center: Reason */}
        <div className="flex items-center gap-1.5 text-[11px] text-white/70 max-w-[400px] truncate">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{session.reason}</span>
        </div>

        {/* Right: End session */}
        <div className="flex items-center gap-2">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-[12px] font-semibold transition-all"
            >
              <X className="w-3.5 h-3.5" />
              End Session
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium">End impersonation?</span>
              <button
                onClick={handleEnd}
                disabled={isEnding}
                className="px-3 py-1 rounded bg-white text-red-600 text-[12px] font-bold hover:bg-white/90 transition-all disabled:opacity-50"
              >
                {isEnding ? 'Ending...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-2 py-1 text-[12px] text-white/70 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **21.2** Update `apps/admin/components/layout-shell.tsx` to render the banner and shift content when impersonating:

```typescript
"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { useImpersonation } from "@/lib/impersonation-context";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const { isImpersonating } = useImpersonation();

  if (isLoginPage) {
    return <>{children}</>;
  }

  // Banner height is 40px when impersonating
  const bannerOffset = isImpersonating ? 'mt-[40px]' : '';

  return (
    <>
      <ImpersonationBanner />
      <div className={bannerOffset}>
        <Sidebar />
        <Header />
        <main className="ml-sidebar-w mt-header-h p-content-p min-h-[calc(100vh-56px)] bg-surface-page">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </>
  );
}
```

- [ ] **21.3** Commit:

```bash
git add apps/admin/components/impersonation-banner.tsx \
        apps/admin/components/layout-shell.tsx
git commit -m "$(cat <<'EOF'
feat(admin-app): add impersonation visual banner with mode indicator and session controls

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Tests — Impersonation flow, audit, permission matrix

**Files:**
- **Create:** `services/auth-service/src/impersonation/__tests__/impersonation.service.spec.ts`
- **Create:** `services/admin-api/src/common/guards/__tests__/impersonation.guard.spec.ts`
- **Create:** `services/admin-api/src/common/interceptors/__tests__/impersonation-audit.interceptor.spec.ts`

**Steps:**

- [ ] **22.1** Create `services/auth-service/src/impersonation/__tests__/impersonation.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ImpersonationService } from '../impersonation.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      impersonationSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      impersonationAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ImpersonationService>(ImpersonationService);
  });

  describe('startSession', () => {
    it('should start a read_only session for a viewer', async () => {
      prisma.impersonationSession.findFirst.mockResolvedValue(null);
      prisma.impersonationSession.create.mockResolvedValue({
        id: BigInt(1),
        adminUserId: BigInt(1),
        targetClientId: BigInt(10),
        targetProjectId: null,
        mode: 'read_only',
        reason: 'Testing',
        startedAt: new Date(),
        endedAt: null,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      });

      const result = await service.startSession(
        1,
        'viewer',
        {
          targetClientId: 10,
          mode: 'read_only',
          reason: 'Testing',
        },
        '127.0.0.1',
        'test',
      );

      expect(result.id).toBe('1');
      expect(result.mode).toBe('read_only');
    });

    it('should reject support mode for viewer role', async () => {
      await expect(
        service.startSession(1, 'viewer', {
          targetClientId: 10,
          mode: 'support',
          reason: 'Testing',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject full_operational mode for admin role', async () => {
      await expect(
        service.startSession(1, 'admin', {
          targetClientId: 10,
          mode: 'full_operational',
          reason: 'Testing',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow full_operational mode for super_admin', async () => {
      prisma.impersonationSession.findFirst.mockResolvedValue(null);
      prisma.impersonationSession.create.mockResolvedValue({
        id: BigInt(1),
        adminUserId: BigInt(1),
        targetClientId: BigInt(10),
        targetProjectId: null,
        mode: 'full_operational',
        reason: 'Emergency',
        startedAt: new Date(),
        endedAt: null,
        ipAddress: null,
        userAgent: null,
      });

      const result = await service.startSession(1, 'super_admin', {
        targetClientId: 10,
        mode: 'full_operational',
        reason: 'Emergency',
      });

      expect(result.mode).toBe('full_operational');
    });

    it('should reject if admin already has an active session', async () => {
      prisma.impersonationSession.findFirst.mockResolvedValue({
        id: BigInt(99),
        endedAt: null,
      });

      await expect(
        service.startSession(1, 'super_admin', {
          targetClientId: 10,
          mode: 'read_only',
          reason: 'Testing',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('endSession', () => {
    it('should end an active session', async () => {
      prisma.impersonationSession.findFirst.mockResolvedValue({
        id: BigInt(1),
        adminUserId: BigInt(1),
        startedAt: new Date(),
        endedAt: null,
      });
      prisma.impersonationSession.update.mockResolvedValue({
        id: BigInt(1),
        adminUserId: BigInt(1),
        targetClientId: BigInt(10),
        targetProjectId: null,
        mode: 'read_only',
        reason: 'Testing',
        startedAt: new Date(),
        endedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      });

      const result = await service.endSession(1, 1);

      expect(result.endedAt).not.toBeNull();
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.impersonationSession.findFirst.mockResolvedValue(null);

      await expect(service.endSession(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('isMethodAllowed', () => {
    it('should allow GET for read_only', () => {
      expect(service.isMethodAllowed('read_only', 'GET')).toBe(true);
    });

    it('should reject POST for read_only', () => {
      expect(service.isMethodAllowed('read_only', 'POST')).toBe(false);
    });

    it('should allow POST for support', () => {
      expect(service.isMethodAllowed('support', 'POST')).toBe(true);
    });

    it('should allow PATCH for support', () => {
      expect(service.isMethodAllowed('support', 'PATCH')).toBe(true);
    });

    it('should reject DELETE for support', () => {
      expect(service.isMethodAllowed('support', 'DELETE')).toBe(false);
    });

    it('should allow DELETE for full_operational', () => {
      expect(service.isMethodAllowed('full_operational', 'DELETE')).toBe(true);
    });

    it('should allow all methods for full_operational', () => {
      const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
      methods.forEach((m) => {
        expect(service.isMethodAllowed('full_operational', m)).toBe(true);
      });
    });
  });

  describe('auditAction', () => {
    it('should create an audit entry with body hash', async () => {
      prisma.impersonationAudit.create.mockResolvedValue({});

      await service.auditAction({
        sessionId: 1,
        adminUserId: 1,
        targetClientId: 10,
        action: 'GET /wallets',
        requestMethod: 'GET',
        requestPath: '/admin/clients/10/wallets',
        requestBody: { filter: 'active' },
      });

      expect(prisma.impersonationAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestBodyHash: expect.any(String),
          requestPath: '/admin/clients/10/wallets',
        }),
      });
    });

    it('should set null body hash when no body', async () => {
      prisma.impersonationAudit.create.mockResolvedValue({});

      await service.auditAction({
        sessionId: 1,
        adminUserId: 1,
        targetClientId: 10,
        action: 'GET /wallets',
        requestMethod: 'GET',
        requestPath: '/admin/clients/10/wallets',
      });

      expect(prisma.impersonationAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestBodyHash: null,
        }),
      });
    });
  });
});
```

- [ ] **22.2** Create `services/admin-api/src/common/guards/__tests__/impersonation.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImpersonationGuard } from '../impersonation.guard';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function createMockContext(
  headers: Record<string, string> = {},
  request: any = {},
): ExecutionContext {
  const req = {
    headers,
    method: request.method || 'GET',
    path: request.path || '/',
    user: request.user || { userId: '1', role: 'admin' },
    ...request,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as any;
}

describe('ImpersonationGuard', () => {
  let guard: ImpersonationGuard;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:3003'),
    } as any;
    guard = new ImpersonationGuard(configService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass through when no impersonation header', async () => {
    const ctx = createMockContext({}, { user: { userId: '1', role: 'admin' } });
    const req = ctx.switchToHttp().getRequest();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.impersonation).toBeNull();
  });

  it('should set impersonation context for valid session', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        session: {
          id: '42',
          adminUserId: '1',
          targetClientId: '10',
          targetProjectId: null,
          mode: 'read_only',
        },
      },
    });

    const ctx = createMockContext(
      {
        'x-impersonation-session': '42',
        authorization: 'Bearer test-token',
      },
      { method: 'GET', user: { userId: '1', role: 'admin' } },
    );
    const req = ctx.switchToHttp().getRequest();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.impersonation).toEqual({
      sessionId: '42',
      adminUserId: '1',
      targetClientId: '10',
      targetProjectId: null,
      mode: 'read_only',
    });
  });

  it('should reject POST for read_only mode', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        session: {
          id: '42',
          adminUserId: '1',
          targetClientId: '10',
          targetProjectId: null,
          mode: 'read_only',
        },
      },
    });

    const ctx = createMockContext(
      {
        'x-impersonation-session': '42',
        authorization: 'Bearer test-token',
      },
      { method: 'POST', user: { userId: '1', role: 'admin' } },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should reject DELETE for support mode', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        session: {
          id: '42',
          adminUserId: '1',
          targetClientId: '10',
          targetProjectId: null,
          mode: 'support',
        },
      },
    });

    const ctx = createMockContext(
      {
        'x-impersonation-session': '42',
        authorization: 'Bearer test-token',
      },
      { method: 'DELETE', user: { userId: '1', role: 'admin' } },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should allow DELETE for full_operational mode', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        session: {
          id: '42',
          adminUserId: '1',
          targetClientId: '10',
          targetProjectId: null,
          mode: 'full_operational',
        },
      },
    });

    const ctx = createMockContext(
      {
        'x-impersonation-session': '42',
        authorization: 'Bearer test-token',
      },
      { method: 'DELETE', user: { userId: '1', role: 'super_admin' } },
    );
    const req = ctx.switchToHttp().getRequest();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.impersonation.mode).toBe('full_operational');
  });

  it('should reject when session ID mismatch', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        session: {
          id: '99',
          adminUserId: '1',
          targetClientId: '10',
          mode: 'read_only',
        },
      },
    });

    const ctx = createMockContext(
      {
        'x-impersonation-session': '42',
        authorization: 'Bearer test-token',
      },
      { method: 'GET', user: { userId: '1', role: 'admin' } },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should reject when no active session exists', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { session: null },
    });

    const ctx = createMockContext(
      {
        'x-impersonation-session': '42',
        authorization: 'Bearer test-token',
      },
      { method: 'GET', user: { userId: '1', role: 'admin' } },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **22.3** Create `services/admin-api/src/common/interceptors/__tests__/impersonation-audit.interceptor.spec.ts`:

```typescript
import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { ImpersonationAuditInterceptor } from '../impersonation-audit.interceptor';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function createMockContext(request: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as any;
}

describe('ImpersonationAuditInterceptor', () => {
  let interceptor: ImpersonationAuditInterceptor;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:3003'),
    } as any;
    interceptor = new ImpersonationAuditInterceptor(configService);
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass through when no impersonation context', (done) => {
    const ctx = createMockContext({
      impersonation: null,
      method: 'GET',
      path: '/admin/clients',
    });

    const handler = { handle: () => of({ data: 'response' }) };

    interceptor.intercept(ctx, handler).subscribe({
      next: (val) => {
        expect(val).toEqual({ data: 'response' });
        expect(mockedAxios.post).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should record audit on successful request', (done) => {
    const ctx = createMockContext({
      impersonation: {
        sessionId: '1',
        adminUserId: '2',
        targetClientId: '10',
        targetProjectId: null,
        mode: 'read_only',
      },
      method: 'GET',
      path: '/admin/clients/10/wallets',
      route: { path: '/admin/clients/:id/wallets' },
      body: {},
      query: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
    });

    const handler = { handle: () => of({ data: 'response' }) };

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        // Audit is fire-and-forget, give it a tick
        setTimeout(() => {
          expect(mockedAxios.post).toHaveBeenCalledWith(
            'http://localhost:3003/auth/impersonation/audit',
            expect.objectContaining({
              sessionId: 1,
              adminUserId: 2,
              targetClientId: 10,
              requestMethod: 'GET',
              requestPath: '/admin/clients/10/wallets',
            }),
            expect.any(Object),
          );
          done();
        }, 10);
      },
    });
  });

  it('should record audit on failed request', (done) => {
    const ctx = createMockContext({
      impersonation: {
        sessionId: '1',
        adminUserId: '2',
        targetClientId: '10',
        targetProjectId: null,
        mode: 'support',
      },
      method: 'PATCH',
      path: '/admin/clients/10/wallets/5',
      route: { path: '/admin/clients/:id/wallets/:walletId' },
      body: { label: 'new label' },
      query: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
    });

    const error = { status: 404, message: 'Not found' };
    const handler = { handle: () => throwError(() => error) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        setTimeout(() => {
          expect(mockedAxios.post).toHaveBeenCalledWith(
            'http://localhost:3003/auth/impersonation/audit',
            expect.objectContaining({
              responseStatus: 404,
              requestMethod: 'PATCH',
            }),
            expect.any(Object),
          );
          done();
        }, 10);
      },
    });
  });
});
```

- [ ] **22.4** Run all tests:

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
npx jest services/auth-service/src/impersonation/__tests__/ --passWithNoTests
npx jest services/admin-api/src/common/guards/__tests__/impersonation.guard.spec.ts --passWithNoTests
npx jest services/admin-api/src/common/interceptors/__tests__/ --passWithNoTests
```

Expected output: all tests pass.

- [ ] **22.5** Commit:

```bash
git add services/auth-service/src/impersonation/__tests__/ \
        services/admin-api/src/common/guards/__tests__/ \
        services/admin-api/src/common/interceptors/__tests__/
git commit -m "$(cat <<'EOF'
test: add comprehensive tests for impersonation service, guard, and audit interceptor

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Summary

### Phase 1 (Tasks 1-13): Multi-Project Foundation
- **2 SQL migrations** (013, 014): projects table + project_id on 13 tables with backfill
- **6 Prisma schema updates**: Project model in admin-api, project_id in all 5 service schemas
- **2 new NestJS modules**: ProjectManagementModule (admin-api), ProjectModule (client-api)
- **1 new guard**: ProjectScopeGuard with 3-source resolution (header > API key > default)
- **3 API client additions**: Admin project CRUD, Client project listing, React Query hooks
- **3 frontend additions**: ProjectContext, ProjectSelector dropdown, project-aware pages
- **3 test files**: Service unit tests, guard tests, controller tests

### Phase 9 (Tasks 14-22): Admin Impersonation
- **1 SQL migration** (022): impersonation_sessions + impersonation_audit tables
- **2 Prisma model additions**: ImpersonationSession, ImpersonationAudit in auth-service
- **1 new NestJS module**: ImpersonationModule in auth-service with full CRUD + audit
- **1 new guard**: ImpersonationGuard with mode-based HTTP method enforcement
- **1 new interceptor**: ImpersonationAuditInterceptor for fire-and-forget audit logging
- **API client additions**: Start/end/list sessions, audit trail, auto-session-header
- **3 frontend additions**: ImpersonationContext, ImpersonationDropdown (3-step wizard), ImpersonationBanner
- **3 test files**: Service permission matrix, guard mode enforcement, interceptor audit recording

### Permission Matrix

| Mode              | Roles Allowed              | GET | POST | PATCH | PUT | DELETE |
|-------------------|----------------------------|-----|------|-------|-----|--------|
| read_only         | super_admin, admin, viewer | Yes | No   | No    | No  | No     |
| support           | super_admin, admin         | Yes | Yes  | Yes   | No  | No     |
| full_operational  | super_admin                | Yes | Yes  | Yes   | Yes | Yes    |
