# Wizard Dynamic Chain Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded chain list in the setup wizard with a dynamic list fetched from the backend, showing only admin-configured chains as selectable and disabling those without active RPC nodes.

**Architecture:** New `GET /client/v1/chains` endpoint in client-api queries the `cvh_admin` database for active chains joined with `rpc_nodes` to determine RPC readiness. Frontend fetches this on mount and renders chains accordingly — configured chains are selectable, unconfigured are disabled with guidance.

**Tech Stack:** NestJS (client-api), MySQL raw queries via AdminDatabaseService, Next.js/React (client app), Tailwind CSS

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `services/client-api/src/chain/chain.service.ts` | Query admin DB for chains + RPC node counts |
| Create | `services/client-api/src/chain/chain.controller.ts` | `GET /client/v1/chains` endpoint |
| Create | `services/client-api/src/chain/chain.module.ts` | Wire controller + service |
| Modify | `services/client-api/src/app.module.ts` | Register ChainModule |
| Modify | `apps/client/app/setup/page.tsx` | Replace hardcoded CHAINS with dynamic fetch + disabled state |

---

### Task 1: Backend — ChainService

**Files:**
- Create: `services/client-api/src/chain/chain.service.ts`

- [ ] **Step 1: Create the chain service**

```typescript
// services/client-api/src/chain/chain.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AdminDatabaseService } from '../prisma/admin-database.service';

interface AvailableChainRow {
  chain_id: number;
  name: string;
  short_name: string;
  native_currency_symbol: string;
  native_currency_decimals: number;
  explorer_url: string | null;
  is_active: number;
  active_node_count: string; // COUNT comes back as string from MySQL
}

export interface AvailableChain {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  explorerUrl: string | null;
  isActive: boolean;
  rpcConfigured: boolean;
  activeNodeCount: number;
}

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  constructor(private readonly adminDb: AdminDatabaseService) {}

  async getAvailableChains(): Promise<AvailableChain[]> {
    const rows = await this.adminDb.query<AvailableChainRow>(
      `SELECT c.chain_id, c.name, c.short_name,
              c.native_currency_symbol, c.native_currency_decimals,
              c.explorer_url, c.is_active,
              COUNT(rn.id) AS active_node_count
       FROM chains c
       LEFT JOIN rpc_nodes rn
         ON rn.chain_id = c.chain_id
         AND rn.is_active = 1
         AND rn.status = 'active'
       WHERE c.is_active = 1
       GROUP BY c.chain_id
       ORDER BY c.chain_id`,
    );

    return rows.map((row) => ({
      chainId: row.chain_id,
      name: row.name,
      shortName: row.short_name,
      nativeCurrencySymbol: row.native_currency_symbol,
      nativeCurrencyDecimals: row.native_currency_decimals,
      explorerUrl: row.explorer_url,
      isActive: row.is_active === 1,
      rpcConfigured: Number(row.active_node_count) > 0,
      activeNodeCount: Number(row.active_node_count),
    }));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/client-api/src/chain/chain.service.ts
git commit -m "feat(client-api): add ChainService for dynamic chain discovery"
```

---

### Task 2: Backend — ChainController + ChainModule

**Files:**
- Create: `services/client-api/src/chain/chain.controller.ts`
- Create: `services/client-api/src/chain/chain.module.ts`
- Modify: `services/client-api/src/app.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
// services/client-api/src/chain/chain.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { ChainService } from './chain.service';

@ApiTags('Chains')
@ApiSecurity('ApiKey')
@Controller('client/v1/chains')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List available blockchain networks',
    description: `Returns all active chains configured by the administrator, with RPC node availability status.
Chains with \`rpcConfigured: false\` have no active RPC nodes and cannot be used for project deployment.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Available chains list.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        chains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 56 },
              name: { type: 'string', example: 'BNB Smart Chain' },
              shortName: { type: 'string', example: 'BSC' },
              nativeCurrencySymbol: { type: 'string', example: 'BNB' },
              nativeCurrencyDecimals: { type: 'integer', example: 18 },
              explorerUrl: { type: 'string', example: 'https://bscscan.com' },
              isActive: { type: 'boolean', example: true },
              rpcConfigured: { type: 'boolean', example: true },
              activeNodeCount: { type: 'integer', example: 2 },
            },
          },
        },
      },
    },
  })
  async getAvailableChains() {
    const chains = await this.chainService.getAvailableChains();
    return { success: true, chains };
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
// services/client-api/src/chain/chain.module.ts
import { Module } from '@nestjs/common';
import { ChainController } from './chain.controller';
import { ChainService } from './chain.service';

@Module({
  controllers: [ChainController],
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
```

- [ ] **Step 3: Register ChainModule in AppModule**

In `services/client-api/src/app.module.ts`, add the import and register:

```typescript
// Add import at top (after existing imports)
import { ChainModule } from './chain/chain.module';

// Add to imports array (after TokenModule)
    TokenModule,
    ChainModule,
    NotificationRulesModule,
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p services/client-api/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add services/client-api/src/chain/ services/client-api/src/app.module.ts
git commit -m "feat(client-api): add GET /client/v1/chains endpoint for dynamic chain discovery"
```

---

### Task 3: Frontend — Replace hardcoded CHAINS with dynamic fetch

**Files:**
- Modify: `apps/client/app/setup/page.tsx`

- [ ] **Step 1: Add AvailableChain interface and CHAIN_UI_META constant**

Replace the existing `CHAINS` constant (lines 79–143 — the full `const CHAINS: (ChainConfig & { chainId: number })[] = [...]` block) with:

```typescript
// ─── API Chain type ────────────────────────────────────────────

interface AvailableChain {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  explorerUrl: string | null;
  isActive: boolean;
  rpcConfigured: boolean;
  activeNodeCount: number;
}

// UI-only metadata not stored in the database (icons, gas estimates)
const CHAIN_UI_META: Record<
  number,
  { icon: string; gasEstimateLabel: string }
> = {
  1:     { icon: "\u039E", gasEstimateLabel: "~0.05 ETH ($162)" },
  56:    { icon: "\u25C6", gasEstimateLabel: "~0.02 BNB ($12)" },
  137:   { icon: "\u2B21", gasEstimateLabel: "~5.0 POL ($4.50)" },
  42161: { icon: "\u25B2", gasEstimateLabel: "~0.001 ETH ($3.24)" },
  10:    { icon: "\u2B24", gasEstimateLabel: "~0.001 ETH ($3.24)" },
  43114: { icon: "\u25B3", gasEstimateLabel: "~0.1 AVAX ($3.50)" },
  8453:  { icon: "B",      gasEstimateLabel: "~0.0005 ETH ($1.62)" },
};
```

Also remove the old `ChainConfig` interface (lines 36–43) since it's no longer needed.

- [ ] **Step 2: Add state and fetch for available chains**

After the existing state declarations (around line 198), add:

```typescript
  // Available chains (fetched from backend)
  const [availableChains, setAvailableChains] = useState<AvailableChain[]>([]);
  const [chainsLoading, setChainsLoading] = useState(true);
```

After the API calls section comment (around line 222), add the fetch:

```typescript
  // Fetch available chains on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await clientFetch<{ chains: AvailableChain[] }>("/v1/chains");
        setAvailableChains(res.chains || []);
      } catch (err: any) {
        console.error("Failed to fetch chains:", err);
      } finally {
        setChainsLoading(false);
      }
    })();
  }, []);
```

- [ ] **Step 3: Add helper to get chain UI meta**

Add a helper function inside the component (after the `copyMnemonic` callback):

```typescript
  // Helper: get chain display info by merging API data with UI meta
  const getChainMeta = useCallback(
    (chainId: number) => {
      const meta = CHAIN_UI_META[chainId];
      const chain = availableChains.find((c) => c.chainId === chainId);
      return {
        icon: meta?.icon ?? "?",
        gasEstimateLabel: meta?.gasEstimateLabel ?? "",
        symbol: chain?.nativeCurrencySymbol ?? "",
        name: chain?.name ?? `Chain ${chainId}`,
        explorerBase: chain?.explorerUrl ?? "https://etherscan.io",
      };
    },
    [availableChains],
  );
```

- [ ] **Step 4: Update selectedChains to use chainId numbers**

Change the state type from `string[]` to `number[]`:

```typescript
  // Step 2 - Chain Selection
  const [selectedChains, setSelectedChains] = useState<number[]>([]);
```

Update `toggleChain` to work with numbers:

```typescript
  const toggleChain = (chainId: number) => {
    const chain = availableChains.find((c) => c.chainId === chainId);
    if (!chain?.rpcConfigured) return; // Ignore clicks on disabled chains
    setSelectedChains((prev) =>
      prev.includes(chainId)
        ? prev.filter((c) => c !== chainId)
        : [...prev, chainId]
    );
  };
```

- [ ] **Step 5: Update createProjectAndKeys to use numeric chain IDs directly**

In `createProjectAndKeys`, replace the chain ID conversion:

```typescript
      // selectedChains already contains numeric chain IDs
      const numericChainIds = selectedChains;
```

(Remove the old `.map((id) => CHAINS.find(...)` conversion.)

- [ ] **Step 6: Replace Step 2 rendering**

Replace the entire `case 2:` block (lines 538–632) with:

```typescript
      // ========== STEP 2: Select Chains ==========
      case 2:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Select Blockchain Networks"
              subtitle="Choose the networks you want to deploy smart contracts on. Each chain will get its own set of contracts."
            />

            {chainsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                <span className="ml-2 text-text-muted font-display">Loading available networks...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {availableChains.map((chain) => {
                    const isSelected = selectedChains.includes(chain.chainId);
                    const meta = CHAIN_UI_META[chain.chainId];
                    const disabled = !chain.rpcConfigured;

                    return (
                      <button
                        key={chain.chainId}
                        onClick={() => toggleChain(chain.chainId)}
                        disabled={disabled}
                        title={
                          disabled
                            ? "No RPC nodes configured \u2014 contact your administrator"
                            : undefined
                        }
                        className={cn(
                          "relative p-4 rounded-card border-2 text-left transition-all duration-fast group",
                          disabled
                            ? "opacity-40 cursor-not-allowed border-border-default bg-surface-elevated"
                            : isSelected
                              ? "bg-accent-subtle border-accent-primary/30 cursor-pointer"
                              : "bg-surface-elevated border-border-default hover:border-border-focus hover:bg-surface-hover cursor-pointer"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {/* Hexagonal chain icon */}
                          <div
                            className="w-10 h-10 flex items-center justify-center text-[18px] font-bold text-accent-primary bg-accent-subtle"
                            style={{
                              clipPath:
                                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                            }}
                          >
                            {meta?.icon ?? "?"}
                          </div>
                          <div className="flex-1">
                            <div className="text-body font-display font-semibold text-text-primary">
                              {chain.name}
                            </div>
                            <div className="text-micro text-text-muted font-display">
                              {chain.nativeCurrencySymbol}
                              {meta?.gasEstimateLabel
                                ? ` \u00B7 ${meta.gasEstimateLabel}`
                                : ""}
                            </div>
                          </div>

                          {/* Status indicator */}
                          {disabled ? (
                            <div className="flex items-center gap-1 text-text-muted">
                              <Lock className="w-4 h-4" />
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "w-5 h-5 rounded-input border-2 flex items-center justify-center transition-all duration-fast",
                                isSelected
                                  ? "bg-accent-primary border-accent-primary"
                                  : "border-border-default group-hover:border-text-muted"
                              )}
                            >
                              {isSelected && (
                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                              )}
                            </div>
                          )}
                        </div>

                        {/* RPC status badge */}
                        {disabled && (
                          <div className="mt-2 text-[10px] text-status-warning font-display flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            No RPC nodes configured
                          </div>
                        )}
                        {!disabled && chain.activeNodeCount > 0 && (
                          <div className="mt-2 text-[10px] text-text-muted font-display">
                            {chain.activeNodeCount} RPC node{chain.activeNodeCount > 1 ? "s" : ""} active
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedChains.length > 0 && (
                  <div className="bg-surface-elevated border border-border-default rounded-card p-3">
                    <div className="text-micro font-display font-semibold text-text-muted uppercase tracking-wider mb-1">
                      Estimated Total Gas (~5.65M gas per chain)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedChains.map((chainId) => {
                        const chain = availableChains.find(
                          (c) => c.chainId === chainId,
                        );
                        const meta = CHAIN_UI_META[chainId];
                        if (!chain) return null;
                        return (
                          <span
                            key={chainId}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge text-[10px] font-display font-semibold bg-accent-subtle text-accent-primary border border-accent-primary/15"
                          >
                            {chain.name}
                            {meta?.gasEstimateLabel
                              ? `: ${meta.gasEstimateLabel}`
                              : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            <StepNav onPrev={prevStep}>
              <NavButton
                onClick={nextStep}
                disabled={selectedChains.length === 0}
                direction="next"
              >
                Continue
              </NavButton>
            </StepNav>
          </div>
        );
```

- [ ] **Step 7: Update all downstream CHAINS references**

Replace all remaining `CHAINS.find(...)` lookups in the file with `getChainMeta(chainId)` or direct `availableChains.find(...)`:

**Line ~913 (Step 5 `getChainMeta` helper):** Already uses a local `getChainMeta` — rename or replace it to use the component-level one. Replace:

```typescript
        const getChainMeta = (chainId: number) =>
          CHAINS.find((c) => c.chainId === chainId);
```

with:

```typescript
        const getChainStep5 = (chainId: number) => {
          const chain = availableChains.find((c) => c.chainId === chainId);
          const meta = CHAIN_UI_META[chainId];
          return chain
            ? { ...chain, icon: meta?.icon ?? "?", gasEstimateLabel: meta?.gasEstimateLabel ?? "", symbol: chain.nativeCurrencySymbol }
            : undefined;
        };
```

Update all `meta` references in Step 5 to use `getChainStep5(chain.chainId)` instead of `getChainMeta(chain.chainId)`.

**Line ~1233 (Step 6 deploy):** Replace:
```typescript
const chainConfig = CHAINS.find((c) => c.chainId === chain.chainId);
const explorerBase = chainConfig?.explorerBase || "https://etherscan.io";
```
with:
```typescript
const chainData = availableChains.find((c) => c.chainId === chain.chainId);
const explorerBase = chainData?.explorerUrl || "https://etherscan.io";
```

**Line ~1408 (Step 7 complete):** Same pattern — replace `CHAINS.find(...)` with `availableChains.find(...)`.

**Line ~1033 (Step 6 deploy button text):** Replace `selectedChains.length` display (this already works since it's just a count).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p apps/client/tsconfig.json`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add apps/client/app/setup/page.tsx
git commit -m "feat(client): replace hardcoded chains with dynamic fetch from admin config

Step 2 now fetches available chains from GET /client/v1/chains.
Chains without active RPC nodes are shown disabled with guidance.
Selected chains use numeric chainId instead of string IDs."
```
