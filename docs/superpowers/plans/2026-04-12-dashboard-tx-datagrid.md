# Dashboard Transaction Datagrid — Enriched Expandable Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `GET /admin/transactions/recent` API endpoint and enrich the dashboard transaction table with inline-expandable rows containing Summary (client, timestamp, explorer link) and Technical (event logs, raw JSON) tabs.

**Architecture:** chain-indexer gains a `GET /events/recent` endpoint that queries `IndexedEvent` and joins token/chain names; admin-api gains a `TransactionsModule` that proxies and enriches with client names; the frontend gains a `TxExpandedRow` component rendering two tabs per expanded row.

**Tech Stack:** NestJS (admin-api, chain-indexer), Prisma, axios (no HttpModule — project uses axios directly), Next.js 14 App Router, Tailwind CSS with project design tokens.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `services/chain-indexer-service/src/sync-health/sync-health.controller.ts` | Modify | Add `GET /events/recent` route |
| `services/admin-api/src/transactions/transactions.service.ts` | Create | Fetch from chain-indexer, enrich with client names |
| `services/admin-api/src/transactions/transactions.controller.ts` | Create | `GET /transactions/recent` HTTP handler |
| `services/admin-api/src/transactions/transactions.module.ts` | Create | NestJS module wiring |
| `services/admin-api/src/app.module.ts` | Modify | Import `TransactionsModule` |
| `apps/admin/components/tx-expanded-row.tsx` | Create | Inline expansion panel with Summary/Technical tabs |
| `apps/admin/app/page.tsx` | Modify | Expand `RecentTx` interface, add expand toggle, render `TxExpandedRow` |
| `apps/admin/app/traceability/page.tsx` | Modify | Accept `?txHash=` query param, show contextual banner |

---

## Task 1: chain-indexer — Add GET /events/recent

**Files:**
- Modify: `services/chain-indexer-service/src/sync-health/sync-health.controller.ts`

- [ ] **Step 1.1: Add the route to SyncHealthController**

Open `services/chain-indexer-service/src/sync-health/sync-health.controller.ts`.

After the existing `@Get('reorgs')` method, add this new route (no new imports needed — `Get`, `Query` are already imported):

```typescript
@Get('events/recent')
async getRecentEvents(
  @Query('limit') limit?: string,
  @Query('chainId') chainId?: string,
) {
  const take = Math.min(parseInt(limit ?? '20', 10), 100);
  const where: any = {};
  if (chainId) where.chainId = parseInt(chainId, 10);

  const events = await this.prisma.indexedEvent.findMany({
    where,
    orderBy: { processedAt: 'desc' },
    take,
  });

  // Resolve token symbols from contract addresses
  const contractAddrs = [
    ...new Set(events.map((e) => e.contractAddress).filter(Boolean) as string[]),
  ];
  const tokens =
    contractAddrs.length > 0
      ? await this.prisma.token.findMany({
          where: { contractAddress: { in: contractAddrs } },
          select: { contractAddress: true, symbol: true, decimals: true },
        })
      : [];
  const tokenMap = new Map(tokens.map((t) => [t.contractAddress, t]));

  // Resolve chain names
  const chainIds = [...new Set(events.map((e) => e.chainId))];
  const chains = await this.prisma.chain.findMany({
    where: { id: { in: chainIds } },
    select: { id: true, name: true },
  });
  const chainMap = new Map(chains.map((c) => [c.id, c.name]));

  return {
    events: events.map((e) => {
      const token = tokenMap.get(e.contractAddress ?? '');
      return {
        id: String(e.id),
        chainId: e.chainId,
        chainName: chainMap.get(e.chainId) ?? null,
        blockNumber: String(e.blockNumber),
        txHash: e.txHash,
        logIndex: e.logIndex,
        contractAddress: e.contractAddress ?? null,
        eventType: e.eventType,
        fromAddress: e.fromAddress ?? null,
        toAddress: e.toAddress ?? null,
        amount: e.amount != null ? String(e.amount) : null,
        tokenSymbol: token?.symbol ?? null,
        tokenDecimals: token?.decimals ?? null,
        clientId: e.clientId != null ? Number(e.clientId) : null,
        projectId: e.projectId != null ? Number(e.projectId) : null,
        walletId: e.walletId != null ? Number(e.walletId) : null,
        isInbound: e.isInbound ?? null,
        rawData: e.rawData ?? null,
        processedAt: e.processedAt ?? null,
      };
    }),
  };
}
```

- [ ] **Step 1.2: Verify the endpoint compiles**

```bash
cd services/chain-indexer-service
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 1.3: Smoke-test the endpoint manually**

If the chain-indexer is running locally:
```bash
curl http://localhost:3006/events/recent?limit=5
```

Expected: `{ "events": [] }` (empty array if no indexed events yet — that's correct).

- [ ] **Step 1.4: Commit**

```bash
git add services/chain-indexer-service/src/sync-health/sync-health.controller.ts
git commit -m "feat(chain-indexer): add GET /events/recent endpoint"
```

---

## Task 2: admin-api — TransactionsService

**Files:**
- Create: `services/admin-api/src/transactions/transactions.service.ts`

- [ ] **Step 2.1: Create the service file**

```typescript
// services/admin-api/src/transactions/transactions.service.ts
import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const EXPLORER_MAP: Record<number, string> = {
  1: 'https://etherscan.io/tx',
  56: 'https://bscscan.com/tx',
  137: 'https://polygonscan.com/tx',
  42161: 'https://arbiscan.io/tx',
  10: 'https://optimistic.etherscan.io/tx',
  43114: 'https://snowtrace.io/tx',
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly chainIndexerUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    };
  }

  async getRecentTransactions(limit: number) {
    // 1. Fetch raw events from chain-indexer
    let events: any[] = [];
    try {
      const { data } = await axios.get(
        `${this.chainIndexerUrl}/events/recent`,
        { headers: this.headers, params: { limit }, timeout: 10000 },
      );
      events = Array.isArray(data?.events) ? data.events : [];
    } catch (err) {
      this.logger.warn(
        `Failed to fetch recent events: ${(err as Error).message}`,
      );
      return { transactions: [] };
    }

    if (events.length === 0) return { transactions: [] };

    // 2. Enrich with client names (batch — no N+1)
    const clientIds = [
      ...new Set(
        events
          .map((e: any) => e.clientId)
          .filter((id): id is number => id != null),
      ),
    ];
    const clients =
      clientIds.length > 0
        ? await this.prisma.client.findMany({
            where: { id: { in: clientIds.map(BigInt) } },
            select: { id: true, name: true },
          })
        : [];
    const clientMap = new Map(clients.map((c) => [Number(c.id), c.name]));

    // 3. Build enriched response
    return {
      transactions: events.map((e: any) => ({
        id: e.id,
        txHash: e.txHash,
        chainId: e.chainId,
        chainName: e.chainName ?? null,
        blockNumber: e.blockNumber,
        eventType: e.eventType,
        isInbound: e.isInbound ?? null,
        fromAddress: e.fromAddress ?? null,
        toAddress: e.toAddress ?? null,
        contractAddress: e.contractAddress ?? null,
        amount: e.amount ?? null,
        tokenSymbol: e.tokenSymbol ?? null,
        tokenDecimals: e.tokenDecimals ?? null,
        logIndex: e.logIndex ?? null,
        clientId: e.clientId ?? null,
        clientName: e.clientId != null ? (clientMap.get(e.clientId) ?? null) : null,
        walletId: e.walletId ?? null,
        walletLabel:
          e.walletId != null ? `Wallet #${e.walletId}` : null,
        rawData: e.rawData ?? null,
        processedAt: e.processedAt ?? null,
        explorerUrl:
          e.txHash != null && EXPLORER_MAP[e.chainId] != null
            ? `${EXPLORER_MAP[e.chainId]}/${e.txHash}`
            : null,
      })),
    };
  }
}
```

- [ ] **Step 2.2: Verify the service compiles**

```bash
cd services/admin-api
npx tsc --noEmit
```

Expected: no errors.

---

## Task 3: admin-api — TransactionsController and Module

**Files:**
- Create: `services/admin-api/src/transactions/transactions.controller.ts`
- Create: `services/admin-api/src/transactions/transactions.module.ts`
- Modify: `services/admin-api/src/app.module.ts`

- [ ] **Step 3.1: Create TransactionsController**

```typescript
// services/admin-api/src/transactions/transactions.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Get('recent')
  async getRecent(@Query('limit') limit?: string) {
    const n = Math.min(parseInt(limit ?? '10', 10), 50);
    return this.service.getRecentTransactions(n);
  }
}
```

- [ ] **Step 3.2: Create TransactionsModule**

```typescript
// services/admin-api/src/transactions/transactions.module.ts
import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
```

- [ ] **Step 3.3: Import TransactionsModule in AppModule**

Open `services/admin-api/src/app.module.ts`. Add the import at the top:

```typescript
import { TransactionsModule } from './transactions/transactions.module';
```

Add `TransactionsModule` to the `imports` array alongside the other modules (e.g. next to `SyncManagementModule`):

```typescript
imports: [
  // ... existing imports ...
  SyncManagementModule,
  TransactionsModule,   // ← add this line
  // ... rest of imports ...
],
```

- [ ] **Step 3.4: Verify the admin-api compiles**

```bash
cd services/admin-api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.5: Smoke-test the endpoint**

If admin-api is running locally (port 3001):
```bash
curl -H "Authorization: Bearer <your-token>" http://localhost:3001/admin/transactions/recent?limit=5
```

Expected: `{ "transactions": [] }` (empty until chain-indexer has indexed events).

- [ ] **Step 3.6: Commit**

```bash
git add services/admin-api/src/transactions/ services/admin-api/src/app.module.ts
git commit -m "feat(admin-api): add GET /transactions/recent endpoint"
```

---

## Task 4: frontend — TxExpandedRow component

**Files:**
- Create: `apps/admin/components/tx-expanded-row.tsx`

- [ ] **Step 4.1: Create the component**

```typescript
// apps/admin/components/tx-expanded-row.tsx
"use client";

import { useState } from "react";
import { ExternalLink, Search, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface RecentTx {
  id: string | number;
  txHash: string;
  chain?: string;
  chainId?: number;
  chainName?: string | null;
  tokenSymbol?: string | null;
  tokenDecimals?: number | null;
  amount?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  contractAddress?: string | null;
  logIndex?: number | null;
  eventType?: string | null;
  isInbound?: boolean | null;
  status?: string;
  blockNumber?: number | string | null;
  processedAt?: string | null;
  clientId?: number | null;
  clientName?: string | null;
  walletId?: number | null;
  walletLabel?: string | null;
  rawData?: Record<string, any> | null;
  explorerUrl?: string | null;
}

interface TxExpandedRowProps {
  tx: RecentTx;
  colSpan: number;
}

type TabId = "summary" | "technical";

function InlineCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-1 p-0.5 text-text-muted hover:text-text-primary transition-colors duration-fast"
    >
      {copied
        ? <Check className="w-3 h-3 text-status-success" />
        : <Copy className="w-3 h-3" />}
    </button>
  );
}

function formatTimestamp(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 19) + " UTC",
  };
}

export function TxExpandedRow({ tx, colSpan }: TxExpandedRowProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [rawCopied, setRawCopied] = useState(false);
  const { date, time } = formatTimestamp(tx.processedAt);

  const raw = tx.rawData as any;

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-surface-elevated border-b border-border-subtle border-l-2 border-l-accent-primary">

          {/* ── Tabs ─────────────────────────────────────────── */}
          <div className="flex border-b border-border-subtle px-4">
            {(["summary", "technical"] as TabId[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest font-display transition-colors duration-fast -mb-px",
                  activeTab === tab
                    ? "text-accent-primary border-b-2 border-accent-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── Summary Tab ───────────────────────────────────── */}
          {activeTab === "summary" && (
            <div className="p-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Client</div>
                  <div className="font-display text-[12px] text-text-primary font-semibold">
                    {tx.clientName ?? "—"}
                  </div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">
                    {tx.walletLabel ?? (tx.walletId != null ? `Wallet #${tx.walletId}` : "—")}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Processed At</div>
                  <div className="font-mono text-[12px] text-text-primary">{date}</div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">{time}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Confirmation</div>
                  <div className="font-display text-[12px] text-status-success font-semibold">Confirmed</div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">Finalized</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Gas Cost</div>
                  <div className="font-mono text-[12px] text-text-primary">
                    {raw?.gasUsed != null ? `${raw.gasUsed} gwei` : "—"}
                  </div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">
                    {raw?.gasCostUsd != null ? `≈ $${raw.gasCostUsd} USD` : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {tx.explorerUrl && (
                  <a
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-status-success/10 text-status-success text-[10px] font-semibold font-display px-3 py-1.5 rounded-button border border-status-success/20 hover:bg-status-success/20 transition-colors duration-fast"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on {tx.chainName ?? `Chain ${tx.chainId}`} Explorer
                  </a>
                )}
                <button
                  onClick={() => router.push(`/traceability?txHash=${tx.txHash}`)}
                  className="inline-flex items-center gap-1.5 bg-accent-subtle text-accent-primary text-[10px] font-semibold font-display px-3 py-1.5 rounded-button border border-accent-primary/20 hover:bg-accent-primary/10 transition-colors duration-fast"
                >
                  <Search className="w-3 h-3" />
                  Full Traceability
                </button>
                <span className="text-[10px] text-text-muted font-mono ml-2">
                  {tx.contractAddress && (
                    <>
                      Contract: {tx.contractAddress.slice(0, 8)}…{tx.contractAddress.slice(-4)}
                    </>
                  )}
                  {tx.logIndex != null && <> · Log #{tx.logIndex}</>}
                </span>
              </div>
            </div>
          )}

          {/* ── Technical Tab ─────────────────────────────────── */}
          {activeTab === "technical" && (
            <div className="p-4 grid grid-cols-2 gap-4">
              {/* Event logs */}
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-2">Event Logs</div>
                <div className="bg-surface-card border border-border-subtle rounded-input p-2 font-mono text-[10px]">
                  {raw?.logs?.length > 0 ? (
                    (raw.logs as any[]).slice(0, 3).map((log: any, i: number) => (
                      <div key={i} className={i > 0 ? "mt-2 pt-2 border-t border-border-subtle" : ""}>
                        <div className="text-accent-primary font-semibold">
                          {log.decoded?.name ?? "Transfer"}
                          <span className="text-text-muted font-normal"> (log #{log.logIndex ?? i})</span>
                        </div>
                        {log.decoded?.args &&
                          Object.entries(log.decoded.args)
                            .slice(0, 3)
                            .map(([k, v]) => (
                              <div key={k} className="text-text-muted">
                                <span className="text-text-secondary">{k}:</span>{" "}
                                {String(v).slice(0, 42)}
                              </div>
                            ))}
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="text-accent-primary font-semibold">
                        {tx.eventType ?? "Transfer"}
                        <span className="text-text-muted font-normal"> (log #{tx.logIndex ?? 0})</span>
                      </div>
                      <div className="text-text-muted">from: <span className="text-text-secondary">{tx.fromAddress ?? "—"}</span></div>
                      <div className="text-text-muted">to: <span className="text-text-secondary">{tx.toAddress ?? "—"}</span></div>
                      {tx.amount && (
                        <div className="text-text-muted">
                          value: <span className="text-status-success">{tx.amount} {tx.tokenSymbol ?? ""}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Contract + raw JSON */}
              <div className="space-y-3">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-2">Contract</div>
                  <div className="bg-surface-card border border-border-subtle rounded-input p-2 font-mono text-[10px]">
                    <div className="text-text-muted">Address</div>
                    <div className="text-text-primary flex items-center">
                      {tx.contractAddress ?? "—"}
                      {tx.contractAddress && <InlineCopyButton value={tx.contractAddress} />}
                    </div>
                    <div className="text-text-muted mt-1">Log Index</div>
                    <div className="text-text-primary">{tx.logIndex ?? "—"}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-2">Raw Data (JSON)</div>
                  {tx.rawData ? (
                    <>
                      <div className="bg-surface-card border border-border-subtle rounded-input p-2 font-mono text-[10px] text-text-muted max-h-[80px] overflow-hidden relative">
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(tx.rawData, null, 2).slice(0, 300)}
                        </pre>
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-card to-transparent" />
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard
                            .writeText(JSON.stringify(tx.rawData, null, 2))
                            .then(() => {
                              setRawCopied(true);
                              setTimeout(() => setRawCopied(false), 1500);
                            });
                        }}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-display font-semibold text-text-muted hover:text-text-primary border border-border-subtle rounded-button px-2.5 py-1 transition-colors duration-fast"
                      >
                        {rawCopied
                          ? <><Check className="w-3 h-3 text-status-success" /> Copied!</>
                          : <><Copy className="w-3 h-3" /> Copy Raw JSON</>}
                      </button>
                    </>
                  ) : (
                    <div className="bg-surface-card border border-border-subtle rounded-input p-3 font-mono text-[10px] text-text-muted">
                      No raw data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4.2: Verify the component has no TypeScript errors**

```bash
cd apps/admin
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add apps/admin/components/tx-expanded-row.tsx
git commit -m "feat(admin): add TxExpandedRow component with Summary and Technical tabs"
```

---

## Task 5: frontend — Update page.tsx

**Files:**
- Modify: `apps/admin/app/page.tsx`

- [ ] **Step 5.1: Update imports at the top of page.tsx**

Add the import for the new component and the `ChevronRight` icon. The existing import line is:

```typescript
import { Loader2 } from "lucide-react";
```

Replace it with:

```typescript
import React from "react";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { TxExpandedRow, type RecentTx } from "@/components/tx-expanded-row";
```

- [ ] **Step 5.2: Remove the local RecentTx interface and replace with the imported one**

Delete the existing `RecentTx` interface from `page.tsx` (lines starting with `interface RecentTx {` through the closing `}`). The `RecentTx` type is now exported from `tx-expanded-row.tsx` and imported above.

- [ ] **Step 5.3: Add expandedTxIds state to DashboardPage**

Inside `DashboardPage`, after the existing `useState` declarations, add:

```typescript
const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());

function toggleExpand(id: string) {
  setExpandedTxIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
```

- [ ] **Step 5.4: Add expand chevron to table headers**

Find the headers array:
```typescript
{["Type", "Chain", "Hash", "From → To", "Token", "Amount", "Status", "Block"].map((h) => (
```

Replace with (adds empty first column for chevron):
```typescript
{["", "Type", "Chain", "Hash", "From → To", "Token", "Amount", "Status", "Block"].map((h) => (
```

- [ ] **Step 5.5: Update each table row to support expand toggle + render TxExpandedRow**

Find the `transactions.map((tx, idx) => {` section and replace everything from `const type = mapEventType(...)` through the end of the `return (...)` block with:

```tsx
const type = mapEventType(tx.eventType);
const abbr = chainAbbr(tx.chain, tx.chainId);
const txId = String(tx.id);
const isExpanded = expandedTxIds.has(txId);
return (
  <React.Fragment key={txId}>
    <tr
      onClick={() => toggleExpand(txId)}
      className={`border-b border-border-subtle hover:bg-surface-hover transition-colors duration-fast cursor-pointer ${idx % 2 === 0 ? "bg-surface-card" : "bg-transparent"} ${isExpanded ? "bg-surface-hover border-l-2 border-l-accent-primary" : ""}`}
    >
      <td className="px-2 py-3 pl-4">
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-accent-primary" />
          : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 font-display text-[12px] font-semibold ${type === "deposit" ? "text-status-success" : "text-status-error"}`}>
          <TxTypeIcon type={type} />
          {type === "deposit" ? "Deposit" : "Withdrawal"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ChainHexAvatar abbr={abbr} />
          <span className="font-display text-[12px] text-text-secondary">{tx.chainName ?? tx.chain ?? `Chain ${tx.chainId}`}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center">
          <span className="font-mono text-code text-text-secondary">{truncateAddress(tx.txHash)}</span>
          <CopyButton value={tx.txHash} size="xs" />
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-[10px] text-text-muted">
          {truncateAddress(tx.fromAddress ?? "")} → {truncateAddress(tx.toAddress ?? "")}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-code text-text-secondary font-medium">{tx.tokenSymbol ?? "—"}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`font-mono text-code font-semibold ${type === "deposit" ? "text-status-success" : "text-status-error"}`}>
          {type === "deposit" ? "+" : "-"}{tx.amount ?? "—"} {tx.tokenSymbol ?? ""}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={dashboardStatusMap[tx.status ?? "confirmed"] ?? "confirmed"} />
      </td>
      <td className="px-5 py-3">
        <span className="font-mono text-[10px] text-text-muted">{tx.blockNumber ? `#${tx.blockNumber}` : "—"}</span>
      </td>
    </tr>
    {isExpanded && (
      <TxExpandedRow tx={tx} colSpan={9} />
    )}
  </React.Fragment>
);
```

- [ ] **Step 5.6: Verify TypeScript compiles**

```bash
cd apps/admin
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.7: Commit**

```bash
git add apps/admin/app/page.tsx
git commit -m "feat(admin): expandable transaction rows with Summary and Technical tabs on dashboard"
```

---

## Task 6: frontend — traceability/page.tsx accepts ?txHash= param

**Files:**
- Modify: `apps/admin/app/traceability/page.tsx`

- [ ] **Step 6.1: Add useSearchParams import**

At the top of `apps/admin/app/traceability/page.tsx`, add `useSearchParams` to the existing react imports:

```typescript
import { useState, useEffect, useSearchParams } from "react";
```

Note: `useSearchParams` is from `next/navigation`, not React. So add this import:

```typescript
import { useSearchParams } from "next/navigation";
```

- [ ] **Step 6.2: Add txHash banner state inside the component**

Inside the `TraceabilityPage` (or whatever the main component function is named), after the existing `useState` declarations, add:

```typescript
const searchParams = useSearchParams();
const [txHashBanner, setTxHashBanner] = useState<string | null>(null);

useEffect(() => {
  const hash = searchParams.get("txHash");
  if (hash) setTxHashBanner(hash);
}, [searchParams]);
```

- [ ] **Step 6.3: Render the banner when txHash is present**

At the top of the returned JSX (before the client dropdown or first section), add:

```tsx
{txHashBanner && (
  <div className="mb-4 flex items-center gap-3 bg-accent-subtle border border-accent-primary/20 rounded-input px-4 py-3">
    <span className="font-display text-caption text-accent-primary font-semibold">Directed from dashboard</span>
    <span className="font-mono text-[10px] text-text-secondary">{txHashBanner}</span>
    <button
      onClick={() => setTxHashBanner(null)}
      className="ml-auto text-text-muted hover:text-text-primary font-display text-caption"
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 6.4: Verify TypeScript compiles**

```bash
cd apps/admin
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.5: Commit**

```bash
git add apps/admin/app/traceability/page.tsx
git commit -m "feat(admin): traceability page accepts ?txHash= query param with banner"
```

---

## Final Verification

- [ ] **Step V.1: Build the admin panel**

```bash
cd apps/admin
npm run build
```

Expected: build succeeds with no errors. Warnings about missing env vars are acceptable.

- [ ] **Step V.2: Manual end-to-end check (when services are running)**

1. Open the admin dashboard
2. Confirm the Recent Transactions table has a `▶` chevron column
3. Click any transaction row → confirm it expands inline
4. Confirm Summary tab shows: Client, Processed At, Confirmation, Gas Cost, and action buttons
5. Click Technical tab → confirm event logs and Raw Data sections render (or show "—" gracefully)
6. Click "View on [Chain] Explorer" → confirm it opens correct URL in new tab
7. Click "Full Traceability" → confirm it navigates to `/traceability?txHash=0x...` with the banner
8. Click the same row again → confirm it collapses
9. Click two different rows → confirm both can be open simultaneously
