# Dashboard Transaction Datagrid — Enriched Expandable Rows

**Date:** 2026-04-12  
**Status:** Approved  
**Scope:** Dashboard (`apps/admin/app/page.tsx`), admin-api new transactions endpoint, chain-indexer new events endpoint

---

## Problem

The dashboard's Recent Transactions table shows minimal data per row (Type, Chain, Hash, From→To, Token, Amount, Status, Block) with no way to expand, no blockchain explorer links, and no client/wallet context. It also has no real backend — the `/transactions/recent` endpoint doesn't exist yet.

---

## Goal

1. Add `GET /admin/transactions/recent` to admin-api returning enriched `IndexedEvent` records.
2. Add `GET /events/recent` to chain-indexer as the data source.
3. Replace the flat table rows with inline-expandable rows containing a two-tab detail panel.

---

## Architecture & Data Flow

```
admin panel (Next.js)
  └── GET /transactions/recent?limit=10
        │
        ▼
  admin-api (NestJS)
    TransactionsController  ← new
      └── TransactionsService  ← new
            ├── calls chain-indexer: GET /events/recent?limit=N
            └── enriches with clientName + walletLabel from admin-api Prisma
        │
        ▼
  chain-indexer (NestJS)
    SyncHealthController
      └── GET /events/recent?limit&chainId  ← new route
            └── prisma.indexedEvent.findMany(orderBy: processedAt DESC)
```

---

## Backend: chain-indexer

### New route: `GET /events/recent`

**File:** `services/chain-indexer-service/src/sync-health/sync-health.controller.ts`

Query params:
- `limit` (optional, default 20, max 100)
- `chainId` (optional, filter by chain)

Queries `IndexedEvent` via Prisma ordered by `processedAt DESC`.

Response shape:
```json
{
  "events": [
    {
      "id": "1234",
      "chainId": 1,
      "blockNumber": "19841293",
      "txHash": "0xd9c2...",
      "logIndex": 0,
      "contractAddress": "0xA0b8...",
      "eventType": "erc20_transfer",
      "fromAddress": "0x1234...",
      "toAddress": "0xabcd...",
      "amount": "1200000000",
      "clientId": "42",
      "walletId": "7",
      "isInbound": true,
      "rawData": { },
      "processedAt": "2026-04-12T14:22:08Z"
    }
  ]
}
```

---

## Backend: admin-api

### New files

- `services/admin-api/src/transactions/transactions.controller.ts`
- `services/admin-api/src/transactions/transactions.service.ts`
- `services/admin-api/src/transactions/transactions.module.ts`

### `GET /admin/transactions/recent`

Query params:
- `limit` (optional, default 10, max 50)

**Logic in `TransactionsService`:**
1. Call chain-indexer `GET /events/recent?limit=N` via `HttpService`
2. Collect unique `clientId` values → batch-query admin-api Prisma for client names
3. Collect unique `walletId` values → batch-query admin-api Prisma for wallet labels
4. Collect unique `chainId` values → batch-query admin-api Prisma `Chain` table for chain names
5. Collect unique `contractAddress` values → batch-query admin-api Prisma `Token` table for `symbol` and `decimals`
6. Resolve `explorerUrl` per `chainId` using static map (see Explorer URL Mapping)
7. Join everything and return enriched array

All enrichment queries use `findMany` with `in` filters — no N+1 queries.

**Enriched response shape:**
```json
{
  "transactions": [
    {
      "id": "1234",
      "txHash": "0xd9c2...",
      "chainId": 1,
      "chainName": "Ethereum",
      "blockNumber": 19841293,
      "eventType": "erc20_transfer",
      "isInbound": true,
      "fromAddress": "0x1234...",
      "toAddress": "0xabcd...",
      "contractAddress": "0xA0b8...",
      "amount": "1200000000",
      "tokenSymbol": "USDC",
      "tokenDecimals": 6,
      "logIndex": 0,
      "clientId": 42,
      "clientName": "Corretora XYZ",
      "walletId": 7,
      "walletLabel": "Hot Wallet #7",
      "rawData": { },
      "processedAt": "2026-04-12T14:22:08Z",
      "explorerUrl": "https://etherscan.io/tx/0xd9c2..."
    }
  ]
}
```

### Explorer URL Mapping (static, in `TransactionsService`)

| chainId | Explorer base URL |
|---------|------------------|
| 1 | `https://etherscan.io/tx/{hash}` |
| 56 | `https://bscscan.com/tx/{hash}` |
| 137 | `https://polygonscan.com/tx/{hash}` |
| 42161 | `https://arbiscan.io/tx/{hash}` |
| 10 | `https://optimistic.etherscan.io/tx/{hash}` |
| 43114 | `https://snowtrace.io/tx/{hash}` |
| unknown | `null` |

---

## Frontend: admin panel

### New component

**File:** `apps/admin/components/tx-expanded-row.tsx`

Props: `tx: RecentTx`, `colSpan: number`

Renders an inline `<tr>` immediately after the parent row containing a two-tab panel.

**Summary tab** (default active):
- Client name + wallet label
- Processed timestamp (date + UTC time)
- Confirmation status: "Confirmed" (event presence in `IndexedEvent` means it passed the chain's required confirmation threshold)
- Gas cost (best-effort from `rawData.gasUsed` if present, shown as "—" if `rawData` lacks gas fields)
- "View on [Explorer]" button — opens `explorerUrl` in new tab; hidden if `explorerUrl` is null
- "Full Traceability →" button — navigates to `/traceability?txHash={hash}`
- Contract address + log index shown inline as secondary metadata

**Technical tab**:
- Event logs decoded from `rawData` (event name, from, to, value with human-readable amount using `tokenDecimals`)
- Contract address block
- Raw JSON viewer of `rawData` (truncated to 5 lines, with "Copy Raw JSON" button)
- "No raw data available" state when `rawData` is null

### Changes to `apps/admin/app/page.tsx`

- Expand `RecentTx` interface with new enriched fields (`clientName`, `walletLabel`, `explorerUrl`, `contractAddress`, `logIndex`, `isInbound`, `rawData`)
- Add `expandedTxIds: Set<string>` state (toggle on row click)
- Add `▶` / `▼` chevron as first column in header and each row
- After each row, conditionally render `<TxExpandedRow>` when that tx ID is in `expandedTxIds`

### Changes to `apps/admin/app/traceability/page.tsx`

- Read `txHash` from URL search params on mount
- If present, auto-populate the search/filter field and trigger lookup

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| chain-indexer unreachable | admin-api returns `{ transactions: [] }`, dashboard shows empty state |
| Client/wallet enrichment query fails | Event returned with `clientName: null`, `walletLabel: null` — frontend shows "—" |
| `explorerUrl` is null (unknown chain) | "View on Explorer" button hidden |
| `rawData` is null | Technical tab shows "No raw data available" |
| `/transactions/recent` returns HTTP error | Frontend catches, sets `transactions: []`, no crash |

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `services/chain-indexer-service/src/sync-health/sync-health.controller.ts` | Add `GET /events/recent` route |
| `services/admin-api/src/transactions/transactions.controller.ts` | Create |
| `services/admin-api/src/transactions/transactions.service.ts` | Create |
| `services/admin-api/src/transactions/transactions.module.ts` | Create |
| `services/admin-api/src/app.module.ts` | Import `TransactionsModule` |
| `apps/admin/components/tx-expanded-row.tsx` | Create |
| `apps/admin/app/page.tsx` | Expand `RecentTx` interface, add expand state, render `TxExpandedRow` |
| `apps/admin/app/traceability/page.tsx` | Accept `?txHash=` query param on mount |
