# Co-Sign Client-Side Signing — Design Spec

**Date:** 2026-04-23  
**Status:** Approved  
**Author:** Audit remediation  

## Problem

The co-sign custody mode is non-functional. The client portal sends a hardcoded `"client_signature_placeholder"` instead of a real cryptographic signature. The key-vault has no co-sign endpoints. There is no `co_sign_operations` database table. The withdrawal executor's operation hash construction is missing `address(this)`, causing hash mismatches with the smart contract.

## Solution

Implement a process-level co-sign authorization gate where the client cryptographically approves each withdrawal by signing the exact same `operationHash` the smart contract uses. The client enters their BIP-39 mnemonic in the browser on each signing operation, derives the client key (`m/44'/60'/1'/0/0`), independently reconstructs and verifies the hash from raw parameters, signs it, and submits the signature. The backend recovers the signer address, verifies it matches the registered client key, and only then allows the withdrawal to proceed to execution.

## Flow

```
Client creates withdrawal
→ Admin approves
→ CoSignOrchestrator creates co_sign_operation with all raw params
→ Withdrawal status: pending_cosign
→ Client opens co-sign page, sees pending operations
→ Client clicks Sign, enters mnemonic in modal
→ Browser derives client key at m/44'/60'/1'/0/0
→ Browser reconstructs operationHash from raw params (networkId, hotWalletAddress, toAddress, amountRaw, data, expireTime, sequenceId)
→ Browser compares reconstructed hash to server-provided hash — rejects on mismatch
→ Browser signs operationHash with Ethereum message prefix
→ Browser zeros key material, submits signature
→ Backend recovers address via ecrecover, verifies against registered client key address
→ co_sign_operation status: signed
→ Withdrawal status: approved
→ Normal executor picks up, broadcasts with gas_tank + platform signature
```

## Withdrawal Lifecycle

```
full_custody:  pending_approval → approved → broadcasting → confirmed
co_sign:       pending_approval → pending_cosign → approved → broadcasting → confirmed
```

`approved` universally means "ready to execute" regardless of custody mode.

## Database Changes

### New table: `cvh_transactions.co_sign_operations`

```sql
CREATE TABLE co_sign_operations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  operation_id VARCHAR(64) NOT NULL,
  withdrawal_id BIGINT NOT NULL,
  client_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  chain_id INT NOT NULL,
  operation_hash VARCHAR(66) NOT NULL,
  hot_wallet_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42) NOT NULL,
  amount_raw VARCHAR(78) NOT NULL,
  token_contract_address VARCHAR(42) NULL,
  expire_time BIGINT NOT NULL,
  sequence_id BIGINT NOT NULL,
  network_id VARCHAR(20) NOT NULL,
  status ENUM('pending','signed','expired','cancelled') NOT NULL DEFAULT 'pending',
  client_signature VARCHAR(132) NULL,
  client_address VARCHAR(42) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  signed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_operation_id (operation_id),
  UNIQUE KEY uq_withdrawal (withdrawal_id),
  INDEX idx_client_status (client_id, status),
  INDEX idx_expires (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Withdrawal status ENUM change

Add `pending_cosign` to the `cvh_transactions.withdrawals.status` ENUM.

```sql
ALTER TABLE cvh_transactions.withdrawals 
  MODIFY COLUMN status ENUM('pending_approval','pending_cosign','approved','broadcasting','confirmed','failed','cancelled') 
  NOT NULL DEFAULT 'pending_approval';
```

## Backend: Core Wallet Service

### New `CoSignOrchestratorService`

Located at `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.ts`.

#### `createCoSignOperation(withdrawalId, clientId, projectId)`

Called when admin approves a withdrawal for a co-sign custody client.

1. Read the withdrawal record (scoped by clientId).
2. Get the hot wallet contract address from the project's wallet record.
3. Get the next sequence ID from `project_chains.hot_wallet_sequence_id`.
4. Compute `expireTime = Math.floor(Date.now() / 1000) + 86400` (24 hours).
5. Build the `operationHash` using the same ABI encoding as the smart contract:
   - Native ETH: `keccak256(abi.encode(['string','address','address','uint256','bytes','uint256','uint256'], [networkId, hotWalletAddress, toAddress, amountRaw, '0x', expireTime, sequenceId]))`
   - ERC-20: `keccak256(abi.encode(['string','address','address','uint256','address','uint256','uint256'], [networkId+'-ERC20', hotWalletAddress, toAddress, amountRaw, tokenContractAddress, expireTime, sequenceId]))`
6. Get client key address via HTTP to key-vault: `GET /:clientId/keys?keyType=client` — returns the public address.
7. Create `co_sign_operations` row with all raw parameters.
8. Update withdrawal status to `pending_cosign`.
9. Publish `withdrawal.pending_cosign` event to Redis/Kafka.

#### `getClientKeyAddress(clientId, projectId)`

HTTP call to key-vault to get the client key's Ethereum address. The key-vault already stores the address in `derived_keys.address` — this is a read-only lookup.

#### `submitCoSignature(operationId, clientId, signature)`

Called when the client submits their signature.

1. Load co-sign operation (scoped by `clientId`, `operation_id`).
2. Verify `status === 'pending'`.
3. Verify `expires_at > now` — reject if expired.
4. Recover the signer address from the signature: `ethers.verifyMessage(ethers.getBytes(operationHash), signature)`.
5. Compare recovered address to `client_address` (case-insensitive). Reject if mismatch.
6. Update co-sign operation: `status = 'signed'`, `client_signature = signature`, `signed_at = now`.
7. Update withdrawal status from `pending_cosign` to `approved`.
8. Publish `withdrawal.cosigned` event.

#### `getPendingOperations(clientId, projectId)`

Query `co_sign_operations` where `client_id = clientId AND project_id = projectId AND status = 'pending'`, ordered by `created_at DESC`.

#### `expireStaleOperations()`

Called by cron every 5 minutes.

1. Find all `co_sign_operations` where `status = 'pending' AND expires_at < NOW()`.
2. For each: update to `status = 'expired'`, update corresponding withdrawal to `cancelled`.
3. Publish `withdrawal.cosign_expired` event for each (triggers webhook + email via notification-service).

### New `CoSignController`

Located at `services/core-wallet-service/src/co-sign/co-sign.controller.ts`. Protected by `InternalServiceGuard`.

- `GET /co-sign/pending?clientId=X&projectId=Y` → `getPendingOperations`
- `GET /co-sign/:operationId?clientId=X` → `getOperation` (single operation with full params)
- `POST /co-sign/:operationId/sign` body `{ clientId, signature }` → `submitCoSignature`

### Withdrawal Approval Hook

In `WithdrawalService.approveWithdrawal`: after setting status to `approved`, check if the client's project has `custody_mode = 'co_sign'`. If yes, call `coSignOrchestrator.createCoSignOperation()` which will transition from `approved` to `pending_cosign`. If `full_custody`, leave as `approved`.

## Backend: Client API Changes

### Update `client-api/co-sign.service.ts`

Redirect all co-sign HTTP calls to core-wallet-service (currently incorrectly routed to key-vault):

- `GET /v1/co-sign/pending` → core-wallet `GET /co-sign/pending?clientId=X&projectId=Y`
- `GET /v1/co-sign/:operationId` → core-wallet `GET /co-sign/:operationId?clientId=X`
- `POST /v1/co-sign/:operationId/sign` → core-wallet `POST /co-sign/:operationId/sign` with `{ clientId, signature }`

### Response Shape

```typescript
interface CoSignOperationResponse {
  operationId: string;
  type: 'withdrawal';
  status: 'pending' | 'signed' | 'expired' | 'cancelled';
  chainId: number;
  chainName: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string;
  operationHash: string;
  hotWalletAddress: string;
  amountRaw: string;
  tokenContractAddress: string | null;
  expireTime: number;
  sequenceId: number;
  networkId: string;
  clientAddress: string;
  relatedWithdrawalId: string;
  expiresAt: string;
  createdAt: string;
}
```

## Backend: Cron Worker

### New cron: `expireCoSignOperations`

Repeatable BullMQ job every 5 minutes. Calls core-wallet-service `POST /co-sign/expire-stale` (new internal endpoint on the CoSignController).

## Backend: Withdrawal Executor Fix

Fix `buildNativeOperationHash` and `buildTokenOperationHash` in `withdrawal-executor.service.ts` to include `hotWalletAddress` (the contract's `address(this)`) in the ABI encoding. This was identified as a bug in the audit — the executor's hash construction does not match the contract, so on-chain calls would fail.

**Native fix:**
```typescript
abiCoder.encode(
  ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
  [networkId, hotWalletAddress, toAddress, value, data, expireTime, sequenceId]
)
```

**ERC-20 fix:**
```typescript
abiCoder.encode(
  ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
  [tokenNetworkId, hotWalletAddress, toAddress, value, tokenContractAddress, expireTime, sequenceId]
)
```

## Frontend: Client Portal Co-Sign Page

### Mnemonic Input Modal

When the user clicks "Sign" on a pending operation, a modal appears:

1. Shows operation summary: amount, token, destination address, chain, expiry countdown.
2. Secure textarea for 24-word mnemonic input.
3. "Verify & Sign" button.

### Signing Flow (on button click)

```typescript
// 1. Derive client key
const mnemonic = ethers.Mnemonic.fromPhrase(mnemonicInput.trim());
const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/1'/0/0");

// 2. Verify this is the right key for this project
if (wallet.address.toLowerCase() !== expectedClientAddress.toLowerCase()) {
  throw new Error('Wrong mnemonic — does not match this project\'s client key');
}

// 3. Reconstruct operationHash from raw params
const abiCoder = ethers.AbiCoder.defaultAbiCoder();
let reconstructed: string;

if (op.tokenContractAddress) {
  reconstructed = ethers.keccak256(
    abiCoder.encode(
      ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [op.networkId + '-ERC20', op.hotWalletAddress, op.toAddress,
       BigInt(op.amountRaw), op.tokenContractAddress, op.expireTime, op.sequenceId]
    )
  );
} else {
  reconstructed = ethers.keccak256(
    abiCoder.encode(
      ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [op.networkId, op.hotWalletAddress, op.toAddress,
       BigInt(op.amountRaw), '0x', op.expireTime, op.sequenceId]
    )
  );
}

// 4. Verify hash matches server
if (reconstructed !== op.operationHash) {
  throw new Error('Hash mismatch — operation may have been tampered with');
}

// 5. Sign with Ethereum message prefix (matches contract's _recoverSigner)
const signature = await wallet.signMessage(ethers.getBytes(op.operationHash));

// 6. Zero key material
mnemonicInput = '';

// 7. Submit
await clientFetch(`/v1/co-sign/${op.operationId}/sign`, {
  method: 'POST',
  body: JSON.stringify({ signature }),
});
```

### UI States

- **Empty state:** "No pending co-sign operations" with explanation text.
- **Pending operations list:** Cards showing amount, destination, chain, time remaining (countdown).
- **Signing modal:** Operation details + mnemonic input + Verify & Sign button.
- **Success state:** Green checkmark, "Operation signed successfully."
- **Error states:** Hash mismatch (red alert, do not proceed), wrong mnemonic (suggest checking phrase), expired (suggest creating new withdrawal), network error (retry).

### Security Measures

- Mnemonic stored in React `useRef` (not `useState`) to avoid React DevTools exposure.
- Mnemonic cleared from ref immediately after key derivation.
- No `console.log` of any key material.
- Input field uses `type="password"` with a toggle to show/hide.
- Paste-only mode encouraged (no autocomplete, no spellcheck).

## Notification Service

### New webhook events

- `withdrawal.pending_cosign` — fired when a withdrawal enters co-sign pending state.
- `withdrawal.cosigned` — fired when client successfully co-signs.
- `withdrawal.cosign_expired` — fired when a co-sign operation expires (24h timeout).

### Email notification

On `withdrawal.cosign_expired`: send email to the client notifying them that a withdrawal was cancelled due to co-sign timeout, with the operation details.

## Testing Strategy

### Unit Tests

- `CoSignOrchestratorService`: creation (correct hash for native + ERC-20), signature verification (valid, invalid, expired, wrong key, wrong client), expiry logic.
- Hash reconstruction: verify TypeScript `abiCoder.encode` output matches Solidity `abi.encode` output for both native and ERC-20 variants.

### Integration Tests

- Full lifecycle: create withdrawal → approve → pending_cosign → client signs → approved → executor broadcasts.
- Expiry: create → approve → pending_cosign → wait → cron expires → cancelled.
- Wrong custody mode: full_custody withdrawal skips co-sign entirely.

### Contract Tests

- Verify the operation hash constructed in TypeScript (both executor and client-side code) matches the hash computed by `CvhWalletSimple` in Solidity for identical parameters.

### Negative Tests

- Wrong mnemonic (different project's mnemonic).
- Expired operation.
- Replay of same signature on different operation.
- Tampered server-provided hash (client-side verification catches it).
- Double-sign attempt (operation already signed).

## Files to Create

1. `database/038-co-sign-operations.sql` — new table + withdrawal status ENUM change
2. `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.ts` — main orchestration logic
3. `services/core-wallet-service/src/co-sign/co-sign.controller.ts` — HTTP endpoints
4. `services/core-wallet-service/src/co-sign/co-sign.module.ts` — NestJS module
5. `services/core-wallet-service/src/co-sign/dto/co-sign.dto.ts` — DTOs
6. `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.spec.ts` — unit tests

## Files to Modify

1. `services/core-wallet-service/src/app.module.ts` — import CoSignModule
2. `services/core-wallet-service/src/withdrawal/withdrawal.service.ts` — hook co-sign creation on approval for co_sign clients
3. `services/core-wallet-service/src/withdrawal/withdrawal-executor.service.ts` — fix operationHash to include hotWalletAddress
4. `services/client-api/src/co-sign/co-sign.service.ts` — redirect to core-wallet instead of key-vault
5. `apps/client/app/co-sign/page.tsx` — replace placeholder with real signing flow
6. `packages/types/src/wallet.ts` — add CoSignOperation type
7. `packages/event-bus/src/topics.ts` — add co-sign event streams

## Not in Scope

- On-chain client signature (the client's signature replaces the platform's in the contract call). This is a future enhancement that the current design enables without code changes on the client side.
- Hardware wallet integration (Ledger/Trezor). Future enhancement — the signing interface is the same, only the key derivation source changes.
- Batch co-signing (signing multiple operations at once). Future convenience feature.
