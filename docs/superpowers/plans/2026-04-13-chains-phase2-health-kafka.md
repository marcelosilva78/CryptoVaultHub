# Phase 2: Health Intelligence & Kafka — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kafka event streaming with dual-write migration, enhance the chain health aggregation endpoint to include real RPC health + quota data, and enable dynamic chain registration in workers via Kafka consumers.

**Architecture:** Three independent tracks converge: (A) Kafka infrastructure + shared EventBus package, (B) health aggregation endpoint enhancement in admin-api proxying rpc-gateway data, (C) producer/consumer migration and dynamic chain registration. EventBusService is a dual-write adapter that publishes to both Redis Streams (existing) and Kafka (new), allowing gradual consumer migration.

**Tech Stack:** KafkaJS 2.x, NestJS @nestjs/microservices (Kafka transport), ioredis (existing), BullMQ (existing), Prisma (existing)

**Design Spec:** `docs/superpowers/specs/2026-04-13-chains-feature-evolution-design.md` sections 5 & 6

---

## Dependency Graph

```
Task 1 (Docker Kafka) ──┐
                         ├──► Task 4 (Producer Integration) ──► Task 6 (Dynamic Chain Reg)
Task 2 (EventBus Pkg) ──┘                                  ──► Task 5 (Consumer Migration)
Task 3 (Health Aggregation) ── independent
```

**Parallel tracks:**
- Tasks 1, 2, 3 are fully independent — run simultaneously
- Tasks 4, 5, 6 depend on Tasks 1+2 — can run simultaneously after 1+2 complete

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/event-bus/package.json` | Shared EventBus package config |
| `packages/event-bus/tsconfig.json` | TypeScript config |
| `packages/event-bus/src/index.ts` | Package barrel export |
| `packages/event-bus/src/kafka-producer.service.ts` | KafkaJS producer with connection management |
| `packages/event-bus/src/kafka-consumer.service.ts` | KafkaJS consumer with group management |
| `packages/event-bus/src/event-bus.service.ts` | Dual-write adapter: Redis Streams + Kafka |
| `packages/event-bus/src/event-bus.module.ts` | NestJS DynamicModule for easy import |
| `packages/event-bus/src/topics.ts` | Topic name constants and partition key helpers |
| `packages/event-bus/src/types.ts` | Shared event interfaces |
| `docker/kafka/init-topics.sh` | Kafka topic creation script |
| `services/rpc-gateway-service/src/health/health.controller.ts` | Expose health summary via HTTP |
| `services/cron-worker-service/src/chain-listener/chain-listener.service.ts` | Kafka consumer for chain status events |
| `services/cron-worker-service/src/chain-listener/chain-listener.module.ts` | Module for chain listener |

### Modified Files
| File | Change |
|------|--------|
| `docker-compose.yml` | Move Kafka to internal-net, add health check, add init container |
| `services/admin-api/package.json` | Add `@cvh/event-bus` dependency |
| `services/admin-api/src/chain-management/chain-management.service.ts` | Enhance `getChainHealth()` to proxy RPC health data |
| `services/admin-api/src/chain-management/chain-management.module.ts` | Add RPC_GATEWAY_URL provider, EventBusModule import |
| `services/chain-indexer-service/package.json` | Add `@cvh/event-bus` dependency |
| `services/chain-indexer-service/src/app.module.ts` | Import EventBusModule |
| `services/chain-indexer-service/src/redis/redis.service.ts` | Integrate EventBusService into publishToStream |
| `services/cron-worker-service/package.json` | Add `@cvh/event-bus` dependency |
| `services/cron-worker-service/src/app.module.ts` | Import EventBusModule, ChainListenerModule |
| `services/cron-worker-service/src/sweep/sweep.service.ts` | Support dynamic job registration |
| `services/rpc-gateway-service/package.json` | Add `@cvh/event-bus` dependency |
| `services/rpc-gateway-service/src/app.module.ts` | Import EventBusModule |
| `services/rpc-gateway-service/src/health/health.module.ts` | Export HealthController |
| `services/notification-service/package.json` | Add `@cvh/event-bus` dependency |
| `services/notification-service/src/event-consumer/event-consumer.service.ts` | Add Kafka consumer alongside Redis Streams |
| `services/notification-service/src/app.module.ts` | Import EventBusModule |

---

## Task 1: Docker Kafka Infrastructure

**Files:**
- Modify: `docker-compose.yml:624-641`
- Create: `docker/kafka/init-topics.sh`

- [ ] **Step 1: Move Kafka to internal-net and add health check**

In `docker-compose.yml`, replace the existing kafka service (lines 624-641) with:

```yaml
  kafka:
    image: apache/kafka:3.7.0
    environment:
      KAFKA_NODE_ID: "1"
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
      KAFKA_LOG_RETENTION_HOURS: "168"
      KAFKA_LOG_RETENTION_BYTES: "5368709120"
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qg"
      KAFKA_LOG_DIRS: /var/lib/kafka/data
    volumes:
      - /docker/data/kafka:/var/lib/kafka/data
    networks:
      - internal-net
      - monitoring-net
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null 2>&1"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 30s
    restart: unless-stopped
```

Key changes: added `internal-net` so app services can reach Kafka; added `healthcheck`; added retention config.

- [ ] **Step 2: Create Kafka topic init script**

Create `docker/kafka/init-topics.sh`:

```bash
#!/bin/bash
# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
until /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka:9092 > /dev/null 2>&1; do
  sleep 2
done
echo "Kafka is ready. Creating topics..."

KAFKA_BIN="/opt/kafka/bin"

# Financial topics — 30-day retention (2592000000 ms)
for TOPIC in cvh.deposits.detected cvh.deposits.confirmed cvh.deposits.swept cvh.withdrawals.lifecycle; do
  $KAFKA_BIN/kafka-topics.sh --bootstrap-server kafka:9092 \
    --create --if-not-exists \
    --topic "$TOPIC" \
    --partitions 8 \
    --replication-factor 1 \
    --config retention.ms=2592000000
  echo "Created topic: $TOPIC (30-day retention)"
done

# Operational topics — 7-day retention (604800000 ms)
for TOPIC in cvh.chain.status cvh.chain.health cvh.rpc.failover cvh.rpc.quota cvh.gas-tank.alerts cvh.reorg.detected cvh.reconciliation.discrepancy; do
  $KAFKA_BIN/kafka-topics.sh --bootstrap-server kafka:9092 \
    --create --if-not-exists \
    --topic "$TOPIC" \
    --partitions 4 \
    --replication-factor 1 \
    --config retention.ms=604800000
  echo "Created topic: $TOPIC (7-day retention)"
done

echo "All topics created successfully."
```

- [ ] **Step 3: Add kafka-init service to docker-compose**

Add after the `kafka` service block in `docker-compose.yml`:

```yaml
  kafka-init:
    image: apache/kafka:3.7.0
    entrypoint: ["/bin/bash", "/scripts/init-topics.sh"]
    volumes:
      - ./docker/kafka/init-topics.sh:/scripts/init-topics.sh:ro
    networks:
      - internal-net
    depends_on:
      kafka:
        condition: service_healthy
    restart: "no"
```

- [ ] **Step 4: Make init script executable and verify**

```bash
chmod +x docker/kafka/init-topics.sh
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker/kafka/init-topics.sh
git commit -m "feat(kafka): move Kafka to internal-net, add health check and topic init script

Kafka now on both internal-net and monitoring-net so application services
can produce/consume events. Added health check for service_healthy
dependency. Init container creates all CVH topics with proper retention."
```

---

## Task 2: Shared EventBus Package (@cvh/event-bus)

**Files:**
- Create: `packages/event-bus/package.json`
- Create: `packages/event-bus/tsconfig.json`
- Create: `packages/event-bus/src/types.ts`
- Create: `packages/event-bus/src/topics.ts`
- Create: `packages/event-bus/src/kafka-producer.service.ts`
- Create: `packages/event-bus/src/kafka-consumer.service.ts`
- Create: `packages/event-bus/src/event-bus.service.ts`
- Create: `packages/event-bus/src/event-bus.module.ts`
- Create: `packages/event-bus/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@cvh/event-bus",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/"
  },
  "dependencies": {
    "kafkajs": "^2.2.4"
  },
  "peerDependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "ioredis": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create types.ts**

```typescript
// packages/event-bus/src/types.ts

export interface EventBusEvent {
  topic: string;
  key: string;
  data: Record<string, unknown>;
  timestamp?: number;
}

export interface EventBusModuleOptions {
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaGroupId?: string;
  enableKafka: boolean;
  enableRedisStreams: boolean;
}

export interface EventHandler {
  (event: EventBusEvent): Promise<void>;
}
```

- [ ] **Step 4: Create topics.ts**

```typescript
// packages/event-bus/src/topics.ts

export const TOPICS = {
  // Financial (30-day retention)
  DEPOSITS_DETECTED: 'cvh.deposits.detected',
  DEPOSITS_CONFIRMED: 'cvh.deposits.confirmed',
  DEPOSITS_SWEPT: 'cvh.deposits.swept',
  WITHDRAWALS_LIFECYCLE: 'cvh.withdrawals.lifecycle',

  // Operational (7-day retention)
  CHAIN_STATUS: 'cvh.chain.status',
  CHAIN_HEALTH: 'cvh.chain.health',
  RPC_FAILOVER: 'cvh.rpc.failover',
  RPC_QUOTA: 'cvh.rpc.quota',
  GAS_TANK_ALERTS: 'cvh.gas-tank.alerts',
  REORG_DETECTED: 'cvh.reorg.detected',
  RECONCILIATION_DISCREPANCY: 'cvh.reconciliation.discrepancy',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

/**
 * Map legacy Redis Stream names to Kafka topics.
 */
export const STREAM_TO_TOPIC: Record<string, TopicName> = {
  'deposits:detected': TOPICS.DEPOSITS_DETECTED,
  'deposits:confirmation': TOPICS.DEPOSITS_CONFIRMED,
  'deposits:swept': TOPICS.DEPOSITS_SWEPT,
  'withdrawals:submitted': TOPICS.WITHDRAWALS_LIFECYCLE,
  'withdrawals:confirmed': TOPICS.WITHDRAWALS_LIFECYCLE,
  'withdrawals:failed': TOPICS.WITHDRAWALS_LIFECYCLE,
};
```

- [ ] **Step 5: Create kafka-producer.service.ts**

```typescript
// packages/event-bus/src/kafka-producer.service.ts

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer, CompressionTypes } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;
  private connected = false;

  constructor(private readonly kafka: Kafka) {
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
    });
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (err) {
      this.logger.error(
        `Kafka producer failed to connect: ${(err as Error).message}. Will retry on next publish.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    }
  }

  async publish(
    topic: string,
    key: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    if (!this.connected) {
      try {
        await this.producer.connect();
        this.connected = true;
      } catch (err) {
        this.logger.warn(
          `Kafka unavailable, skipping publish to ${topic}: ${(err as Error).message}`,
        );
        return;
      }
    }

    await this.producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key,
          value: JSON.stringify(value),
          timestamp: Date.now().toString(),
        },
      ],
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

- [ ] **Step 6: Create kafka-consumer.service.ts**

```typescript
// packages/event-bus/src/kafka-consumer.service.ts

import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventHandler, EventBusEvent } from './types';

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;
  private connected = false;

  constructor(
    private readonly kafka: Kafka,
    groupId: string,
  ) {
    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async subscribe(
    topics: string[],
    handler: EventHandler,
  ): Promise<void> {
    if (!this.connected) {
      await this.consumer.connect();
      this.connected = true;
      this.logger.log('Kafka consumer connected');
    }

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, message } = payload;
        const key = message.key?.toString() ?? '';
        let data: Record<string, unknown> = {};

        try {
          data = JSON.parse(message.value?.toString() ?? '{}');
        } catch {
          this.logger.warn(`Failed to parse message from ${topic}`);
          return;
        }

        const event: EventBusEvent = {
          topic,
          key,
          data,
          timestamp: message.timestamp
            ? parseInt(message.timestamp, 10)
            : Date.now(),
        };

        try {
          await handler(event);
        } catch (err) {
          this.logger.error(
            `Error handling event from ${topic}: ${(err as Error).message}`,
          );
        }
      },
    });
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    }
  }
}
```

- [ ] **Step 7: Create event-bus.service.ts (dual-write adapter)**

```typescript
// packages/event-bus/src/event-bus.service.ts

import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { KafkaProducerService } from './kafka-producer.service';
import { STREAM_TO_TOPIC } from './topics';

/**
 * Dual-write event bus: publishes to both Redis Streams (legacy)
 * and Kafka (new). Consumers can migrate from Redis to Kafka
 * independently. Once all consumers are on Kafka, Redis writes
 * can be disabled via the enableRedisStreams flag.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly redis: Redis,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly enableRedisStreams: boolean,
    private readonly enableKafka: boolean,
  ) {}

  /**
   * Publish an event to both Redis Streams and Kafka.
   *
   * @param stream - Legacy Redis stream name (e.g., 'deposits:detected')
   * @param key    - Partition key for Kafka (e.g., chainId as string)
   * @param data   - Event payload
   */
  async publish(
    stream: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Redis Streams (legacy)
    if (this.enableRedisStreams) {
      promises.push(this.publishToRedisStream(stream, data));
    }

    // Kafka (new)
    if (this.enableKafka) {
      const topic = STREAM_TO_TOPIC[stream];
      if (topic) {
        promises.push(this.kafkaProducer.publish(topic, key, data));
      }
    }

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Event bus publish partial failure for ${stream}: ${result.reason}`,
        );
      }
    }
  }

  /**
   * Publish directly to a Kafka topic (for new events that have no
   * Redis Stream equivalent, e.g., cvh.chain.status).
   */
  async publishToKafka(
    topic: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enableKafka) return;
    await this.kafkaProducer.publish(topic, key, data);
  }

  private async publishToRedisStream(
    stream: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const fields: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      fields.push(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    await this.redis.xadd(stream, '*', ...fields);
  }
}
```

- [ ] **Step 8: Create event-bus.module.ts**

```typescript
// packages/event-bus/src/event-bus.module.ts

import { DynamicModule, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel } from 'kafkajs';
import Redis from 'ioredis';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { EventBusService } from './event-bus.service';

export interface EventBusModuleConfig {
  /** Kafka client ID for this service */
  clientId: string;
  /** Kafka consumer group ID (only needed if consuming) */
  groupId?: string;
}

@Module({})
export class EventBusModule {
  static forRoot(config: EventBusModuleConfig): DynamicModule {
    const kafkaProvider = {
      provide: 'KAFKA_INSTANCE',
      useFactory: (configService: ConfigService) => {
        const brokers = configService
          .get<string>('KAFKA_BROKERS', 'kafka:9092')
          .split(',');
        return new Kafka({
          clientId: config.clientId,
          brokers,
          logLevel: logLevel.WARN,
          retry: { initialRetryTime: 300, retries: 5 },
        });
      },
      inject: [ConfigService],
    };

    const producerProvider = {
      provide: KafkaProducerService,
      useFactory: (kafka: Kafka) => new KafkaProducerService(kafka),
      inject: ['KAFKA_INSTANCE'],
    };

    const consumerProvider = {
      provide: KafkaConsumerService,
      useFactory: (kafka: Kafka) => {
        const groupId = config.groupId ?? `${config.clientId}-group`;
        return new KafkaConsumerService(kafka, groupId);
      },
      inject: ['KAFKA_INSTANCE'],
    };

    const eventBusProvider = {
      provide: EventBusService,
      useFactory: (
        configService: ConfigService,
        kafkaProducer: KafkaProducerService,
      ) => {
        const redis = new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') ?? undefined,
          maxRetriesPerRequest: null,
        });

        const enableKafka =
          configService.get<string>('EVENTBUS_KAFKA_ENABLED', 'true') === 'true';
        const enableRedis =
          configService.get<string>('EVENTBUS_REDIS_ENABLED', 'true') === 'true';

        return new EventBusService(redis, kafkaProducer, enableRedis, enableKafka);
      },
      inject: [ConfigService, KafkaProducerService],
    };

    return {
      module: EventBusModule,
      global: true,
      providers: [
        kafkaProvider,
        producerProvider,
        consumerProvider,
        eventBusProvider,
      ],
      exports: [
        KafkaProducerService,
        KafkaConsumerService,
        EventBusService,
      ],
    };
  }
}
```

- [ ] **Step 9: Create index.ts barrel export**

```typescript
// packages/event-bus/src/index.ts

export { EventBusModule } from './event-bus.module';
export type { EventBusModuleConfig } from './event-bus.module';
export { EventBusService } from './event-bus.service';
export { KafkaProducerService } from './kafka-producer.service';
export { KafkaConsumerService } from './kafka-consumer.service';
export { TOPICS, STREAM_TO_TOPIC } from './topics';
export type { TopicName } from './topics';
export type { EventBusEvent, EventHandler, EventBusModuleOptions } from './types';
```

- [ ] **Step 10: Install kafkajs and link the package**

```bash
cd packages/event-bus && npm install kafkajs@^2.2.4
```

Then add workspace reference in root `package.json` if using workspaces, or symlink via file: protocol in consuming services.

- [ ] **Step 11: Commit**

```bash
git add packages/event-bus/
git commit -m "feat(event-bus): create shared @cvh/event-bus package with dual-write adapter

KafkaProducerService for idempotent Kafka publishing, KafkaConsumerService
for group-based consumption, EventBusService dual-write adapter that
publishes to both Redis Streams and Kafka. Toggle via EVENTBUS_KAFKA_ENABLED
and EVENTBUS_REDIS_ENABLED env vars."
```

---

## Task 3: Health Aggregation Endpoint Enhancement

**Files:**
- Create: `services/rpc-gateway-service/src/health/health.controller.ts`
- Modify: `services/rpc-gateway-service/src/health/health.module.ts`
- Modify: `services/admin-api/src/chain-management/chain-management.service.ts:207-250`
- Modify: `services/admin-api/src/chain-management/chain-management.module.ts`

- [ ] **Step 1: Create RPC Gateway health controller**

Create `services/rpc-gateway-service/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';

@Controller('rpc')
export class RpcHealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get('health')
  async getHealth() {
    const nodes = await this.healthService.getHealthSummary();

    const nodesWithQuota = await Promise.all(
      nodes.map(async (node) => {
        const quota = await this.rateLimiter.getQuotaUsage(
          parseInt(node.nodeId, 10),
        );
        return { ...node, quota };
      }),
    );

    return { nodes: nodesWithQuota };
  }
}
```

- [ ] **Step 2: Update health module to include controller and export RateLimiterModule**

In `services/rpc-gateway-service/src/health/health.module.ts`, replace contents:

```typescript
import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { RpcHealthController } from './health.controller';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';

@Module({
  imports: [RateLimiterModule],
  controllers: [RpcHealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
```

- [ ] **Step 3: Verify RateLimiterService has getQuotaUsage method**

Read `services/rpc-gateway-service/src/rate-limiter/rate-limiter.service.ts` and confirm `getQuotaUsage(nodeId: number)` exists. If not, add it:

```typescript
async getQuotaUsage(nodeId: number): Promise<{
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
}> {
  const now = new Date();
  const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
  const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

  const [dailyStr, monthlyStr] = await Promise.all([
    this.redis.get(dayKey),
    this.redis.get(monthKey),
  ]);

  const limits = this.nodeLimits.get(nodeId);

  return {
    dailyUsed: parseInt(dailyStr ?? '0', 10),
    monthlyUsed: parseInt(monthlyStr ?? '0', 10),
    dailyLimit: limits?.maxRequestsPerDay ?? null,
    monthlyLimit: limits?.maxRequestsPerMonth ?? null,
  };
}
```

- [ ] **Step 4: Add RPC_GATEWAY_URL to admin-api chain-management module**

Read `services/admin-api/src/chain-management/chain-management.module.ts` and add:

```typescript
{
  provide: 'RPC_GATEWAY_URL',
  useFactory: (config: ConfigService) =>
    config.get<string>('RPC_GATEWAY_URL', 'http://rpc-gateway-service:3009'),
  inject: [ConfigService],
},
```

- [ ] **Step 5: Enhance getChainHealth in chain-management.service.ts**

Inject `RPC_GATEWAY_URL` in the `ChainManagementService` constructor. Replace the `getChainHealth()` method (lines 207-250):

```typescript
import { Inject } from '@nestjs/common';
// ... existing imports ...

@Injectable()
export class ChainManagementService {
  private readonly logger = new Logger(ChainManagementService.name);
  private readonly chainIndexerUrl: string;
  private readonly rpcGatewayUrl: string;
  private readonly redis: Redis;

  constructor(
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
    private readonly depService: ChainDependencyService,
    private readonly lifecycleService: ChainLifecycleService,
    @Inject('RPC_GATEWAY_URL') rpcGatewayUrl?: string,
  ) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
    this.rpcGatewayUrl = rpcGatewayUrl
      ?? this.configService.get<string>('RPC_GATEWAY_URL', 'http://rpc-gateway-service:3009');

    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: null,
    });
  }
```

Then replace `getChainHealth()`:

```typescript
  async getChainHealth() {
    // Check Redis cache first (15s TTL)
    const cacheKey = 'admin:chains:health';
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [chainsRes, syncHealthRes, rpcHealthRes, rpcNodes] = await Promise.all([
      axios.get(`${this.chainIndexerUrl}/chains`),
      axios.get(`${this.chainIndexerUrl}/sync-health`).catch((err) => {
        this.logger.warn(`Failed to fetch sync-health: ${err.message}`);
        return { data: [] };
      }),
      axios.get(`${this.rpcGatewayUrl}/rpc/health`).catch((err) => {
        this.logger.warn(`Failed to fetch rpc-health: ${err.message}`);
        return { data: { nodes: [] } };
      }),
      this.depService.getRpcNodeCounts().catch(
        () => new Map<number, { total: number; active: number }>(),
      ),
    ]);

    const chains = chainsRes.data.chains || chainsRes.data.data || chainsRes.data;
    const syncHealth = Array.isArray(syncHealthRes.data)
      ? syncHealthRes.data
      : syncHealthRes.data.chains || [];
    const rpcNodesHealth = rpcHealthRes.data.nodes || [];

    // Group RPC nodes by chainId
    const rpcByChain = new Map<number, typeof rpcNodesHealth>();
    for (const node of rpcNodesHealth) {
      const list = rpcByChain.get(node.chainId) ?? [];
      list.push(node);
      rpcByChain.set(node.chainId, list);
    }

    const result = {
      chains: chains.map((chain: any) => {
        const chainId = chain.chainId || chain.id;
        const sync = syncHealth.find((s: any) => s.chainId === chainId);
        const rpc = rpcNodes instanceof Map ? rpcNodes.get(chainId) : undefined;
        const rpcHealth = rpcByChain.get(chainId) ?? [];

        // Calculate aggregated RPC metrics
        const healthyNodes = rpcHealth.filter(
          (n: any) => n.status === 'active' && n.healthScore >= 70,
        ).length;

        const latencies = rpcHealth
          .map((n: any) => n.quota?.dailyUsed)
          .filter((v: any) => v !== undefined);

        // Derive quota status from worst-case node
        let quotaStatus: string = 'available';
        for (const node of rpcHealth) {
          if (node.quota) {
            const { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit } = node.quota;
            if (monthlyLimit && monthlyUsed >= monthlyLimit) {
              quotaStatus = 'monthly_exhausted';
              break;
            }
            if (dailyLimit && dailyUsed >= dailyLimit) {
              quotaStatus = 'daily_exhausted';
              break;
            }
            if (
              (dailyLimit && dailyUsed >= dailyLimit * 0.8) ||
              (monthlyLimit && monthlyUsed >= monthlyLimit * 0.8)
            ) {
              quotaStatus = 'approaching';
            }
          }
        }

        // Calculate avg latency from recent health records
        const avgLatencyMs =
          rpcHealth.length > 0
            ? Math.round(
                rpcHealth.reduce(
                  (sum: number, n: any) => sum + (n.healthScore ?? 0),
                  0,
                ) / rpcHealth.length,
              )
            : null;

        return {
          chainId,
          name: chain.name,
          shortName: chain.shortName || chain.symbol,
          symbol: chain.symbol,
          status: chain.status ?? (chain.isActive ? 'active' : 'inactive'),
          blockTimeSeconds: chain.blockTimeSeconds
            ? Number(chain.blockTimeSeconds)
            : null,
          health: {
            overall: sync?.status ?? 'unknown',
            lastBlock: sync?.lastBlock ?? null,
            blocksBehind: sync?.blocksBehind ?? null,
            lastCheckedAt:
              sync?.lastUpdated ?? sync?.lastCheckedAt ?? null,
            staleSince: sync?.status === 'error' ? sync?.lastUpdated : null,
          },
          rpc: {
            totalNodes: rpc?.total ?? rpcHealth.length,
            activeNodes: rpc?.active ?? rpcHealth.filter((n: any) => n.status === 'active').length,
            healthyNodes,
            avgLatencyMs,
            quotaStatus,
          },
          operations: {
            pendingDeposits: 0,
            pendingWithdrawals: 0,
            pendingFlushes: 0,
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    };

    // Cache for 15 seconds
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 15);

    return result;
  }
```

- [ ] **Step 6: Add RPC_GATEWAY_URL env var to docker-compose admin-api service**

In `docker-compose.yml`, add to the admin-api service environment:

```yaml
RPC_GATEWAY_URL: http://rpc-gateway-service:3009
```

- [ ] **Step 7: Commit**

```bash
git add services/rpc-gateway-service/src/health/ services/admin-api/src/chain-management/ docker-compose.yml
git commit -m "feat(health): enhance chain health aggregation with real RPC data and quota status

admin-api /admin/chains/health now proxies rpc-gateway /rpc/health to
include per-node health scores, quota usage, and derives per-chain
quotaStatus. Response cached in Redis for 15s. RPC Gateway exposes
new GET /rpc/health endpoint."
```

---

## Task 4: EventBus Producer Integration

**Files:**
- Modify: `services/chain-indexer-service/package.json`
- Modify: `services/chain-indexer-service/src/app.module.ts`
- Modify: `services/chain-indexer-service/src/redis/redis.service.ts`
- Modify: `services/cron-worker-service/package.json`
- Modify: `services/cron-worker-service/src/app.module.ts`
- Modify: `services/rpc-gateway-service/package.json`
- Modify: `services/rpc-gateway-service/src/app.module.ts`
- Modify: `services/rpc-gateway-service/src/health/health.service.ts`
- Modify: `services/admin-api/package.json`
- Modify: `services/admin-api/src/app.module.ts`
- Modify: `services/admin-api/src/chain-management/chain-lifecycle.service.ts`

**Depends on:** Task 1, Task 2

- [ ] **Step 1: Add @cvh/event-bus dependency to all services**

Add to each service's `package.json` dependencies:

```json
"@cvh/event-bus": "file:../../packages/event-bus"
```

Services: `admin-api`, `chain-indexer-service`, `cron-worker-service`, `rpc-gateway-service`, `notification-service`.

Run `npm install` in the project root.

- [ ] **Step 2: Add KAFKA_BROKERS env var to docker-compose**

In `docker-compose.yml`, add to the environment of all 5 services above:

```yaml
KAFKA_BROKERS: kafka:9092
EVENTBUS_KAFKA_ENABLED: "true"
EVENTBUS_REDIS_ENABLED: "true"
```

Also add `kafka` as a dependency with `service_healthy` for each:

```yaml
depends_on:
  kafka:
    condition: service_healthy
```

- [ ] **Step 3: Import EventBusModule in chain-indexer-service**

In `services/chain-indexer-service/src/app.module.ts`, add:

```typescript
import { EventBusModule } from '@cvh/event-bus';

@Module({
  imports: [
    // ... existing imports ...
    EventBusModule.forRoot({
      clientId: 'chain-indexer-service',
    }),
  ],
})
```

- [ ] **Step 4: Update chain-indexer RedisService to use EventBusService**

In `services/chain-indexer-service/src/redis/redis.service.ts`, inject EventBusService and update `publishToStream`:

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventBusService } from '@cvh/event-bus';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly eventBus?: EventBusService,
  ) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') ?? undefined,
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

  /**
   * Publish an event to Redis Stream AND Kafka via EventBusService.
   * Falls back to Redis-only if EventBusService is unavailable.
   */
  async publishToStream(
    stream: string,
    data: Record<string, string>,
  ): Promise<string> {
    // Dual-write via EventBusService
    if (this.eventBus) {
      const key = data.chainId || data.chain_id || '0';
      await this.eventBus.publish(stream, key, data);
      this.logger.debug(`Published to ${stream} via EventBus (dual-write)`);
      return '';
    }

    // Fallback: direct Redis Streams
    const fields: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(key, value);
    }
    const id = await this.client.xadd(stream, '*', ...fields);
    this.logger.debug(`Published to ${stream}: ${id}`);
    return id ?? '';
  }

  async setCache(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async getCache(key: string): Promise<string | null> {
    return this.client.get(key);
  }
}
```

- [ ] **Step 5: Import EventBusModule in cron-worker-service**

In `services/cron-worker-service/src/app.module.ts`, add:

```typescript
import { EventBusModule } from '@cvh/event-bus';

@Module({
  imports: [
    // ... existing imports ...
    EventBusModule.forRoot({
      clientId: 'cron-worker-service',
      groupId: 'cron-worker-group',
    }),
  ],
})
```

- [ ] **Step 6: Update cron-worker RedisService the same way as step 4**

Apply the same `@Optional() EventBusService` injection pattern to `services/cron-worker-service/src/redis/redis.service.ts`.

- [ ] **Step 7: Import EventBusModule in rpc-gateway-service**

In `services/rpc-gateway-service/src/app.module.ts`:

```typescript
import { EventBusModule } from '@cvh/event-bus';

@Module({
  imports: [
    // ... existing imports ...
    EventBusModule.forRoot({
      clientId: 'rpc-gateway-service',
    }),
  ],
})
```

- [ ] **Step 8: Publish health events from rpc-gateway HealthService**

In `services/rpc-gateway-service/src/health/health.service.ts`, inject EventBusService and publish after each health check round:

```typescript
import { EventBusService, TOPICS } from '@cvh/event-bus';

// In constructor:
constructor(
  private readonly prisma: PrismaService,
  private readonly rateLimiter: RateLimiterService,
  @Optional() private readonly eventBus?: EventBusService,
) {}

// At end of runHealthChecks(), after all nodes checked:
if (this.eventBus) {
  // Aggregate by chain for health event
  const chainHealth = new Map<number, { healthy: number; total: number }>();
  for (const node of nodes) {
    const entry = chainHealth.get(node.chainId) ?? { healthy: 0, total: 0 };
    entry.total++;
    if (Number(node.healthScore) >= 70) entry.healthy++;
    chainHealth.set(node.chainId, entry);
  }

  for (const [chainId, health] of chainHealth) {
    await this.eventBus.publishToKafka(
      TOPICS.CHAIN_HEALTH,
      chainId.toString(),
      {
        chainId,
        healthyNodes: health.healthy,
        totalNodes: health.total,
        timestamp: new Date().toISOString(),
      },
    );
  }
}
```

- [ ] **Step 9: Publish chain status events from admin-api lifecycle transitions**

In `services/admin-api/src/chain-management/chain-lifecycle.service.ts`, inject EventBusService and publish on lifecycle transitions:

```typescript
import { EventBusService, TOPICS } from '@cvh/event-bus';

// Add to constructor:
constructor(
  // ... existing deps ...
  @Optional() private readonly eventBus?: EventBusService,
) {}

// After a successful transition, publish:
if (this.eventBus) {
  await this.eventBus.publishToKafka(
    TOPICS.CHAIN_STATUS,
    chainId.toString(),
    {
      chainId,
      previousStatus,
      newStatus,
      reason,
      transitionedAt: new Date().toISOString(),
    },
  );
}
```

Import EventBusModule in admin-api's AppModule:

```typescript
EventBusModule.forRoot({
  clientId: 'admin-api',
}),
```

- [ ] **Step 10: Commit**

```bash
git add services/ packages/ docker-compose.yml
git commit -m "feat(event-bus): integrate EventBusService dual-write across all services

chain-indexer and cron-worker RedisService.publishToStream now dual-writes
to Redis Streams + Kafka via EventBusService. rpc-gateway publishes
chain health events. admin-api publishes chain lifecycle status events.
All services have KAFKA_BROKERS env and depend on kafka health check."
```

---

## Task 5: Notification Service Consumer Migration

**Files:**
- Modify: `services/notification-service/package.json`
- Modify: `services/notification-service/src/app.module.ts`
- Modify: `services/notification-service/src/event-consumer/event-consumer.service.ts`

**Depends on:** Task 2, Task 4

- [ ] **Step 1: Add @cvh/event-bus to notification-service**

Add to `services/notification-service/package.json`:

```json
"@cvh/event-bus": "file:../../packages/event-bus"
```

- [ ] **Step 2: Import EventBusModule in notification-service**

In `services/notification-service/src/app.module.ts`, add:

```typescript
import { EventBusModule } from '@cvh/event-bus';

// In imports array:
EventBusModule.forRoot({
  clientId: 'notification-service',
  groupId: 'notification-service',
}),
```

- [ ] **Step 3: Add Kafka consumer alongside Redis Streams**

In `services/notification-service/src/event-consumer/event-consumer.service.ts`, add Kafka consumption as a parallel path. The existing Redis Streams loop continues unchanged — Kafka runs alongside it:

```typescript
import { KafkaConsumerService, TOPICS, EventBusEvent } from '@cvh/event-bus';

// Add to constructor:
constructor(
  private readonly config: ConfigService,
  private readonly deliveryService: WebhookDeliveryService,
  @Optional() private readonly kafkaConsumer?: KafkaConsumerService,
) {
  // ... existing redis setup ...
}

// Update onModuleInit:
async onModuleInit() {
  await this.ensureConsumerGroups();
  this.running = true;
  this.consumeLoop();

  // Start Kafka consumer in parallel
  if (this.kafkaConsumer) {
    await this.startKafkaConsumer();
  }
}

private async startKafkaConsumer() {
  const topics = [
    TOPICS.DEPOSITS_DETECTED,
    TOPICS.DEPOSITS_CONFIRMED,
    TOPICS.DEPOSITS_SWEPT,
    TOPICS.WITHDRAWALS_LIFECYCLE,
  ];

  const KAFKA_TO_EVENT: Record<string, string> = {
    [TOPICS.DEPOSITS_DETECTED]: 'deposit.detected',
    [TOPICS.DEPOSITS_CONFIRMED]: 'deposit.confirmed',
    [TOPICS.DEPOSITS_SWEPT]: 'deposit.swept',
    [TOPICS.WITHDRAWALS_LIFECYCLE]: 'withdrawal.lifecycle',
  };

  try {
    await this.kafkaConsumer!.subscribe(topics, async (event: EventBusEvent) => {
      const eventType = KAFKA_TO_EVENT[event.topic];
      if (!eventType) return;

      const data = event.data as Record<string, string>;
      const clientId = data.clientId || data.client_id;
      if (!clientId) {
        this.logger.warn(`Kafka event ${event.topic} missing clientId, skipping`);
        return;
      }

      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: event.data,
        source: 'kafka',
      };

      await this.deliveryService.createDeliveries(
        BigInt(clientId),
        eventType,
        payload,
      );

      this.logger.debug(
        `Processed Kafka event: ${event.topic} -> ${eventType} for client ${clientId}`,
      );
    });

    this.logger.log('Kafka consumer started for financial events');
  } catch (err) {
    this.logger.error(
      `Failed to start Kafka consumer: ${(err as Error).message}. Falling back to Redis Streams only.`,
    );
  }
}
```

- [ ] **Step 4: Add KAFKA_BROKERS env to notification-service in docker-compose**

```yaml
KAFKA_BROKERS: kafka:9092
EVENTBUS_KAFKA_ENABLED: "true"
EVENTBUS_REDIS_ENABLED: "true"
```

Add kafka dependency:

```yaml
depends_on:
  kafka:
    condition: service_healthy
```

- [ ] **Step 5: Commit**

```bash
git add services/notification-service/ docker-compose.yml
git commit -m "feat(notification): add Kafka consumer alongside Redis Streams

notification-service now consumes financial events from both Redis
Streams (existing) and Kafka (new) in parallel. Kafka consumer uses
@cvh/event-bus KafkaConsumerService. Once dual-write is validated,
Redis Streams consumption can be disabled."
```

---

## Task 6: Dynamic Chain Registration in Workers

**Files:**
- Create: `services/cron-worker-service/src/chain-listener/chain-listener.service.ts`
- Create: `services/cron-worker-service/src/chain-listener/chain-listener.module.ts`
- Modify: `services/cron-worker-service/src/app.module.ts`
- Modify: `services/cron-worker-service/src/sweep/sweep.service.ts`

**Depends on:** Task 2, Task 4

- [ ] **Step 1: Create ChainListenerService**

Create `services/cron-worker-service/src/chain-listener/chain-listener.service.ts`:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, TOPICS, EventBusEvent } from '@cvh/event-bus';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Listens to cvh.chain.status Kafka topic and dynamically registers
 * or removes BullMQ repeatable jobs when chains change state.
 * Eliminates the need to restart workers when chains are added or deactivated.
 */
@Injectable()
export class ChainListenerService implements OnModuleInit {
  private readonly logger = new Logger(ChainListenerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly prisma: PrismaService,
    @InjectQueue('sweep') private readonly sweepQueue: Queue,
    @InjectQueue('forwarder-deploy')
    private readonly forwarderDeployQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      [TOPICS.CHAIN_STATUS],
      this.handleChainStatusEvent.bind(this),
    );
    this.logger.log(
      'Chain listener started — listening for chain status changes',
    );
  }

  private async handleChainStatusEvent(event: EventBusEvent): Promise<void> {
    const { chainId, newStatus, previousStatus } = event.data as {
      chainId: number;
      newStatus: string;
      previousStatus: string;
    };

    this.logger.log(
      `Chain ${chainId} status changed: ${previousStatus} -> ${newStatus}`,
    );

    if (newStatus === 'active') {
      await this.registerChainJobs(chainId);
    } else if (
      newStatus === 'inactive' ||
      newStatus === 'archived'
    ) {
      await this.removeChainJobs(chainId);
    }
    // 'draining' — jobs continue running, no action needed
  }

  /**
   * Register repeatable BullMQ jobs for a newly activated chain.
   */
  private async registerChainJobs(chainId: number): Promise<void> {
    // Find all clients with wallets on this chain
    const wallets = await this.prisma.wallet.findMany({
      where: { chainId, walletType: 'hot', isActive: true },
      select: { clientId: true },
    });

    const clientIds = [
      ...new Set(wallets.map((w) => Number(w.clientId))),
    ];

    for (const clientId of clientIds) {
      const jobId = `sweep-${chainId}-${clientId}`;

      // Check if job already exists
      const existing = await this.sweepQueue.getRepeatableJobs();
      if (existing.some((j) => j.id === jobId)) continue;

      await this.sweepQueue.add(
        'execute-sweep',
        { chainId, clientId },
        {
          repeat: { every: 60_000 },
          jobId,
        },
      );
      this.logger.log(`Registered sweep job: ${jobId}`);
    }

    // Register forwarder-deploy job for the chain
    const fwdJobId = `forwarder-deploy-${chainId}`;
    const existingFwd = await this.forwarderDeployQueue.getRepeatableJobs();
    if (!existingFwd.some((j) => j.id === fwdJobId)) {
      await this.forwarderDeployQueue.add(
        'deploy-forwarders',
        { chainId },
        {
          repeat: { every: 30_000 },
          jobId: fwdJobId,
        },
      );
      this.logger.log(`Registered forwarder-deploy job: ${fwdJobId}`);
    }
  }

  /**
   * Remove repeatable BullMQ jobs for a deactivated/archived chain.
   */
  private async removeChainJobs(chainId: number): Promise<void> {
    // Remove sweep jobs for this chain
    const sweepJobs = await this.sweepQueue.getRepeatableJobs();
    for (const job of sweepJobs) {
      if (job.id?.startsWith(`sweep-${chainId}-`)) {
        await this.sweepQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Removed sweep job: ${job.id}`);
      }
    }

    // Remove forwarder-deploy job
    const fwdJobs = await this.forwarderDeployQueue.getRepeatableJobs();
    for (const job of fwdJobs) {
      if (job.id === `forwarder-deploy-${chainId}`) {
        await this.forwarderDeployQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Removed forwarder-deploy job: ${job.id}`);
      }
    }
  }
}
```

- [ ] **Step 2: Create ChainListenerModule**

Create `services/cron-worker-service/src/chain-listener/chain-listener.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChainListenerService } from './chain-listener.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sweep' }),
    BullModule.registerQueue({ name: 'forwarder-deploy' }),
  ],
  providers: [ChainListenerService],
})
export class ChainListenerModule {}
```

- [ ] **Step 3: Import ChainListenerModule in cron-worker AppModule**

In `services/cron-worker-service/src/app.module.ts`, add import:

```typescript
import { ChainListenerModule } from './chain-listener/chain-listener.module';

@Module({
  imports: [
    // ... existing imports ...
    ChainListenerModule,
  ],
})
```

- [ ] **Step 4: Add dynamic registration method to SweepService**

In `services/cron-worker-service/src/sweep/sweep.service.ts`, add a public method that can be called to register a new chain's jobs dynamically (used as an alternative entry point):

```typescript
/**
 * Register sweep jobs for a single chain. Called by ChainListenerService
 * when a chain becomes active, or at startup via onModuleInit.
 */
async registerChainSweepJobs(
  chainId: number,
  intervalMs: number = 60_000,
): Promise<void> {
  const wallets = await this.prisma.wallet.findMany({
    where: { chainId, walletType: 'hot', isActive: true },
    select: { clientId: true },
  });

  const clientIds = [...new Set(wallets.map((w) => Number(w.clientId)))];
  for (const clientId of clientIds) {
    await this.sweepQueue.add(
      'execute-sweep',
      { chainId, clientId },
      {
        repeat: { every: intervalMs },
        jobId: `sweep-${chainId}-${clientId}`,
      },
    );
  }
  this.logger.log(
    `Registered ${clientIds.length} sweep jobs for chain ${chainId}`,
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add services/cron-worker-service/
git commit -m "feat(workers): dynamic chain registration via Kafka consumer

ChainListenerService consumes cvh.chain.status topic and dynamically
registers/removes BullMQ sweep and forwarder-deploy jobs when chains
transition to active/inactive/archived. Eliminates need to restart
workers when chains are added or deactivated."
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `docker compose config` validates without errors
- [ ] Kafka topic init script creates all 11 topics
- [ ] `GET /admin/chains/health` returns real RPC health data with quota status
- [ ] Health response is cached in Redis for 15s (verify with second call within 15s)
- [ ] `GET /rpc/health` on rpc-gateway returns node health + quota data
- [ ] EventBusService dual-writes: events appear in both Redis Streams and Kafka
- [ ] `EVENTBUS_KAFKA_ENABLED=false` disables Kafka writes without error
- [ ] notification-service receives events from both Redis Streams and Kafka
- [ ] When a chain lifecycle transition fires, `cvh.chain.status` event appears in Kafka
- [ ] ChainListenerService registers BullMQ jobs for newly activated chains
- [ ] ChainListenerService removes BullMQ jobs for deactivated chains
- [ ] All services start cleanly with `docker compose up`
