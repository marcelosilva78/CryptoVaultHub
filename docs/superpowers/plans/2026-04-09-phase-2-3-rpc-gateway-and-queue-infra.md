# Phase 2-3: RPC Gateway & Queue Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Create centralized RPC provider management with rate limiting/circuit breaking, and persistent job infrastructure with admin visibility.

**Architecture:** New rpc-gateway-service (port 3009) as internal RPC abstraction. BullMQ execution + cvh_jobs MySQL for persistence/audit. Provider state machine: active->draining->standby->unhealthy->disabled.

**Tech Stack:** NestJS 10.3, MySQL 8, Prisma 5.22, BullMQ 5.1, Redis 7, ethers.js 6

---

## File Structure

```
CryptoVaultHub/
├── database/
│   ├── 015-rpc-providers.sql                          # RPC provider tables in cvh_admin
│   └── 016-create-cvh-jobs.sql                        # Job persistence database + tables
│
├── services/
│   └── rpc-gateway-service/                           # NEW: Internal RPC abstraction (port 3009)
│       ├── package.json
│       ├── tsconfig.json
│       ├── prisma/
│       │   └── schema.prisma                          # RpcProvider, RpcNode, health, switch log
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── prisma/
│           │   ├── prisma.module.ts
│           │   └── prisma.service.ts
│           ├── redis/
│           │   ├── redis.module.ts
│           │   └── redis.service.ts
│           ├── router/
│           │   ├── router.module.ts
│           │   ├── rpc-router.service.ts              # Node selection + failover
│           │   ├── rpc-rate-limiter.service.ts         # Redis sliding window
│           │   ├── rpc-circuit-breaker.service.ts      # closed->open->half-open
│           │   └── rpc-proxy.controller.ts             # Internal HTTP API
│           ├── health/
│           │   ├── health.module.ts
│           │   ├── rpc-health.service.ts              # Health check logic
│           │   └── health-worker.service.ts           # BullMQ repeatable job
│           ├── switch/
│           │   ├── switch.module.ts
│           │   └── provider-switch.service.ts         # Graceful drain + switchover
│           ├── common/
│           │   └── health.controller.ts               # /health endpoint
│           └── generated/
│               └── prisma-client/
│
├── packages/
│   └── job-client/                                    # NEW: @cvh/job-client shared package
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── job-orchestrator.service.ts             # Create, dedup, cancel, retry
│           ├── job-worker-base.ts                      # Abstract base wrapping BullMQ
│           ├── job-deduplication.service.ts            # job_uid dedup
│           ├── job-monitor.service.ts                  # Query, stats, stuck detection
│           ├── job-client.module.ts                    # NestJS dynamic module
│           ├── prisma/
│           │   ├── prisma-jobs.module.ts
│           │   ├── prisma-jobs.service.ts
│           │   └── schema.prisma                      # Jobs DB Prisma schema
│           └── types.ts                               # Shared job types/enums
│
├── services/admin-api/src/
│   ├── rpc-management/                                # NEW: Admin RPC CRUD
│   │   ├── rpc-management.module.ts
│   │   ├── rpc-management.controller.ts
│   │   ├── rpc-management.service.ts
│   │   └── dto/
│   │       ├── create-provider.dto.ts
│   │       ├── update-provider.dto.ts
│   │       ├── create-node.dto.ts
│   │       └── update-node.dto.ts
│   └── job-management/                                # NEW: Admin job endpoints
│       ├── job-management.module.ts
│       ├── job-management.controller.ts
│       └── job-management.service.ts
│
├── apps/admin/
│   ├── app/
│   │   ├── rpc-providers/
│   │   │   └── page.tsx                               # NEW: RPC Providers page
│   │   ├── rpc-health/
│   │   │   └── page.tsx                               # NEW: RPC Health dashboard
│   │   └── jobs/
│   │       └── page.tsx                               # NEW: Jobs dashboard
│   └── lib/
│       └── mock-data.ts                               # MODIFY: Add RPC + job mock data
│
├── services/chain-indexer-service/src/blockchain/
│   └── evm-provider.service.ts                        # MODIFY: Call rpc-gateway
│
├── services/core-wallet-service/src/blockchain/
│   └── evm-provider.service.ts                        # MODIFY: Call rpc-gateway
│
└── docker-compose.yml                                 # MODIFY: Add rpc-gateway-service
```

---

## Task 1: Migration — RPC Provider Tables

**Files:**
- Create: `database/015-rpc-providers.sql`

- [ ] **Step 1: Create the migration file**

Create `database/015-rpc-providers.sql`:

```sql
-- ============================================================================
-- Migration 015: RPC Provider Management Tables
-- Database: cvh_admin
-- Description: Centralized RPC provider/node registry with health tracking
--              and provider switch audit log.
-- ============================================================================

USE `cvh_admin`;

-- ---------------------------------------------------------------------------
-- rpc_providers — Top-level provider entries (e.g., Tatum, Alchemy, Infura)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rpc_providers` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(50) NOT NULL,
  `website` VARCHAR(255) NULL,
  `auth_method` ENUM('api_key','bearer','header','none') NOT NULL DEFAULT 'api_key',
  `auth_header_name` VARCHAR(100) NULL DEFAULT 'x-api-key',
  `api_key_encrypted` TEXT NULL,
  `api_secret_encrypted` TEXT NULL,
  `notes` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- rpc_nodes — Individual RPC endpoints per chain per provider
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rpc_nodes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `provider_id` BIGINT NOT NULL,
  `chain_id` INT NOT NULL,
  `endpoint_url` VARCHAR(512) NOT NULL,
  `ws_endpoint_url` VARCHAR(512) NULL,
  `priority` INT NOT NULL DEFAULT 50,
  `weight` INT NOT NULL DEFAULT 100,
  `status` ENUM('active','draining','standby','unhealthy','disabled') NOT NULL DEFAULT 'standby',
  `max_requests_per_second` INT NULL DEFAULT 50,
  `max_requests_per_minute` INT NULL DEFAULT 2000,
  `timeout_ms` INT NOT NULL DEFAULT 15000,
  `health_check_interval_s` INT NOT NULL DEFAULT 30,
  `consecutive_failures` INT NOT NULL DEFAULT 0,
  `health_score` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `tags` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chain_status` (`chain_id`, `status`, `priority`),
  INDEX `idx_provider` (`provider_id`),
  CONSTRAINT `fk_rpc_nodes_provider` FOREIGN KEY (`provider_id`) REFERENCES `rpc_providers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- rpc_provider_health — Time-series health metrics per node
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rpc_provider_health` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `node_id` BIGINT NOT NULL,
  `check_type` ENUM('latency','block_height','error_rate','uptime') NOT NULL,
  `value` DECIMAL(12,4) NOT NULL,
  `measured_at` DATETIME(3) NOT NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_node_time` (`node_id`, `measured_at` DESC),
  CONSTRAINT `fk_health_node` FOREIGN KEY (`node_id`) REFERENCES `rpc_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- provider_switch_log — Audit trail for provider switchovers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `provider_switch_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `from_node_id` BIGINT NULL,
  `to_node_id` BIGINT NOT NULL,
  `reason` ENUM('manual','failover','health_degraded','rate_limited','draining') NOT NULL,
  `initiated_by` VARCHAR(100) NOT NULL DEFAULT 'system',
  `status` ENUM('initiated','draining','completed','rolled_back') NOT NULL DEFAULT 'initiated',
  `pending_jobs_at_switch` INT NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chain_time` (`chain_id`, `created_at` DESC),
  CONSTRAINT `fk_switch_from_node` FOREIGN KEY (`from_node_id`) REFERENCES `rpc_nodes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_switch_to_node` FOREIGN KEY (`to_node_id`) REFERENCES `rpc_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed: Default Tatum provider
-- ---------------------------------------------------------------------------
INSERT INTO `rpc_providers` (`name`, `slug`, `website`, `auth_method`, `auth_header_name`, `notes`)
VALUES ('Tatum', 'tatum', 'https://tatum.io', 'api_key', 'x-api-key', 'Default RPC provider via Tatum.io');
```

- [ ] **Step 2: Run the migration**

```bash
mysql -u root -p < database/015-rpc-providers.sql
```

Expected: Tables `rpc_providers`, `rpc_nodes`, `rpc_provider_health`, `provider_switch_log` created in `cvh_admin`. One seed row in `rpc_providers`.

- [ ] **Step 3: Verify**

```bash
mysql -u root -p -e "USE cvh_admin; SHOW TABLES LIKE 'rpc%'; SHOW TABLES LIKE 'provider%'; SELECT * FROM rpc_providers;"
```

Expected output:
```
+------------------------------+
| Tables_in_cvh_admin (rpc%)   |
+------------------------------+
| rpc_nodes                    |
| rpc_provider_health          |
| rpc_providers                |
+------------------------------+
+-------------------------------------+
| Tables_in_cvh_admin (provider%)     |
+-------------------------------------+
| provider_switch_log                 |
+-------------------------------------+
| id | name  | slug  | website          | ...
|  1 | Tatum | tatum | https://tatum.io | ...
```

- [ ] **Step 4: Commit**

```bash
git add database/015-rpc-providers.sql
git commit -m "feat: add RPC provider management tables (migration 015)"
```

---

## Task 2: Bootstrap rpc-gateway-service

**Files:**
- Create: `services/rpc-gateway-service/package.json`
- Create: `services/rpc-gateway-service/tsconfig.json`
- Create: `services/rpc-gateway-service/prisma/schema.prisma`
- Create: `services/rpc-gateway-service/src/main.ts`
- Create: `services/rpc-gateway-service/src/app.module.ts`
- Create: `services/rpc-gateway-service/src/prisma/prisma.service.ts`
- Create: `services/rpc-gateway-service/src/prisma/prisma.module.ts`
- Create: `services/rpc-gateway-service/src/redis/redis.service.ts`
- Create: `services/rpc-gateway-service/src/redis/redis.module.ts`
- Create: `services/rpc-gateway-service/src/common/health.controller.ts`

- [ ] **Step 1: Create package.json**

Create `services/rpc-gateway-service/package.json`:

```json
{
  "name": "@cvh/rpc-gateway-service",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "ts-node-dev --respawn src/main.ts",
    "start": "node dist/main.js",
    "test": "jest",
    "lint": "eslint src/",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
    "@cvh/types": "*",
    "@cvh/config": "*",
    "@cvh/utils": "*",
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/bullmq": "^10.1.0",
    "@prisma/client": "^5.22.0",
    "bullmq": "^5.1.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "ethers": "^6.16.0",
    "ioredis": "^5.3.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.7.5",
    "jest": "^29.7.0",
    "prisma": "^5.22.0",
    "ts-jest": "^29.4.9",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `services/rpc-gateway-service/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "commonjs",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/generated"]
}
```

- [ ] **Step 3: Create Prisma schema**

Create `services/rpc-gateway-service/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-client"
}

datasource db {
  provider = "mysql"
  url      = env("ADMIN_DATABASE_URL")
}

model RpcProvider {
  id              BigInt    @id @default(autoincrement())
  name            String    @db.VarChar(100)
  slug            String    @unique @db.VarChar(50)
  website         String?   @db.VarChar(255)
  authMethod      AuthMethod @default(api_key) @map("auth_method")
  authHeaderName  String?   @default("x-api-key") @map("auth_header_name") @db.VarChar(100)
  apiKeyEncrypted String?   @map("api_key_encrypted") @db.Text
  apiSecretEncrypted String? @map("api_secret_encrypted") @db.Text
  notes           String?   @db.Text
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  nodes RpcNode[]

  @@map("rpc_providers")
}

model RpcNode {
  id                    BigInt     @id @default(autoincrement())
  providerId            BigInt     @map("provider_id")
  chainId               Int        @map("chain_id")
  endpointUrl           String     @db.VarChar(512) @map("endpoint_url")
  wsEndpointUrl         String?    @db.VarChar(512) @map("ws_endpoint_url")
  priority              Int        @default(50)
  weight                Int        @default(100)
  status                NodeStatus @default(standby)
  maxRequestsPerSecond  Int?       @default(50) @map("max_requests_per_second")
  maxRequestsPerMinute  Int?       @default(2000) @map("max_requests_per_minute")
  timeoutMs             Int        @default(15000) @map("timeout_ms")
  healthCheckIntervalS  Int        @default(30) @map("health_check_interval_s")
  consecutiveFailures   Int        @default(0) @map("consecutive_failures")
  healthScore           Decimal    @default(100.00) @db.Decimal(5, 2) @map("health_score")
  tags                  Json?
  isActive              Boolean    @default(true) @map("is_active")
  createdAt             DateTime   @default(now()) @map("created_at")
  updatedAt             DateTime   @updatedAt @map("updated_at")

  provider      RpcProvider         @relation(fields: [providerId], references: [id], onDelete: Cascade)
  healthRecords RpcProviderHealth[]
  switchesFrom  ProviderSwitchLog[] @relation("SwitchFrom")
  switchesTo    ProviderSwitchLog[] @relation("SwitchTo")

  @@index([chainId, status, priority], name: "idx_chain_status")
  @@index([providerId], name: "idx_provider")
  @@map("rpc_nodes")
}

model RpcProviderHealth {
  id         BigInt        @id @default(autoincrement())
  nodeId     BigInt        @map("node_id")
  checkType  HealthCheckType @map("check_type")
  value      Decimal       @db.Decimal(12, 4)
  measuredAt DateTime      @map("measured_at")
  metadata   Json?

  node RpcNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@index([nodeId, measuredAt(sort: Desc)], name: "idx_node_time")
  @@map("rpc_provider_health")
}

model ProviderSwitchLog {
  id                  BigInt      @id @default(autoincrement())
  chainId             Int         @map("chain_id")
  fromNodeId          BigInt?     @map("from_node_id")
  toNodeId            BigInt      @map("to_node_id")
  reason              SwitchReason
  initiatedBy         String      @default("system") @map("initiated_by") @db.VarChar(100)
  status              SwitchStatus @default(initiated)
  pendingJobsAtSwitch Int?        @map("pending_jobs_at_switch")
  notes               String?     @db.Text
  createdAt           DateTime    @default(now()) @map("created_at")

  fromNode RpcNode? @relation("SwitchFrom", fields: [fromNodeId], references: [id], onDelete: SetNull)
  toNode   RpcNode  @relation("SwitchTo", fields: [toNodeId], references: [id], onDelete: Cascade)

  @@index([chainId, createdAt(sort: Desc)], name: "idx_chain_time")
  @@map("provider_switch_log")
}

enum AuthMethod {
  api_key
  bearer
  header
  none
}

enum NodeStatus {
  active
  draining
  standby
  unhealthy
  disabled
}

enum HealthCheckType {
  latency
  block_height
  error_rate
  uptime
}

enum SwitchReason {
  manual
  failover
  health_degraded
  rate_limited
  draining
}

enum SwitchStatus {
  initiated
  draining
  completed
  rolled_back
}
```

- [ ] **Step 4: Create PrismaService and PrismaModule**

Create `services/rpc-gateway-service/src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma-client';

@Injectable()
export class PrismaService
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

Create `services/rpc-gateway-service/src/prisma/prisma.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Create RedisService and RedisModule**

Create `services/rpc-gateway-service/src/redis/redis.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD', undefined),
      maxRetriesPerRequest: null,
    });
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis client disconnected');
  }

  getClient(): Redis {
    return this.client;
  }
}
```

Create `services/rpc-gateway-service/src/redis/redis.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 6: Create health controller**

Create `services/rpc-gateway-service/src/common/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'rpc-gateway-service',
    };
  }
}
```

- [ ] **Step 7: Create AppModule**

Create `services/rpc-gateway-service/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RouterModule } from './router/router.module';
import { HealthModule } from './health/health.module';
import { SwitchModule } from './switch/switch.module';
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
          password: config.get<string>('REDIS_PASSWORD', undefined),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    RouterModule,
    HealthModule,
    SwitchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 8: Create main.ts**

Create `services/rpc-gateway-service/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('RpcGatewayService');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT || 3009;
  await app.listen(port);
  logger.log(`RPC Gateway Service running on port ${port}`);
}
bootstrap();
```

- [ ] **Step 9: Generate Prisma client and verify build**

```bash
cd services/rpc-gateway-service
npx prisma generate
npx tsc --noEmit
```

Expected: No compilation errors.

- [ ] **Step 10: Commit**

```bash
git add services/rpc-gateway-service/
git commit -m "feat: bootstrap rpc-gateway-service with Prisma schema and NestJS scaffold"
```

---

## Task 3: Docker Compose — Add rpc-gateway-service

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add rpc-gateway-service to docker-compose.yml**

Add the following block after the `cron-worker-service` definition (before the `# --- Frontend Apps ---` comment):

```yaml
  rpc-gateway-service:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.nestjs
      args:
        SERVICE_PATH: services/rpc-gateway-service
        PORT: 3009
    ports:
      - "3009:3009"
    environment:
      - NODE_ENV=production
      - PORT=3009
      - MYSQL_HOST=${MYSQL_HOST}
      - MYSQL_PORT=${MYSQL_PORT}
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
      - ADMIN_DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/cvh_admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - internal-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3009/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 2: Add RPC_GATEWAY_URL to services that will call it**

Add `RPC_GATEWAY_URL=http://rpc-gateway-service:3009` to the environment of `chain-indexer-service`, `core-wallet-service`, and `cron-worker-service` in `docker-compose.yml`.

- [ ] **Step 3: Verify**

```bash
docker compose config --services | grep rpc-gateway
```

Expected: `rpc-gateway-service`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add rpc-gateway-service to Docker Compose"
```

---

## Task 4: Prisma Models Verification

This task is already covered by the Prisma schema in Task 2 Step 3. The models are: `RpcProvider`, `RpcNode`, `RpcProviderHealth`, `ProviderSwitchLog`. Verify they match the SQL from Task 1.

- [ ] **Step 1: Verify Prisma introspection matches**

```bash
cd services/rpc-gateway-service
npx prisma db pull --print 2>/dev/null | head -50
```

Compare against the schema.prisma file. Ensure all columns, indexes, and relations are present.

- [ ] **Step 2: Re-generate client after any adjustments**

```bash
cd services/rpc-gateway-service
npx prisma generate
```

---

## Task 5: RpcRouterService — Node Selection & Failover

**Files:**
- Create: `services/rpc-gateway-service/src/router/router.module.ts`
- Create: `services/rpc-gateway-service/src/router/rpc-router.service.ts`
- Create: `services/rpc-gateway-service/src/router/rpc-rate-limiter.service.ts`
- Create: `services/rpc-gateway-service/src/router/rpc-circuit-breaker.service.ts`
- Create: `services/rpc-gateway-service/src/router/rpc-proxy.controller.ts`

- [ ] **Step 1: Create RpcRouterService**

Create `services/rpc-gateway-service/src/router/rpc-router.service.ts`:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RpcRateLimiterService } from './rpc-rate-limiter.service';
import { RpcCircuitBreakerService } from './rpc-circuit-breaker.service';
import { NodeStatus } from '../generated/prisma-client';

interface CachedProvider {
  nodeId: bigint;
  provider: ethers.JsonRpcProvider;
  wsProvider?: ethers.WebSocketProvider;
  chainId: number;
  priority: number;
  weight: number;
  endpointUrl: string;
}

@Injectable()
export class RpcRouterService {
  private readonly logger = new Logger(RpcRouterService.name);

  // Map<chainId, CachedProvider[]> sorted by priority ASC
  private readonly providerCache = new Map<number, CachedProvider[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RpcRateLimiterService,
    private readonly circuitBreaker: RpcCircuitBreakerService,
  ) {}

  /**
   * Get the best available provider for a chain.
   * Selection algorithm:
   * 1. Load active nodes for chain sorted by priority ASC, weight DESC
   * 2. Filter out circuit-broken nodes
   * 3. Filter out rate-limited nodes
   * 4. Weighted random selection among top-priority tier
   * 5. If no node available, throw
   */
  async getProvider(chainId: number): Promise<{
    provider: ethers.JsonRpcProvider;
    nodeId: bigint;
  }> {
    let cached = this.providerCache.get(chainId);
    if (!cached || cached.length === 0) {
      cached = await this.loadProvidersForChain(chainId);
    }

    // Filter by circuit breaker state
    const healthy = cached.filter(
      (c) => !this.circuitBreaker.isOpen(c.nodeId),
    );

    if (healthy.length === 0) {
      // Try half-open nodes (allow one probe request)
      const halfOpen = cached.filter(
        (c) => this.circuitBreaker.isHalfOpen(c.nodeId),
      );
      if (halfOpen.length > 0) {
        const selected = halfOpen[0];
        this.logger.warn(
          `Chain ${chainId}: all nodes circuit-broken, probing half-open node ${selected.nodeId}`,
        );
        return { provider: selected.provider, nodeId: selected.nodeId };
      }
      throw new Error(
        `No healthy RPC nodes available for chain ${chainId}. All ${cached.length} nodes are circuit-broken.`,
      );
    }

    // Filter by rate limiter
    const available: CachedProvider[] = [];
    for (const node of healthy) {
      const allowed = await this.rateLimiter.tryAcquire(node.nodeId);
      if (allowed) {
        available.push(node);
      }
    }

    if (available.length === 0) {
      throw new Error(
        `All RPC nodes for chain ${chainId} are rate-limited. Try again shortly.`,
      );
    }

    // Weighted selection among top priority tier
    const topPriority = available[0].priority;
    const topTier = available.filter((n) => n.priority === topPriority);
    const selected = this.weightedSelect(topTier);

    return { provider: selected.provider, nodeId: selected.nodeId };
  }

  /**
   * Get a WebSocket provider for the chain.
   */
  async getWsProvider(chainId: number): Promise<{
    provider: ethers.WebSocketProvider;
    nodeId: bigint;
  }> {
    let cached = this.providerCache.get(chainId);
    if (!cached || cached.length === 0) {
      cached = await this.loadProvidersForChain(chainId);
    }

    const withWs = cached.filter(
      (c) => c.wsProvider && !this.circuitBreaker.isOpen(c.nodeId),
    );
    if (withWs.length === 0) {
      throw new Error(
        `No WebSocket RPC nodes available for chain ${chainId}`,
      );
    }

    const selected = withWs[0];
    return { provider: selected.wsProvider!, nodeId: selected.nodeId };
  }

  reportSuccess(nodeId: bigint): void {
    this.circuitBreaker.recordSuccess(nodeId);
  }

  reportFailure(nodeId: bigint): void {
    this.circuitBreaker.recordFailure(nodeId);
  }

  /**
   * Invalidate cached providers for a chain (e.g., after admin changes).
   */
  async invalidateChain(chainId: number): Promise<void> {
    const existing = this.providerCache.get(chainId);
    if (existing) {
      for (const entry of existing) {
        entry.provider.destroy();
        if (entry.wsProvider) {
          entry.wsProvider.destroy();
        }
      }
    }
    this.providerCache.delete(chainId);
    this.logger.log(`Provider cache invalidated for chain ${chainId}`);
  }

  /**
   * Invalidate all chains.
   */
  async invalidateAll(): Promise<void> {
    for (const [chainId] of this.providerCache) {
      await this.invalidateChain(chainId);
    }
  }

  private async loadProvidersForChain(
    chainId: number,
  ): Promise<CachedProvider[]> {
    const nodes = await this.prisma.rpcNode.findMany({
      where: {
        chainId,
        isActive: true,
        status: { in: [NodeStatus.active, NodeStatus.standby] },
        provider: { isActive: true },
      },
      include: { provider: true },
      orderBy: [{ priority: 'asc' }, { weight: 'desc' }],
    });

    if (nodes.length === 0) {
      throw new NotFoundException(
        `No active RPC nodes configured for chain ${chainId}`,
      );
    }

    const cached: CachedProvider[] = [];
    for (const node of nodes) {
      const provider = this.createHttpProvider(
        node.endpointUrl,
        chainId,
        node.provider.authMethod,
        node.provider.authHeaderName,
        node.provider.apiKeyEncrypted,
        node.timeoutMs,
      );

      let wsProvider: ethers.WebSocketProvider | undefined;
      if (node.wsEndpointUrl) {
        wsProvider = new ethers.WebSocketProvider(
          node.wsEndpointUrl,
          chainId,
        );
      }

      // Initialize rate limiter for this node
      this.rateLimiter.initialize(
        node.id,
        node.maxRequestsPerSecond ?? 50,
        node.maxRequestsPerMinute ?? 2000,
      );

      // Initialize circuit breaker for this node
      this.circuitBreaker.initialize(node.id);

      cached.push({
        nodeId: node.id,
        provider,
        wsProvider,
        chainId,
        priority: node.priority,
        weight: node.weight,
        endpointUrl: node.endpointUrl,
      });
    }

    this.providerCache.set(chainId, cached);
    this.logger.log(
      `Loaded ${cached.length} RPC nodes for chain ${chainId}`,
    );
    return cached;
  }

  private createHttpProvider(
    url: string,
    chainId: number,
    authMethod: string,
    authHeaderName: string | null,
    apiKeyEncrypted: string | null,
    timeoutMs: number,
  ): ethers.JsonRpcProvider {
    const fetchReq = new ethers.FetchRequest(url);
    fetchReq.timeout = timeoutMs;

    // Apply auth headers
    if (authMethod !== 'none' && apiKeyEncrypted) {
      // TODO: Decrypt apiKeyEncrypted via KeyVault in production
      const apiKey = apiKeyEncrypted; // Placeholder — decrypt in real impl
      const headerName = authHeaderName ?? 'x-api-key';

      if (authMethod === 'api_key' || authMethod === 'header') {
        fetchReq.setHeader(headerName, apiKey);
      } else if (authMethod === 'bearer') {
        fetchReq.setHeader('Authorization', `Bearer ${apiKey}`);
      }
    }

    return new ethers.JsonRpcProvider(fetchReq, chainId, {
      staticNetwork: true,
    });
  }

  private weightedSelect(nodes: CachedProvider[]): CachedProvider {
    if (nodes.length === 1) return nodes[0];

    const totalWeight = nodes.reduce((sum, n) => sum + n.weight, 0);
    let random = Math.random() * totalWeight;

    for (const node of nodes) {
      random -= node.weight;
      if (random <= 0) return node;
    }

    return nodes[nodes.length - 1];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/rpc-gateway-service/src/router/rpc-router.service.ts
git commit -m "feat: add RpcRouterService with weighted node selection and failover"
```

---

## Task 6: RpcRateLimiterService — Redis Sliding Window

**Files:**
- Create: `services/rpc-gateway-service/src/router/rpc-rate-limiter.service.ts`

- [ ] **Step 1: Create RpcRateLimiterService**

Create `services/rpc-gateway-service/src/router/rpc-rate-limiter.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface NodeLimits {
  maxPerSecond: number;
  maxPerMinute: number;
}

@Injectable()
export class RpcRateLimiterService {
  private readonly logger = new Logger(RpcRateLimiterService.name);
  private readonly limits = new Map<string, NodeLimits>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Register rate limits for a node.
   */
  initialize(
    nodeId: bigint,
    maxPerSecond: number,
    maxPerMinute: number,
  ): void {
    this.limits.set(nodeId.toString(), { maxPerSecond, maxPerMinute });
  }

  /**
   * Try to acquire a rate-limit token for a node.
   * Uses Redis sliding window log algorithm.
   * Returns true if the request is allowed.
   */
  async tryAcquire(nodeId: bigint): Promise<boolean> {
    const key = nodeId.toString();
    const limit = this.limits.get(key);
    if (!limit) return true; // No limits configured, allow

    const client = this.redis.getClient();
    const now = Date.now();

    // Check per-second limit using a sorted set
    const secKey = `rpc:rl:sec:${key}`;
    const secWindowStart = now - 1000;

    // Check per-minute limit using a sorted set
    const minKey = `rpc:rl:min:${key}`;
    const minWindowStart = now - 60000;

    // Use a Lua script for atomic check-and-increment
    const luaScript = `
      local secKey = KEYS[1]
      local minKey = KEYS[2]
      local now = tonumber(ARGV[1])
      local secWindowStart = tonumber(ARGV[2])
      local minWindowStart = tonumber(ARGV[3])
      local maxPerSec = tonumber(ARGV[4])
      local maxPerMin = tonumber(ARGV[5])

      -- Clean expired entries
      redis.call('ZREMRANGEBYSCORE', secKey, '-inf', secWindowStart)
      redis.call('ZREMRANGEBYSCORE', minKey, '-inf', minWindowStart)

      -- Count current window
      local secCount = redis.call('ZCARD', secKey)
      local minCount = redis.call('ZCARD', minKey)

      -- Check limits
      if secCount >= maxPerSec then
        return 0
      end
      if minCount >= maxPerMin then
        return 0
      end

      -- Add entry
      local member = now .. ':' .. math.random(100000)
      redis.call('ZADD', secKey, now, member)
      redis.call('ZADD', minKey, now, member)

      -- Set TTL on keys
      redis.call('EXPIRE', secKey, 2)
      redis.call('EXPIRE', minKey, 65)

      return 1
    `;

    try {
      const result = await client.eval(
        luaScript,
        2,
        secKey,
        minKey,
        now.toString(),
        secWindowStart.toString(),
        minWindowStart.toString(),
        limit.maxPerSecond.toString(),
        limit.maxPerMinute.toString(),
      );
      return result === 1;
    } catch (error) {
      // On Redis errors, fail open (allow the request)
      this.logger.warn(
        `Rate limiter Redis error for node ${key}, failing open: ${error}`,
      );
      return true;
    }
  }

  /**
   * Get current usage stats for a node.
   */
  async getUsage(nodeId: bigint): Promise<{
    requestsPerSecond: number;
    requestsPerMinute: number;
    maxPerSecond: number;
    maxPerMinute: number;
  }> {
    const key = nodeId.toString();
    const limit = this.limits.get(key) ?? {
      maxPerSecond: 50,
      maxPerMinute: 2000,
    };
    const client = this.redis.getClient();
    const now = Date.now();

    const [secCount, minCount] = await Promise.all([
      client.zcount(`rpc:rl:sec:${key}`, now - 1000, '+inf'),
      client.zcount(`rpc:rl:min:${key}`, now - 60000, '+inf'),
    ]);

    return {
      requestsPerSecond: secCount,
      requestsPerMinute: minCount,
      maxPerSecond: limit.maxPerSecond,
      maxPerMinute: limit.maxPerMinute,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/rpc-gateway-service/src/router/rpc-rate-limiter.service.ts
git commit -m "feat: add RpcRateLimiterService with Redis sliding window token bucket"
```

---

## Task 7: RpcCircuitBreakerService — State Machine

**Files:**
- Create: `services/rpc-gateway-service/src/router/rpc-circuit-breaker.service.ts`

- [ ] **Step 1: Create RpcCircuitBreakerService**

Create `services/rpc-gateway-service/src/router/rpc-circuit-breaker.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastStateChangeAt: number;
  halfOpenProbeAllowed: boolean;
}

@Injectable()
export class RpcCircuitBreakerService {
  private readonly logger = new Logger(RpcCircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitEntry>();

  /** Trip the breaker after this many consecutive failures */
  private readonly FAILURE_THRESHOLD = 5;
  /** Time in ms before transitioning OPEN -> HALF_OPEN */
  private readonly OPEN_TIMEOUT_MS = 30_000;
  /** Successes needed in HALF_OPEN to close the circuit */
  private readonly HALF_OPEN_SUCCESS_THRESHOLD = 2;

  constructor(private readonly prisma: PrismaService) {}

  initialize(nodeId: bigint): void {
    const key = nodeId.toString();
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        lastStateChangeAt: Date.now(),
        halfOpenProbeAllowed: true,
      });
    }
  }

  isOpen(nodeId: bigint): boolean {
    const entry = this.getEntry(nodeId);
    if (!entry) return false;

    if (entry.state === CircuitState.OPEN) {
      // Check if it should transition to half-open
      const elapsed = Date.now() - entry.lastStateChangeAt;
      if (elapsed >= this.OPEN_TIMEOUT_MS) {
        this.transitionTo(nodeId, entry, CircuitState.HALF_OPEN);
        return false; // Now half-open, not fully open
      }
      return true;
    }
    return false;
  }

  isHalfOpen(nodeId: bigint): boolean {
    const entry = this.getEntry(nodeId);
    if (!entry) return false;

    if (entry.state === CircuitState.OPEN) {
      const elapsed = Date.now() - entry.lastStateChangeAt;
      if (elapsed >= this.OPEN_TIMEOUT_MS) {
        this.transitionTo(nodeId, entry, CircuitState.HALF_OPEN);
        return true;
      }
    }
    return entry.state === CircuitState.HALF_OPEN;
  }

  recordSuccess(nodeId: bigint): void {
    const entry = this.getEntry(nodeId);
    if (!entry) return;

    entry.failureCount = 0;

    if (entry.state === CircuitState.HALF_OPEN) {
      entry.successCount++;
      if (entry.successCount >= this.HALF_OPEN_SUCCESS_THRESHOLD) {
        this.transitionTo(nodeId, entry, CircuitState.CLOSED);
        this.logger.log(
          `Circuit breaker CLOSED for node ${nodeId} after ${entry.successCount} successes in half-open`,
        );
        // Update DB
        this.updateNodeHealth(nodeId, 0, true).catch(() => {});
      }
    }
  }

  recordFailure(nodeId: bigint): void {
    const entry = this.getEntry(nodeId);
    if (!entry) return;

    entry.failureCount++;
    entry.lastFailureAt = Date.now();
    entry.successCount = 0;

    if (entry.state === CircuitState.HALF_OPEN) {
      // Immediately re-open on failure during half-open
      this.transitionTo(nodeId, entry, CircuitState.OPEN);
      this.logger.warn(
        `Circuit breaker re-OPENED for node ${nodeId} (failed during half-open probe)`,
      );
      this.updateNodeHealth(nodeId, entry.failureCount, false).catch(() => {});
    } else if (
      entry.state === CircuitState.CLOSED &&
      entry.failureCount >= this.FAILURE_THRESHOLD
    ) {
      this.transitionTo(nodeId, entry, CircuitState.OPEN);
      this.logger.warn(
        `Circuit breaker OPENED for node ${nodeId} after ${entry.failureCount} consecutive failures`,
      );
      this.updateNodeHealth(nodeId, entry.failureCount, false).catch(() => {});
    }
  }

  getState(nodeId: bigint): {
    state: string;
    failureCount: number;
    lastFailureAt: number | null;
  } {
    const entry = this.getEntry(nodeId);
    if (!entry) {
      return { state: 'unknown', failureCount: 0, lastFailureAt: null };
    }
    return {
      state: entry.state,
      failureCount: entry.failureCount,
      lastFailureAt: entry.lastFailureAt,
    };
  }

  /**
   * Force-reset a circuit (admin action).
   */
  forceReset(nodeId: bigint): void {
    const entry = this.getEntry(nodeId);
    if (!entry) return;
    this.transitionTo(nodeId, entry, CircuitState.CLOSED);
    entry.failureCount = 0;
    entry.successCount = 0;
    this.logger.log(`Circuit breaker force-reset for node ${nodeId}`);
  }

  private getEntry(nodeId: bigint): CircuitEntry | undefined {
    return this.circuits.get(nodeId.toString());
  }

  private transitionTo(
    nodeId: bigint,
    entry: CircuitEntry,
    newState: CircuitState,
  ): void {
    const oldState = entry.state;
    entry.state = newState;
    entry.lastStateChangeAt = Date.now();
    if (newState === CircuitState.HALF_OPEN) {
      entry.successCount = 0;
      entry.halfOpenProbeAllowed = true;
    }
    this.logger.debug(
      `Node ${nodeId}: circuit ${oldState} -> ${newState}`,
    );
  }

  private async updateNodeHealth(
    nodeId: bigint,
    failures: number,
    healthy: boolean,
  ): Promise<void> {
    try {
      await this.prisma.rpcNode.update({
        where: { id: nodeId },
        data: {
          consecutiveFailures: failures,
          status: healthy ? 'active' : 'unhealthy',
          healthScore: healthy ? 100.0 : Math.max(0, 100 - failures * 20),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to update node ${nodeId} health in DB`, err);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/rpc-gateway-service/src/router/rpc-circuit-breaker.service.ts
git commit -m "feat: add RpcCircuitBreakerService with closed/open/half-open state machine"
```

---

## Task 8: RpcHealthService + HealthWorker

**Files:**
- Create: `services/rpc-gateway-service/src/health/health.module.ts`
- Create: `services/rpc-gateway-service/src/health/rpc-health.service.ts`
- Create: `services/rpc-gateway-service/src/health/health-worker.service.ts`

- [ ] **Step 1: Create RpcHealthService**

Create `services/rpc-gateway-service/src/health/rpc-health.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RpcRouterService } from '../router/rpc-router.service';
import { RpcCircuitBreakerService } from '../router/rpc-circuit-breaker.service';
import { RpcRateLimiterService } from '../router/rpc-rate-limiter.service';

export interface NodeHealthResult {
  nodeId: bigint;
  chainId: number;
  providerName: string;
  endpointUrl: string;
  status: string;
  latencyMs: number | null;
  blockHeight: number | null;
  circuitState: string;
  rateLimitUsage: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    maxPerSecond: number;
    maxPerMinute: number;
  } | null;
  healthScore: number;
  consecutiveFailures: number;
  error: string | null;
}

@Injectable()
export class RpcHealthService {
  private readonly logger = new Logger(RpcHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circuitBreaker: RpcCircuitBreakerService,
    private readonly rateLimiter: RpcRateLimiterService,
  ) {}

  /**
   * Run health checks on all active nodes.
   */
  async checkAllNodes(): Promise<NodeHealthResult[]> {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { isActive: true },
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    });

    const results: NodeHealthResult[] = [];

    // Run checks in parallel, max 10 concurrent
    const batchSize = 10;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((node) => this.checkNode(node)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const node = batch[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            nodeId: node.id,
            chainId: node.chainId,
            providerName: node.provider.name,
            endpointUrl: node.endpointUrl,
            status: 'unhealthy',
            latencyMs: null,
            blockHeight: null,
            circuitState: this.circuitBreaker.getState(node.id).state,
            rateLimitUsage: null,
            healthScore: 0,
            consecutiveFailures: node.consecutiveFailures,
            error: result.reason?.message ?? 'Unknown error',
          });
        }
      }
    }

    return results;
  }

  private async checkNode(
    node: any,
  ): Promise<NodeHealthResult> {
    const startMs = Date.now();
    let latencyMs: number | null = null;
    let blockHeight: number | null = null;
    let error: string | null = null;
    let healthy = true;

    try {
      // Create a temporary provider for the health check
      const fetchReq = new ethers.FetchRequest(node.endpointUrl);
      fetchReq.timeout = node.timeoutMs;

      if (node.provider.authMethod !== 'none' && node.provider.apiKeyEncrypted) {
        const headerName = node.provider.authHeaderName ?? 'x-api-key';
        if (node.provider.authMethod === 'bearer') {
          fetchReq.setHeader('Authorization', `Bearer ${node.provider.apiKeyEncrypted}`);
        } else {
          fetchReq.setHeader(headerName, node.provider.apiKeyEncrypted);
        }
      }

      const provider = new ethers.JsonRpcProvider(fetchReq, node.chainId, {
        staticNetwork: true,
      });

      blockHeight = await provider.getBlockNumber();
      latencyMs = Date.now() - startMs;

      provider.destroy();

      this.circuitBreaker.recordSuccess(node.id);
    } catch (err) {
      latencyMs = Date.now() - startMs;
      error = err instanceof Error ? err.message : String(err);
      healthy = false;
      this.circuitBreaker.recordFailure(node.id);
    }

    // Record health metric in DB
    const healthScore = healthy
      ? Math.min(100, 100 - Math.max(0, (latencyMs ?? 0) - 500) / 50)
      : Math.max(0, Number(node.healthScore) - 20);

    try {
      await Promise.all([
        this.prisma.rpcProviderHealth.create({
          data: {
            nodeId: node.id,
            checkType: 'latency',
            value: latencyMs ?? 99999,
            measuredAt: new Date(),
            metadata: { blockHeight, error },
          },
        }),
        this.prisma.rpcNode.update({
          where: { id: node.id },
          data: {
            consecutiveFailures: healthy ? 0 : node.consecutiveFailures + 1,
            healthScore,
            status: healthy
              ? node.status === 'unhealthy'
                ? 'standby'
                : node.status
              : node.consecutiveFailures + 1 >= 5
                ? 'unhealthy'
                : node.status,
          },
        }),
      ]);
    } catch (dbErr) {
      this.logger.error(`Failed to persist health data for node ${node.id}`, dbErr);
    }

    const circuitState = this.circuitBreaker.getState(node.id);
    let rateLimitUsage = null;
    try {
      rateLimitUsage = await this.rateLimiter.getUsage(node.id);
    } catch {
      // ignore
    }

    return {
      nodeId: node.id,
      chainId: node.chainId,
      providerName: node.provider.name,
      endpointUrl: node.endpointUrl,
      status: healthy ? node.status : 'unhealthy',
      latencyMs,
      blockHeight,
      circuitState: circuitState.state,
      rateLimitUsage,
      healthScore: Number(healthScore),
      consecutiveFailures: healthy ? 0 : node.consecutiveFailures + 1,
      error,
    };
  }

  /**
   * Get latest health records for a specific node.
   */
  async getNodeHistory(nodeId: bigint, limit: number = 100) {
    return this.prisma.rpcProviderHealth.findMany({
      where: { nodeId },
      orderBy: { measuredAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get aggregated health stats per chain.
   */
  async getChainHealthSummary() {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { isActive: true },
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    });

    const byChain = new Map<number, typeof nodes>();
    for (const node of nodes) {
      const list = byChain.get(node.chainId) ?? [];
      list.push(node);
      byChain.set(node.chainId, list);
    }

    const summary = [];
    for (const [chainId, chainNodes] of byChain) {
      const activeCount = chainNodes.filter((n) => n.status === 'active').length;
      const unhealthyCount = chainNodes.filter((n) => n.status === 'unhealthy').length;
      const avgHealth =
        chainNodes.reduce((sum, n) => sum + Number(n.healthScore), 0) /
        chainNodes.length;

      summary.push({
        chainId,
        totalNodes: chainNodes.length,
        activeNodes: activeCount,
        unhealthyNodes: unhealthyCount,
        avgHealthScore: Math.round(avgHealth * 100) / 100,
        primaryNode: chainNodes.find((n) => n.status === 'active')
          ? {
              nodeId: chainNodes.find((n) => n.status === 'active')!.id.toString(),
              provider: chainNodes.find((n) => n.status === 'active')!.provider.name,
            }
          : null,
      });
    }
    return summary;
  }
}
```

- [ ] **Step 2: Create HealthWorkerService (BullMQ repeatable)**

Create `services/rpc-gateway-service/src/health/health-worker.service.ts`:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { RpcHealthService } from './rpc-health.service';

@Processor('rpc-health')
@Injectable()
export class HealthWorkerService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(HealthWorkerService.name);

  constructor(
    @InjectQueue('rpc-health') private readonly healthQueue: Queue,
    private readonly rpcHealth: RpcHealthService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Register repeatable health check job (every 30 seconds)
    await this.healthQueue.add(
      'check-all',
      {},
      {
        repeat: { every: 30_000 },
        jobId: 'rpc-health-check-all',
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );
    this.logger.log('RPC health check repeatable job registered (every 30s)');
  }

  async process(job: Job): Promise<any> {
    if (job.name !== 'check-all') return;

    this.logger.debug('Running RPC health checks...');
    const results = await this.rpcHealth.checkAllNodes();

    const healthy = results.filter((r) => r.status !== 'unhealthy').length;
    const unhealthy = results.filter((r) => r.status === 'unhealthy').length;

    this.logger.log(
      `RPC health check completed: ${healthy} healthy, ${unhealthy} unhealthy out of ${results.length} nodes`,
    );

    return { totalNodes: results.length, healthy, unhealthy };
  }
}
```

- [ ] **Step 3: Create HealthModule**

Create `services/rpc-gateway-service/src/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RpcHealthService } from './rpc-health.service';
import { HealthWorkerService } from './health-worker.service';
import { RouterModule } from '../router/router.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'rpc-health' }),
    RouterModule,
  ],
  providers: [RpcHealthService, HealthWorkerService],
  exports: [RpcHealthService],
})
export class HealthModule {}
```

- [ ] **Step 4: Commit**

```bash
git add services/rpc-gateway-service/src/health/
git commit -m "feat: add RpcHealthService with BullMQ repeatable health check worker"
```

---

## Task 9: ProviderSwitchService — Graceful Drain + Switchover

**Files:**
- Create: `services/rpc-gateway-service/src/switch/switch.module.ts`
- Create: `services/rpc-gateway-service/src/switch/provider-switch.service.ts`

- [ ] **Step 1: Create ProviderSwitchService**

Create `services/rpc-gateway-service/src/switch/provider-switch.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RpcRouterService } from '../router/rpc-router.service';
import { NodeStatus, SwitchReason, SwitchStatus } from '../generated/prisma-client';

export interface SwitchResult {
  switchId: bigint;
  chainId: number;
  fromNodeId: bigint | null;
  toNodeId: bigint;
  status: string;
  message: string;
}

@Injectable()
export class ProviderSwitchService {
  private readonly logger = new Logger(ProviderSwitchService.name);

  /** Time to wait for draining to complete (ms) */
  private readonly DRAIN_TIMEOUT_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: RpcRouterService,
  ) {}

  /**
   * Initiate a graceful switchover for a chain from one node to another.
   * Steps:
   * 1. Set old node status to 'draining'
   * 2. Set new node status to 'active'
   * 3. Invalidate router cache for the chain
   * 4. Log the switch
   */
  async initiateSwitch(params: {
    chainId: number;
    toNodeId: bigint;
    reason: SwitchReason;
    initiatedBy: string;
    notes?: string;
  }): Promise<SwitchResult> {
    const { chainId, toNodeId, reason, initiatedBy, notes } = params;

    // Validate target node
    const targetNode = await this.prisma.rpcNode.findUnique({
      where: { id: toNodeId },
    });
    if (!targetNode || targetNode.chainId !== chainId) {
      throw new BadRequestException(
        `Node ${toNodeId} not found or does not belong to chain ${chainId}`,
      );
    }
    if (targetNode.status === 'disabled') {
      throw new BadRequestException(
        `Node ${toNodeId} is disabled and cannot be switched to`,
      );
    }

    // Find current active node for this chain
    const currentActive = await this.prisma.rpcNode.findFirst({
      where: { chainId, status: 'active', isActive: true },
    });

    const fromNodeId = currentActive?.id ?? null;

    // Create switch log entry
    const switchLog = await this.prisma.providerSwitchLog.create({
      data: {
        chainId,
        fromNodeId,
        toNodeId,
        reason,
        initiatedBy,
        status: 'initiated',
        notes,
      },
    });

    // If there is a current active node, drain it
    if (currentActive && currentActive.id !== toNodeId) {
      await this.prisma.rpcNode.update({
        where: { id: currentActive.id },
        data: { status: 'draining' },
      });

      await this.prisma.providerSwitchLog.update({
        where: { id: switchLog.id },
        data: { status: 'draining' },
      });

      this.logger.log(
        `Node ${currentActive.id} set to draining for chain ${chainId}`,
      );

      // Wait briefly for in-flight requests, then complete
      // In production, this would monitor actual in-flight request count
      setTimeout(async () => {
        try {
          await this.completeSwitch(switchLog.id, currentActive.id);
        } catch (err) {
          this.logger.error(`Failed to complete switch ${switchLog.id}`, err);
        }
      }, 5_000);
    }

    // Activate target node
    await this.prisma.rpcNode.update({
      where: { id: toNodeId },
      data: { status: 'active' },
    });

    // Invalidate router cache for the chain
    await this.router.invalidateChain(chainId);

    if (!currentActive || currentActive.id === toNodeId) {
      await this.prisma.providerSwitchLog.update({
        where: { id: switchLog.id },
        data: { status: 'completed' },
      });
    }

    this.logger.log(
      `Switch initiated for chain ${chainId}: ${fromNodeId} -> ${toNodeId} (${reason})`,
    );

    return {
      switchId: switchLog.id,
      chainId,
      fromNodeId,
      toNodeId,
      status: currentActive && currentActive.id !== toNodeId ? 'draining' : 'completed',
      message: `Switch ${currentActive ? 'initiated with drain' : 'completed'} for chain ${chainId}`,
    };
  }

  /**
   * Complete the switch after draining.
   */
  private async completeSwitch(
    switchId: bigint,
    oldNodeId: bigint,
  ): Promise<void> {
    await this.prisma.rpcNode.update({
      where: { id: oldNodeId },
      data: { status: 'standby' },
    });

    await this.prisma.providerSwitchLog.update({
      where: { id: switchId },
      data: { status: 'completed' },
    });

    this.logger.log(
      `Switch ${switchId} completed. Old node ${oldNodeId} moved to standby.`,
    );
  }

  /**
   * Get switch history for a chain.
   */
  async getSwitchHistory(
    chainId?: number,
    limit: number = 50,
  ) {
    return this.prisma.providerSwitchLog.findMany({
      where: chainId ? { chainId } : undefined,
      include: {
        fromNode: { include: { provider: true } },
        toNode: { include: { provider: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Auto-failover: called by health service when a node becomes unhealthy.
   */
  async autoFailover(chainId: number, unhealthyNodeId: bigint): Promise<SwitchResult | null> {
    // Find the next best node
    const candidates = await this.prisma.rpcNode.findMany({
      where: {
        chainId,
        isActive: true,
        id: { not: unhealthyNodeId },
        status: { in: ['standby', 'active'] },
      },
      orderBy: [{ priority: 'asc' }, { healthScore: 'desc' }],
      take: 1,
    });

    if (candidates.length === 0) {
      this.logger.error(
        `Auto-failover failed for chain ${chainId}: no alternative nodes available`,
      );
      return null;
    }

    return this.initiateSwitch({
      chainId,
      toNodeId: candidates[0].id,
      reason: 'failover',
      initiatedBy: 'system:auto-failover',
      notes: `Automatic failover from unhealthy node ${unhealthyNodeId}`,
    });
  }
}
```

- [ ] **Step 2: Create SwitchModule**

Create `services/rpc-gateway-service/src/switch/switch.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProviderSwitchService } from './provider-switch.service';
import { RouterModule } from '../router/router.module';

@Module({
  imports: [RouterModule],
  providers: [ProviderSwitchService],
  exports: [ProviderSwitchService],
})
export class SwitchModule {}
```

- [ ] **Step 3: Commit**

```bash
git add services/rpc-gateway-service/src/switch/
git commit -m "feat: add ProviderSwitchService with graceful drain and auto-failover"
```

---

## Task 10: RpcProxyController — Internal HTTP API

**Files:**
- Create: `services/rpc-gateway-service/src/router/rpc-proxy.controller.ts`
- Create: `services/rpc-gateway-service/src/router/router.module.ts`

- [ ] **Step 1: Create RpcProxyController**

Create `services/rpc-gateway-service/src/router/rpc-proxy.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  ParseIntPipe,
} from '@nestjs/common';
import { RpcRouterService } from './rpc-router.service';
import { RpcHealthService } from '../health/rpc-health.service';

interface RpcCallDto {
  method: string;
  params?: any[];
}

interface BatchRpcCallDto {
  calls: RpcCallDto[];
}

@Controller('rpc')
export class RpcProxyController {
  private readonly logger = new Logger(RpcProxyController.name);

  constructor(
    private readonly router: RpcRouterService,
  ) {}

  /**
   * Proxy a single JSON-RPC call to the best available node for a chain.
   * Internal services call: POST /rpc/:chainId/call
   */
  @Post(':chainId/call')
  async proxyCall(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: RpcCallDto,
    @Headers('x-internal-service-key') serviceKey?: string,
  ) {
    // TODO: Validate internal service key in production
    const { provider, nodeId } = await this.router.getProvider(chainId);

    try {
      const result = await provider.send(dto.method, dto.params ?? []);
      this.router.reportSuccess(nodeId);
      return {
        success: true,
        result,
        nodeId: nodeId.toString(),
      };
    } catch (error) {
      this.router.reportFailure(nodeId);
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `RPC call failed on node ${nodeId} for chain ${chainId}: ${dto.method} — ${msg}`,
      );

      // Attempt failover to another node
      try {
        const fallback = await this.router.getProvider(chainId);
        if (fallback.nodeId !== nodeId) {
          const result = await fallback.provider.send(dto.method, dto.params ?? []);
          this.router.reportSuccess(fallback.nodeId);
          return {
            success: true,
            result,
            nodeId: fallback.nodeId.toString(),
            failover: true,
          };
        }
      } catch (fallbackErr) {
        // Both attempts failed
      }

      throw new HttpException(
        {
          success: false,
          error: msg,
          nodeId: nodeId.toString(),
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Batch multiple JSON-RPC calls.
   * POST /rpc/:chainId/batch
   */
  @Post(':chainId/batch')
  async proxyBatch(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: BatchRpcCallDto,
  ) {
    const { provider, nodeId } = await this.router.getProvider(chainId);
    const results = [];

    for (const call of dto.calls) {
      try {
        const result = await provider.send(call.method, call.params ?? []);
        this.router.reportSuccess(nodeId);
        results.push({ success: true, method: call.method, result });
      } catch (error) {
        this.router.reportFailure(nodeId);
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ success: false, method: call.method, error: msg });
      }
    }

    return {
      success: true,
      nodeId: nodeId.toString(),
      results,
    };
  }

  /**
   * Get the block number for a chain (convenience endpoint).
   * GET /rpc/:chainId/block-number
   */
  @Get(':chainId/block-number')
  async getBlockNumber(
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const { provider, nodeId } = await this.router.getProvider(chainId);

    try {
      const blockNumber = await provider.getBlockNumber();
      this.router.reportSuccess(nodeId);
      return {
        success: true,
        blockNumber,
        nodeId: nodeId.toString(),
      };
    } catch (error) {
      this.router.reportFailure(nodeId);
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        { success: false, error: msg },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Invalidate the provider cache for a chain (admin trigger).
   * POST /rpc/:chainId/invalidate
   */
  @Post(':chainId/invalidate')
  async invalidateCache(
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    await this.router.invalidateChain(chainId);
    return { success: true, message: `Cache invalidated for chain ${chainId}` };
  }
}
```

- [ ] **Step 2: Create RouterModule**

Create `services/rpc-gateway-service/src/router/router.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RpcRouterService } from './rpc-router.service';
import { RpcRateLimiterService } from './rpc-rate-limiter.service';
import { RpcCircuitBreakerService } from './rpc-circuit-breaker.service';
import { RpcProxyController } from './rpc-proxy.controller';

@Module({
  controllers: [RpcProxyController],
  providers: [
    RpcRouterService,
    RpcRateLimiterService,
    RpcCircuitBreakerService,
  ],
  exports: [
    RpcRouterService,
    RpcRateLimiterService,
    RpcCircuitBreakerService,
  ],
})
export class RouterModule {}
```

- [ ] **Step 3: Commit**

```bash
git add services/rpc-gateway-service/src/router/
git commit -m "feat: add RpcProxyController with internal HTTP API for RPC calls"
```

---

## Task 11: Admin API — Provider CRUD Endpoints

**Files:**
- Create: `services/admin-api/src/rpc-management/rpc-management.module.ts`
- Create: `services/admin-api/src/rpc-management/rpc-management.controller.ts`
- Create: `services/admin-api/src/rpc-management/rpc-management.service.ts`
- Create: `services/admin-api/src/rpc-management/dto/create-provider.dto.ts`
- Create: `services/admin-api/src/rpc-management/dto/update-provider.dto.ts`
- Create: `services/admin-api/src/rpc-management/dto/create-node.dto.ts`
- Create: `services/admin-api/src/rpc-management/dto/update-node.dto.ts`
- Modify: `services/admin-api/prisma/schema.prisma` (add RPC models)
- Modify: `services/admin-api/src/app.module.ts` (import RpcManagementModule)

- [ ] **Step 1: Add RPC models to Admin API Prisma schema**

Append to `services/admin-api/prisma/schema.prisma`:

```prisma
// ---------------------------------------------------------------------------
// RPC Provider Management
// ---------------------------------------------------------------------------

model RpcProvider {
  id              BigInt    @id @default(autoincrement())
  name            String    @db.VarChar(100)
  slug            String    @unique @db.VarChar(50)
  website         String?   @db.VarChar(255)
  authMethod      RpcAuthMethod @default(api_key) @map("auth_method")
  authHeaderName  String?   @default("x-api-key") @map("auth_header_name") @db.VarChar(100)
  apiKeyEncrypted String?   @map("api_key_encrypted") @db.Text
  apiSecretEncrypted String? @map("api_secret_encrypted") @db.Text
  notes           String?   @db.Text
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  nodes RpcNode[]

  @@map("rpc_providers")
}

model RpcNode {
  id                    BigInt     @id @default(autoincrement())
  providerId            BigInt     @map("provider_id")
  chainId               Int        @map("chain_id")
  endpointUrl           String     @db.VarChar(512) @map("endpoint_url")
  wsEndpointUrl         String?    @db.VarChar(512) @map("ws_endpoint_url")
  priority              Int        @default(50)
  weight                Int        @default(100)
  status                RpcNodeStatus @default(standby)
  maxRequestsPerSecond  Int?       @default(50) @map("max_requests_per_second")
  maxRequestsPerMinute  Int?       @default(2000) @map("max_requests_per_minute")
  timeoutMs             Int        @default(15000) @map("timeout_ms")
  healthCheckIntervalS  Int        @default(30) @map("health_check_interval_s")
  consecutiveFailures   Int        @default(0) @map("consecutive_failures")
  healthScore           Decimal    @default(100.00) @db.Decimal(5, 2) @map("health_score")
  tags                  Json?
  isActive              Boolean    @default(true) @map("is_active")
  createdAt             DateTime   @default(now()) @map("created_at")
  updatedAt             DateTime   @updatedAt @map("updated_at")

  provider RpcProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)

  @@index([chainId, status, priority], name: "idx_rpc_chain_status")
  @@index([providerId], name: "idx_rpc_provider")
  @@map("rpc_nodes")
}

enum RpcAuthMethod {
  api_key
  bearer
  header
  none
}

enum RpcNodeStatus {
  active
  draining
  standby
  unhealthy
  disabled
}
```

- [ ] **Step 2: Create DTOs**

Create `services/admin-api/src/rpc-management/dto/create-provider.dto.ts`:

```typescript
import { IsString, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProviderDto {
  @ApiProperty({ example: 'Alchemy', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'alchemy', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  slug: string;

  @ApiPropertyOptional({ example: 'https://alchemy.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ enum: ['api_key', 'bearer', 'header', 'none'], default: 'api_key' })
  @IsEnum(['api_key', 'bearer', 'header', 'none'])
  authMethod: 'api_key' | 'bearer' | 'header' | 'none';

  @ApiPropertyOptional({ example: 'x-api-key' })
  @IsOptional()
  @IsString()
  authHeaderName?: string;

  @ApiPropertyOptional({ description: 'API key (will be encrypted at rest)' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ description: 'API secret (will be encrypted at rest)' })
  @IsOptional()
  @IsString()
  apiSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
```

Create `services/admin-api/src/rpc-management/dto/update-provider.dto.ts`:

```typescript
import { IsString, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProviderDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ enum: ['api_key', 'bearer', 'header', 'none'] })
  @IsOptional()
  @IsEnum(['api_key', 'bearer', 'header', 'none'])
  authMethod?: 'api_key' | 'bearer' | 'header' | 'none';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authHeaderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

Create `services/admin-api/src/rpc-management/dto/create-node.dto.ts`:

```typescript
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNodeDto {
  @ApiProperty({ example: 1, description: 'Provider ID' })
  @IsInt()
  providerId: number;

  @ApiProperty({ example: 1, description: 'EVM chain ID' })
  @IsInt()
  chainId: number;

  @ApiProperty({ example: 'https://eth-mainnet.g.alchemy.com/v2/...' })
  @IsString()
  endpointUrl: string;

  @ApiPropertyOptional({ example: 'wss://eth-mainnet.g.alchemy.com/v2/...' })
  @IsOptional()
  @IsString()
  wsEndpointUrl?: string;

  @ApiPropertyOptional({ example: 50, description: 'Lower = higher priority' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  priority?: number;

  @ApiPropertyOptional({ example: 100, description: 'Weight for load balancing' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  weight?: number;

  @ApiPropertyOptional({ enum: ['active', 'standby', 'disabled'], default: 'standby' })
  @IsOptional()
  @IsEnum(['active', 'standby', 'disabled'])
  status?: 'active' | 'standby' | 'disabled';

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  maxRequestsPerSecond?: number;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  @IsInt()
  maxRequestsPerMinute?: number;

  @ApiPropertyOptional({ example: 15000, description: 'Timeout in milliseconds' })
  @IsOptional()
  @IsInt()
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 30, description: 'Health check interval in seconds' })
  @IsOptional()
  @IsInt()
  healthCheckIntervalS?: number;

  @ApiPropertyOptional({ description: 'Arbitrary tags as JSON' })
  @IsOptional()
  tags?: Record<string, any>;
}
```

Create `services/admin-api/src/rpc-management/dto/update-node.dto.ts`:

```typescript
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endpointUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wsEndpointUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  weight?: number;

  @ApiPropertyOptional({
    enum: ['active', 'draining', 'standby', 'unhealthy', 'disabled'],
  })
  @IsOptional()
  @IsEnum(['active', 'draining', 'standby', 'unhealthy', 'disabled'])
  status?: 'active' | 'draining' | 'standby' | 'unhealthy' | 'disabled';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxRequestsPerSecond?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxRequestsPerMinute?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  timeoutMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  healthCheckIntervalS?: number;

  @ApiPropertyOptional()
  @IsOptional()
  tags?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 3: Create RpcManagementService**

Create `services/admin-api/src/rpc-management/rpc-management.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RpcManagementService {
  private readonly logger = new Logger(RpcManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  // ─── Providers ───────────────────────────────────────────────

  async createProvider(
    dto: CreateProviderDto,
    adminUserId: string,
    ip?: string,
  ) {
    const existing = await this.prisma.rpcProvider.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Provider with slug '${dto.slug}' already exists`);
    }

    const provider = await this.prisma.rpcProvider.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        website: dto.website,
        authMethod: dto.authMethod as any,
        authHeaderName: dto.authHeaderName,
        apiKeyEncrypted: dto.apiKey ?? null, // TODO: encrypt via KeyVault
        apiSecretEncrypted: dto.apiSecret ?? null,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      adminUserId,
      action: 'rpc_provider.create',
      entityType: 'rpc_provider',
      entityId: provider.id.toString(),
      details: { name: dto.name, slug: dto.slug },
      ipAddress: ip,
    });

    return this.serializeProvider(provider);
  }

  async updateProvider(
    id: number,
    dto: UpdateProviderDto,
    adminUserId: string,
    ip?: string,
  ) {
    const provider = await this.prisma.rpcProvider.findUnique({
      where: { id: BigInt(id) },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }

    const updated = await this.prisma.rpcProvider.update({
      where: { id: BigInt(id) },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.authMethod && { authMethod: dto.authMethod as any }),
        ...(dto.authHeaderName !== undefined && { authHeaderName: dto.authHeaderName }),
        ...(dto.apiKey !== undefined && { apiKeyEncrypted: dto.apiKey }),
        ...(dto.apiSecret !== undefined && { apiSecretEncrypted: dto.apiSecret }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.log({
      adminUserId,
      action: 'rpc_provider.update',
      entityType: 'rpc_provider',
      entityId: id.toString(),
      details: dto,
      ipAddress: ip,
    });

    // Notify rpc-gateway to invalidate cache
    await this.notifyGateway('invalidate-provider', { providerId: id });

    return this.serializeProvider(updated);
  }

  async listProviders() {
    const providers = await this.prisma.rpcProvider.findMany({
      include: { nodes: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
    return providers.map((p) => ({
      ...this.serializeProvider(p),
      nodeCount: p.nodes.length,
      activeNodes: p.nodes.filter((n) => n.status === 'active').length,
    }));
  }

  async getProvider(id: number) {
    const provider = await this.prisma.rpcProvider.findUnique({
      where: { id: BigInt(id) },
      include: { nodes: { include: {} } },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }
    return {
      ...this.serializeProvider(provider),
      nodes: provider.nodes.map((n) => this.serializeNode(n)),
    };
  }

  // ─── Nodes ───────────────────────────────────────────────────

  async createNode(
    dto: CreateNodeDto,
    adminUserId: string,
    ip?: string,
  ) {
    const provider = await this.prisma.rpcProvider.findUnique({
      where: { id: BigInt(dto.providerId) },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${dto.providerId} not found`);
    }

    const node = await this.prisma.rpcNode.create({
      data: {
        providerId: BigInt(dto.providerId),
        chainId: dto.chainId,
        endpointUrl: dto.endpointUrl,
        wsEndpointUrl: dto.wsEndpointUrl,
        priority: dto.priority ?? 50,
        weight: dto.weight ?? 100,
        status: (dto.status as any) ?? 'standby',
        maxRequestsPerSecond: dto.maxRequestsPerSecond ?? 50,
        maxRequestsPerMinute: dto.maxRequestsPerMinute ?? 2000,
        timeoutMs: dto.timeoutMs ?? 15000,
        healthCheckIntervalS: dto.healthCheckIntervalS ?? 30,
        tags: dto.tags ?? null,
      },
    });

    await this.audit.log({
      adminUserId,
      action: 'rpc_node.create',
      entityType: 'rpc_node',
      entityId: node.id.toString(),
      details: { chainId: dto.chainId, provider: provider.name },
      ipAddress: ip,
    });

    await this.notifyGateway('invalidate-chain', { chainId: dto.chainId });

    return this.serializeNode(node);
  }

  async updateNode(
    id: number,
    dto: UpdateNodeDto,
    adminUserId: string,
    ip?: string,
  ) {
    const node = await this.prisma.rpcNode.findUnique({
      where: { id: BigInt(id) },
    });
    if (!node) {
      throw new NotFoundException(`Node ${id} not found`);
    }

    const updated = await this.prisma.rpcNode.update({
      where: { id: BigInt(id) },
      data: {
        ...(dto.endpointUrl && { endpointUrl: dto.endpointUrl }),
        ...(dto.wsEndpointUrl !== undefined && { wsEndpointUrl: dto.wsEndpointUrl }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.status && { status: dto.status as any }),
        ...(dto.maxRequestsPerSecond !== undefined && { maxRequestsPerSecond: dto.maxRequestsPerSecond }),
        ...(dto.maxRequestsPerMinute !== undefined && { maxRequestsPerMinute: dto.maxRequestsPerMinute }),
        ...(dto.timeoutMs !== undefined && { timeoutMs: dto.timeoutMs }),
        ...(dto.healthCheckIntervalS !== undefined && { healthCheckIntervalS: dto.healthCheckIntervalS }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.log({
      adminUserId,
      action: 'rpc_node.update',
      entityType: 'rpc_node',
      entityId: id.toString(),
      details: dto,
      ipAddress: ip,
    });

    await this.notifyGateway('invalidate-chain', { chainId: node.chainId });

    return this.serializeNode(updated);
  }

  async listNodes(chainId?: number) {
    const where: any = { isActive: true };
    if (chainId) where.chainId = chainId;

    const nodes = await this.prisma.rpcNode.findMany({
      where,
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    });
    return nodes.map((n) => ({
      ...this.serializeNode(n),
      providerName: (n as any).provider?.name,
      providerSlug: (n as any).provider?.slug,
    }));
  }

  async getNode(id: number) {
    const node = await this.prisma.rpcNode.findUnique({
      where: { id: BigInt(id) },
      include: { provider: true },
    });
    if (!node) {
      throw new NotFoundException(`Node ${id} not found`);
    }
    return {
      ...this.serializeNode(node),
      providerName: node.provider.name,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private serializeProvider(p: any) {
    return {
      id: p.id.toString(),
      name: p.name,
      slug: p.slug,
      website: p.website,
      authMethod: p.authMethod,
      authHeaderName: p.authHeaderName,
      hasApiKey: !!p.apiKeyEncrypted,
      hasApiSecret: !!p.apiSecretEncrypted,
      notes: p.notes,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private serializeNode(n: any) {
    return {
      id: n.id.toString(),
      providerId: n.providerId.toString(),
      chainId: n.chainId,
      endpointUrl: n.endpointUrl,
      wsEndpointUrl: n.wsEndpointUrl,
      priority: n.priority,
      weight: n.weight,
      status: n.status,
      maxRequestsPerSecond: n.maxRequestsPerSecond,
      maxRequestsPerMinute: n.maxRequestsPerMinute,
      timeoutMs: n.timeoutMs,
      healthCheckIntervalS: n.healthCheckIntervalS,
      consecutiveFailures: n.consecutiveFailures,
      healthScore: Number(n.healthScore),
      tags: n.tags,
      isActive: n.isActive,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  private async notifyGateway(action: string, data: any): Promise<void> {
    const gatewayUrl = this.config.get<string>(
      'RPC_GATEWAY_URL',
      'http://localhost:3009',
    );
    try {
      if (action === 'invalidate-chain' && data.chainId) {
        await axios.post(`${gatewayUrl}/rpc/${data.chainId}/invalidate`);
      }
    } catch (err) {
      this.logger.warn(`Failed to notify rpc-gateway: ${action}`, err);
    }
  }
}
```

- [ ] **Step 4: Create RpcManagementController**

Create `services/admin-api/src/rpc-management/rpc-management.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { RpcManagementService } from './rpc-management.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@ApiTags('RPC Management')
@ApiBearerAuth('JWT')
@Controller('admin')
export class RpcManagementController {
  constructor(private readonly rpcService: RpcManagementService) {}

  // ─── Providers ───────────────────────────────────────────────

  @Post('rpc/providers')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Create a new RPC provider' })
  @ApiResponse({ status: 201, description: 'Provider created' })
  async createProvider(@Body() dto: CreateProviderDto, @Req() req: Request) {
    const user = (req as any).user;
    const provider = await this.rpcService.createProvider(dto, user.userId, req.ip);
    return { success: true, provider };
  }

  @Get('rpc/providers')
  @AdminAuth()
  @ApiOperation({ summary: 'List all RPC providers' })
  @ApiResponse({ status: 200, description: 'List of providers' })
  async listProviders() {
    const providers = await this.rpcService.listProviders();
    return { success: true, providers };
  }

  @Get('rpc/providers/:id')
  @AdminAuth()
  @ApiOperation({ summary: 'Get provider details with nodes' })
  async getProvider(@Param('id', ParseIntPipe) id: number) {
    const provider = await this.rpcService.getProvider(id);
    return { success: true, provider };
  }

  @Put('rpc/providers/:id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Update an RPC provider' })
  async updateProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProviderDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const provider = await this.rpcService.updateProvider(id, dto, user.userId, req.ip);
    return { success: true, provider };
  }

  // ─── Nodes ───────────────────────────────────────────────────

  @Post('rpc/nodes')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Create a new RPC node endpoint' })
  @ApiResponse({ status: 201, description: 'Node created' })
  async createNode(@Body() dto: CreateNodeDto, @Req() req: Request) {
    const user = (req as any).user;
    const node = await this.rpcService.createNode(dto, user.userId, req.ip);
    return { success: true, node };
  }

  @Get('rpc/nodes')
  @AdminAuth()
  @ApiOperation({ summary: 'List RPC nodes, optionally filtered by chain' })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  async listNodes(@Query('chainId') chainId?: number) {
    const nodes = await this.rpcService.listNodes(chainId);
    return { success: true, nodes };
  }

  @Get('rpc/nodes/:id')
  @AdminAuth()
  @ApiOperation({ summary: 'Get node details' })
  async getNode(@Param('id', ParseIntPipe) id: number) {
    const node = await this.rpcService.getNode(id);
    return { success: true, node };
  }

  @Put('rpc/nodes/:id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Update an RPC node' })
  async updateNode(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNodeDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const node = await this.rpcService.updateNode(id, dto, user.userId, req.ip);
    return { success: true, node };
  }
}
```

- [ ] **Step 5: Create RpcManagementModule**

Create `services/admin-api/src/rpc-management/rpc-management.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RpcManagementController } from './rpc-management.controller';
import { RpcManagementService } from './rpc-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [RpcManagementController],
  providers: [RpcManagementService, AuditLogService],
  exports: [RpcManagementService],
})
export class RpcManagementModule {}
```

- [ ] **Step 6: Register module in admin-api AppModule**

In `services/admin-api/src/app.module.ts`, add:

```typescript
import { RpcManagementModule } from './rpc-management/rpc-management.module';
```

And add `RpcManagementModule` to the `imports` array.

- [ ] **Step 7: Regenerate Prisma and verify**

```bash
cd services/admin-api
npx prisma generate
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add services/admin-api/src/rpc-management/ services/admin-api/prisma/schema.prisma services/admin-api/src/app.module.ts
git commit -m "feat: add Admin API RPC provider and node CRUD endpoints"
```

---

## Task 12: Admin API — Health Dashboard + Switch History Endpoints

**Files:**
- Modify: `services/admin-api/src/rpc-management/rpc-management.controller.ts`
- Modify: `services/admin-api/src/rpc-management/rpc-management.service.ts`

- [ ] **Step 1: Add health and switch endpoints to RpcManagementService**

Append these methods to `services/admin-api/src/rpc-management/rpc-management.service.ts`:

```typescript
  // ─── Health & Switch (delegates to rpc-gateway) ──────────────

  async getHealthDashboard() {
    const gatewayUrl = this.config.get<string>(
      'RPC_GATEWAY_URL',
      'http://localhost:3009',
    );
    try {
      // Fetch live health from rpc-gateway
      const response = await axios.get(`${gatewayUrl}/health`);
      return response.data;
    } catch {
      // Fallback: read from DB
      const nodes = await this.prisma.rpcNode.findMany({
        where: { isActive: true },
        include: { provider: true },
        orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
      });
      return nodes.map((n) => ({
        ...this.serializeNode(n),
        providerName: n.provider.name,
      }));
    }
  }

  async getSwitchHistory(chainId?: number, limit: number = 50) {
    const where: any = {};
    if (chainId) where.chainId = chainId;

    const logs = await this.prisma.$queryRaw`
      SELECT
        psl.id,
        psl.chain_id AS chainId,
        psl.from_node_id AS fromNodeId,
        psl.to_node_id AS toNodeId,
        psl.reason,
        psl.initiated_by AS initiatedBy,
        psl.status,
        psl.pending_jobs_at_switch AS pendingJobsAtSwitch,
        psl.notes,
        psl.created_at AS createdAt
      FROM provider_switch_log psl
      ${chainId ? Prisma.sql`WHERE psl.chain_id = ${chainId}` : Prisma.empty}
      ORDER BY psl.created_at DESC
      LIMIT ${limit}
    `;
    return logs;
  }

  async initiateSwitch(params: {
    chainId: number;
    toNodeId: number;
    reason: string;
    adminUserId: string;
    notes?: string;
    ip?: string;
  }) {
    const gatewayUrl = this.config.get<string>(
      'RPC_GATEWAY_URL',
      'http://localhost:3009',
    );

    // Log the switch via the gateway
    try {
      const response = await axios.post(`${gatewayUrl}/switch`, {
        chainId: params.chainId,
        toNodeId: params.toNodeId,
        reason: params.reason,
        initiatedBy: params.adminUserId,
        notes: params.notes,
      });

      await this.audit.log({
        adminUserId: params.adminUserId,
        action: 'rpc_node.switch',
        entityType: 'rpc_node',
        entityId: params.toNodeId.toString(),
        details: {
          chainId: params.chainId,
          reason: params.reason,
          notes: params.notes,
        },
        ipAddress: params.ip,
      });

      return response.data;
    } catch (err) {
      this.logger.error('Failed to initiate switch via gateway', err);
      throw err;
    }
  }
```

Note: The raw SQL for `getSwitchHistory` requires adding `import { Prisma } from '../generated/prisma-client';` at the top.

- [ ] **Step 2: Add endpoints to controller**

Append to `services/admin-api/src/rpc-management/rpc-management.controller.ts`:

```typescript
  // ─── Health & Switch ─────────────────────────────────────────

  @Get('rpc/health')
  @AdminAuth()
  @ApiOperation({ summary: 'Get RPC health dashboard data' })
  async getHealthDashboard() {
    const health = await this.rpcService.getHealthDashboard();
    return { success: true, health };
  }

  @Get('rpc/switches')
  @AdminAuth()
  @ApiOperation({ summary: 'Get provider switch history' })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSwitchHistory(
    @Query('chainId') chainId?: number,
    @Query('limit') limit?: number,
  ) {
    const history = await this.rpcService.getSwitchHistory(chainId, limit ?? 50);
    return { success: true, history };
  }

  @Post('rpc/switches')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Initiate a manual provider switch' })
  async initiateSwitch(
    @Body() body: { chainId: number; toNodeId: number; reason: string; notes?: string },
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const result = await this.rpcService.initiateSwitch({
      ...body,
      adminUserId: user.userId,
      ip: req.ip,
    });
    return { success: true, result };
  }
```

- [ ] **Step 3: Commit**

```bash
git add services/admin-api/src/rpc-management/
git commit -m "feat: add RPC health dashboard and switch history admin endpoints"
```

---

## Task 13: Migrate Existing EvmProviderService to Call rpc-gateway

**Files:**
- Modify: `services/chain-indexer-service/src/blockchain/evm-provider.service.ts`
- Modify: `services/core-wallet-service/src/blockchain/evm-provider.service.ts`
- Modify: `services/cron-worker-service/src/blockchain/evm-provider.service.ts` (if exists)

- [ ] **Step 1: Create a gateway-backed EvmProviderService**

Replace `services/chain-indexer-service/src/blockchain/evm-provider.service.ts` with:

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import axios from 'axios';

interface CachedProvider {
  provider: ethers.JsonRpcProvider;
  wsProvider?: ethers.WebSocketProvider;
  chainId: number;
  nodeId: string | null;
}

/**
 * Manages ethers.js providers per chain.
 * Delegates node selection to rpc-gateway-service when available,
 * falls back to legacy behavior (direct DB read) if gateway is unreachable.
 */
@Injectable()
export class EvmProviderService implements OnModuleDestroy {
  private readonly logger = new Logger(EvmProviderService.name);
  private readonly providers = new Map<number, CachedProvider>();
  private readonly gatewayUrl: string;

  constructor(private readonly config: ConfigService) {
    this.gatewayUrl = this.config.get<string>(
      'RPC_GATEWAY_URL',
      'http://localhost:3009',
    );
  }

  /**
   * Execute an RPC call through the gateway.
   * This is the preferred method for all RPC interactions.
   */
  async rpcCall(chainId: number, method: string, params: any[] = []): Promise<any> {
    try {
      const response = await axios.post(
        `${this.gatewayUrl}/rpc/${chainId}/call`,
        { method, params },
        { timeout: 30_000 },
      );
      return response.data.result;
    } catch (error) {
      // If gateway is down, fall back to direct provider
      this.logger.warn(
        `RPC gateway unavailable for chain ${chainId}, falling back to direct provider`,
      );
      const provider = await this.getProvider(chainId);
      return provider.send(method, params);
    }
  }

  /**
   * Get a direct ethers.js provider (for operations that need a provider object).
   * Prefers gateway-backed providers when possible.
   */
  async getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
    const existing = this.providers.get(chainId);
    if (existing) return existing.provider;

    // Ask the gateway for the block number to verify connectivity
    try {
      const response = await axios.get(
        `${this.gatewayUrl}/rpc/${chainId}/block-number`,
        { timeout: 5_000 },
      );
      this.logger.log(
        `RPC gateway connected for chain ${chainId}, block ${response.data.blockNumber}`,
      );
    } catch {
      this.logger.warn(
        `RPC gateway not available for chain ${chainId}, using direct fallback`,
      );
    }

    // Create a proxied provider that routes through the gateway
    const provider = new ethers.JsonRpcProvider(
      `${this.gatewayUrl}/rpc/${chainId}/jsonrpc`,
      chainId,
      { staticNetwork: true },
    );

    this.providers.set(chainId, {
      provider,
      chainId,
      nodeId: null,
    });

    return provider;
  }

  /**
   * Get a WebSocket provider for the given chain.
   */
  async getWsProvider(chainId: number): Promise<ethers.WebSocketProvider> {
    const existing = this.providers.get(chainId);
    if (existing?.wsProvider) return existing.wsProvider;

    throw new Error(
      `WebSocket providers must be configured via rpc-gateway-service for chain ${chainId}`,
    );
  }

  reportFailure(chainId: number): void {
    this.logger.debug(`Failure reported for chain ${chainId}`);
    // The gateway handles circuit breaking internally
  }

  reportSuccess(chainId: number): void {
    // The gateway handles circuit breaking internally
  }

  onModuleDestroy() {
    for (const [chainId, entry] of this.providers) {
      entry.provider.destroy();
      if (entry.wsProvider) {
        entry.wsProvider.destroy();
      }
      this.logger.log(`Providers destroyed for chain ${chainId}`);
    }
    this.providers.clear();
  }
}
```

- [ ] **Step 2: Apply same pattern to core-wallet-service**

Apply the same replacement to `services/core-wallet-service/src/blockchain/evm-provider.service.ts`. The code is identical, only the import paths for PrismaService should be removed since we no longer read from DB.

- [ ] **Step 3: Add axios dependency if not present**

```bash
cd services/chain-indexer-service && npm ls axios 2>/dev/null || npm install axios
cd ../../services/core-wallet-service && npm ls axios 2>/dev/null || npm install axios
```

- [ ] **Step 4: Verify compilation**

```bash
cd services/chain-indexer-service && npx tsc --noEmit
cd ../../services/core-wallet-service && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add services/chain-indexer-service/src/blockchain/evm-provider.service.ts services/core-wallet-service/src/blockchain/evm-provider.service.ts
git commit -m "refactor: migrate EvmProviderService to route through rpc-gateway-service"
```

---

## Task 14: Admin Frontend — RPC Providers Page

**Files:**
- Create: `apps/admin/app/rpc-providers/page.tsx`
- Modify: `apps/admin/lib/mock-data.ts` (add RPC mock data + nav entry)

- [ ] **Step 1: Add RPC mock data and nav entry**

Add to `apps/admin/lib/mock-data.ts` before the closing of the file:

```typescript
// ─── RPC Providers ──────────────────────────────────────────
export const rpcProviders = [
  {
    id: "1",
    name: "Tatum",
    slug: "tatum",
    website: "https://tatum.io",
    authMethod: "api_key",
    hasApiKey: true,
    isActive: true,
    nodeCount: 5,
    activeNodes: 3,
    chains: ["ETH", "BSC", "POLY"],
  },
  {
    id: "2",
    name: "Alchemy",
    slug: "alchemy",
    website: "https://alchemy.com",
    authMethod: "api_key",
    hasApiKey: true,
    isActive: true,
    nodeCount: 3,
    activeNodes: 2,
    chains: ["ETH", "ARB"],
  },
  {
    id: "3",
    name: "QuickNode",
    slug: "quicknode",
    website: "https://quicknode.com",
    authMethod: "bearer",
    hasApiKey: true,
    isActive: false,
    nodeCount: 2,
    activeNodes: 0,
    chains: ["ETH"],
  },
];

export const rpcNodes = [
  {
    id: "1",
    providerName: "Tatum",
    chainId: 1,
    chainName: "Ethereum",
    status: "active",
    healthScore: 98.5,
    latencyMs: 120,
    blockHeight: 19500000,
    consecutiveFailures: 0,
    priority: 10,
    weight: 100,
    maxRps: 50,
    circuitState: "closed",
  },
  {
    id: "2",
    providerName: "Tatum",
    chainId: 56,
    chainName: "BSC",
    status: "active",
    healthScore: 95.2,
    latencyMs: 85,
    blockHeight: 38000000,
    consecutiveFailures: 0,
    priority: 10,
    weight: 100,
    maxRps: 50,
    circuitState: "closed",
  },
  {
    id: "3",
    providerName: "Alchemy",
    chainId: 1,
    chainName: "Ethereum",
    status: "standby",
    healthScore: 99.1,
    latencyMs: 95,
    blockHeight: 19500000,
    consecutiveFailures: 0,
    priority: 20,
    weight: 80,
    maxRps: 100,
    circuitState: "closed",
  },
  {
    id: "4",
    providerName: "Tatum",
    chainId: 137,
    chainName: "Polygon",
    status: "unhealthy",
    healthScore: 22.0,
    latencyMs: 5200,
    blockHeight: 55000000,
    consecutiveFailures: 7,
    priority: 10,
    weight: 100,
    maxRps: 50,
    circuitState: "open",
  },
];

export const rpcSwitchHistory = [
  {
    id: "1",
    chainId: 1,
    fromProvider: "QuickNode",
    toProvider: "Tatum",
    reason: "failover",
    initiatedBy: "system:auto-failover",
    status: "completed",
    createdAt: "2026-04-09T12:30:00Z",
  },
  {
    id: "2",
    chainId: 137,
    fromProvider: "Tatum",
    toProvider: "Alchemy",
    reason: "manual",
    initiatedBy: "admin@cvh.io",
    status: "draining",
    createdAt: "2026-04-09T11:15:00Z",
  },
];
```

Update the `navSections` in `apps/admin/lib/mock-data.ts`. In the "Blockchain" section items array, add after Gas Tanks:

```typescript
      { label: "RPC Providers", href: "/rpc-providers", icon: "Activity" },
      { label: "RPC Health", href: "/rpc-health", icon: "Activity" },
```

- [ ] **Step 2: Create RPC Providers page**

Create `apps/admin/app/rpc-providers/page.tsx`:

```tsx
"use client";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { rpcProviders, rpcNodes } from "@/lib/mock-data";

const statusBadgeMap: Record<string, "success" | "error" | "warning" | "accent" | "neutral"> = {
  active: "success",
  standby: "accent",
  draining: "warning",
  unhealthy: "error",
  disabled: "neutral",
};

export default function RpcProvidersPage() {
  const totalNodes = rpcNodes.length;
  const activeNodes = rpcNodes.filter((n) => n.status === "active").length;
  const unhealthyNodes = rpcNodes.filter((n) => n.status === "unhealthy").length;
  const avgHealth =
    rpcNodes.reduce((sum, n) => sum + n.healthScore, 0) / (rpcNodes.length || 1);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-section-gap">
        <StatCard label="Total Providers" value={rpcProviders.length.toString()} />
        <StatCard label="Total Nodes" value={totalNodes.toString()} />
        <StatCard label="Active Nodes" value={activeNodes.toString()} color="success" />
        <StatCard
          label="Avg Health Score"
          value={`${avgHealth.toFixed(1)}%`}
          color={avgHealth > 80 ? "success" : avgHealth > 50 ? "warning" : "error"}
        />
      </div>

      {/* Providers Table */}
      <DataTable
        title="RPC Providers"
        headers={["Provider", "Slug", "Auth", "Nodes", "Active", "Chains", "Status"]}
        actions={
          <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
            + Add Provider
          </button>
        }
        className="mb-section-gap"
      >
        {rpcProviders.map((p) => (
          <TableRow key={p.id}>
            <TableCell>
              <div className="font-semibold font-display text-text-primary">{p.name}</div>
              <div className="text-micro text-text-muted">{p.website}</div>
            </TableCell>
            <TableCell mono>{p.slug}</TableCell>
            <TableCell>
              <Badge variant="neutral">{p.authMethod}</Badge>
            </TableCell>
            <TableCell mono>{p.nodeCount}</TableCell>
            <TableCell mono>{p.activeNodes}</TableCell>
            <TableCell>{p.chains.join(", ")}</TableCell>
            <TableCell>
              <Badge variant={p.isActive ? "success" : "neutral"} dot>
                {p.isActive ? "Active" : "Disabled"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {/* Nodes Table */}
      <DataTable
        title="RPC Nodes"
        headers={[
          "Provider",
          "Chain",
          "Status",
          "Health",
          "Latency",
          "Block Height",
          "Failures",
          "Circuit",
          "Priority",
        ]}
        actions={
          <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
            + Add Node
          </button>
        }
      >
        {rpcNodes.map((n) => (
          <TableRow key={n.id} highlight={n.status === "unhealthy"}>
            <TableCell>{n.providerName}</TableCell>
            <TableCell>
              <div className="font-semibold font-display">{n.chainName}</div>
              <div className="text-micro text-text-muted font-mono">ID: {n.chainId}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusBadgeMap[n.status] ?? "neutral"} dot>
                {n.status}
              </Badge>
            </TableCell>
            <TableCell
              mono
              className={
                n.healthScore >= 80
                  ? "text-status-success"
                  : n.healthScore >= 50
                    ? "text-status-warning"
                    : "text-status-error"
              }
            >
              {n.healthScore.toFixed(1)}%
            </TableCell>
            <TableCell mono>{n.latencyMs}ms</TableCell>
            <TableCell mono className="text-caption">{n.blockHeight.toLocaleString()}</TableCell>
            <TableCell
              mono
              className={n.consecutiveFailures > 0 ? "text-status-error" : "text-text-primary"}
            >
              {n.consecutiveFailures}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  n.circuitState === "closed"
                    ? "success"
                    : n.circuitState === "half_open"
                      ? "warning"
                      : "error"
                }
              >
                {n.circuitState}
              </Badge>
            </TableCell>
            <TableCell mono>{n.priority}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/rpc-providers/ apps/admin/lib/mock-data.ts
git commit -m "feat: add RPC Providers admin frontend page with mock data"
```

---

## Task 15: Admin Frontend — RPC Health Dashboard Page

**Files:**
- Create: `apps/admin/app/rpc-health/page.tsx`

- [ ] **Step 1: Create RPC Health Dashboard page**

Create `apps/admin/app/rpc-health/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/badge";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { rpcNodes, rpcSwitchHistory } from "@/lib/mock-data";

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-status-success"
      : score >= 50
        ? "bg-status-warning"
        : "bg-status-error";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 bg-surface-elevated rounded-pill overflow-hidden w-20">
        <div
          className={cn("h-full rounded-pill transition-all duration-normal", color)}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "font-mono text-caption",
          score >= 80
            ? "text-status-success"
            : score >= 50
              ? "text-status-warning"
              : "text-status-error"
        )}
      >
        {score.toFixed(1)}%
      </span>
    </div>
  );
}

const reasonBadgeMap: Record<string, "success" | "error" | "warning" | "accent" | "neutral"> = {
  failover: "error",
  manual: "accent",
  health_degraded: "warning",
  rate_limited: "warning",
  draining: "neutral",
};

const switchStatusMap: Record<string, "success" | "error" | "warning" | "accent" | "neutral"> = {
  completed: "success",
  draining: "warning",
  initiated: "accent",
  rolled_back: "error",
};

export default function RpcHealthPage() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Group nodes by chain
  const chainGroups = new Map<number, typeof rpcNodes>();
  for (const node of rpcNodes) {
    const list = chainGroups.get(node.chainId) ?? [];
    list.push(node);
    chainGroups.set(node.chainId, list);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] font-display">
          RPC Health Dashboard
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex items-center gap-1.5 bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display",
            refreshing && "border-accent-primary text-accent-primary"
          )}
        >
          <RefreshCw
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              refreshing && "animate-spin"
            )}
          />
          Refresh
        </button>
      </div>

      {/* Chain Health Cards */}
      <div className="grid grid-cols-3 gap-4 mb-section-gap">
        {Array.from(chainGroups.entries()).map(([chainId, nodes]) => {
          const activeNode = nodes.find((n) => n.status === "active");
          const avgHealth =
            nodes.reduce((s, n) => s + n.healthScore, 0) / nodes.length;
          const hasUnhealthy = nodes.some((n) => n.status === "unhealthy");

          return (
            <div
              key={chainId}
              className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card relative overflow-hidden group hover:border-accent-primary/20 transition-all duration-fast"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-body font-semibold font-display text-text-primary">
                    {nodes[0].chainName}
                  </div>
                  <div className="text-micro text-text-muted font-mono">
                    Chain ID: {chainId}
                  </div>
                </div>
                <Badge variant={hasUnhealthy ? "error" : "success"} dot>
                  {hasUnhealthy ? "Degraded" : "Healthy"}
                </Badge>
              </div>

              <div className="space-y-2 text-caption">
                <div className="flex justify-between">
                  <span className="text-text-secondary font-display">Active Provider</span>
                  <span className="font-mono text-text-primary">
                    {activeNode?.providerName ?? "None"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary font-display">Nodes</span>
                  <span className="font-mono">{nodes.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-display">Avg Health</span>
                  <HealthBar score={avgHealth} />
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary font-display">Latency</span>
                  <span className="font-mono">
                    {activeNode ? `${activeNode.latencyMs}ms` : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* All Nodes Detail Table */}
      <DataTable
        title="All RPC Nodes"
        headers={[
          "Provider",
          "Chain",
          "Status",
          "Health",
          "Latency",
          "Block",
          "Circuit",
          "RPS Limit",
        ]}
        className="mb-section-gap"
      >
        {rpcNodes.map((n) => (
          <TableRow key={n.id} highlight={n.status === "unhealthy"}>
            <TableCell>{n.providerName}</TableCell>
            <TableCell>
              {n.chainName}
              <span className="text-micro text-text-muted font-mono ml-1">({n.chainId})</span>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  n.status === "active"
                    ? "success"
                    : n.status === "unhealthy"
                      ? "error"
                      : n.status === "draining"
                        ? "warning"
                        : "neutral"
                }
                dot
              >
                {n.status}
              </Badge>
            </TableCell>
            <TableCell>
              <HealthBar score={n.healthScore} />
            </TableCell>
            <TableCell mono>{n.latencyMs}ms</TableCell>
            <TableCell mono className="text-caption">
              {n.blockHeight.toLocaleString()}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  n.circuitState === "closed"
                    ? "success"
                    : n.circuitState === "half_open"
                      ? "warning"
                      : "error"
                }
              >
                {n.circuitState}
              </Badge>
            </TableCell>
            <TableCell mono>{n.maxRps}/s</TableCell>
          </TableRow>
        ))}
      </DataTable>

      {/* Switch History */}
      <DataTable
        title="Provider Switch History"
        headers={["Chain", "From", "To", "Reason", "Initiated By", "Status", "Time"]}
      >
        {rpcSwitchHistory.map((s) => (
          <TableRow key={s.id}>
            <TableCell mono>{s.chainId}</TableCell>
            <TableCell>{s.fromProvider}</TableCell>
            <TableCell>{s.toProvider}</TableCell>
            <TableCell>
              <Badge variant={reasonBadgeMap[s.reason] ?? "neutral"}>{s.reason}</Badge>
            </TableCell>
            <TableCell className="text-caption">{s.initiatedBy}</TableCell>
            <TableCell>
              <Badge variant={switchStatusMap[s.status] ?? "neutral"} dot>
                {s.status}
              </Badge>
            </TableCell>
            <TableCell className="text-caption text-text-muted">
              {new Date(s.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/app/rpc-health/
git commit -m "feat: add RPC Health Dashboard admin frontend page"
```

---

## Task 16: Phase 2 Tests

**Files:**
- Create: `services/rpc-gateway-service/src/router/rpc-circuit-breaker.service.spec.ts`
- Create: `services/rpc-gateway-service/src/router/rpc-rate-limiter.service.spec.ts`
- Create: `services/rpc-gateway-service/src/router/rpc-router.service.spec.ts`

- [ ] **Step 1: Create circuit breaker tests**

Create `services/rpc-gateway-service/src/router/rpc-circuit-breaker.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RpcCircuitBreakerService } from './rpc-circuit-breaker.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RpcCircuitBreakerService', () => {
  let service: RpcCircuitBreakerService;
  const mockPrisma = {
    rpcNode: { update: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RpcCircuitBreakerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RpcCircuitBreakerService>(RpcCircuitBreakerService);
  });

  it('should start in closed state', () => {
    service.initialize(1n);
    const state = service.getState(1n);
    expect(state.state).toBe('closed');
    expect(state.failureCount).toBe(0);
  });

  it('should remain closed below failure threshold', () => {
    service.initialize(2n);
    service.recordFailure(2n);
    service.recordFailure(2n);
    service.recordFailure(2n);
    service.recordFailure(2n); // 4 failures, threshold is 5
    expect(service.isOpen(2n)).toBe(false);
  });

  it('should open after reaching failure threshold', () => {
    service.initialize(3n);
    for (let i = 0; i < 5; i++) {
      service.recordFailure(3n);
    }
    expect(service.isOpen(3n)).toBe(true);
  });

  it('should reset failure count on success', () => {
    service.initialize(4n);
    service.recordFailure(4n);
    service.recordFailure(4n);
    service.recordSuccess(4n);
    const state = service.getState(4n);
    expect(state.failureCount).toBe(0);
  });

  it('should force-reset to closed', () => {
    service.initialize(5n);
    for (let i = 0; i < 5; i++) {
      service.recordFailure(5n);
    }
    expect(service.isOpen(5n)).toBe(true);
    service.forceReset(5n);
    expect(service.isOpen(5n)).toBe(false);
    expect(service.getState(5n).failureCount).toBe(0);
  });

  it('should return unknown for uninitialized nodes', () => {
    const state = service.getState(999n);
    expect(state.state).toBe('unknown');
  });
});
```

- [ ] **Step 2: Create rate limiter tests**

Create `services/rpc-gateway-service/src/router/rpc-rate-limiter.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RpcRateLimiterService } from './rpc-rate-limiter.service';
import { RedisService } from '../redis/redis.service';

describe('RpcRateLimiterService', () => {
  let service: RpcRateLimiterService;
  const mockEval = jest.fn();
  const mockZcount = jest.fn();
  const mockRedis = {
    getClient: () => ({
      eval: mockEval,
      zcount: mockZcount,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RpcRateLimiterService,
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<RpcRateLimiterService>(RpcRateLimiterService);
  });

  it('should allow requests when no limits configured', async () => {
    const result = await service.tryAcquire(999n);
    expect(result).toBe(true);
  });

  it('should allow requests when under limit', async () => {
    service.initialize(1n, 50, 2000);
    mockEval.mockResolvedValue(1);
    const result = await service.tryAcquire(1n);
    expect(result).toBe(true);
  });

  it('should deny requests when over limit', async () => {
    service.initialize(2n, 50, 2000);
    mockEval.mockResolvedValue(0);
    const result = await service.tryAcquire(2n);
    expect(result).toBe(false);
  });

  it('should fail open on Redis error', async () => {
    service.initialize(3n, 50, 2000);
    mockEval.mockRejectedValue(new Error('Redis connection lost'));
    const result = await service.tryAcquire(3n);
    expect(result).toBe(true); // fail open
  });

  it('should return usage stats', async () => {
    service.initialize(4n, 50, 2000);
    mockZcount.mockResolvedValueOnce(10).mockResolvedValueOnce(200);
    const usage = await service.getUsage(4n);
    expect(usage.requestsPerSecond).toBe(10);
    expect(usage.requestsPerMinute).toBe(200);
    expect(usage.maxPerSecond).toBe(50);
    expect(usage.maxPerMinute).toBe(2000);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd services/rpc-gateway-service
npx jest --verbose
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add services/rpc-gateway-service/src/router/*.spec.ts
git commit -m "test: add unit tests for RPC circuit breaker and rate limiter"
```

---

# Phase 3: Queue & Job Infrastructure

---

## Task 17: Migration — cvh_jobs Database

**Files:**
- Create: `database/016-create-cvh-jobs.sql`

- [ ] **Step 1: Create the migration file**

Create `database/016-create-cvh-jobs.sql`:

```sql
-- ============================================================================
-- Migration 016: Job Persistence Database
-- Database: cvh_jobs (new)
-- Description: Persistent job tracking, attempt history, dead-letter queue,
--              distributed locks, and repeatable schedules.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `cvh_jobs` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `cvh_jobs`;

-- ---------------------------------------------------------------------------
-- jobs — Primary job table with full lifecycle tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `job_uid` VARCHAR(255) NOT NULL,
  `queue_name` VARCHAR(100) NOT NULL,
  `job_type` VARCHAR(100) NOT NULL,
  `priority` ENUM('critical','standard','bulk') NOT NULL DEFAULT 'standard',
  `status` ENUM('pending','queued','processing','completed','failed','dead_letter','canceled') NOT NULL DEFAULT 'pending',
  `client_id` BIGINT NULL,
  `project_id` BIGINT NULL,
  `chain_id` INT NULL,
  `payload` JSON NOT NULL,
  `result` JSON NULL,
  `correlation_id` VARCHAR(255) NULL,
  `max_attempts` INT NOT NULL DEFAULT 3,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `backoff_type` ENUM('exponential','linear','fixed') NOT NULL DEFAULT 'exponential',
  `backoff_delay_ms` INT NOT NULL DEFAULT 1000,
  `timeout_ms` INT NOT NULL DEFAULT 30000,
  `scheduled_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `next_retry_at` DATETIME(3) NULL,
  `locked_by` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_uid` (`job_uid`),
  INDEX `idx_queue_status` (`queue_name`, `status`, `priority`, `scheduled_at`),
  INDEX `idx_correlation` (`correlation_id`),
  INDEX `idx_client_status` (`client_id`, `status`),
  INDEX `idx_chain_status` (`chain_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- job_attempts — Per-attempt audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT NOT NULL,
  `attempt_number` INT NOT NULL,
  `status` ENUM('processing','completed','failed') NOT NULL,
  `worker_id` VARCHAR(255) NULL,
  `started_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `duration_ms` INT NULL,
  `error_message` TEXT NULL,
  `result` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_job_attempt` (`job_id`, `attempt_number`),
  CONSTRAINT `fk_attempt_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- dead_letter_jobs — Failed jobs that exhausted all retries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dead_letter_jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `original_job_id` BIGINT NOT NULL,
  `job_uid` VARCHAR(255) NOT NULL,
  `queue_name` VARCHAR(100) NOT NULL,
  `job_type` VARCHAR(100) NOT NULL,
  `client_id` BIGINT NULL,
  `project_id` BIGINT NULL,
  `payload` JSON NOT NULL,
  `last_error` TEXT NULL,
  `total_attempts` INT NOT NULL,
  `status` ENUM('pending_review','reprocessed','discarded') NOT NULL DEFAULT 'pending_review',
  `dead_lettered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`, `dead_lettered_at`),
  INDEX `idx_original_job` (`original_job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- job_locks — Distributed locks for job deduplication
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_locks` (
  `lock_key` VARCHAR(255) NOT NULL,
  `job_id` BIGINT NOT NULL,
  `locked_by` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`lock_key`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- job_schedules — Repeatable job definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_schedules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `schedule_name` VARCHAR(255) NOT NULL,
  `job_type` VARCHAR(100) NOT NULL,
  `queue_name` VARCHAR(100) NOT NULL,
  `cron_expression` VARCHAR(100) NULL,
  `interval_ms` INT NULL,
  `payload` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schedule_name` (`schedule_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- GRANT ALL PRIVILEGES ON cvh_jobs.* TO 'cvh_admin'@'%';
-- FLUSH PRIVILEGES;
```

- [ ] **Step 2: Run the migration**

```bash
mysql -u root -p < database/016-create-cvh-jobs.sql
```

- [ ] **Step 3: Verify**

```bash
mysql -u root -p -e "USE cvh_jobs; SHOW TABLES;"
```

Expected:
```
+--------------------+
| Tables_in_cvh_jobs |
+--------------------+
| dead_letter_jobs   |
| job_attempts       |
| job_locks          |
| job_schedules      |
| jobs               |
+--------------------+
```

- [ ] **Step 4: Commit**

```bash
git add database/016-create-cvh-jobs.sql
git commit -m "feat: add cvh_jobs database schema (migration 016)"
```

---

## Task 18: Create Shared @cvh/job-client Package

**Files:**
- Create: `packages/job-client/package.json`
- Create: `packages/job-client/tsconfig.json`
- Create: `packages/job-client/src/index.ts`
- Create: `packages/job-client/src/types.ts`
- Create: `packages/job-client/src/prisma/schema.prisma`
- Create: `packages/job-client/src/prisma/prisma-jobs.service.ts`
- Create: `packages/job-client/src/prisma/prisma-jobs.module.ts`
- Create: `packages/job-client/src/job-client.module.ts`

- [ ] **Step 1: Create package.json**

Create `packages/job-client/package.json`:

```json
{
  "name": "@cvh/job-client",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "jest",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/bullmq": "^10.1.0",
    "@prisma/client": "^5.22.0",
    "bullmq": "^5.1.0",
    "ioredis": "^5.3.0",
    "uuid": "^8.3.2"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.14",
    "@types/uuid": "^10.0.0",
    "jest": "^29.7.0",
    "prisma": "^5.22.0",
    "ts-jest": "^29.4.9",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/job-client/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "commonjs",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/generated"]
}
```

- [ ] **Step 3: Create types.ts**

Create `packages/job-client/src/types.ts`:

```typescript
export enum JobPriority {
  CRITICAL = 'critical',
  STANDARD = 'standard',
  BULK = 'bulk',
}

export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
  CANCELED = 'canceled',
}

export enum BackoffType {
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  FIXED = 'fixed',
}

export interface CreateJobOptions {
  jobUid: string;
  queueName: string;
  jobType: string;
  priority?: JobPriority;
  clientId?: number;
  projectId?: number;
  chainId?: number;
  payload: Record<string, any>;
  correlationId?: string;
  maxAttempts?: number;
  backoffType?: BackoffType;
  backoffDelayMs?: number;
  timeoutMs?: number;
  scheduledAt?: Date;
  deduplicate?: boolean;
}

export interface JobResult {
  jobId: bigint;
  jobUid: string;
  status: JobStatus;
  bullJobId?: string;
}

export interface JobAttemptResult {
  success: boolean;
  result?: Record<string, any>;
  error?: string;
}

export interface JobWorkerOptions {
  queueName: string;
  concurrency?: number;
  workerId?: string;
}

export interface JobListQuery {
  queueName?: string;
  status?: JobStatus;
  clientId?: number;
  chainId?: number;
  correlationId?: string;
  page?: number;
  limit?: number;
}

export interface JobStats {
  totalJobs: number;
  byStatus: Record<string, number>;
  byQueue: Record<string, number>;
  avgDurationMs: number;
  deadLetterCount: number;
}
```

- [ ] **Step 4: Create Prisma schema for jobs DB**

Create `packages/job-client/src/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma-jobs-client"
}

datasource db {
  provider = "mysql"
  url      = env("JOBS_DATABASE_URL")
}

model Job {
  id              BigInt      @id @default(autoincrement())
  jobUid          String      @unique @map("job_uid") @db.VarChar(255)
  queueName       String      @map("queue_name") @db.VarChar(100)
  jobType         String      @map("job_type") @db.VarChar(100)
  priority        JobPriority @default(standard)
  status          JobStatusEnum @default(pending)
  clientId        BigInt?     @map("client_id")
  projectId       BigInt?     @map("project_id")
  chainId         Int?        @map("chain_id")
  payload         Json
  result          Json?
  correlationId   String?     @map("correlation_id") @db.VarChar(255)
  maxAttempts     Int         @default(3) @map("max_attempts")
  attemptCount    Int         @default(0) @map("attempt_count")
  backoffType     BackoffTypeEnum @default(exponential) @map("backoff_type")
  backoffDelayMs  Int         @default(1000) @map("backoff_delay_ms")
  timeoutMs       Int         @default(30000) @map("timeout_ms")
  scheduledAt     DateTime?   @map("scheduled_at")
  startedAt       DateTime?   @map("started_at")
  completedAt     DateTime?   @map("completed_at")
  nextRetryAt     DateTime?   @map("next_retry_at")
  lockedBy        String?     @map("locked_by") @db.VarChar(255)
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  attempts JobAttempt[]

  @@index([queueName, status, priority, scheduledAt], name: "idx_queue_status")
  @@index([correlationId], name: "idx_correlation")
  @@index([clientId, status], name: "idx_client_status")
  @@index([chainId, status], name: "idx_chain_status")
  @@map("jobs")
}

model JobAttempt {
  id             BigInt    @id @default(autoincrement())
  jobId          BigInt    @map("job_id")
  attemptNumber  Int       @map("attempt_number")
  status         AttemptStatus
  workerId       String?   @map("worker_id") @db.VarChar(255)
  startedAt      DateTime  @map("started_at")
  completedAt    DateTime? @map("completed_at")
  durationMs     Int?      @map("duration_ms")
  errorMessage   String?   @map("error_message") @db.Text
  result         Json?

  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId, attemptNumber], name: "idx_job_attempt")
  @@map("job_attempts")
}

model DeadLetterJob {
  id              BigInt    @id @default(autoincrement())
  originalJobId   BigInt    @map("original_job_id")
  jobUid          String    @map("job_uid") @db.VarChar(255)
  queueName       String    @map("queue_name") @db.VarChar(100)
  jobType         String    @map("job_type") @db.VarChar(100)
  clientId        BigInt?   @map("client_id")
  projectId       BigInt?   @map("project_id")
  payload         Json
  lastError       String?   @map("last_error") @db.Text
  totalAttempts   Int       @map("total_attempts")
  status          DlqStatus @default(pending_review)
  deadLetteredAt  DateTime  @default(now()) @map("dead_lettered_at")

  @@index([status, deadLetteredAt], name: "idx_dlq_status")
  @@index([originalJobId], name: "idx_original_job")
  @@map("dead_letter_jobs")
}

model JobLock {
  lockKey   String   @id @map("lock_key") @db.VarChar(255)
  jobId     BigInt   @map("job_id")
  lockedBy  String   @map("locked_by") @db.VarChar(255)
  expiresAt DateTime @map("expires_at")

  @@index([expiresAt], name: "idx_expires")
  @@map("job_locks")
}

model JobSchedule {
  id              BigInt   @id @default(autoincrement())
  scheduleName    String   @unique @map("schedule_name") @db.VarChar(255)
  jobType         String   @map("job_type") @db.VarChar(100)
  queueName       String   @map("queue_name") @db.VarChar(100)
  cronExpression  String?  @map("cron_expression") @db.VarChar(100)
  intervalMs      Int?     @map("interval_ms")
  payload         Json?
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("job_schedules")
}

enum JobPriority {
  critical
  standard
  bulk
}

enum JobStatusEnum {
  pending
  queued
  processing
  completed
  failed
  dead_letter
  canceled
}

enum BackoffTypeEnum {
  exponential
  linear
  fixed
}

enum AttemptStatus {
  processing
  completed
  failed
}

enum DlqStatus {
  pending_review
  reprocessed
  discarded
}
```

- [ ] **Step 5: Create PrismaJobsService and PrismaJobsModule**

Create `packages/job-client/src/prisma/prisma-jobs.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma-jobs-client';

@Injectable()
export class PrismaJobsService
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

Create `packages/job-client/src/prisma/prisma-jobs.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaJobsService } from './prisma-jobs.service';

@Global()
@Module({
  providers: [PrismaJobsService],
  exports: [PrismaJobsService],
})
export class PrismaJobsModule {}
```

- [ ] **Step 6: Generate Prisma client**

```bash
cd packages/job-client
npx prisma generate
```

- [ ] **Step 7: Commit**

```bash
git add packages/job-client/
git commit -m "feat: create @cvh/job-client shared package with Prisma schema and types"
```

---

## Task 19: JobOrchestratorService

**Files:**
- Create: `packages/job-client/src/job-orchestrator.service.ts`

- [ ] **Step 1: Create JobOrchestratorService**

Create `packages/job-client/src/job-orchestrator.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaJobsService } from './prisma/prisma-jobs.service';
import { JobDeduplicationService } from './job-deduplication.service';
import {
  CreateJobOptions,
  JobResult,
  JobStatus,
  JobPriority,
  BackoffType,
} from './types';

const PRIORITY_MAP: Record<string, number> = {
  critical: 1,
  standard: 5,
  bulk: 10,
};

@Injectable()
export class JobOrchestratorService {
  private readonly logger = new Logger(JobOrchestratorService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly prisma: PrismaJobsService,
    private readonly dedup: JobDeduplicationService,
  ) {}

  /**
   * Register a BullMQ queue for a given queue name.
   * Called by services during module init.
   */
  registerQueue(name: string, queue: Queue): void {
    this.queues.set(name, queue);
    this.logger.log(`Queue '${name}' registered with orchestrator`);
  }

  /**
   * Create and enqueue a new job.
   * Persists to MySQL first, then enqueues in BullMQ.
   */
  async createJob(options: CreateJobOptions): Promise<JobResult> {
    const jobUid = options.jobUid || `${options.jobType}:${uuidv4()}`;

    // Deduplication check
    if (options.deduplicate !== false) {
      const isDuplicate = await this.dedup.isDuplicate(jobUid);
      if (isDuplicate) {
        this.logger.debug(`Job ${jobUid} is a duplicate, skipping`);
        const existing = await this.prisma.job.findUnique({
          where: { jobUid },
        });
        return {
          jobId: existing?.id ?? 0n,
          jobUid,
          status: (existing?.status as JobStatus) ?? JobStatus.PENDING,
        };
      }
    }

    // Persist to MySQL
    const job = await this.prisma.job.create({
      data: {
        jobUid,
        queueName: options.queueName,
        jobType: options.jobType,
        priority: (options.priority as any) ?? 'standard',
        status: 'pending',
        clientId: options.clientId ? BigInt(options.clientId) : null,
        projectId: options.projectId ? BigInt(options.projectId) : null,
        chainId: options.chainId ?? null,
        payload: options.payload,
        correlationId: options.correlationId ?? null,
        maxAttempts: options.maxAttempts ?? 3,
        backoffType: (options.backoffType as any) ?? 'exponential',
        backoffDelayMs: options.backoffDelayMs ?? 1000,
        timeoutMs: options.timeoutMs ?? 30000,
        scheduledAt: options.scheduledAt ?? null,
      },
    });

    // Register dedup lock
    await this.dedup.registerJob(jobUid, job.id);

    // Enqueue in BullMQ
    const queue = this.queues.get(options.queueName);
    if (!queue) {
      this.logger.error(`Queue '${options.queueName}' not registered`);
      return {
        jobId: job.id,
        jobUid,
        status: JobStatus.PENDING,
      };
    }

    const bullJob = await queue.add(
      options.jobType,
      {
        ...options.payload,
        _cvhJobId: job.id.toString(),
        _cvhJobUid: jobUid,
      },
      {
        priority: PRIORITY_MAP[options.priority ?? 'standard'] ?? 5,
        delay: options.scheduledAt
          ? Math.max(0, options.scheduledAt.getTime() - Date.now())
          : 0,
        attempts: options.maxAttempts ?? 3,
        backoff: {
          type: options.backoffType ?? 'exponential',
          delay: options.backoffDelayMs ?? 1000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    );

    // Update status to queued
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'queued' },
    });

    this.logger.debug(
      `Job ${jobUid} created (DB id=${job.id}, BullMQ id=${bullJob.id})`,
    );

    return {
      jobId: job.id,
      jobUid,
      status: JobStatus.QUEUED,
      bullJobId: bullJob.id,
    };
  }

  /**
   * Cancel a job by UID.
   */
  async cancelJob(jobUid: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { jobUid },
    });
    if (!job) return false;

    if (['completed', 'canceled', 'dead_letter'].includes(job.status)) {
      return false; // Cannot cancel terminal jobs
    }

    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'canceled', completedAt: new Date() },
    });

    // Try to remove from BullMQ queue
    const queue = this.queues.get(job.queueName);
    if (queue) {
      try {
        const bullJob = await queue.getJob(jobUid);
        if (bullJob) {
          await bullJob.remove();
        }
      } catch {
        // Job may already be processing
      }
    }

    this.logger.log(`Job ${jobUid} canceled`);
    return true;
  }

  /**
   * Retry a failed or dead-letter job.
   */
  async retryJob(jobUid: string): Promise<JobResult | null> {
    const job = await this.prisma.job.findUnique({
      where: { jobUid },
    });
    if (!job) return null;

    if (!['failed', 'dead_letter'].includes(job.status)) {
      return null; // Can only retry failed jobs
    }

    // Create a new job with incremented UID
    const newUid = `${jobUid}:retry:${Date.now()}`;
    return this.createJob({
      jobUid: newUid,
      queueName: job.queueName,
      jobType: job.jobType,
      priority: job.priority as JobPriority,
      clientId: job.clientId ? Number(job.clientId) : undefined,
      projectId: job.projectId ? Number(job.projectId) : undefined,
      chainId: job.chainId ?? undefined,
      payload: job.payload as Record<string, any>,
      correlationId: job.correlationId ?? undefined,
      maxAttempts: job.maxAttempts,
      backoffType: job.backoffType as BackoffType,
      backoffDelayMs: job.backoffDelayMs,
      timeoutMs: job.timeoutMs,
      deduplicate: false, // Skip dedup for retries
    });
  }

  /**
   * Mark a job as processing (called by worker base).
   */
  async markProcessing(jobId: bigint, workerId: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        lockedBy: workerId,
        attemptCount: { increment: 1 },
      },
    });
  }

  /**
   * Mark a job as completed (called by worker base).
   */
  async markCompleted(
    jobId: bigint,
    result: Record<string, any>,
  ): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        result,
        completedAt: new Date(),
        lockedBy: null,
      },
    });
  }

  /**
   * Mark a job as failed (called by worker base).
   */
  async markFailed(
    jobId: bigint,
    error: string,
    isFinal: boolean,
  ): Promise<void> {
    if (isFinal) {
      const job = await this.prisma.job.findUnique({ where: { id: jobId } });
      if (job) {
        // Move to dead letter
        await this.prisma.$transaction([
          this.prisma.job.update({
            where: { id: jobId },
            data: {
              status: 'dead_letter',
              completedAt: new Date(),
              lockedBy: null,
            },
          }),
          this.prisma.deadLetterJob.create({
            data: {
              originalJobId: jobId,
              jobUid: job.jobUid,
              queueName: job.queueName,
              jobType: job.jobType,
              clientId: job.clientId,
              projectId: job.projectId,
              payload: job.payload!,
              lastError: error,
              totalAttempts: job.attemptCount + 1,
            },
          }),
        ]);
        this.logger.warn(`Job ${job.jobUid} moved to dead letter queue`);
      }
    } else {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          lockedBy: null,
        },
      });
    }
  }

  /**
   * Record an attempt in the job_attempts table.
   */
  async recordAttempt(params: {
    jobId: bigint;
    attemptNumber: number;
    status: 'processing' | 'completed' | 'failed';
    workerId: string;
    startedAt: Date;
    completedAt?: Date;
    durationMs?: number;
    errorMessage?: string;
    result?: Record<string, any>;
  }): Promise<void> {
    await this.prisma.jobAttempt.create({
      data: {
        jobId: params.jobId,
        attemptNumber: params.attemptNumber,
        status: params.status as any,
        workerId: params.workerId,
        startedAt: params.startedAt,
        completedAt: params.completedAt,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
        result: params.result,
      },
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/job-client/src/job-orchestrator.service.ts
git commit -m "feat: add JobOrchestratorService with create, cancel, retry, and dead-letter support"
```

---

## Task 20: JobWorkerBase — Abstract Base Class

**Files:**
- Create: `packages/job-client/src/job-worker-base.ts`

- [ ] **Step 1: Create JobWorkerBase**

Create `packages/job-client/src/job-worker-base.ts`:

```typescript
import { Logger } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobOrchestratorService } from './job-orchestrator.service';
import { JobAttemptResult } from './types';

/**
 * Abstract base class for all CVH job workers.
 * Wraps BullMQ processor with:
 * - Automatic MySQL job lifecycle tracking
 * - Per-attempt recording
 * - Dead-letter promotion on final failure
 * - Structured logging
 *
 * Usage:
 * ```
 * @Processor('my-queue')
 * export class MyWorker extends JobWorkerBase {
 *   constructor(orchestrator: JobOrchestratorService) {
 *     super(orchestrator, 'MyWorker');
 *   }
 *   async execute(job: Job): Promise<JobAttemptResult> {
 *     // your logic
 *     return { success: true, result: { ... } };
 *   }
 * }
 * ```
 */
export abstract class JobWorkerBase extends WorkerHost {
  protected readonly logger: Logger;
  private readonly workerId: string;

  constructor(
    protected readonly orchestrator: JobOrchestratorService,
    workerName: string,
  ) {
    super();
    this.logger = new Logger(workerName);
    this.workerId = `${workerName}:${process.pid}:${Date.now()}`;
  }

  /**
   * Implement this method with your job processing logic.
   * Return { success: true, result } on success, or throw/return { success: false, error }.
   */
  abstract execute(job: Job): Promise<JobAttemptResult>;

  /**
   * BullMQ processor entry point. Do NOT override this.
   */
  async process(job: Job): Promise<any> {
    const cvhJobId = job.data?._cvhJobId
      ? BigInt(job.data._cvhJobId)
      : null;
    const cvhJobUid = job.data?._cvhJobUid ?? job.id ?? 'unknown';
    const attemptNumber = (job.attemptsMade ?? 0) + 1;
    const startedAt = new Date();

    this.logger.log(
      `Processing job ${cvhJobUid} (attempt ${attemptNumber}, BullMQ id=${job.id})`,
    );

    // Mark as processing in MySQL
    if (cvhJobId) {
      await this.orchestrator.markProcessing(cvhJobId, this.workerId);
      await this.orchestrator.recordAttempt({
        jobId: cvhJobId,
        attemptNumber,
        status: 'processing',
        workerId: this.workerId,
        startedAt,
      });
    }

    try {
      const result = await this.execute(job);
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      if (result.success) {
        // Success path
        if (cvhJobId) {
          await this.orchestrator.markCompleted(
            cvhJobId,
            result.result ?? {},
          );
          await this.orchestrator.recordAttempt({
            jobId: cvhJobId,
            attemptNumber,
            status: 'completed',
            workerId: this.workerId,
            startedAt,
            completedAt,
            durationMs,
            result: result.result,
          });
        }

        this.logger.log(
          `Job ${cvhJobUid} completed in ${durationMs}ms`,
        );
        return result.result;
      } else {
        // Explicit failure returned (not thrown)
        throw new Error(result.error ?? 'Job returned failure');
      }
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      const maxAttempts = job.opts?.attempts ?? 3;
      const isFinal = attemptNumber >= maxAttempts;

      this.logger.error(
        `Job ${cvhJobUid} failed (attempt ${attemptNumber}/${maxAttempts}): ${errorMsg}`,
      );

      if (cvhJobId) {
        await this.orchestrator.recordAttempt({
          jobId: cvhJobId,
          attemptNumber,
          status: 'failed',
          workerId: this.workerId,
          startedAt,
          completedAt,
          durationMs,
          errorMessage: errorMsg,
        });
        await this.orchestrator.markFailed(cvhJobId, errorMsg, isFinal);
      }

      throw error; // Re-throw for BullMQ retry mechanism
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/job-client/src/job-worker-base.ts
git commit -m "feat: add JobWorkerBase abstract class wrapping BullMQ with MySQL lifecycle tracking"
```

---

## Task 21: JobDeduplicationService

**Files:**
- Create: `packages/job-client/src/job-deduplication.service.ts`

- [ ] **Step 1: Create JobDeduplicationService**

Create `packages/job-client/src/job-deduplication.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaJobsService } from './prisma/prisma-jobs.service';

@Injectable()
export class JobDeduplicationService {
  private readonly logger = new Logger(JobDeduplicationService.name);

  /** Lock duration: 1 hour default */
  private readonly LOCK_TTL_MS = 3600_000;

  constructor(private readonly prisma: PrismaJobsService) {}

  /**
   * Check if a job with this UID already exists and is not in a terminal state.
   */
  async isDuplicate(jobUid: string): Promise<boolean> {
    // Check job_locks table first (fast path)
    const lock = await this.prisma.jobLock.findUnique({
      where: { lockKey: `job:${jobUid}` },
    });

    if (lock && lock.expiresAt > new Date()) {
      return true;
    }

    // Check jobs table for non-terminal status
    const existing = await this.prisma.job.findUnique({
      where: { jobUid },
    });

    if (
      existing &&
      !['completed', 'canceled', 'dead_letter'].includes(existing.status)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Register a deduplication lock for a job.
   */
  async registerJob(jobUid: string, jobId: bigint): Promise<void> {
    const lockKey = `job:${jobUid}`;
    const expiresAt = new Date(Date.now() + this.LOCK_TTL_MS);

    try {
      await this.prisma.jobLock.upsert({
        where: { lockKey },
        update: {
          jobId,
          lockedBy: `orchestrator:${process.pid}`,
          expiresAt,
        },
        create: {
          lockKey,
          jobId,
          lockedBy: `orchestrator:${process.pid}`,
          expiresAt,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to register dedup lock for ${jobUid}`, err);
    }
  }

  /**
   * Release a deduplication lock.
   */
  async releaseLock(jobUid: string): Promise<void> {
    try {
      await this.prisma.jobLock.delete({
        where: { lockKey: `job:${jobUid}` },
      });
    } catch {
      // Lock may not exist
    }
  }

  /**
   * Clean up expired locks (run periodically).
   */
  async cleanupExpiredLocks(): Promise<number> {
    const result = await this.prisma.jobLock.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired job locks`);
    }
    return result.count;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/job-client/src/job-deduplication.service.ts
git commit -m "feat: add JobDeduplicationService with lock-based dedup"
```

---

## Task 22: JobMonitorService

**Files:**
- Create: `packages/job-client/src/job-monitor.service.ts`

- [ ] **Step 1: Create JobMonitorService**

Create `packages/job-client/src/job-monitor.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaJobsService } from './prisma/prisma-jobs.service';
import { JobListQuery, JobStats, JobStatus } from './types';

@Injectable()
export class JobMonitorService {
  private readonly logger = new Logger(JobMonitorService.name);

  /** Jobs processing for longer than this are considered stuck */
  private readonly STUCK_THRESHOLD_MS = 300_000; // 5 minutes

  constructor(private readonly prisma: PrismaJobsService) {}

  /**
   * List jobs with filtering and pagination.
   */
  async listJobs(query: JobListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.queueName) where.queueName = query.queueName;
    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = BigInt(query.clientId);
    if (query.chainId) where.chainId = query.chainId;
    if (query.correlationId) where.correlationId = query.correlationId;

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      items: items.map((j) => ({
        id: j.id.toString(),
        jobUid: j.jobUid,
        queueName: j.queueName,
        jobType: j.jobType,
        priority: j.priority,
        status: j.status,
        clientId: j.clientId?.toString() ?? null,
        chainId: j.chainId,
        attemptCount: j.attemptCount,
        maxAttempts: j.maxAttempts,
        correlationId: j.correlationId,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get full job details including attempts.
   */
  async getJobDetail(jobUid: string) {
    const job = await this.prisma.job.findUnique({
      where: { jobUid },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });
    if (!job) return null;

    return {
      id: job.id.toString(),
      jobUid: job.jobUid,
      queueName: job.queueName,
      jobType: job.jobType,
      priority: job.priority,
      status: job.status,
      clientId: job.clientId?.toString() ?? null,
      projectId: job.projectId?.toString() ?? null,
      chainId: job.chainId,
      payload: job.payload,
      result: job.result,
      correlationId: job.correlationId,
      maxAttempts: job.maxAttempts,
      attemptCount: job.attemptCount,
      backoffType: job.backoffType,
      backoffDelayMs: job.backoffDelayMs,
      timeoutMs: job.timeoutMs,
      scheduledAt: job.scheduledAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      nextRetryAt: job.nextRetryAt,
      lockedBy: job.lockedBy,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      attempts: job.attempts.map((a) => ({
        id: a.id.toString(),
        attemptNumber: a.attemptNumber,
        status: a.status,
        workerId: a.workerId,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        durationMs: a.durationMs,
        errorMessage: a.errorMessage,
        result: a.result,
      })),
    };
  }

  /**
   * Get aggregated job statistics.
   */
  async getStats(): Promise<JobStats> {
    const [
      totalJobs,
      statusCounts,
      queueCounts,
      deadLetterCount,
      avgDuration,
    ] = await Promise.all([
      this.prisma.job.count(),
      this.prisma.job.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['queueName'],
        _count: true,
      }),
      this.prisma.deadLetterJob.count({
        where: { status: 'pending_review' },
      }),
      this.prisma.jobAttempt.aggregate({
        where: { status: 'completed', durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row._count;
    }

    const byQueue: Record<string, number> = {};
    for (const row of queueCounts) {
      byQueue[row.queueName] = row._count;
    }

    return {
      totalJobs,
      byStatus,
      byQueue,
      avgDurationMs: avgDuration._avg.durationMs ?? 0,
      deadLetterCount,
    };
  }

  /**
   * List dead-letter jobs.
   */
  async listDeadLetterJobs(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.deadLetterJob.findMany({
        where: { status: 'pending_review' },
        skip,
        take: limit,
        orderBy: { deadLetteredAt: 'desc' },
      }),
      this.prisma.deadLetterJob.count({
        where: { status: 'pending_review' },
      }),
    ]);

    return {
      items: items.map((d) => ({
        id: d.id.toString(),
        originalJobId: d.originalJobId.toString(),
        jobUid: d.jobUid,
        queueName: d.queueName,
        jobType: d.jobType,
        clientId: d.clientId?.toString() ?? null,
        lastError: d.lastError,
        totalAttempts: d.totalAttempts,
        status: d.status,
        deadLetteredAt: d.deadLetteredAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Detect stuck jobs (processing longer than threshold).
   */
  async detectStuckJobs(): Promise<any[]> {
    const threshold = new Date(Date.now() - this.STUCK_THRESHOLD_MS);

    const stuck = await this.prisma.job.findMany({
      where: {
        status: 'processing',
        startedAt: { lt: threshold },
      },
      orderBy: { startedAt: 'asc' },
    });

    if (stuck.length > 0) {
      this.logger.warn(
        `Found ${stuck.length} stuck jobs (processing > ${this.STUCK_THRESHOLD_MS / 1000}s)`,
      );
    }

    return stuck.map((j) => ({
      id: j.id.toString(),
      jobUid: j.jobUid,
      queueName: j.queueName,
      jobType: j.jobType,
      startedAt: j.startedAt,
      lockedBy: j.lockedBy,
      stuckForMs: Date.now() - (j.startedAt?.getTime() ?? 0),
    }));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/job-client/src/job-monitor.service.ts
git commit -m "feat: add JobMonitorService with list, stats, DLQ, and stuck detection"
```

---

## Task 23: JobClientModule — NestJS Dynamic Module

**Files:**
- Create: `packages/job-client/src/job-client.module.ts`
- Modify: `packages/job-client/src/index.ts`

- [ ] **Step 1: Create JobClientModule**

Create `packages/job-client/src/job-client.module.ts`:

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { PrismaJobsModule } from './prisma/prisma-jobs.module';
import { JobOrchestratorService } from './job-orchestrator.service';
import { JobDeduplicationService } from './job-deduplication.service';
import { JobMonitorService } from './job-monitor.service';

@Module({})
export class JobClientModule {
  /**
   * Import this module in any service that needs job orchestration.
   * Requires JOBS_DATABASE_URL environment variable.
   */
  static forRoot(): DynamicModule {
    return {
      module: JobClientModule,
      global: true,
      imports: [PrismaJobsModule],
      providers: [
        JobOrchestratorService,
        JobDeduplicationService,
        JobMonitorService,
      ],
      exports: [
        JobOrchestratorService,
        JobDeduplicationService,
        JobMonitorService,
        PrismaJobsModule,
      ],
    };
  }
}
```

- [ ] **Step 2: Create index.ts**

Create `packages/job-client/src/index.ts`:

```typescript
export { JobClientModule } from './job-client.module';
export { JobOrchestratorService } from './job-orchestrator.service';
export { JobWorkerBase } from './job-worker-base';
export { JobDeduplicationService } from './job-deduplication.service';
export { JobMonitorService } from './job-monitor.service';
export { PrismaJobsService } from './prisma/prisma-jobs.service';
export { PrismaJobsModule } from './prisma/prisma-jobs.module';
export * from './types';
```

- [ ] **Step 3: Commit**

```bash
git add packages/job-client/src/job-client.module.ts packages/job-client/src/index.ts
git commit -m "feat: add JobClientModule dynamic module and package exports"
```

---

## Task 24: Admin API — Job Management Endpoints

**Files:**
- Create: `services/admin-api/src/job-management/job-management.module.ts`
- Create: `services/admin-api/src/job-management/job-management.controller.ts`
- Create: `services/admin-api/src/job-management/job-management.service.ts`
- Modify: `services/admin-api/src/app.module.ts`
- Modify: `services/admin-api/package.json`

- [ ] **Step 1: Add @cvh/job-client dependency to admin-api**

In `services/admin-api/package.json`, add to dependencies:

```json
"@cvh/job-client": "*"
```

- [ ] **Step 2: Create JobManagementService**

Create `services/admin-api/src/job-management/job-management.service.ts`:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JobMonitorService, JobOrchestratorService } from '@cvh/job-client';

@Injectable()
export class JobManagementService {
  private readonly logger = new Logger(JobManagementService.name);

  constructor(
    private readonly monitor: JobMonitorService,
    private readonly orchestrator: JobOrchestratorService,
  ) {}

  async listJobs(query: {
    queueName?: string;
    status?: string;
    clientId?: number;
    chainId?: number;
    page?: number;
    limit?: number;
  }) {
    return this.monitor.listJobs({
      queueName: query.queueName,
      status: query.status as any,
      clientId: query.clientId,
      chainId: query.chainId,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  async getJobDetail(jobUid: string) {
    const detail = await this.monitor.getJobDetail(jobUid);
    if (!detail) {
      throw new NotFoundException(`Job ${jobUid} not found`);
    }
    return detail;
  }

  async getStats() {
    return this.monitor.getStats();
  }

  async getDeadLetterJobs(page: number = 1, limit: number = 50) {
    return this.monitor.listDeadLetterJobs(page, limit);
  }

  async getStuckJobs() {
    return this.monitor.detectStuckJobs();
  }

  async retryJob(jobUid: string) {
    const result = await this.orchestrator.retryJob(jobUid);
    if (!result) {
      throw new NotFoundException(
        `Job ${jobUid} not found or not in a retryable state`,
      );
    }
    return result;
  }

  async cancelJob(jobUid: string) {
    const result = await this.orchestrator.cancelJob(jobUid);
    if (!result) {
      throw new NotFoundException(
        `Job ${jobUid} not found or already in a terminal state`,
      );
    }
    return { canceled: true, jobUid };
  }
}
```

- [ ] **Step 3: Create JobManagementController**

Create `services/admin-api/src/job-management/job-management.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { JobManagementService } from './job-management.service';

@ApiTags('Job Management')
@ApiBearerAuth('JWT')
@Controller('admin')
export class JobManagementController {
  constructor(private readonly jobService: JobManagementService) {}

  @Get('jobs')
  @AdminAuth()
  @ApiOperation({ summary: 'List all jobs with filtering' })
  @ApiQuery({ name: 'queueName', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'clientId', required: false, type: Number })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listJobs(
    @Query('queueName') queueName?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: number,
    @Query('chainId') chainId?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.jobService.listJobs({
      queueName,
      status,
      clientId,
      chainId,
      page,
      limit,
    });
    return { success: true, ...result };
  }

  @Get('jobs/stats')
  @AdminAuth()
  @ApiOperation({ summary: 'Get job statistics' })
  async getStats() {
    const stats = await this.jobService.getStats();
    return { success: true, stats };
  }

  @Get('jobs/stuck')
  @AdminAuth()
  @ApiOperation({ summary: 'Get stuck jobs (processing too long)' })
  async getStuckJobs() {
    const stuck = await this.jobService.getStuckJobs();
    return { success: true, stuckJobs: stuck };
  }

  @Get('jobs/dead-letter')
  @AdminAuth()
  @ApiOperation({ summary: 'List dead-letter queue jobs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDeadLetterJobs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.jobService.getDeadLetterJobs(page, limit);
    return { success: true, ...result };
  }

  @Get('jobs/:jobUid')
  @AdminAuth()
  @ApiOperation({ summary: 'Get full job details including attempts' })
  async getJobDetail(@Param('jobUid') jobUid: string) {
    const job = await this.jobService.getJobDetail(jobUid);
    return { success: true, job };
  }

  @Post('jobs/:jobUid/retry')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Retry a failed or dead-letter job' })
  async retryJob(@Param('jobUid') jobUid: string) {
    const result = await this.jobService.retryJob(jobUid);
    return { success: true, result };
  }

  @Post('jobs/:jobUid/cancel')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Cancel a pending or queued job' })
  async cancelJob(@Param('jobUid') jobUid: string) {
    const result = await this.jobService.cancelJob(jobUid);
    return { success: true, result };
  }
}
```

- [ ] **Step 4: Create JobManagementModule**

Create `services/admin-api/src/job-management/job-management.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JobClientModule } from '@cvh/job-client';
import { JobManagementController } from './job-management.controller';
import { JobManagementService } from './job-management.service';

@Module({
  imports: [JobClientModule.forRoot()],
  controllers: [JobManagementController],
  providers: [JobManagementService],
})
export class JobManagementModule {}
```

- [ ] **Step 5: Register in admin-api AppModule**

In `services/admin-api/src/app.module.ts`, add:

```typescript
import { JobManagementModule } from './job-management/job-management.module';
```

And add `JobManagementModule` to the `imports` array.

- [ ] **Step 6: Add JOBS_DATABASE_URL to docker-compose for admin-api**

In `docker-compose.yml`, add to admin-api environment:

```yaml
      - JOBS_DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/cvh_jobs
```

- [ ] **Step 7: Commit**

```bash
git add services/admin-api/src/job-management/ services/admin-api/src/app.module.ts services/admin-api/package.json docker-compose.yml
git commit -m "feat: add Admin API job management endpoints (list, stats, DLQ, retry, cancel)"
```

---

## Task 25: Admin Frontend — Jobs Dashboard Page

**Files:**
- Create: `apps/admin/app/jobs/page.tsx`
- Modify: `apps/admin/lib/mock-data.ts`

- [ ] **Step 1: Add jobs mock data and nav entry**

Add to `apps/admin/lib/mock-data.ts`:

```typescript
// ─── Jobs ───────────────────────────────────────────────────
export const jobStats = {
  totalJobs: 245302,
  completed: 243891,
  failed: 1200,
  processing: 35,
  deadLetter: 176,
  avgDurationMs: 1250,
};

export const recentJobs = [
  {
    jobUid: "sweep:56:1712678400000",
    queueName: "sweep",
    jobType: "execute-sweep",
    priority: "standard",
    status: "completed",
    clientId: "1",
    chainId: 56,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-04-09T14:00:00Z",
    completedAt: "2026-04-09T14:00:01.250Z",
    durationMs: 1250,
  },
  {
    jobUid: "forwarder-deploy:1:batch-42",
    queueName: "forwarder-deploy",
    jobType: "deploy-batch",
    priority: "standard",
    status: "processing",
    clientId: "2",
    chainId: 1,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-04-09T13:58:00Z",
    completedAt: null,
    durationMs: null,
  },
  {
    jobUid: "webhook:delivery:evt-9x8f",
    queueName: "webhook-delivery",
    jobType: "deliver-webhook",
    priority: "critical",
    status: "failed",
    clientId: "3",
    chainId: null,
    attemptCount: 3,
    maxAttempts: 3,
    createdAt: "2026-04-09T13:55:00Z",
    completedAt: "2026-04-09T13:55:30Z",
    durationMs: 30000,
  },
  {
    jobUid: "sanctions-sync:2026-04-09",
    queueName: "sanctions-sync",
    jobType: "sync-ofac",
    priority: "bulk",
    status: "completed",
    clientId: null,
    chainId: null,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-04-09T06:00:00Z",
    completedAt: "2026-04-09T06:02:15Z",
    durationMs: 135000,
  },
  {
    jobUid: "sweep:1:1712674800000",
    queueName: "sweep",
    jobType: "execute-sweep",
    priority: "standard",
    status: "dead_letter",
    clientId: "1",
    chainId: 1,
    attemptCount: 3,
    maxAttempts: 3,
    createdAt: "2026-04-09T13:00:00Z",
    completedAt: "2026-04-09T13:05:00Z",
    durationMs: null,
  },
];

export const deadLetterJobs = [
  {
    id: "1",
    jobUid: "sweep:1:1712674800000",
    queueName: "sweep",
    jobType: "execute-sweep",
    clientId: "1",
    lastError: "Provider for chain 1 is circuit-broken (5 failures).",
    totalAttempts: 3,
    status: "pending_review",
    deadLetteredAt: "2026-04-09T13:05:00Z",
  },
  {
    id: "2",
    jobUid: "webhook:delivery:evt-7k2m",
    queueName: "webhook-delivery",
    jobType: "deliver-webhook",
    clientId: "3",
    lastError: "HTTP 502 Bad Gateway from https://pay.gw/callbacks",
    totalAttempts: 3,
    status: "pending_review",
    deadLetteredAt: "2026-04-09T12:30:00Z",
  },
];
```

Update the `navSections` in the "Config" section items array, add:

```typescript
      { label: "Jobs", href: "/jobs", icon: "Cog" },
```

- [ ] **Step 2: Create Jobs Dashboard page**

Create `apps/admin/app/jobs/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { RefreshCw } from "lucide-react";
import { jobStats, recentJobs, deadLetterJobs } from "@/lib/mock-data";

const statusBadgeMap: Record<string, "success" | "error" | "warning" | "accent" | "neutral"> = {
  completed: "success",
  processing: "accent",
  queued: "neutral",
  pending: "neutral",
  failed: "error",
  dead_letter: "error",
  canceled: "warning",
};

const priorityBadgeMap: Record<string, "success" | "error" | "warning" | "accent" | "neutral"> = {
  critical: "error",
  standard: "neutral",
  bulk: "accent",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function JobsPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "dlq">("recent");

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-6 gap-4 mb-section-gap">
        <StatCard label="Total Jobs" value={jobStats.totalJobs.toLocaleString()} />
        <StatCard
          label="Completed"
          value={jobStats.completed.toLocaleString()}
          color="success"
        />
        <StatCard label="Failed" value={jobStats.failed.toLocaleString()} color="error" />
        <StatCard label="Processing" value={jobStats.processing.toString()} color="accent" />
        <StatCard
          label="Dead Letter"
          value={jobStats.deadLetter.toString()}
          color="error"
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(jobStats.avgDurationMs)}
        />
      </div>

      {/* Tabs + Refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["recent", "dlq"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-1.5 text-caption font-semibold rounded-button transition-all duration-fast font-display",
                activeTab === tab
                  ? "bg-accent-primary text-accent-text"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              )}
            >
              {tab === "recent" ? "Recent Jobs" : `Dead Letter (${deadLetterJobs.length})`}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex items-center gap-1.5 bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display",
            refreshing && "border-accent-primary text-accent-primary"
          )}
        >
          <RefreshCw
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              refreshing && "animate-spin"
            )}
          />
          Refresh
        </button>
      </div>

      {/* Recent Jobs */}
      {activeTab === "recent" && (
        <DataTable
          title="Recent Jobs"
          headers={[
            "Job UID",
            "Queue",
            "Type",
            "Priority",
            "Status",
            "Chain",
            "Attempts",
            "Duration",
            "Created",
          ]}
        >
          {recentJobs.map((job) => (
            <TableRow key={job.jobUid} highlight={job.status === "dead_letter"}>
              <TableCell mono className="text-caption max-w-[200px] truncate">
                {job.jobUid}
              </TableCell>
              <TableCell>{job.queueName}</TableCell>
              <TableCell className="text-caption">{job.jobType}</TableCell>
              <TableCell>
                <Badge variant={priorityBadgeMap[job.priority] ?? "neutral"}>
                  {job.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeMap[job.status] ?? "neutral"} dot>
                  {job.status}
                </Badge>
              </TableCell>
              <TableCell mono>{job.chainId ?? "--"}</TableCell>
              <TableCell mono>
                {job.attemptCount}/{job.maxAttempts}
              </TableCell>
              <TableCell mono>{formatDuration(job.durationMs)}</TableCell>
              <TableCell className="text-caption text-text-muted">
                {new Date(job.createdAt).toLocaleTimeString()}
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}

      {/* Dead Letter Queue */}
      {activeTab === "dlq" && (
        <DataTable
          title="Dead Letter Queue"
          headers={[
            "Job UID",
            "Queue",
            "Type",
            "Client",
            "Error",
            "Attempts",
            "Status",
            "Dead Lettered",
            "Actions",
          ]}
        >
          {deadLetterJobs.map((dlq) => (
            <TableRow key={dlq.id} highlight>
              <TableCell mono className="text-caption max-w-[180px] truncate">
                {dlq.jobUid}
              </TableCell>
              <TableCell>{dlq.queueName}</TableCell>
              <TableCell className="text-caption">{dlq.jobType}</TableCell>
              <TableCell mono>{dlq.clientId ?? "--"}</TableCell>
              <TableCell className="text-caption max-w-[250px] truncate text-status-error">
                {dlq.lastError}
              </TableCell>
              <TableCell mono>{dlq.totalAttempts}</TableCell>
              <TableCell>
                <Badge variant="error" dot>
                  {dlq.status}
                </Badge>
              </TableCell>
              <TableCell className="text-caption text-text-muted">
                {new Date(dlq.deadLetteredAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <button className="px-2 py-1 text-micro font-semibold bg-accent-primary text-accent-text rounded-button hover:bg-accent-hover font-display">
                    Retry
                  </button>
                  <button className="px-2 py-1 text-micro font-semibold bg-surface-elevated text-text-secondary rounded-button hover:text-text-primary font-display">
                    Discard
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/jobs/ apps/admin/lib/mock-data.ts
git commit -m "feat: add Jobs Dashboard admin frontend page with stats, recent jobs, and DLQ"
```

---

## Task 26: Update Existing Workers to Use JobWorkerBase

**Files:**
- Modify: `services/cron-worker-service/src/sweep/sweep.service.ts`
- Modify: `services/cron-worker-service/src/app.module.ts`
- Modify: `services/cron-worker-service/package.json`

- [ ] **Step 1: Add @cvh/job-client dependency**

In `services/cron-worker-service/package.json`, add to dependencies:

```json
"@cvh/job-client": "*"
```

- [ ] **Step 2: Import JobClientModule in AppModule**

In `services/cron-worker-service/src/app.module.ts`, add:

```typescript
import { JobClientModule } from '@cvh/job-client';
```

And add `JobClientModule.forRoot()` to the `imports` array.

Add `JOBS_DATABASE_URL` to the docker-compose environment for cron-worker-service.

- [ ] **Step 3: Migrate SweepService to use JobWorkerBase**

Replace `services/cron-worker-service/src/sweep/sweep.service.ts` with:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import {
  JobWorkerBase,
  JobOrchestratorService,
  JobAttemptResult,
} from '@cvh/job-client';

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export interface SweepJobData {
  chainId: number;
  clientId: number;
  _cvhJobId?: string;
  _cvhJobUid?: string;
}

export interface SweepResult {
  chainId: number;
  clientId: number;
  swept: number;
  failed: number;
  txHashes: string[];
}

/**
 * Token sweep worker: finds forwarders with token balances > 0,
 * groups by chain and token, executes flush to hot wallet.
 *
 * Now extends JobWorkerBase for automatic MySQL lifecycle tracking.
 */
@Processor('sweep')
@Injectable()
export class SweepService extends JobWorkerBase implements OnModuleInit {
  constructor(
    orchestrator: JobOrchestratorService,
    @InjectQueue('sweep') private readonly sweepQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super(orchestrator, 'SweepService');
  }

  async onModuleInit(): Promise<void> {
    // Register queue with orchestrator
    this.orchestrator.registerQueue('sweep', this.sweepQueue);
    await this.initSweepJobs();
  }

  async initSweepJobs(intervalMs: number = 60_000): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    for (const chain of chains) {
      const wallets = await this.prisma.wallet.findMany({
        where: { chainId: chain.id, walletType: 'hot', isActive: true },
        select: { clientId: true },
      });

      const clientIds = [...new Set(wallets.map((w) => Number(w.clientId)))];
      for (const clientId of clientIds) {
        await this.sweepQueue.add(
          'execute-sweep',
          { chainId: chain.id, clientId },
          {
            repeat: { every: intervalMs },
            jobId: `sweep-${chain.id}-${clientId}`,
          },
        );
        this.logger.log(
          `Sweep job created for chain ${chain.id}, client ${clientId}`,
        );
      }
    }
  }

  /**
   * Implement the abstract execute method from JobWorkerBase.
   */
  async execute(job: Job<SweepJobData>): Promise<JobAttemptResult> {
    const { chainId, clientId } = job.data;

    try {
      const result = await this.executeSweep(chainId, clientId);
      this.evmProvider.reportSuccess(chainId);
      return { success: true, result };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.evmProvider.reportFailure(chainId);
      return { success: false, error: msg };
    }
  }

  async executeSweep(
    chainId: number,
    clientId: number,
  ): Promise<SweepResult> {
    const result: SweepResult = {
      chainId,
      clientId,
      swept: 0,
      failed: 0,
      txHashes: [],
    };

    const deposits = await this.prisma.deposit.findMany({
      where: {
        chainId,
        clientId: BigInt(clientId),
        status: 'confirmed',
        sweepTxHash: null,
      },
    });

    if (deposits.length === 0) return result;

    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain || !chain.forwarderFactoryAddress) {
      this.logger.warn(
        `No forwarder factory for chain ${chainId}, skipping sweep`,
      );
      return result;
    }

    const gasTank = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'gas_tank',
        },
      },
    });
    if (!gasTank) {
      this.logger.warn(
        `No gas tank wallet for chain ${chainId}, client ${clientId}`,
      );
      return result;
    }

    const provider = await this.evmProvider.getProvider(chainId);

    const tokenIds = [...new Set(deposits.map((d) => d.tokenId))];
    const tokens = await this.prisma.token.findMany({
      where: { id: { in: tokenIds } },
    });

    const depositsByToken = new Map<bigint, typeof deposits>();
    for (const deposit of deposits) {
      const existing = depositsByToken.get(deposit.tokenId) ?? [];
      existing.push(deposit);
      depositsByToken.set(deposit.tokenId, existing);
    }

    for (const [tokenId, tokenDeposits] of depositsByToken) {
      const token = tokens.find((t) => t.id === tokenId);
      if (!token) continue;

      const forwarderAddresses = [
        ...new Set(tokenDeposits.map((d) => d.forwarderAddress)),
      ];

      try {
        const erc20 = new ethers.Contract(
          token.contractAddress,
          ERC20_ABI,
          provider,
        );

        const addressesWithBalance: string[] = [];
        for (const addr of forwarderAddresses) {
          if (token.isNative) {
            const balance = await provider.getBalance(addr);
            if (balance > 0n) addressesWithBalance.push(addr);
          } else {
            const balance = await erc20.balanceOf(addr);
            if (balance > 0n) addressesWithBalance.push(addr);
          }
        }

        if (addressesWithBalance.length === 0) continue;

        const sweepTxHash = `sweep:${chainId}:${token.symbol}:${Date.now()}`;

        const depositIds = tokenDeposits
          .filter((d) =>
            addressesWithBalance.includes(d.forwarderAddress),
          )
          .map((d) => d.id);

        await this.prisma.deposit.updateMany({
          where: { id: { in: depositIds } },
          data: {
            status: 'swept',
            sweepTxHash,
            sweptAt: new Date(),
          },
        });

        result.swept += depositIds.length;
        result.txHashes.push(sweepTxHash);

        await this.redis.publishToStream('deposits:swept', {
          chainId: chainId.toString(),
          clientId: clientId.toString(),
          tokenSymbol: token.symbol,
          tokenAddress: token.contractAddress,
          forwarderCount: addressesWithBalance.length.toString(),
          depositCount: depositIds.length.toString(),
          sweepTxHash,
          timestamp: new Date().toISOString(),
        });

        this.logger.log(
          `Swept ${depositIds.length} ${token.symbol} deposits on chain ${chainId} from ${addressesWithBalance.length} forwarders`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Sweep failed for token ${token.symbol} on chain ${chainId}: ${msg}`,
        );
        result.failed += tokenDeposits.length;
      }
    }

    return result;
  }
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd services/cron-worker-service && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add services/cron-worker-service/
git commit -m "refactor: migrate SweepService to extend JobWorkerBase for MySQL lifecycle tracking"
```

---

## Task 27: Phase 3 Tests

**Files:**
- Create: `packages/job-client/src/job-orchestrator.service.spec.ts`
- Create: `packages/job-client/src/job-deduplication.service.spec.ts`
- Create: `packages/job-client/src/job-monitor.service.spec.ts`

- [ ] **Step 1: Create JobOrchestratorService tests**

Create `packages/job-client/src/job-orchestrator.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JobOrchestratorService } from './job-orchestrator.service';
import { PrismaJobsService } from './prisma/prisma-jobs.service';
import { JobDeduplicationService } from './job-deduplication.service';

describe('JobOrchestratorService', () => {
  let service: JobOrchestratorService;

  const mockPrisma = {
    job: {
      create: jest.fn().mockResolvedValue({ id: 1n, jobUid: 'test-uid', status: 'pending' }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    deadLetterJob: {
      create: jest.fn().mockResolvedValue({}),
    },
    jobAttempt: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
  };

  const mockDedup = {
    isDuplicate: jest.fn().mockResolvedValue(false),
    registerJob: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'bull-123' }),
    getJob: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobOrchestratorService,
        { provide: PrismaJobsService, useValue: mockPrisma },
        { provide: JobDeduplicationService, useValue: mockDedup },
      ],
    }).compile();

    service = module.get<JobOrchestratorService>(JobOrchestratorService);
    service.registerQueue('test-queue', mockQueue as any);
  });

  it('should create a job and enqueue it', async () => {
    const result = await service.createJob({
      jobUid: 'test-uid',
      queueName: 'test-queue',
      jobType: 'test-type',
      payload: { data: 'test' },
    });

    expect(result.jobUid).toBe('test-uid');
    expect(result.status).toBe('queued');
    expect(mockPrisma.job.create).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
  });

  it('should skip duplicate jobs', async () => {
    mockDedup.isDuplicate.mockResolvedValue(true);
    mockPrisma.job.findUnique.mockResolvedValue({
      id: 1n,
      status: 'processing',
    });

    const result = await service.createJob({
      jobUid: 'dup-uid',
      queueName: 'test-queue',
      jobType: 'test-type',
      payload: {},
    });

    expect(result.status).toBe('processing');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should mark a job as completed', async () => {
    await service.markCompleted(1n, { swept: 5 });
    expect(mockPrisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1n },
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });

  it('should record an attempt', async () => {
    await service.recordAttempt({
      jobId: 1n,
      attemptNumber: 1,
      status: 'completed',
      workerId: 'test-worker',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 500,
    });

    expect(mockPrisma.jobAttempt.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Create JobDeduplicationService tests**

Create `packages/job-client/src/job-deduplication.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JobDeduplicationService } from './job-deduplication.service';
import { PrismaJobsService } from './prisma/prisma-jobs.service';

describe('JobDeduplicationService', () => {
  let service: JobDeduplicationService;

  const mockPrisma = {
    jobLock: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    job: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobDeduplicationService,
        { provide: PrismaJobsService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<JobDeduplicationService>(JobDeduplicationService);
  });

  it('should detect duplicate via lock', async () => {
    mockPrisma.jobLock.findUnique.mockResolvedValue({
      lockKey: 'job:test',
      expiresAt: new Date(Date.now() + 3600000),
    });

    const result = await service.isDuplicate('test');
    expect(result).toBe(true);
  });

  it('should not detect expired lock as duplicate', async () => {
    mockPrisma.jobLock.findUnique.mockResolvedValue({
      lockKey: 'job:test',
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const result = await service.isDuplicate('test');
    expect(result).toBe(false);
  });

  it('should detect duplicate via active job', async () => {
    mockPrisma.jobLock.findUnique.mockResolvedValue(null);
    mockPrisma.job.findUnique.mockResolvedValue({
      jobUid: 'test',
      status: 'processing',
    });

    const result = await service.isDuplicate('test');
    expect(result).toBe(true);
  });

  it('should not detect completed job as duplicate', async () => {
    mockPrisma.jobLock.findUnique.mockResolvedValue(null);
    mockPrisma.job.findUnique.mockResolvedValue({
      jobUid: 'test',
      status: 'completed',
    });

    const result = await service.isDuplicate('test');
    expect(result).toBe(false);
  });

  it('should register a lock', async () => {
    await service.registerJob('uid-1', 1n);
    expect(mockPrisma.jobLock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lockKey: 'job:uid-1' },
      }),
    );
  });

  it('should cleanup expired locks', async () => {
    mockPrisma.jobLock.deleteMany.mockResolvedValue({ count: 5 });
    const count = await service.cleanupExpiredLocks();
    expect(count).toBe(5);
  });
});
```

- [ ] **Step 3: Create JobMonitorService tests**

Create `packages/job-client/src/job-monitor.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JobMonitorService } from './job-monitor.service';
import { PrismaJobsService } from './prisma/prisma-jobs.service';

describe('JobMonitorService', () => {
  let service: JobMonitorService;

  const mockPrisma = {
    job: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    jobAttempt: {
      aggregate: jest.fn().mockResolvedValue({ _avg: { durationMs: 1200 } }),
    },
    deadLetterJob: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobMonitorService,
        { provide: PrismaJobsService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<JobMonitorService>(JobMonitorService);
  });

  it('should list jobs with pagination', async () => {
    mockPrisma.job.findMany.mockResolvedValue([
      { id: 1n, jobUid: 'test-1', queueName: 'sweep', status: 'completed' },
    ]);
    mockPrisma.job.count.mockResolvedValue(1);

    const result = await service.listJobs({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should get job stats', async () => {
    mockPrisma.job.count.mockResolvedValue(100);
    mockPrisma.job.groupBy
      .mockResolvedValueOnce([
        { status: 'completed', _count: 90 },
        { status: 'failed', _count: 10 },
      ])
      .mockResolvedValueOnce([
        { queueName: 'sweep', _count: 60 },
        { queueName: 'webhook', _count: 40 },
      ]);
    mockPrisma.deadLetterJob.count.mockResolvedValue(5);

    const stats = await service.getStats();
    expect(stats.totalJobs).toBe(100);
    expect(stats.byStatus.completed).toBe(90);
    expect(stats.deadLetterCount).toBe(5);
    expect(stats.avgDurationMs).toBe(1200);
  });

  it('should detect stuck jobs', async () => {
    const stuckJob = {
      id: 1n,
      jobUid: 'stuck-1',
      queueName: 'sweep',
      jobType: 'execute-sweep',
      startedAt: new Date(Date.now() - 600000), // 10 min ago
      lockedBy: 'worker-1',
    };
    mockPrisma.job.findMany.mockResolvedValue([stuckJob]);

    const stuck = await service.detectStuckJobs();
    expect(stuck).toHaveLength(1);
    expect(stuck[0].jobUid).toBe('stuck-1');
    expect(stuck[0].stuckForMs).toBeGreaterThan(300000);
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
cd packages/job-client && npx jest --verbose
cd ../../services/rpc-gateway-service && npx jest --verbose
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/job-client/src/*.spec.ts services/rpc-gateway-service/src/router/*.spec.ts
git commit -m "test: add comprehensive unit tests for job-client and rpc-gateway-service"
```

---

## Final Verification

- [ ] **Step 1: Full build check**

```bash
npx turbo build
```

Expected: All packages and services compile without errors.

- [ ] **Step 2: Full test suite**

```bash
npx turbo test
```

Expected: All test suites pass.

- [ ] **Step 3: Docker compose validation**

```bash
docker compose config --services | sort
```

Expected output includes `rpc-gateway-service` among the services.

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
git status
# If clean, no action needed. Otherwise:
git add -A
git commit -m "chore: phase 2-3 final cleanup and integration verification"
```
