# Gas Tank Client UX — Requirements for Next Session

**Date:** 2026-05-05
**Priority:** HIGH — Clients cannot monitor or manage gas tank funds
**Status:** Requirements defined, ready for implementation

---

## Problem

The gas tank wallet is created during the setup wizard (Step 5) and funded by the client to pay for smart contract deployments and ongoing operations (sweep, flush, forwarder deployment). However, after the wizard completes, **there is no visibility** of the gas tank in the client portal:

- No gas tank section on the dashboard
- No gas tank page in the sidebar menu
- No balance monitoring
- No low-balance alerts
- No top-up mechanism outside the wizard
- No gas consumption history
- The client has no way to know when the gas tank needs refunding

## Context

- Gas tank address: derived at path `m/44'/60'/1000'/{chainId}/0` from the project mnemonic
- Stored in `cvh_wallets.wallets` with `wallet_type = 'gas_tank'`
- One gas tank per chain per project
- Balance checked via direct RPC `eth_getBalance` (no indexer dependency)
- The admin portal has a Gas Tanks page (`/gas-tanks`) with top-up functionality — the client portal has nothing equivalent

## Requirements

### 1. Dashboard Gas Tank Widget
- Show gas tank balance per chain on the main dashboard
- Display as a compact card or section below the custody balance
- Color-coded: green (sufficient), yellow (low), red (critical)
- Show the gas tank address with copy button
- "Top Up" button that shows QR code + address

### 2. Gas Tanks Page (new sidebar menu item)
- Add "Gas Tanks" to the sidebar under OPERATIONS
- Page shows one card per chain with:
  - Chain name and icon
  - Gas tank address (with copy + QR code)
  - Current balance (live, polled every 30s)
  - Derivation path
  - Recent gas consumption (last 5 transactions)
  - "Export Keystore JSON" button
  - Top-up QR code (EIP-681 format)
  - Estimated operations remaining (balance / avg gas cost)

### 3. Low Balance Alerts
- Configurable threshold per chain (default: cost of 10 operations)
- Dashboard banner when any gas tank is below threshold
- Optional webhook event: `gas_tank.low_balance`
- Optional email notification

### 4. Gas Consumption History
- List of transactions sent FROM the gas tank address
- Each entry: date, type (deploy/sweep/flush/forwarder), gas used, gas cost, tx hash
- Filterable by date range and operation type

### 5. Top-Up Flow (outside wizard)
- "Top Up" button on Gas Tanks page
- Shows: QR code (EIP-681), address, derivation path, current balance
- Auto-polls balance every 15s
- Shows "Funded!" confirmation when balance increases

## API Endpoints Needed

Most already exist:
- `GET /v1/wallets` — returns gas_tank wallets (filter by walletType)
- `GET /v1/wallets/balance/:chainId/:address` — live balance via RPC
- `GET /v1/wallets/fee-data/:chainId` — current gas price

May need:
- `GET /v1/gas-tanks` — dedicated endpoint returning gas tanks with balance + estimated operations
- `GET /v1/gas-tanks/:chainId/history` — transactions from gas tank address (requires indexer data or RPC `eth_getTransactionsByAddress`)

## Database

No new tables needed. Gas tanks are already in `cvh_wallets.wallets` with `wallet_type = 'gas_tank'`.

## Technical Notes

- Gas tank private key is derivable from the project mnemonic at `m/44'/60'/1000'/{chainId}/0`
- The client already has the mnemonic (shown once during wizard Step 4)
- Balance polling should use the `SharedRpcRateLimiter` to avoid exceeding Tatum limits
- The admin portal's Gas Tanks page (`apps/admin/app/gas-tanks/page.tsx`) can serve as a reference implementation

## Priority Order

1. Gas Tanks page with balance display (MVP)
2. Dashboard widget
3. Top-up flow with QR
4. Low balance alerts
5. Gas consumption history

## Files to Reference

- `apps/admin/app/gas-tanks/page.tsx` — Admin gas tank page (reference)
- `services/client-api/src/project-setup/project-setup.service.ts` — `checkGasBalance()` method
- `services/core-wallet-service/src/wallet/wallet.service.ts` — Gas tank registration
- `services/core-wallet-service/src/balance/balance.service.ts` — Balance checking
- `apps/client/app/setup/page.tsx` — Wizard Step 5 gas funding UI (reference for QR/address display)
- `apps/client/components/setup/qr-code-display.tsx` — QR code component (reusable)
