# Chains & RPC Providers Feature Evolution — Design Specification

**Date:** 2026-04-13
**Status:** Draft → Approved
**Scope:** Complete evolution of the Chains and RPC Providers features from basic CRUD to production-grade operational management

---

## 1. Executive Summary

### Current State Diagnosis

The Chains feature is functionally incomplete and operationally misleading:

- **"Healthy" indicator is fake**: Shows `isActive === true`, not real RPC health. The green LED creates a false impression of live monitoring.
- **3 of 9 columns are empty**: Block Time, Last Block, and Lag always show "—" despite data existing in the backend.
- **No edit or delete**: Chains are immutable after creation. No PATCH or DELETE endpoints exist.
- **Two disconnected RPC systems**: `chain-indexer-service` uses `chains.rpcEndpoints` JSON; `rpc-gateway-service` uses `rpc_nodes` table. They never synchronize.
- **Rate limiter never seeded**: `RateLimiterService.registerNode()` is never called — all rate limits are bypassed.
- **6+ Redis Streams have no consumers**: Events like `chain:reorg`, `gas_tank:alerts` are published and silently lost.
- **Workers require restart for new chains**: BullMQ repeatable jobs are registered at `onModuleInit` only.
- **Redis uses `allkeys-lru`**: Under memory pressure, BullMQ jobs (including financial operations) can be evicted.
- **Frontend hardcodes chain list**: RPC Providers page has a `CHAINS` constant with 8 entries instead of fetching from the API.
- **Orphaned backend modules**: `GapDetectorModule`, `FinalityTrackerModule`, and `ReconciliationModule` are implemented but not wired into `AppModule` or scheduled.

### Impact

- **Operational risk**: Operators cannot trust the health indicators on screen.
- **Data integrity risk**: No mechanism to safely deactivate or manage chain lifecycle.
- **Financial risk**: Redis `allkeys-lru` can silently lose sweep/deposit jobs.
- **Scalability risk**: No rate limiting means a single provider's quota can be exhausted unknowingly.

### Direction

Transform the Chains page into a live operational dashboard with:
- Real health data from RPC probes and sync health
- Full lifecycle management (active → draining → inactive → archived)
- Dependency-aware safe deactivation
- Unified RPC provider management with smart templates and quota tracking
- Kafka as the event bus for financial operations
- Hardened Redis for job processing

---

## 2. Architecture Decisions

### AD-1: Chain Lifecycle States (No Hard Delete)

Chains are never physically deleted. A chain with any historical data (wallets, transactions, tokens, addresses) cannot be removed — only transitioned through lifecycle states.

**States:** `active | draining | inactive | archived`

**Transitions:**
```
active → draining       Always allowed. Stops new deposit detection, completes pending.
draining → inactive     Blocked while pending deposits/withdrawals/flushes > 0.
active → inactive       Always allowed (emergency). Warnings issued.
inactive → archived     Blocked while pending deposits > 0.
inactive → active       Allowed. Warning if no active RPC nodes.
archived → inactive     Always allowed.
```

**Physical delete:** Only allowed for chains with ZERO records across all 15+ dependent tables. Practically, this means only chains created moments ago by mistake. Enforced at the backend.

**Migration:** Existing `isActive: true` → `status: 'active'`; `isActive: false` → `status: 'inactive'`. A computed getter `get isActive()` returns `status === 'active' || status === 'draining'` for backward compatibility with worker filters.

### AD-2: Dual-Engine Queue Architecture

- **Kafka** (new `app-kafka` broker on `internal-net`): Event bus for financial operations where zero message loss is required. Topics: `cvh.deposits.*`, `cvh.withdrawals.*`, `cvh.chain.status`, `cvh.chain.health`, `cvh.rpc.*`, `cvh.gas-tank.*`, `cvh.reorg.*`, `cvh.reconciliation.*`.
- **BullMQ** (Redis): Operational job scheduling (sweep, gas-tank, forwarder-deploy, polling, confirmation tracking, webhooks). Redis hardened with `noeviction` + `appendfsync always` + 2GB memory.

Migration from Redis Streams to Kafka is gradual via dual-write adapter (`EventBusService`).

### AD-3: RPC System Unification

The `rpc_nodes` table in `cvh_admin` becomes the single source of truth for RPC endpoints. The `chains.rpcEndpoints` JSON column is deprecated. The `chain-indexer-service` `EvmProviderService` is refactored to fetch RPC config from `rpc-gateway-service` via internal HTTP (`GET /rpc/:chainId/config`).

### AD-4: Smart Provider Templates

Known providers (Tatum, Alchemy, Infura, QuickNode) have pre-configured templates with URL patterns, auth methods, and default rate limits. Templates are stored in code (not DB) and served via `GET /admin/rpc-providers/templates`. The operator selects a provider type, and the form pre-fills accordingly.

### AD-5: Polling for Real-Time Updates

Frontend polls `GET /admin/chains/health` every 30 seconds. This aligns with the rpc-gateway-service health check cron (also 30s). The response is cached in Redis for 15s to prevent N-admin amplification. SSE can be added incrementally later without architectural changes.

---

## 3. Data Model Changes

### 3.1 Chain Model Evolution

**File:** All 3 Prisma schemas (`core-wallet-service`, `chain-indexer-service`, `cron-worker-service`)

```prisma
model Chain {
  id                      Int       @id @map("chain_id")
  name                    String    @db.VarChar(50)
  shortName               String    @map("short_name") @db.VarChar(10)
  nativeCurrencySymbol    String    @map("native_currency_symbol") @db.VarChar(10)
  nativeCurrencyDecimals  Int       @default(18) @map("native_currency_decimals")
  rpcEndpoints            Json      @map("rpc_endpoints")  // DEPRECATED - kept for fallback
  blockTimeSeconds        Decimal   @map("block_time_seconds") @db.Decimal(5, 2)
  confirmationsDefault    Int       @map("confirmations_default")
  finalityThreshold       Int       @default(32) @map("finality_threshold")
  walletFactoryAddress    String?   @map("wallet_factory_address") @db.VarChar(42)
  forwarderFactoryAddress String?   @map("forwarder_factory_address") @db.VarChar(42)
  walletImplAddress       String?   @map("wallet_impl_address") @db.VarChar(42)
  forwarderImplAddress    String?   @map("forwarder_impl_address") @db.VarChar(42)
  multicall3Address       String    @default("0xcA11bde05977b3631167028862bE2a173976CA11") @map("multicall3_address") @db.VarChar(42)
  explorerUrl             String?   @map("explorer_url") @db.VarChar(200)
  gasPriceStrategy        String    @default("eip1559") @map("gas_price_strategy") @db.VarChar(10)
  status                  String    @default("active") @db.VarChar(20) // active|draining|inactive|archived
  statusReason            String?   @map("status_reason") @db.VarChar(255)
  statusChangedAt         DateTime? @map("status_changed_at")
  isTestnet               Boolean   @default(false) @map("is_testnet")
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")

  @@map("chains")
}
```

**Removed:** `isActive Boolean` — replaced by `status` enum.
**Added:** `status`, `statusReason`, `statusChangedAt`, `updatedAt`, `finalityThreshold`.

### 3.2 RPC Node Model Evolution

**File:** `admin-api/prisma/schema.prisma`, `rpc-gateway-service/prisma/schema.prisma`

```prisma
model RpcNode {
  id                    BigInt    @id @default(autoincrement())
  providerId            BigInt    @map("provider_id")
  chainId               Int       @map("chain_id")
  rpcHttpUrl            String    @map("rpc_http_url") @db.VarChar(500)
  rpcWsUrl              String?   @map("rpc_ws_url") @db.VarChar(500)
  apiKeyEncrypted       String?   @map("api_key_encrypted") @db.Text
  priority              Int       @default(50)
  weight                Int       @default(100)
  status                String    @default("standby") @db.VarChar(20)
  maxRequestsPerSecond  Int?      @map("max_requests_per_second")
  maxRequestsPerMinute  Int?      @map("max_requests_per_minute")
  maxRequestsPerDay     Int?      @map("max_requests_per_day")
  maxRequestsPerMonth   Int?      @map("max_requests_per_month")
  quotaStatus           String    @default("available") @map("quota_status") @db.VarChar(20)
  providerType          String    @default("custom") @map("provider_type") @db.VarChar(20)
  authMethod            String    @default("url_path") @map("auth_method") @db.VarChar(20)
  nodeType              String?   @map("node_type") @db.VarChar(30)
  timeoutMs             Int       @default(10000) @map("timeout_ms")
  healthScore           Decimal   @default(100.00) @map("health_score") @db.Decimal(5, 2)
  consecutiveFailures   Int       @default(0) @map("consecutive_failures")
  healthCheckIntervalS  Int       @default(30) @map("health_check_interval_s")
  lastHealthCheckAt     DateTime? @map("last_health_check_at")
  lastHealthyAt         DateTime? @map("last_healthy_at")
  createdAt             DateTime  @default(now()) @map("created_at")

  provider              RpcProvider @relation(fields: [providerId], references: [id])

  @@index([chainId, status, priority], map: "idx_chain_status")
  @@map("rpc_nodes")
}
```

**Added:** `maxRequestsPerDay`, `maxRequestsPerMonth`, `quotaStatus`, `providerType`, `authMethod`, `nodeType`.

### 3.3 Provider Templates (Code, not DB)

```typescript
// services/admin-api/src/rpc-management/provider-templates.ts
export const PROVIDER_TEMPLATES: Record<ProviderType, ProviderTemplate> = {
  tatum: {
    name: 'Tatum',
    authMethod: 'header',
    authHeaderName: 'x-api-key',
    urlPatterns: {
      http: 'https://api.tatum.io/v3/blockchain/node/{chain-slug}',
      ws: null, // Tatum does not provide WS
    },
    chainSlugs: { 1: 'ethereum', 56: 'bsc', 137: 'polygon-matic', 42161: 'arbitrum-one', 10: 'optimism', 43114: 'avax', 8453: 'base' },
    defaultLimits: { maxRequestsPerSecond: 5, maxRequestsPerMinute: 300, maxRequestsPerDay: null, maxRequestsPerMonth: 100000 },
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
    chainSlugs: { 1: 'eth-mainnet', 56: 'bnb-mainnet', 137: 'polygon-mainnet', 42161: 'arb-mainnet', 10: 'opt-mainnet', 43114: 'avax-mainnet', 8453: 'base-mainnet' },
    defaultLimits: { maxRequestsPerSecond: 25, maxRequestsPerMinute: null, maxRequestsPerDay: null, maxRequestsPerMonth: 300000000 },
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
    chainSlugs: { 1: 'mainnet', 56: 'bnbsmartchain-mainnet', 137: 'polygon-mainnet', 42161: 'arbitrum-mainnet', 10: 'optimism-mainnet', 43114: 'avalanche-mainnet', 8453: 'base-mainnet' },
    defaultLimits: { maxRequestsPerSecond: 10, maxRequestsPerMinute: null, maxRequestsPerDay: 100000, maxRequestsPerMonth: null },
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
    defaultLimits: { maxRequestsPerSecond: 25, maxRequestsPerMinute: null, maxRequestsPerDay: null, maxRequestsPerMonth: null },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey', 'subdomain'],
  },
  custom: {
    name: 'Custom',
    authMethod: 'none',
    urlPatterns: { http: '', ws: '' },
    chainSlugs: {},
    defaultLimits: { maxRequestsPerSecond: null, maxRequestsPerMinute: null, maxRequestsPerDay: null, maxRequestsPerMonth: null },
    supportedChainIds: [], // all chains
    fields: ['rpcHttpUrl', 'rpcWsUrl', 'nodeType', 'authMethod'],
    nodeTypes: ['geth', 'nethermind', 'erigon', 'besu', 'openethereum', 'reth'],
  },
};
```

---

## 4. Backend API Design

### 4.1 Chain Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/admin/chains` | any admin | List all chains (with status filter) |
| GET | `/admin/chains/:chainId` | any admin | Chain details + dependency counts |
| POST | `/admin/chains` | super_admin, admin | Create chain (with RPC probe) |
| PATCH | `/admin/chains/:chainId` | super_admin, admin | Edit mutable fields |
| POST | `/admin/chains/:chainId/lifecycle` | super_admin | State transition |
| DELETE | `/admin/chains/:chainId` | super_admin | Physical delete (zero-dependency only) |
| GET | `/admin/chains/health` | any admin | Aggregated health for polling |

### 4.2 Chain Health Response Contract

```typescript
interface ChainHealthResponse {
  chains: Array<{
    chainId: number;
    name: string;
    shortName: string;
    symbol: string;
    status: 'active' | 'draining' | 'inactive' | 'archived';
    blockTimeSeconds: number;
    health: {
      overall: 'healthy' | 'degraded' | 'critical' | 'error' | 'unknown';
      lastBlock: number | null;
      blocksBehind: number | null;
      lastCheckedAt: string | null;
      staleSince: string | null;
    };
    rpc: {
      totalNodes: number;
      activeNodes: number;
      healthyNodes: number;
      avgLatencyMs: number | null;
      quotaStatus: 'available' | 'approaching' | 'daily_exhausted' | 'monthly_exhausted';
    };
    operations: {
      pendingDeposits: number;
      pendingWithdrawals: number;
      pendingFlushes: number;
    };
  }>;
  updatedAt: string;
}
```

### 4.3 Chain Detail Response Contract

```typescript
interface ChainDetailResponse {
  chain: {
    id: number;
    name: string;
    shortName: string;
    symbol: string;
    chainId: number;
    explorerUrl: string | null;
    confirmationsRequired: number;
    blockTimeSeconds: number;
    finalityThreshold: number;
    gasPriceStrategy: string;
    status: string;
    statusReason: string | null;
    statusChangedAt: string | null;
    isTestnet: boolean;
    createdAt: string;
    updatedAt: string;
  };
  dependencies: {
    rpcNodes: { total: number; active: number };
    tokens: { total: number };
    wallets: { total: number };
    depositAddresses: { total: number; deployed: number };
    deposits: { total: number; pending: number };
    withdrawals: { total: number; pending: number };
    clients: { total: number };
    gasTanks: { total: number };
    flushOperations: { total: number; pending: number };
  };
  syncHealth: {
    indexerStatus: string;
    lastBlock: number | null;
    blocksBehind: number | null;
    gapCount: number;
    reorgs24h: number;
  };
  canTransitionTo: string[];
}
```

### 4.4 Lifecycle Transition Contract

```typescript
// Request
interface LifecycleRequest {
  action: 'drain' | 'deactivate' | 'archive' | 'reactivate';
  reason: string; // min 10 chars
}

// Response 200
interface LifecycleResponse {
  previousStatus: string;
  newStatus: string;
  reason: string;
  transitionedAt: string;
  warnings: string[];
}

// Response 409
interface LifecycleBlockedResponse {
  error: 'TRANSITION_BLOCKED';
  message: string;
  blockers: Array<{ type: string; count: number }>;
}
```

### 4.5 RPC Provider Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/admin/rpc-providers/templates` | any admin | Provider templates |
| GET | `/admin/rpc-providers` | any admin | List all (with health + quota) |
| GET | `/admin/rpc-providers/chain/:chainId` | any admin | Nodes for specific chain |
| POST | `/admin/rpc-providers` | super_admin, admin | Create with template |
| PATCH | `/admin/rpc-providers/:id` | super_admin, admin | Update (including quotas) |
| DELETE | `/admin/rpc-providers/:id` | super_admin, admin | Delete node |
| POST | `/admin/rpc-providers/:id/reset-quota` | super_admin | Manual quota reset |

### 4.6 Improved Validations

**Chain creation:**
- `rpcUrl`: `@IsUrl()` (currently accepts any string)
- Duplicate `chainId`: Catch Prisma P2002 → clean 409 response
- RPC probe: Call `eth_chainId` and validate match. If unreachable, create as `inactive` with warning.
- `blockTimeSeconds`: Required in DTO (currently hardcoded as 12)
- `finalityThreshold`: Optional, defaults to 32

**RPC Provider creation:**
- `chainId`: Validate chain exists in the system
- URL probe: Call `eth_blockNumber` on provided URL before accepting
- Provider type + auth method must be consistent

---

## 5. Health Intelligence

### 5.1 Autonomous Health Scheduling

**Problem:** `SyncHealthService.checkHealth()` is never scheduled — only runs on HTTP request.

**Fix:** Import `ScheduleModule.forRoot()` in `chain-indexer-service` AppModule. Add `@Cron(EVERY_30_SECONDS)` to `checkHealth()`.

Also wire:
- `FinalityTrackerModule` → import in AppModule, `@Cron(EVERY_30_SECONDS)` on `checkFinality()`
- `GapDetectorModule` → import in AppModule, `@Cron(EVERY_5_MINUTES)` on `detectGaps()`

### 5.2 Health Aggregation Pipeline

```
GET /admin/chains/health (admin-api)
  ├── GET chain-indexer:3006/sync-health → status, lastBlock, blocksBehind, gapCount
  ├── GET rpc-gateway:3009/rpc/health → node status, latency, block height
  ├── Local query cvh_admin.rpc_nodes → quotaStatus per node
  └── Merge by chainId → ChainHealthResponse

Cache: Redis key "admin:chains:health" TTL 15s
```

### 5.3 Quota Tracking

Redis counters per node:
- `rpc:quota:{nodeId}:day:{YYYY-MM-DD}` — daily usage counter (TTL 48h)
- `rpc:quota:{nodeId}:month:{YYYY-MM}` — monthly usage counter (TTL 35 days)

Incremented atomically after each successful RPC call in `RpcRouterService`.

Quota status derivation (during 30s health cron):
- `available`: used < 80% of all limits
- `approaching`: used >= 80% of any limit
- `daily_exhausted`: used >= maxRequestsPerDay
- `monthly_exhausted`: used >= maxRequestsPerMonth

Exhausted nodes are skipped by `RpcRouterService.selectNode()` but NOT marked as `unhealthy` (they are functional, just quota-limited).

### 5.4 Rate Limiter Seeding Fix

On `rpc-gateway-service` startup (`onModuleInit`), load all active/standby nodes and call `rateLimiter.registerNode()` for each. Currently this never happens — rate limits are silently bypassed.

### 5.5 Load Balancing Toggle

New field `loadBalancingEnabled` (Boolean, default true) on chain configuration (via admin-api).
- `true`: `RpcRouterService` distributes across all active nodes (priority + health score ordering)
- `false`: Uses only the highest-priority node; others are failover-only

---

## 6. Queue & Event Architecture

### 6.1 Kafka Broker

New `app-kafka` service in docker-compose on `internal-net`. Isolated from PostHog's Kafka. KRaft mode, single broker, 7-day retention default.

### 6.2 Kafka Topics

**Financial (30-day retention):**
- `cvh.deposits.detected` (partition key: chainId)
- `cvh.deposits.confirmed` (partition key: chainId)
- `cvh.deposits.swept` (partition key: chainId)
- `cvh.withdrawals.lifecycle` (partition key: chainId)

**Operational (7-day retention):**
- `cvh.chain.status` (partition key: chainId)
- `cvh.chain.health` (partition key: chainId)
- `cvh.rpc.failover` (partition key: nodeId)
- `cvh.rpc.quota` (partition key: nodeId)
- `cvh.gas-tank.alerts` (partition key: chainId)
- `cvh.reorg.detected` (partition key: chainId)
- `cvh.reconciliation.discrepancy` (partition key: chainId)

### 6.3 Migration Strategy

Gradual dual-write via `EventBusService` adapter:
1. Producers write to both Redis Streams and Kafka
2. Consumers migrate to Kafka consumer groups
3. Redis Stream writes removed

### 6.4 Redis Hardening

- `maxmemory`: 512MB → 2GB
- `maxmemory-policy`: `allkeys-lru` → `noeviction`
- `appendfsync`: default (everysec) → `always`

### 6.5 Dynamic Chain Registration

Workers consume `cvh.chain.status` Kafka topic. On `active` status: register new BullMQ repeatable jobs. On `inactive`/`archived`: remove repeatable jobs. Eliminates the restart requirement.

---

## 7. Frontend Design

### 7.1 Chains Page — Complete Redesign

**Layout:**
- Summary stat cards: Active Chains | Healthy | Degraded | Critical
- Auto-refresh indicator ("Updated 5s ago", polling every 30s)
- Data table with real data from `/admin/chains/health`

**Table columns (reduced from 9 to 8, all with real data):**

| Column | Source | Display |
|--------|--------|---------|
| Chain | chain.name | Icon + name |
| ID | chain.chainId | Monospace |
| Block Time | chain.blockTimeSeconds | "12.1s" |
| Last Block | health.lastBlock | Formatted number, color-coded |
| Lag | health.blocksBehind | Badge: green (<5), yellow (5-50), red (>50) |
| RPC | rpc.activeNodes/totalNodes | "3/3" with color |
| Health | health.overall | Badge: Healthy/Degraded/Critical/Error |
| Status | chain.status | Badge: Active/Draining/Inactive/Archived |
| Actions | — | ⋯ dropdown menu |

**Actions menu per row:**
- View Details (opens expanded panel)
- Edit Chain (opens edit modal — mutable fields only)
- Drain / Deactivate / Archive / Reactivate (lifecycle, based on current state)
- View on Explorer (external link, if explorerUrl set)

**Expandable row panel (accordion, one at a time):**
4-column metrics grid:
1. **Operations**: Clients, Projects, Addresses (total/deployed)
2. **Transactions**: Deposits (total/pending), Withdrawals (total/pending), Flushes
3. **RPC Nodes**: Per-node health score, quota progress bars, provider name
4. **Configuration**: Confirmations, Finality threshold, Gas strategy, Testnet flag, Tokens count, Gas Tanks count

Bottom info bar: Sync status, Gap count, Reorgs (24h), Avg latency, Created date, Load balancing toggle

**Lifecycle confirmation modals:**
- **Drain**: Yellow-themed, explains what continues and what stops. Reason required (10+ chars). No type-to-confirm (lower friction, drain is safe).
- **Deactivate**: Red-themed, shows dependency counts, recommends Drain if pending operations exist. Reason required. Type chain name to confirm.
- **Archive**: Red-themed, similar to Deactivate. Blocked if pending operations.
- **Reactivate**: Green-themed, warns if no active RPC nodes. No type-to-confirm.

**State management:** Migrate from raw `useState` + `useEffect` to React Query (`useQuery` with 30s `refetchInterval` for health, standard queries for details/mutations).

### 7.2 RPC Providers Page — Evolution

**Replace hardcoded `CHAINS` constant:** Fetch chains from `GET /admin/chains` and populate the chain dropdown dynamically.

**Provider modal redesign:**
- Provider field becomes a dropdown: Tatum | Alchemy | Infura | QuickNode | Custom
- On selection, fetch template from `/admin/rpc-providers/templates`
- Pre-fill URL patterns, auth method, default rate limits
- For "Custom": show Node Type dropdown (Geth, Nethermind, Erigon, Besu, OpenEthereum, Reth) and Auth Method dropdown
- Rate Limits section: 4 fields (req/s, req/min, req/day, req/month) with template defaults

**Node row enhancements:**
- Show health score (numeric + color)
- Show quota usage progress bar
- Show quota status badge (Available/Approaching/Exhausted)
- Show latency (avg ms from last health check)

**Stats cards update:**
- "Healthy Nodes" → derived from real health score (>= 70), not just `isActive`
- Add "Quota Warnings" card counting nodes with `approaching` or `exhausted` status

### 7.3 Edit Chain Modal

Fields (all optional, only changed fields sent):
- Name, Short Name (text inputs)
- Explorer URL (URL input)
- Confirmations Required (number, min 1)
- Block Time (number, min 0.1)
- Finality Threshold (number, min 1)
- Gas Price Strategy (dropdown: eip1559 | legacy)

Immutable fields shown as read-only with lock icon:
- Chain ID, Native Currency Symbol, Native Currency Decimals
- Factory/Implementation contract addresses

### 7.4 Add Chain Modal — Improvements

- Add `blockTimeSeconds` field (required, currently missing — hardcoded as 12)
- Add `finalityThreshold` field (optional, default 32)
- Add `isTestnet` checkbox
- Show RPC probe result after URL is entered (green check / red X / loading spinner)
- Validate `chainId` uniqueness client-side (check against loaded chains list)

---

## 8. Testing Strategy

### 8.1 Unit Tests (New)

| Service | Test File | Scenarios |
|---------|-----------|-----------|
| admin-api | `chain-management.service.spec.ts` | addChain proxy + audit, listChains, getChainDetail with deps, updateChain, lifecycle transitions (all 6), delete (zero-dep allowed, dep-blocked), health aggregation |
| admin-api | `rpc-management.service.spec.ts` | createRpcProvider (all 5 types), updateRpcProvider, deleteRpcProvider, getTemplates, resetQuota, encryption/decryption |
| chain-indexer | `evm-provider.service.spec.ts` | getProvider lazy creation, circuit breaker trip/reset, Tatum header injection, healthCheck, reportFailure/Success |
| rpc-gateway | `rate-limiter.service.spec.ts` (expand) | registerNode, checkAndRecord per-second/minute, quota daily/monthly, exhausted skip |
| rpc-gateway | `health.service.spec.ts` (expand) | quota status derivation, node status transitions, limit seeding on init |
| core-wallet | `chain.service.spec.ts` | createChain, listChains, getChain, status filter |

### 8.2 Integration Tests (New)

| Scope | Description |
|-------|-------------|
| Chain lifecycle | Create chain → drain → inactive → archived, verify workers stop |
| RPC health pipeline | Create node → health check fires → score updates → frontend reflects |
| Quota enforcement | Create node with daily limit → exhaust → verify node skipped → verify reset |
| Dependency check | Create chain with wallets → attempt deactivate → verify dependency response |
| Provider template | Select Alchemy → verify URL generation → verify rate limits pre-filled |

### 8.3 E2E Tests (Future)

| Flow | Steps |
|------|-------|
| Full chain onboarding | Add chain → add RPC providers → verify health appears → add token |
| Chain wind-down | Drain chain → wait for pending → auto-transition to inactive |
| RPC failover | Kill primary node → verify failover → verify switch log |
| Quota exhaustion | Send requests → exhaust daily quota → verify fallback to next node |

### 8.4 Critical Edge Cases

- Chain created with unreachable RPC → status `inactive`, no crash
- All RPC nodes for a chain go unhealthy → health shows `error`, operations pause
- Quota resets at midnight UTC → node transitions from `daily_exhausted` to `available`
- Concurrent lifecycle transitions → only one succeeds (optimistic locking via `updatedAt`)
- Chain-indexer restart → picks up all active chains from DB, not stale in-memory state

---

## 9. Implementation Strategy

### Phase 1 — Data Foundation & Backend (Highest Priority)

1. Database migrations: Chain status field, RpcNode quota fields, provider type fields
2. Chain CRUD: PATCH and lifecycle endpoints in admin-api + chain-indexer
3. Dependency check service: Count across all 15+ tables
4. Provider templates: Code module + GET endpoint
5. Validation improvements: RPC probe, duplicate chainId catch, URL validation
6. Wire orphaned modules: GapDetector, FinalityTracker in AppModule with cron
7. SyncHealth autonomous scheduling
8. Rate limiter seeding on startup
9. Audit logging for new operations

### Phase 2 — Health Intelligence & Queues

1. Health aggregation endpoint (`GET /admin/chains/health`)
2. Quota tracking (Redis counters + status derivation)
3. Redis hardening (noeviction, appendfsync always, 2GB)
4. Kafka broker setup + topic creation
5. EventBusService dual-write adapter
6. Dynamic chain registration in workers
7. Kafka consumers for orphaned streams

### Phase 3 — Frontend Chains Page

1. React Query migration (replace useState/useEffect)
2. Health polling (30s refetchInterval)
3. Real data columns (block time, last block, lag, RPC health)
4. Stat cards (active/healthy/degraded/critical)
5. Expandable row detail panel
6. Actions menu (edit, lifecycle transitions)
7. Edit chain modal
8. Lifecycle confirmation modals (drain/deactivate/archive/reactivate)
9. Add chain modal improvements (RPC probe, block time, finality)

### Phase 4 — Frontend RPC Providers Page

1. Dynamic chain dropdown (replace hardcoded CHAINS)
2. Provider type dropdown with templates
3. Smart form (pre-fill on provider selection)
4. Rate limit fields (4 levels)
5. Node type dropdown for Custom
6. Auth method dropdown for Custom
7. Health indicators per node (score, latency)
8. Quota progress bars and status badges

### Risk Mitigation

- **Backward compatibility**: `isActive` getter ensures existing worker filters work during migration
- **Gradual Kafka migration**: Dual-write prevents any message loss during transition
- **Redis hardening**: `noeviction` may cause write errors under memory pressure — monitoring required
- **Database migrations**: Run in maintenance window, add columns with defaults (zero downtime for reads)

---

## 10. Files Inventory

### Backend — Will Be Modified

```
services/admin-api/src/chain-management/chain-management.controller.ts
services/admin-api/src/chain-management/chain-management.service.ts
services/admin-api/src/common/dto/chain.dto.ts
services/admin-api/src/rpc-management/rpc-management.controller.ts
services/admin-api/src/rpc-management/rpc-management.service.ts
services/admin-api/src/common/dto/rpc.dto.ts
services/admin-api/prisma/schema.prisma
services/chain-indexer-service/src/sync-health/sync-health.controller.ts
services/chain-indexer-service/src/sync-health/sync-health.service.ts
services/chain-indexer-service/src/blockchain/evm-provider.service.ts
services/chain-indexer-service/src/app.module.ts
services/chain-indexer-service/prisma/schema.prisma
services/core-wallet-service/src/chain/chain.service.ts
services/core-wallet-service/src/chain/chain.controller.ts
services/core-wallet-service/src/common/dto/chain.dto.ts
services/core-wallet-service/prisma/schema.prisma
services/cron-worker-service/prisma/schema.prisma
services/cron-worker-service/src/app.module.ts
services/rpc-gateway-service/src/health/health.service.ts
services/rpc-gateway-service/src/rate-limiter/rate-limiter.service.ts
services/rpc-gateway-service/src/router/rpc-router.service.ts
services/rpc-gateway-service/prisma/schema.prisma
docker-compose.yml
packages/api-client/src/admin-api.ts
packages/types/src/chain.ts
```

### Backend — Will Be Created

```
services/admin-api/src/chain-management/chain-dependency.service.ts
services/admin-api/src/chain-management/chain-lifecycle.service.ts
services/admin-api/src/rpc-management/provider-templates.ts
services/admin-api/src/common/dto/chain-lifecycle.dto.ts
services/admin-api/src/common/dto/chain-update.dto.ts
services/shared/event-bus/event-bus.service.ts (or per-service)
database/migrations/XXXX_chain_lifecycle_status.sql
database/migrations/XXXX_rpc_node_quota_fields.sql
```

### Frontend — Will Be Modified

```
apps/admin/app/chains/page.tsx (major rewrite)
apps/admin/app/rpc-providers/page.tsx (significant changes)
```

### Frontend — Will Be Created

```
apps/admin/app/chains/components/chain-health-table.tsx
apps/admin/app/chains/components/chain-expanded-row.tsx
apps/admin/app/chains/components/chain-edit-modal.tsx
apps/admin/app/chains/components/chain-lifecycle-modal.tsx
apps/admin/app/chains/components/chain-stat-cards.tsx
apps/admin/app/chains/hooks/use-chain-health.ts
apps/admin/app/chains/hooks/use-chain-detail.ts
apps/admin/app/chains/hooks/use-chain-mutations.ts
apps/admin/app/rpc-providers/components/provider-template-form.tsx
apps/admin/app/rpc-providers/components/quota-progress-bar.tsx
apps/admin/app/rpc-providers/hooks/use-provider-templates.ts
```

### Tests — Will Be Created

```
services/admin-api/src/chain-management/chain-management.service.spec.ts
services/admin-api/src/chain-management/chain-dependency.service.spec.ts
services/admin-api/src/chain-management/chain-lifecycle.service.spec.ts
services/admin-api/src/rpc-management/rpc-management.service.spec.ts
services/core-wallet-service/src/chain/chain.service.spec.ts
services/chain-indexer-service/src/blockchain/evm-provider.service.spec.ts
services/rpc-gateway-service/src/rate-limiter/rate-limiter.service.spec.ts (expand)
services/rpc-gateway-service/src/health/health.service.spec.ts (expand)
```
