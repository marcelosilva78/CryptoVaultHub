# Wizard Step 2: Dynamic Chain Selection from Admin-Configured RPC Nodes

**Date:** 2026-04-22
**Status:** Approved

## Problem

The setup wizard Step 2 ("Select Blockchain Networks") uses a hardcoded list of 7 chains. This allows clients to select chains that have no RPC nodes configured in the admin panel, leading to deployment failures. The chain selection must reflect the actual infrastructure configured by the administrator.

## Design

### Backend: `GET /client/v1/chains`

New endpoint in `client-api` that queries the `cvh_admin` database for active chains and joins with `rpc_nodes` to determine RPC readiness.

**Location:** `services/client-api/src/chain/chain.controller.ts` (new file)
**Service:** `services/client-api/src/chain/chain.service.ts` (new file)
**Module:** Register in `services/client-api/src/app.module.ts`

**Response shape:**

```json
{
  "success": true,
  "chains": [
    {
      "chainId": 56,
      "name": "BNB Smart Chain",
      "shortName": "BSC",
      "nativeCurrencySymbol": "BNB",
      "nativeCurrencyDecimals": 18,
      "explorerUrl": "https://bscscan.com",
      "isActive": true,
      "rpcConfigured": true,
      "activeNodeCount": 2
    }
  ]
}
```

**Query logic:**

```sql
SELECT c.chain_id, c.name, c.short_name, c.native_currency_symbol,
       c.native_currency_decimals, c.explorer_url, c.is_active,
       COUNT(rn.id) AS active_node_count
FROM chains c
LEFT JOIN rpc_nodes rn
  ON rn.chain_id = c.chain_id AND rn.is_active = 1 AND rn.status = 'active'
WHERE c.is_active = 1
GROUP BY c.chain_id
ORDER BY c.chain_id
```

- `rpcConfigured` = `active_node_count > 0`
- Auth: requires valid client API key with `read` scope
- No new DB tables or migrations

### Frontend: Dynamic Step 2

**1. Fetch chains on wizard mount**

Call `GET /client/v1/chains` once when the wizard component mounts. Store in state as `availableChains`. Show a loading spinner until resolved.

**2. Static UI metadata map**

A `CHAIN_UI_META` record keyed by `chainId` provides client-only display values that don't belong in the database:

```typescript
const CHAIN_UI_META: Record<number, { icon: string; gasEstimateLabel: string }> = {
  1:     { icon: "\u039E", gasEstimateLabel: "~0.05 ETH ($162)" },
  56:    { icon: "\u25C6", gasEstimateLabel: "~0.02 BNB ($12)" },
  137:   { icon: "\u2B21", gasEstimateLabel: "~5.0 POL ($4.50)" },
  42161: { icon: "\u25B2", gasEstimateLabel: "~0.001 ETH ($3.24)" },
  10:    { icon: "\u2B24", gasEstimateLabel: "~0.001 ETH ($3.24)" },
  43114: { icon: "\u25B3", gasEstimateLabel: "~0.1 AVAX ($3.50)" },
  8453:  { icon: "B",      gasEstimateLabel: "~0.0005 ETH ($1.62)" },
};
```

For chains added by the admin that are not in this map, use a fallback icon (`"?"`) and no gas estimate label.

**3. Step 2 rendering**

- Chains with `rpcConfigured: true` render as selectable cards (current behavior)
- Chains with `rpcConfigured: false` render with `opacity-40 cursor-not-allowed`, a lock icon overlay, and tooltip text: "No RPC nodes configured -- contact your administrator"
- Clicking a disabled chain does nothing
- Chain cards show: icon, name, symbol, gas estimate (from UI meta), and a small badge like "2 nodes" or "No RPC" for disabled

**4. Validation**

- `selectedChains` can only contain chains where `rpcConfigured === true`
- "Continue" button requires `selectedChains.length > 0`

**5. Remove hardcoded CHAINS constant**

The existing `CHAINS` array is replaced by the API response merged with `CHAIN_UI_META`. All downstream references (Steps 4-7) that look up chain config by `chainId` will use the fetched data.

### What doesn't change

- Admin panel chain/RPC management (no changes)
- Steps 3-7 logic (they consume `selectedChains` which now only contains valid chains)
- Gas estimate labels remain approximate client-side constants
- No new admin endpoints needed
