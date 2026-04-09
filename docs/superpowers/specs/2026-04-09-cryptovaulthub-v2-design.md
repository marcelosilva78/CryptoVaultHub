# CryptoVaultHub v2 — Comprehensive Architecture Design Specification

**Date**: 2026-04-09
**Status**: Draft — Pending Review
**Scope**: 14 feature improvements across 10 implementation phases

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Key Architectural Decisions](#2-key-architectural-decisions)
3. [Phase 1: Foundation — Projects & Scoping](#3-phase-1-foundation)
4. [Phase 2: RPC Gateway & Provider Management](#4-phase-2-rpc-gateway)
5. [Phase 3: Queue & Job Infrastructure](#5-phase-3-queue-infra)
6. [Phase 4: Chain Indexer v2](#6-phase-4-chain-indexer)
7. [Phase 5: Webhooks v2](#7-phase-5-webhooks)
8. [Phase 6: Flush Operations](#8-phase-6-flush-operations)
9. [Phase 7: Deploy Traceability & Multi-Chain Addresses](#9-phase-7-traceability)
10. [Phase 8: Export System](#10-phase-8-exports)
11. [Phase 9: Admin Impersonation](#11-phase-9-impersonation)
12. [Phase 10: UX Components](#12-phase-10-ux)
13. [Migration Strategy](#13-migration-strategy)
14. [Risks & Mitigations](#14-risks)

---

## 1. Architecture Overview

### Current State

- **8 NestJS microservices**: admin-api (3001), client-api (3002), auth-service (3003), core-wallet-service (3004), key-vault-service (3005), chain-indexer-service (3006), notification-service (3007), cron-worker-service (3008)
- **2 Next.js 14 frontends**: admin (3010), client (3011)
- **8 MySQL databases**: cvh_auth, cvh_keyvault, cvh_admin, cvh_wallets, cvh_transactions, cvh_compliance, cvh_notifications, cvh_indexer
- **BullMQ + Redis 7**: Queue execution engine
- **Kong 3.6**: API Gateway
- **Observability**: Prometheus + Grafana + Loki + Jaeger

### Target State

**New service (+1)**:
- `rpc-gateway-service` (3009) — RPC provider abstraction layer

**New databases (+2)**:
- `cvh_jobs` — Persistent job metadata, dedup, audit
- `cvh_exports` — Export requests, files, templates

**Modified databases (6/8)**:
- `cvh_admin` — +projects, +rpc_providers, +rpc_nodes, +rpc_provider_health, +rpc_rate_limits, +provider_switch_log
- `cvh_wallets` — +address_groups, +flush_operations, +flush_items, +project_id on all tables
- `cvh_transactions` — +deploy_traces, +transaction_events, +project_id on all tables
- `cvh_notifications` — +webhook_delivery_attempts, +webhook_dead_letters, +retry config columns, +project_id
- `cvh_indexer` — +indexed_blocks, +indexed_events, +materialized_balances, +sync_gaps, +reorg_log
- `cvh_auth` — +impersonation_sessions, +impersonation_audit, +project_id on api_keys

**New tables total**: ~25
**Modified tables total**: ~13

---

## 2. Key Architectural Decisions

### ADR-001: Project Scoping Model

**Problem**: Clients need multiple projects; every data query must be project-scoped.

**Decision**: Column-level `project_id BIGINT NOT NULL` on all tenant-scoped tables with automatic middleware enforcement via `@ProjectScoped()` guard (Option C: Hybrid).

**Rationale**: Preserves 8-database architecture, works with Prisma, no infrastructure explosion. Admin APIs can omit project context for cross-project views.

**Trade-offs**: All queries must include project_id (enforced by guard). Composite indexes slightly larger. Migration requires default project backfill.

### ADR-002: Multi-Chain Same Address

**Problem**: Depositors need the same address across Ethereum, BSC, Polygon, etc.

**Decision**: Deploy ForwarderFactory at deterministic CREATE2 address on all EVM chains. Same factory address + same salt + same init_code_hash = same forwarder address on every chain.

**Rationale**: Preserves existing auto-sweep model. Industry-proven approach (Uniswap, Safe use the same pattern). No need for a separate HD wallet model.

**Prerequisites**: Factory contract must be deployed at identical address on all target chains using a deterministic deployer (same nonce or CREATE2-deployed factory).

### ADR-003: RPC Provider Architecture

**Problem**: Current RPC management is scattered across 3 services with no rate limiting, no scoring, no graceful switchover.

**Decision**: New `rpc-gateway-service` (port 3009) as internal abstraction layer. All services call the gateway instead of blockchain directly.

**Rationale**: Centralizes rate limiting, circuit breaking, failover, health scoring. Single point of control for provider switchover.

**Provider state machine**: `active` -> `draining` -> `standby` -> `unhealthy` -> `disabled`

### ADR-004: Queue & Job System

**Problem**: BullMQ is Redis-only; no persistent visibility, no admin dashboard, no cross-restart deduplication.

**Decision**: Keep BullMQ as execution engine. Add `cvh_jobs` database for persistent job metadata, dedup, and admin visibility.

**Queue tiers**:
- `critical`: flush, deploy, sweep (concurrency 5/chain)
- `standard`: webhooks, indexing, confirmations (concurrency 10-20)
- `bulk`: exports, backfill, cleanup (concurrency 2-3)

**Delivery guarantee**: At-least-once with idempotency keys for exactly-once semantics.

### ADR-005: Indexer Architecture

**Problem**: No gap detection, no block-level persistence, no materialized balances, no reorg handling.

**Decision**: Hybrid polling + WebSocket with checkpoint-based recovery. Block-level persistence via `indexed_blocks`. Gap detection every 60s. Materialized balances only after finality threshold.

**Finality thresholds**: Ethereum 64, BSC 15, Polygon 256, Arbitrum 1 (L1 finalized), Optimism 1 (L1 finalized), Avalanche 1, Base 1.

### ADR-006: Flush Naming Convention

**Problem**: Need clear naming for ERC-20 flush vs native asset sweep.

**Decision**: "Flush Tokens" for ERC-20s, "Sweep Native" for native assets.

**Rationale**: "Sweep" is industry-standard for native assets. "Flush" is already established in the codebase for token operations via contract methods (`flushTokens`).

### ADR-007: Impersonation Model

**Problem**: Admins need to view client environments for support.

**Decision**: Three-tier impersonation: `read_only` (view only), `support` (view + retries/resends), `full_operational` (all actions, requires super_admin). Every impersonated action logged with real admin, target client/project, action, IP, timestamp.

---

## 3. Phase 1: Foundation — Projects & Scoping

### 3.1 Database Schema

#### New table: `cvh_admin.projects`

```sql
CREATE TABLE `projects` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `client_id`   BIGINT        NOT NULL,
  `name`        VARCHAR(200)  NOT NULL,
  `slug`        VARCHAR(100)  NOT NULL,
  `description` VARCHAR(500)  NULL,
  `is_default`  TINYINT(1)    NOT NULL DEFAULT 0,
  `status`      ENUM('active','archived','suspended') NOT NULL DEFAULT 'active',
  `settings`    JSON          NULL,
  `created_at`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_slug` (`client_id`, `slug`),
  INDEX `idx_client_status` (`client_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Tables receiving `project_id`

| Database | Table | Nullable | Notes |
|---|---|---|---|
| cvh_wallets | wallets | NOT NULL | Per-project wallet isolation |
| cvh_wallets | deposit_addresses | NOT NULL | Addresses belong to project |
| cvh_wallets | whitelisted_addresses | NOT NULL | Whitelist per project |
| cvh_transactions | deposits | NOT NULL | Deposit tracking per project |
| cvh_transactions | withdrawals | NOT NULL | Withdrawal tracking per project |
| cvh_compliance | screening_results | NOT NULL | Compliance per project |
| cvh_compliance | compliance_alerts | NOT NULL | Alerts per project |
| cvh_auth | api_keys | NOT NULL | API key scoped to project |
| cvh_notifications | webhooks | NOT NULL | Webhooks per project |
| cvh_notifications | webhook_deliveries | NOT NULL | Deliveries inherit project |
| cvh_notifications | email_logs | NOT NULL | Emails per project |
| cvh_indexer | monitored_addresses | NOT NULL | Monitoring per project |
| cvh_keyvault | key_vault_audit | NULL | Platform ops have no project |

**Exclusions** (platform-level, no project_id):
- `chains`, `tokens`, `tiers`, `client_tier_overrides` (client-level)
- `master_seeds`, `derived_keys`, `shamir_shares` (client-level crypto)
- `sanctions_entries` (global compliance data)
- `sync_cursors` (per-chain, not per-project)

#### Migration strategy for `project_id`

```sql
-- Step 1: Create default project per client
INSERT INTO cvh_admin.projects (client_id, name, slug, is_default, status)
SELECT id, CONCAT(name, ' - Default'), 'default', 1, 'active'
FROM cvh_admin.clients;

-- Step 2: Add project_id as NULLABLE first
ALTER TABLE cvh_wallets.wallets ADD COLUMN project_id BIGINT NULL AFTER client_id;
-- (repeat for all 13 tables)

-- Step 3: Backfill project_id from default project
UPDATE cvh_wallets.wallets w
  JOIN cvh_admin.projects p ON p.client_id = w.client_id AND p.is_default = 1
  SET w.project_id = p.id
  WHERE w.project_id IS NULL;
-- (repeat for all tables)

-- Step 4: Set NOT NULL constraint (except key_vault_audit)
ALTER TABLE cvh_wallets.wallets MODIFY project_id BIGINT NOT NULL;
-- (repeat for all tables except key_vault_audit)

-- Step 5: Add composite indexes
ALTER TABLE cvh_wallets.wallets ADD INDEX idx_client_project (client_id, project_id);
ALTER TABLE cvh_wallets.deposit_addresses ADD INDEX idx_client_project (client_id, project_id);
-- (repeat for all tables)
```

### 3.2 API Design

#### Client API — Project CRUD

```
POST   /client/v1/projects          — Create project
GET    /client/v1/projects          — List client's projects
GET    /client/v1/projects/:id      — Get project detail
PATCH  /client/v1/projects/:id      — Update project
DELETE /client/v1/projects/:id      — Archive project (soft delete)
POST   /client/v1/projects/:id/default — Set as default project
```

#### Project Context Flow

1. Client sets `X-Project-Id` header on every request (or `projectId` JWT claim)
2. `ProjectScopeGuard` extracts and validates: does project belong to this client? Is project active?
3. Guard injects `req.projectId` into request context
4. All downstream queries include `WHERE client_id = ? AND project_id = ?`
5. If header missing and client has exactly 1 project, use it implicitly
6. If header missing and client has multiple projects, return 400 with project list

### 3.3 Middleware Design

```typescript
// services/client-api/src/common/guards/project-scope.guard.ts
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const clientId = req.clientId; // set by ApiKeyAuthGuard
    const projectId = req.headers['x-project-id'];

    if (!projectId) {
      // Check if client has single project (implicit)
      const projects = await this.projectService.findByClient(clientId);
      if (projects.length === 1) {
        req.projectId = projects[0].id;
        return true;
      }
      throw new BadRequestException({
        message: 'X-Project-Id header required',
        projects: projects.map(p => ({ id: p.id, name: p.name, slug: p.slug })),
      });
    }

    const project = await this.projectService.findByIdAndClient(projectId, clientId);
    if (!project || project.status !== 'active') {
      throw new ForbiddenException('Invalid or inactive project');
    }

    req.projectId = project.id;
    req.projectSlug = project.slug;
    return true;
  }
}
```

### 3.4 Frontend — Project Selector

**Location**: `apps/client/components/header.tsx`

**Behavior**:
- Dropdown in header bar showing current project name
- List of all client's projects with status badges
- "Create New Project" option at bottom
- On switch: update React Query client, refetch all active queries
- Store active project in localStorage + React Context

**Component tree**:
```
<ProjectProvider>          // apps/client/lib/project-context.tsx
  <LayoutShell>
    <Header>
      <ProjectSelector />  // apps/client/components/project-selector.tsx
    </Header>
    <Sidebar />
    <Content />
  </LayoutShell>
</ProjectProvider>
```

---

## 4. Phase 2: RPC Gateway & Provider Management

### 4.1 Database Schema

#### New tables in `cvh_admin`

```sql
CREATE TABLE `rpc_providers` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `name`              VARCHAR(100) NOT NULL,
  `slug`              VARCHAR(50)  NOT NULL UNIQUE,
  `website`           VARCHAR(255) NULL,
  `auth_method`       ENUM('api_key','bearer','header','none') NOT NULL DEFAULT 'api_key',
  `auth_header_name`  VARCHAR(100) NULL DEFAULT 'x-api-key',
  `api_key_encrypted` TEXT         NULL,
  `api_secret_encrypted` TEXT      NULL,
  `notes`             TEXT         NULL,
  `is_active`         TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `rpc_nodes` (
  `id`                       BIGINT       NOT NULL AUTO_INCREMENT,
  `provider_id`              BIGINT       NOT NULL,
  `chain_id`                 INT          NOT NULL,
  `endpoint_url`             VARCHAR(512) NOT NULL,
  `ws_endpoint_url`          VARCHAR(512) NULL,
  `priority`                 INT          NOT NULL DEFAULT 50,
  `weight`                   INT          NOT NULL DEFAULT 100,
  `status`                   ENUM('active','draining','standby','unhealthy','disabled') NOT NULL DEFAULT 'standby',
  `max_requests_per_second`  INT          NULL DEFAULT 50,
  `max_requests_per_minute`  INT          NULL DEFAULT 2000,
  `max_batch_size`           INT          NULL DEFAULT 100,
  `timeout_ms`               INT          NOT NULL DEFAULT 15000,
  `health_check_interval_s`  INT          NOT NULL DEFAULT 30,
  `last_health_check_at`     DATETIME(3)  NULL,
  `last_healthy_at`          DATETIME(3)  NULL,
  `consecutive_failures`     INT          NOT NULL DEFAULT 0,
  `health_score`             DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `tags`                     JSON         NULL,
  `is_active`                TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chain_status` (`chain_id`, `status`, `priority`),
  INDEX `idx_provider` (`provider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `rpc_provider_health` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `node_id`     BIGINT       NOT NULL,
  `check_type`  ENUM('latency','block_height','error_rate','uptime') NOT NULL,
  `value`       DECIMAL(12,4) NOT NULL,
  `measured_at` DATETIME(3)  NOT NULL,
  `metadata`    JSON         NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_node_time` (`node_id`, `measured_at` DESC),
  INDEX `idx_cleanup` (`measured_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `provider_switch_log` (
  `id`                    BIGINT      NOT NULL AUTO_INCREMENT,
  `chain_id`              INT         NOT NULL,
  `from_node_id`          BIGINT      NULL,
  `to_node_id`            BIGINT      NOT NULL,
  `reason`                ENUM('manual','failover','health_degraded','rate_limited','draining') NOT NULL,
  `initiated_by`          VARCHAR(100) NOT NULL DEFAULT 'system',
  `drain_started_at`      DATETIME(3) NULL,
  `drain_completed_at`    DATETIME(3) NULL,
  `switch_completed_at`   DATETIME(3) NULL,
  `pending_jobs_at_switch` INT        NULL,
  `status`                ENUM('initiated','draining','completed','rolled_back') NOT NULL DEFAULT 'initiated',
  `notes`                 TEXT        NULL,
  `created_at`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chain_time` (`chain_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 Service Architecture

```
rpc-gateway-service/
  src/
    router/
      rpc-router.service.ts         — Node selection algorithm
      rpc-router.controller.ts      — Internal HTTP proxy endpoints
    rate-limiter/
      rate-limiter.service.ts       — Redis token bucket per node
    circuit-breaker/
      circuit-breaker.service.ts    — Per-node circuit breaker (closed/open/half-open)
    health/
      health.service.ts             — Periodic health checks
      health.worker.ts              — BullMQ repeatable job
    switchover/
      switchover.service.ts         — Graceful provider switchover
    prisma/
      prisma.service.ts             — DB access for provider config
```

**Node selection algorithm**:
1. Filter nodes: `chain_id = X AND status = 'active' AND is_active = true`
2. Exclude circuit-broken nodes
3. Check rate limits (Redis sliding window)
4. Sort by `priority ASC, health_score DESC`
5. If primary fails: try next in list (failover)
6. If all fail: return error with diagnostic info

**Graceful switchover flow**:
1. Admin triggers switch → `from_node.status = 'draining'`
2. New requests route to `to_node` (status set to `active`)
3. Wait for in-flight requests on `from_node` to complete (poll BullMQ)
4. After drain timeout or completion → `from_node.status = 'standby'`
5. Log switch in `provider_switch_log`

### 4.3 API Endpoints (Admin)

```
POST   /admin/rpc-providers                           — Create provider
GET    /admin/rpc-providers                           — List providers
PATCH  /admin/rpc-providers/:id                       — Update provider
DELETE /admin/rpc-providers/:id                       — Disable provider

POST   /admin/rpc-providers/:providerId/nodes         — Create node
GET    /admin/rpc-providers/:providerId/nodes         — List nodes
PATCH  /admin/rpc-nodes/:nodeId                       — Update node config
PATCH  /admin/rpc-nodes/:nodeId/status                — Change node status

POST   /admin/chains/:chainId/switch-provider         — Trigger switchover
GET    /admin/chains/:chainId/switch-history          — Switch history
GET    /admin/rpc-health                              — All providers health
GET    /admin/rpc-health/:chainId                     — Chain-specific health
```

### 4.4 Docker Compose Addition

```yaml
rpc-gateway-service:
  build:
    context: .
    dockerfile: infra/docker/Dockerfile.nestjs
    args:
      SERVICE: rpc-gateway-service
  ports:
    - "3009:3009"
  environment:
    - PORT=3009
    - ADMIN_DATABASE_URL=mysql://cvh_admin:${MYSQL_PASSWORD}@mysql:3306/cvh_admin
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}
  networks:
    - internal-net
  depends_on:
    - mysql
    - redis
```

---

## 5. Phase 3: Queue & Job Infrastructure

### 5.1 Database Schema — `cvh_jobs` (New Database)

```sql
CREATE DATABASE IF NOT EXISTS `cvh_jobs` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cvh_jobs`;

CREATE TABLE `jobs` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `job_uid`          VARCHAR(255) NOT NULL,
  `queue_name`       VARCHAR(100) NOT NULL,
  `job_type`         VARCHAR(100) NOT NULL,
  `priority`         ENUM('critical','standard','bulk') NOT NULL DEFAULT 'standard',
  `status`           ENUM('pending','queued','processing','completed','failed','dead_letter','canceled') NOT NULL DEFAULT 'pending',
  `client_id`        BIGINT       NULL,
  `project_id`       BIGINT       NULL,
  `chain_id`         INT          NULL,
  `payload`          JSON         NOT NULL,
  `result`           JSON         NULL,
  `correlation_id`   VARCHAR(255) NULL,
  `parent_job_id`    BIGINT       NULL,
  `max_attempts`     INT          NOT NULL DEFAULT 3,
  `attempt_count`    INT          NOT NULL DEFAULT 0,
  `backoff_type`     ENUM('exponential','linear','fixed') NOT NULL DEFAULT 'exponential',
  `backoff_delay_ms` INT          NOT NULL DEFAULT 1000,
  `timeout_ms`       INT          NOT NULL DEFAULT 30000,
  `scheduled_at`     DATETIME(3)  NULL,
  `started_at`       DATETIME(3)  NULL,
  `completed_at`     DATETIME(3)  NULL,
  `failed_at`        DATETIME(3)  NULL,
  `next_retry_at`    DATETIME(3)  NULL,
  `locked_by`        VARCHAR(255) NULL,
  `locked_at`        DATETIME(3)  NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_uid` (`job_uid`),
  INDEX `idx_queue_status` (`queue_name`, `status`, `priority`, `scheduled_at`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `job_type`, `status`),
  INDEX `idx_correlation` (`correlation_id`),
  INDEX `idx_retry` (`status`, `next_retry_at`),
  INDEX `idx_type_status` (`job_type`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `job_attempts` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `job_id`          BIGINT       NOT NULL,
  `attempt_number`  INT          NOT NULL,
  `status`          ENUM('processing','completed','failed') NOT NULL,
  `worker_id`       VARCHAR(255) NULL,
  `started_at`      DATETIME(3)  NOT NULL,
  `completed_at`    DATETIME(3)  NULL,
  `duration_ms`     INT          NULL,
  `error_message`   TEXT         NULL,
  `error_stack`     TEXT         NULL,
  `result`          JSON         NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_job_attempt` (`job_id`, `attempt_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dead_letter_jobs` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `original_job_id`   BIGINT       NOT NULL,
  `job_uid`           VARCHAR(255) NOT NULL,
  `queue_name`        VARCHAR(100) NOT NULL,
  `job_type`          VARCHAR(100) NOT NULL,
  `client_id`         BIGINT       NULL,
  `project_id`        BIGINT       NULL,
  `payload`           JSON         NOT NULL,
  `last_error`        TEXT         NULL,
  `total_attempts`    INT          NOT NULL,
  `dead_lettered_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reprocessed_at`    DATETIME(3)  NULL,
  `reprocessed_job_id` BIGINT     NULL,
  `status`            ENUM('pending_review','reprocessed','discarded') NOT NULL DEFAULT 'pending_review',
  `reviewed_by`       BIGINT       NULL,
  `review_notes`      TEXT         NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`, `dead_lettered_at`),
  INDEX `idx_client` (`client_id`, `job_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `job_locks` (
  `lock_key`   VARCHAR(255) NOT NULL,
  `job_id`     BIGINT       NOT NULL,
  `locked_by`  VARCHAR(255) NOT NULL,
  `locked_at`  DATETIME(3)  NOT NULL,
  `expires_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`lock_key`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `job_schedules` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `schedule_name`   VARCHAR(255) NOT NULL,
  `job_type`        VARCHAR(100) NOT NULL,
  `queue_name`      VARCHAR(100) NOT NULL,
  `cron_expression` VARCHAR(100) NULL,
  `interval_ms`     INT          NULL,
  `payload`         JSON         NULL,
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `last_triggered_at` DATETIME(3) NULL,
  `next_trigger_at` DATETIME(3)  NULL,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schedule_name` (`schedule_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.2 Queue Topology

| Queue Name | Priority | Use Cases | Concurrency | Rate Limit |
|---|---|---|---|---|
| `critical-flush` | critical | flush_tokens, sweep_native | 5/chain | Provider limit |
| `critical-deploy` | critical | wallet/forwarder deploy | 3/chain | Provider limit |
| `standard-webhook` | standard | webhook delivery + retry | 20 global | 100/s |
| `standard-indexer` | standard | block indexing, events | 3/chain | Provider limit |
| `standard-confirmation` | standard | confirmation tracking | 10 global | Provider limit |
| `bulk-export` | bulk | CSV/XLSX/JSON generation | 3 global | N/A |
| `bulk-backfill` | bulk | gap recovery, reindex | 2/chain | Provider limit |
| `maintenance` | bulk | health checks, sanctions, cleanup | 2 global | N/A |

### 5.3 Service Architecture

```typescript
// JobOrchestratorService — central job lifecycle manager
interface JobCreateParams {
  jobUid: string;           // Idempotency key
  queueName: string;
  jobType: string;
  priority: 'critical' | 'standard' | 'bulk';
  clientId?: bigint;
  projectId?: bigint;
  chainId?: number;
  payload: Record<string, unknown>;
  correlationId?: string;
  parentJobId?: bigint;
  maxAttempts?: number;
  backoffType?: 'exponential' | 'linear' | 'fixed';
  backoffDelayMs?: number;
  timeoutMs?: number;
  scheduledAt?: Date;
}

// createJob: DB insert + BullMQ enqueue (atomic)
// createJobIfNotExists: check job_uid uniqueness first
// cancelJob: set status=canceled, remove from BullMQ
// retryJob: create new job with incremented attempt
// reprocessDeadLetter: move from DLQ back to queue
```

### 5.4 Admin API Endpoints

```
GET    /admin/jobs                         — List jobs (filterable)
GET    /admin/jobs/:id                     — Job detail + attempts
POST   /admin/jobs/:id/retry              — Retry failed job
POST   /admin/jobs/batch-retry            — Batch retry
GET    /admin/jobs/dead-letter            — List DLQ
POST   /admin/jobs/dead-letter/:id/reprocess — Reprocess from DLQ
POST   /admin/jobs/dead-letter/:id/discard   — Discard DLQ entry
GET    /admin/jobs/stats                   — Queue depths, rates, errors
GET    /admin/jobs/schedules              — List scheduled jobs
PATCH  /admin/jobs/schedules/:id          — Update schedule
```

---

## 6. Phase 4: Chain Indexer v2

### 6.1 Database Schema — `cvh_indexer` (Enhanced)

```sql
-- New tables added to cvh_indexer

CREATE TABLE `indexed_blocks` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `chain_id`          INT          NOT NULL,
  `block_number`      BIGINT       NOT NULL,
  `block_hash`        VARCHAR(66)  NOT NULL,
  `parent_hash`       VARCHAR(66)  NOT NULL,
  `block_timestamp`   BIGINT       NOT NULL,
  `transaction_count` INT          NOT NULL DEFAULT 0,
  `events_detected`   INT          NOT NULL DEFAULT 0,
  `indexed_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_finalized`      TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_block` (`chain_id`, `block_number`),
  INDEX `idx_chain_finalized` (`chain_id`, `is_finalized`, `block_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `indexed_events` (
  `id`                BIGINT         NOT NULL AUTO_INCREMENT,
  `chain_id`          INT            NOT NULL,
  `block_number`      BIGINT         NOT NULL,
  `tx_hash`           VARCHAR(66)    NOT NULL,
  `log_index`         INT            NOT NULL,
  `contract_address`  VARCHAR(42)    NOT NULL,
  `event_type`        ENUM('erc20_transfer','native_transfer','contract_deploy','forwarder_flush','approval','other') NOT NULL,
  `from_address`      VARCHAR(42)    NULL,
  `to_address`        VARCHAR(42)    NULL,
  `token_id`          BIGINT         NULL,
  `amount`            DECIMAL(78,0)  NULL,
  `client_id`         BIGINT         NULL,
  `project_id`        BIGINT         NULL,
  `wallet_id`         BIGINT         NULL,
  `is_inbound`        TINYINT(1)     NULL,
  `raw_data`          JSON           NULL,
  `processed_at`      DATETIME(3)    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_tx_log` (`chain_id`, `tx_hash`, `log_index`),
  INDEX `idx_chain_block` (`chain_id`, `block_number`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `event_type`, `block_number`),
  INDEX `idx_to_address` (`to_address`, `chain_id`),
  INDEX `idx_from_address` (`from_address`, `chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `materialized_balances` (
  `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
  `chain_id`           INT           NOT NULL,
  `address`            VARCHAR(42)   NOT NULL,
  `token_id`           BIGINT        NULL COMMENT 'NULL = native asset',
  `client_id`          BIGINT        NOT NULL,
  `project_id`         BIGINT        NOT NULL,
  `wallet_id`          BIGINT        NULL,
  `balance`            DECIMAL(78,0) NOT NULL DEFAULT 0,
  `last_updated_block` BIGINT        NOT NULL,
  `last_updated_at`    DATETIME(3)   NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_addr_token` (`chain_id`, `address`, `token_id`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sync_gaps` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `chain_id`        INT          NOT NULL,
  `gap_start_block` BIGINT       NOT NULL,
  `gap_end_block`   BIGINT       NOT NULL,
  `detected_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status`          ENUM('detected','backfilling','resolved','failed') NOT NULL DEFAULT 'detected',
  `backfill_job_id` BIGINT       NULL,
  `resolved_at`     DATETIME(3)  NULL,
  `attempt_count`   INT          NOT NULL DEFAULT 0,
  `max_attempts`    INT          NOT NULL DEFAULT 5,
  `last_error`      TEXT         NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_chain_status` (`chain_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reorg_log` (
  `id`                    BIGINT      NOT NULL AUTO_INCREMENT,
  `chain_id`              INT         NOT NULL,
  `reorg_at_block`        BIGINT      NOT NULL,
  `old_block_hash`        VARCHAR(66) NULL,
  `new_block_hash`        VARCHAR(66) NULL,
  `depth`                 INT         NOT NULL DEFAULT 1,
  `detected_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reindexed_at`          DATETIME(3) NULL,
  `events_invalidated`    INT         NOT NULL DEFAULT 0,
  `balances_recalculated` INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_chain_time` (`chain_id`, `detected_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enhance existing sync_cursors
ALTER TABLE `sync_cursors`
  ADD COLUMN `latest_finalized_block` BIGINT NOT NULL DEFAULT 0 AFTER `last_block`,
  ADD COLUMN `blocks_behind`          INT NOT NULL DEFAULT 0,
  ADD COLUMN `indexer_status`         ENUM('syncing','synced','stale','error') NOT NULL DEFAULT 'syncing',
  ADD COLUMN `last_error`             TEXT NULL,
  ADD COLUMN `last_error_at`          DATETIME(3) NULL;
```

### 6.2 Indexer Components

| Component | Trigger | Function |
|---|---|---|
| **BlockProcessor** | New block detected | Fetch block + txs, match against monitored_addresses, store in indexed_blocks + indexed_events |
| **GapDetector** | Every 60s per chain | Compare sync_cursors.last_block vs indexed_blocks, create sync_gaps |
| **BackfillWorker** | sync_gap created | Process gap in batches of 100 blocks via BlockProcessor |
| **FinalityTracker** | Every 30s per chain | Mark blocks as finalized once past finality threshold, trigger balance materialization |
| **ReorgDetector** | Each new block | Compare parent_hash vs stored previous block_hash, walk back to fork point, invalidate affected data |
| **BalanceMaterializer** | Block finalized | Recompute balances from finalized events for affected addresses |
| **SyncHealthMonitor** | Every 30s per chain | Check indexer health (block lag, gaps, WS status), set severity |
| **Reconciliation** | Every hour | Sample addresses, compare materialized_balance vs on-chain balance, flag divergences |

### 6.3 Finality Thresholds

| Chain | chain_id | Finality (blocks) | Block time | Finality time |
|---|---|---|---|---|
| Ethereum | 1 | 64 | 12s | ~13 min |
| BSC | 56 | 15 | 3s | ~45s |
| Polygon | 137 | 256 | 2s | ~8 min |
| Arbitrum | 42161 | 1 | 0.25s | Instant (L2) |
| Optimism | 10 | 1 | 2s | Instant (L2) |
| Avalanche | 43114 | 1 | 2s | Instant |
| Base | 8453 | 1 | 2s | Instant (L2) |

### 6.4 Recovery ("Death Certificate") Mechanism

**SyncHealthMonitor** severity levels:

| Level | Condition | Auto-Action |
|---|---|---|
| `healthy` | blocks_behind < 5, no gaps, WS connected | None |
| `degraded` | blocks_behind 5-50 OR unresolved gaps < 100 blocks | Increase polling frequency |
| `critical` | blocks_behind > 50 OR unresolved gaps > 100 blocks | Restart WebSocket, trigger backfill |
| `dead` | No blocks processed in 5 minutes | Alert admin, switch to polling, trigger full recovery |

### 6.5 API Endpoints

```
GET  /admin/sync/health                    — Per-chain sync status
GET  /admin/sync/gaps                      — List all sync gaps
POST /admin/sync/gaps/:id/retry            — Retry gap backfill
POST /admin/sync/chains/:chainId/reindex   — Trigger reindex for range
GET  /admin/sync/reorgs                    — Reorg history
GET  /client/v1/balances                   — Materialized balances (from DB)
GET  /client/v1/transactions               — Indexed events for client
```

---

## 7. Phase 5: Webhooks v2

### 7.1 Schema Changes — `cvh_notifications`

```sql
-- Enhance webhooks table
ALTER TABLE `webhooks`
  ADD COLUMN `project_id`            BIGINT NOT NULL AFTER `client_id`,
  ADD COLUMN `retry_max_attempts`    INT NOT NULL DEFAULT 5,
  ADD COLUMN `retry_backoff_type`    ENUM('exponential','linear','fixed') NOT NULL DEFAULT 'exponential',
  ADD COLUMN `retry_backoff_base_ms` INT NOT NULL DEFAULT 1000,
  ADD COLUMN `retry_backoff_max_ms`  INT NOT NULL DEFAULT 3600000,
  ADD COLUMN `retry_jitter`          TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `retry_timeout_ms`      INT NOT NULL DEFAULT 10000,
  ADD COLUMN `retry_on_status_codes` JSON DEFAULT '["500","502","503","504","408","429"]',
  ADD COLUMN `fail_on_status_codes`  JSON DEFAULT '["400","401","403","404"]',
  ADD COLUMN `description`           TEXT NULL,
  ADD INDEX `idx_client_project` (`client_id`, `project_id`);

-- Enhance webhook_deliveries table
ALTER TABLE `webhook_deliveries`
  ADD COLUMN `project_id`         BIGINT NOT NULL AFTER `client_id`,
  ADD COLUMN `correlation_id`     VARCHAR(255) NULL,
  ADD COLUMN `idempotency_key`    VARCHAR(255) NULL,
  ADD COLUMN `request_url`        VARCHAR(2048) NULL,
  ADD COLUMN `request_headers`    JSON NULL,
  ADD COLUMN `response_headers`   JSON NULL,
  ADD COLUMN `response_time_ms`   INT NULL,
  ADD COLUMN `error_message`      TEXT NULL,
  ADD COLUMN `error_code`         VARCHAR(50) NULL,
  ADD COLUMN `is_manual_resend`   TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `original_delivery_id` BIGINT NULL,
  ADD UNIQUE KEY `uq_idempotency` (`idempotency_key`),
  ADD INDEX `idx_client_project_status` (`client_id`, `project_id`, `event_type`, `status`, `created_at`),
  ADD INDEX `idx_retry` (`status`, `next_retry_at`);

-- New: webhook_delivery_attempts
CREATE TABLE `webhook_delivery_attempts` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `delivery_id`     BIGINT        NOT NULL,
  `attempt_number`  INT           NOT NULL,
  `status`          ENUM('success','failed','timeout','error') NOT NULL,
  `request_url`     VARCHAR(2048) NOT NULL,
  `request_headers` JSON          NULL,
  `request_body`    JSON          NULL,
  `response_status` INT           NULL,
  `response_headers` JSON         NULL,
  `response_body`   TEXT          NULL,
  `response_time_ms` INT          NULL,
  `error_message`   TEXT          NULL,
  `error_code`      VARCHAR(50)   NULL,
  `timestamp`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_delivery` (`delivery_id`, `attempt_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- New: webhook_dead_letters
CREATE TABLE `webhook_dead_letters` (
  `id`                  BIGINT       NOT NULL AUTO_INCREMENT,
  `delivery_id`         BIGINT       NOT NULL,
  `webhook_id`          BIGINT       NOT NULL,
  `client_id`           BIGINT       NOT NULL,
  `project_id`          BIGINT       NOT NULL,
  `event_type`          VARCHAR(100) NOT NULL,
  `payload`             JSON         NOT NULL,
  `last_error`          TEXT         NULL,
  `total_attempts`      INT          NOT NULL,
  `dead_lettered_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status`              ENUM('pending_review','resent','discarded') NOT NULL DEFAULT 'pending_review',
  `resent_at`           DATETIME(3)  NULL,
  `resent_delivery_id`  BIGINT       NULL,
  `reviewed_by`         BIGINT       NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `status`),
  INDEX `idx_event_time` (`event_type`, `dead_lettered_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.2 API Endpoints

```
-- Client API
GET    /client/v1/webhooks/:id/deliveries                 — Delivery history
GET    /client/v1/webhooks/deliveries/:deliveryId         — Delivery detail + attempts
POST   /client/v1/webhooks/deliveries/:deliveryId/resend  — Manual resend
POST   /client/v1/webhooks/deliveries/batch-resend        — Batch resend
GET    /client/v1/webhooks/dead-letters                   — DLQ list
PATCH  /client/v1/webhooks/:id                            — Update retry config

-- Admin API
GET    /admin/webhooks/deliveries          — All deliveries (cross-client)
POST   /admin/webhooks/deliveries/:id/resend
POST   /admin/webhooks/deliveries/batch-resend
GET    /admin/webhooks/dead-letters
GET    /admin/webhooks/stats               — Success rate, avg response time, DLQ depth
```

---

## 8. Phase 6: Flush Operations

### 8.1 Database Schema — `cvh_wallets`

```sql
CREATE TABLE `flush_operations` (
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
  `batch_tx_hashes`   JSON          NULL,
  `error_message`     TEXT          NULL,
  `dry_run_result`    JSON          NULL,
  `filters_applied`   JSON          NULL,
  `started_at`        DATETIME(3)   NULL,
  `completed_at`      DATETIME(3)   NULL,
  `created_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_operation_uid` (`operation_uid`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `status`, `created_at`),
  INDEX `idx_chain_type` (`chain_id`, `operation_type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `flush_items` (
  `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
  `operation_id`       BIGINT        NOT NULL,
  `deposit_address_id` BIGINT        NOT NULL,
  `address`            VARCHAR(42)   NOT NULL,
  `status`             ENUM('pending','processing','succeeded','failed','skipped') NOT NULL DEFAULT 'pending',
  `token_id`           BIGINT        NULL,
  `amount_before`      DECIMAL(78,0) NULL,
  `amount_flushed`     DECIMAL(78,0) NULL,
  `tx_hash`            VARCHAR(66)   NULL,
  `gas_cost`           DECIMAL(78,0) NULL,
  `error_message`      TEXT          NULL,
  `processed_at`       DATETIME(3)   NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_operation` (`operation_id`, `status`),
  INDEX `idx_address` (`deposit_address_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 8.2 API Endpoints

```
-- Client API
POST   /client/v1/flush/tokens              — Trigger token flush
POST   /client/v1/flush/native              — Trigger native sweep
POST   /client/v1/flush/dry-run             — Simulate without executing
GET    /client/v1/flush/operations           — List flush operations
GET    /client/v1/flush/operations/:id       — Detail with items
POST   /client/v1/flush/operations/:id/cancel — Cancel pending

-- Admin API (same + cross-client)
POST   /admin/flush/global                   — Flush across clients with filters
```

### 8.3 Flush Guard (Concurrency Protection)

```typescript
// Redis-based lock per address to prevent concurrent flushes
const lockKey = `flush:lock:${chainId}:${address}`;
const acquired = await redis.set(lockKey, operationId, 'EX', 300, 'NX');
if (!acquired) throw new ConflictException('Flush already in progress for this address');
```

---

## 9. Phase 7: Deploy Traceability & Multi-Chain Addresses

### 9.1 Deploy Traces — `cvh_transactions`

```sql
CREATE TABLE `deploy_traces` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `client_id`        BIGINT        NOT NULL,
  `project_id`       BIGINT        NOT NULL,
  `chain_id`         INT           NOT NULL,
  `resource_type`    ENUM('wallet','forwarder','factory','token_contract') NOT NULL,
  `resource_id`      BIGINT        NOT NULL,
  `address`          VARCHAR(42)   NOT NULL,
  `tx_hash`          VARCHAR(66)   NOT NULL,
  `block_number`     BIGINT        NOT NULL,
  `block_hash`       VARCHAR(66)   NULL,
  `block_timestamp`  BIGINT        NULL,
  `deployer_address` VARCHAR(42)   NULL,
  `factory_address`  VARCHAR(42)   NULL,
  `salt`             VARCHAR(66)   NULL,
  `init_code_hash`   VARCHAR(66)   NULL,
  `gas_used`         BIGINT        NULL,
  `gas_price`        BIGINT        NULL,
  `gas_cost_wei`     DECIMAL(78,0) NULL,
  `rpc_provider_id`  BIGINT        NULL,
  `rpc_node_id`      BIGINT        NULL,
  `explorer_url`     VARCHAR(512)  NOT NULL,
  `correlation_id`   VARCHAR(255)  NULL,
  `triggered_by`     BIGINT        NULL,
  `trigger_type`     ENUM('user','system','automated') NOT NULL DEFAULT 'system',
  `event_logs`       JSON          NULL,
  `metadata`         JSON          NULL,
  `created_at`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `resource_type`),
  INDEX `idx_chain_tx` (`chain_id`, `tx_hash`),
  INDEX `idx_address` (`address`),
  INDEX `idx_correlation` (`correlation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 9.2 Multi-Chain Address Groups — `cvh_wallets`

```sql
CREATE TABLE `address_groups` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `group_uid`        VARCHAR(255) NOT NULL,
  `client_id`        BIGINT       NOT NULL,
  `project_id`       BIGINT       NOT NULL,
  `external_id`      VARCHAR(255) NULL,
  `label`            VARCHAR(255) NULL,
  `derivation_salt`  VARCHAR(66)  NOT NULL,
  `computed_address`  VARCHAR(42)  NOT NULL,
  `status`           ENUM('active','disabled') NOT NULL DEFAULT 'active',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_uid` (`group_uid`),
  UNIQUE KEY `uq_client_salt` (`client_id`, `derivation_salt`),
  INDEX `idx_client_project` (`client_id`, `project_id`),
  INDEX `idx_address` (`computed_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add to deposit_addresses
ALTER TABLE `deposit_addresses`
  ADD COLUMN `project_id`        BIGINT NULL AFTER `client_id`,
  ADD COLUMN `address_group_id`  BIGINT NULL,
  ADD COLUMN `deploy_trace_id`   BIGINT NULL;
```

### 9.3 Multi-Chain Flow

1. Client calls `POST /client/v1/address-groups` with `externalId` (depositor reference)
2. System generates deterministic salt: `keccak256(clientId + projectId + index)`
3. Computes CREATE2 address: `keccak256(0xff ++ factoryAddress ++ salt ++ initCodeHash)`
4. Creates `address_groups` record with `computed_address`
5. Client calls `POST /client/v1/address-groups/:id/provision` with `chainIds: [1, 56, 137]`
6. System creates `deposit_addresses` records for each chain, all linked to the same group
7. Same address across all chains (factory deployed at same address on each chain)

### 9.4 API Endpoints

```
POST   /client/v1/address-groups                  — Create group (compute address)
POST   /client/v1/address-groups/:id/provision     — Provision on chain(s)
GET    /client/v1/address-groups                   — List groups with chain status
GET    /client/v1/address-groups/:id               — Group detail
GET    /client/v1/deploy-traces                    — Deploy trace history
GET    /client/v1/deploy-traces/:id                — Trace detail + event logs
```

---

## 10. Phase 8: Export System

### 10.1 Database Schema — `cvh_exports` (New Database)

```sql
CREATE DATABASE IF NOT EXISTS `cvh_exports` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cvh_exports`;

CREATE TABLE `export_requests` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `request_uid`    VARCHAR(255) NOT NULL,
  `client_id`      BIGINT       NULL,
  `project_id`     BIGINT       NULL,
  `requested_by`   BIGINT       NOT NULL,
  `is_admin_export` TINYINT(1)  NOT NULL DEFAULT 0,
  `export_type`    ENUM('transactions','deposits','withdrawals','flush_operations','webhooks','webhook_failures','audit_logs','events','balances') NOT NULL,
  `format`         ENUM('csv','xlsx','json') NOT NULL,
  `filters`        JSON         NOT NULL,
  `status`         ENUM('pending','processing','completed','failed','expired') NOT NULL DEFAULT 'pending',
  `total_rows`     INT          NULL,
  `file_size_bytes` BIGINT      NULL,
  `file_path`      VARCHAR(512) NULL,
  `download_url`   VARCHAR(1024) NULL,
  `download_count` INT          NOT NULL DEFAULT 0,
  `max_downloads`  INT          NOT NULL DEFAULT 10,
  `expires_at`     DATETIME(3)  NULL,
  `job_id`         BIGINT       NULL,
  `error_message`  TEXT         NULL,
  `started_at`     DATETIME(3)  NULL,
  `completed_at`   DATETIME(3)  NULL,
  `created_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_uid` (`request_uid`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `status`),
  INDEX `idx_requested_by` (`requested_by`, `created_at`),
  INDEX `idx_expires` (`status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `export_files` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `export_request_id` BIGINT      NOT NULL,
  `file_name`        VARCHAR(255) NOT NULL,
  `file_path`        VARCHAR(512) NOT NULL,
  `file_size_bytes`  BIGINT       NOT NULL,
  `mime_type`        VARCHAR(100) NOT NULL,
  `checksum_sha256`  VARCHAR(64)  NOT NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_request` (`export_request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `export_templates` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`         BIGINT       NULL,
  `project_id`        BIGINT       NULL,
  `name`              VARCHAR(255) NOT NULL,
  `export_type`       ENUM('transactions','deposits','withdrawals','flush_operations','webhooks','webhook_failures','audit_logs','events','balances') NOT NULL,
  `filters`           JSON         NOT NULL,
  `format`            ENUM('csv','xlsx','json') NOT NULL,
  `is_system_template` TINYINT(1)  NOT NULL DEFAULT 0,
  `created_by`        BIGINT       NOT NULL,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 10.2 Export Flow

1. Client/Admin calls `POST /exports` with type, format, filters
2. Service estimates row count (COUNT query)
3. If rows < 1000: sync export, return file directly
4. If rows >= 1000: create job in `cvh_jobs`, return `export_request.id`
5. Worker streams query results to temp file (CSV/XLSX/JSON)
6. On completion: store file, update status, notify via webhook/email
7. Client downloads via `GET /exports/:id/download`
8. Cleanup job removes expired files

### 10.3 API Endpoints

```
POST   /client/v1/exports                  — Request export
GET    /client/v1/exports                  — List export requests
GET    /client/v1/exports/:id              — Export status
GET    /client/v1/exports/:id/download     — Download file
GET    /client/v1/export-templates         — List templates
POST   /client/v1/export-templates         — Save template

-- Admin equivalents for all above (cross-client)
```

---

## 11. Phase 9: Admin Impersonation

### 11.1 Database Schema — `cvh_auth`

```sql
CREATE TABLE `impersonation_sessions` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `admin_user_id`    BIGINT       NOT NULL,
  `target_client_id` BIGINT       NOT NULL,
  `target_project_id` BIGINT     NULL,
  `mode`             ENUM('read_only','support','full_operational') NOT NULL DEFAULT 'read_only',
  `started_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at`         DATETIME(3)  NULL,
  `ip_address`       VARCHAR(45)  NULL,
  `user_agent`       VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_admin` (`admin_user_id`, `started_at` DESC),
  INDEX `idx_target` (`target_client_id`, `target_project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `impersonation_audit` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `session_id`        BIGINT       NOT NULL,
  `admin_user_id`     BIGINT       NOT NULL,
  `target_client_id`  BIGINT       NOT NULL,
  `target_project_id` BIGINT       NULL,
  `action`            VARCHAR(200) NOT NULL,
  `resource_type`     VARCHAR(100) NULL,
  `resource_id`       VARCHAR(100) NULL,
  `request_method`    VARCHAR(10)  NOT NULL,
  `request_path`      VARCHAR(500) NOT NULL,
  `request_body_hash` VARCHAR(64)  NULL,
  `ip_address`        VARCHAR(45)  NULL,
  `timestamp`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_session` (`session_id`),
  INDEX `idx_admin_time` (`admin_user_id`, `timestamp` DESC),
  INDEX `idx_target_time` (`target_client_id`, `timestamp` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 11.2 Impersonation Flow

1. Admin selects client from dropdown → `POST /auth/impersonate`
2. Auth service creates `impersonation_sessions` record
3. Returns impersonation JWT with claims: `{ adminUserId, targetClientId, targetProjectId, mode }`
4. Admin app stores impersonation token, displays client context
5. All subsequent requests include impersonation context
6. `ImpersonationGuard` validates mode permissions before allowing actions
7. Every action creates `impersonation_audit` record
8. Admin ends session → `POST /auth/impersonate/end`

### 11.3 Permission Matrix

| Action | read_only | support | full_operational |
|---|---|---|---|
| View client data | Yes | Yes | Yes |
| View balances/transactions | Yes | Yes | Yes |
| Retry webhooks | No | Yes | Yes |
| Resend webhooks | No | Yes | Yes |
| Trigger flush | No | No | Yes |
| Create/modify webhooks | No | No | Yes |
| Manage API keys | No | No | Yes |
| Create/modify projects | No | No | Yes |

### 11.4 API Endpoints

```
POST   /auth/impersonate          — Start impersonation session
POST   /auth/impersonate/end      — End session
GET    /admin/impersonation/sessions  — List sessions (audit)
GET    /admin/impersonation/audit     — Audit trail
```

### 11.5 Frontend

**Admin header dropdown structure**:
```
[Administration ▾]          ← default mode
─────────────────
[Client A]
[Client B]
[Client C]                  ← clicking enters impersonation
```

When impersonating:
```
[🔶 Viewing: Client A ▾] [Project: Default ▾] [Mode: read_only] [Exit ✕]
```

Visual indicators:
- `read_only`: orange top banner
- `support`: amber top banner
- `full_operational`: red top banner with warning text

---

## 12. Phase 10: UX Components

### 12.1 Enhanced JsonViewer Component

**File**: `packages/ui/components/json-viewer.tsx` (shared between admin and client)

**Props**:
```typescript
interface JsonViewerProps {
  data: unknown;
  title?: string;
  maxHeight?: string;           // default: '400px'
  showLineNumbers?: boolean;    // default: true
  showCopyButton?: boolean;     // default: true
  showDownload?: boolean;       // default: false
  showSearch?: boolean;         // default: false
  collapsedByDefault?: boolean; // default: false (collapse nested > 2 levels)
  collapsedDepth?: number;      // default: 2
}
```

**Features**:
- Expand/collapse for nested objects and arrays (click on `{...}` or `[...]`)
- Copy button with checkmark animation feedback (1.5s)
- Download as `.json` file
- Syntax highlighting: gold keys, green strings, blue numbers, amber booleans, muted null
- Line numbers
- Search within JSON (Ctrl+F overlay)
- Breadcrumb path when navigating nested objects
- Click-to-copy individual values
- Monospace font (JetBrains Mono)

### 12.2 Status Badges

Consistent badge system across all tables:

| Status | Color | Background |
|---|---|---|
| active, succeeded, delivered, healthy, synced | #2EBD85 | rgba(46,189,133,0.1) |
| pending, queued, processing, syncing | #E2A828 | rgba(226,168,40,0.1) |
| failed, error, dead, unhealthy | #F6465D | rgba(246,70,93,0.1) |
| canceled, disabled, archived, standby | #858A9B | rgba(133,138,155,0.1) |
| draining, partially_succeeded, degraded | #F5A623 | rgba(245,166,35,0.1) |

---

## 13. Migration Strategy

### 13.1 Migration File Sequence

```
database/
  013-create-projects.sql           — Phase 1: projects table
  014-add-project-id.sql            — Phase 1: project_id columns + backfill
  015-rpc-providers.sql             — Phase 2: provider management tables
  016-create-cvh-jobs.sql           — Phase 3: jobs database + tables
  017-indexer-v2.sql                — Phase 4: indexer enhancement tables
  018-webhooks-v2.sql               — Phase 5: webhook enhancement + new tables
  019-flush-operations.sql          — Phase 6: flush tables
  020-deploy-traces.sql             — Phase 7: traceability + address groups
  021-create-cvh-exports.sql        — Phase 8: exports database + tables
  022-impersonation.sql             — Phase 9: impersonation tables
  023-performance-indexes-v2.sql    — Phase 10: additional indexes
```

### 13.2 Rollout Order

1. Run migrations 013-014 (foundation)
2. Deploy updated auth-service + client-api (project context support)
3. Deploy updated admin-api (project management)
4. Deploy frontend with project selector
5. Run migration 015, deploy rpc-gateway-service
6. Run migration 016, deploy updated cron-worker-service
7. Run migration 017, deploy updated chain-indexer-service
8. Run migrations 018-019, deploy updated notification-service
9. Run migrations 020-021, deploy updated core-wallet-service
10. Run migration 022, deploy impersonation support
11. Run migration 023, performance tuning

### 13.3 Backward Compatibility

- `X-Project-Id` header is optional during migration period (single-project clients get implicit default)
- Old API keys continue working (backfilled with default project)
- Existing webhook configurations preserved (new retry fields have sensible defaults)
- Existing sweep jobs continue unchanged (automated mode)

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `project_id` backfill on large tables causes lock contention | High | Run ALTER + UPDATE in batches during low-traffic window; use pt-online-schema-change if needed |
| RPC gateway becomes single point of failure | High | Deploy multiple instances with Redis-shared state; health check from Kong |
| Reorg handling corrupts materialized balances | Medium | Only materialize after finality threshold; reconciliation job detects divergence |
| Factory address not deterministic across chains | Medium | Use deterministic deployer (0x4e59b44847b379578588920ca78fbf26c0b4956c); verify before production |
| Queue backlog during provider outage | Medium | Dead letter queue; backpressure; rate limiting; priority queues |
| Export of large datasets causes OOM | Low | Stream to file, never load full dataset in memory; chunk processing |
| Impersonation privilege escalation | Medium | Strict role check; audit every action; time-limited sessions |

---

## Summary: New Components Created

| Type | Count | Details |
|---|---|---|
| **New service** | 1 | rpc-gateway-service |
| **New databases** | 2 | cvh_jobs, cvh_exports |
| **New tables** | ~25 | See each phase |
| **Modified tables** | ~13 | project_id + enhancements |
| **New API endpoints** | ~50 | Across all services |
| **New frontend pages** | ~8 | Provider mgmt, jobs, sync health, exports, etc. |
| **New frontend components** | ~15 | Project selector, impersonation dropdown, JsonViewer v2, flush UI, etc. |
| **Migration files** | 11 | 013 through 023 |
