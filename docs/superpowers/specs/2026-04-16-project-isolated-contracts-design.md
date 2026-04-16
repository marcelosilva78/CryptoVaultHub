# Project-Isolated Smart Contract Architecture — Design Specification

**Date**: 2026-04-16
**Status**: Approved
**Author**: Claude + Marcelo

---

## 1. Overview

Redesign CryptoVaultHub so that every project has its own isolated set of smart contracts, keys, and on-chain infrastructure. The client owns 100% of the keys and can export everything to operate independently.

### Core Principles

- **Project = deployment unit**: each project gets its own factories, wallets, forwarders, and keys
- **Client sovereignty**: seed visible to client, keys exportable, full portability
- **Rich traceability**: every on-chain interaction logged as full JSON (request, response, calldata, bytecode verification)
- **Configurable custody**: full_custody, co_sign, or client_only per project
- **Gas Tank per chain per client**: shared across projects within the same client

---

## 2. Data Model

### 2.1 Entity Relationships

```
Client (1)
  ├── Gas Tanks (1 per chain) ← shared across projects
  └── Projects (many)
       ├── Project Seed (1) ← BIP-39 24 words, unique per project
       ├── Shamir Shares (5) ← 3-of-5 threshold for backup key
       ├── Project Chains (many) ← 1 per chain selected
       │    ├── Wallet Factory (1 contract)
       │    ├── Forwarder Factory (1 contract)
       │    ├── Wallet Impl (1 template contract)
       │    ├── Forwarder Impl (1 template contract)
       │    ├── Hot Wallet (1 CvhWalletSimple multisig)
       │    └── Deploy Traces (many) ← full JSON per deploy tx
       ├── Derived Keys (3+) ← platform, client, backup from project seed
       ├── Forwarders (many) ← deposit addresses
       └── Exportable Bundle ← seed + addresses + ABIs + traces
```

### 2.2 New Tables

#### `project_seeds`
```sql
CREATE TABLE project_seeds (
  id                  BIGINT NOT NULL AUTO_INCREMENT,
  project_id          BIGINT NOT NULL,
  encrypted_seed      TEXT NOT NULL,
  encrypted_dek       TEXT NOT NULL,
  iv                  VARCHAR(64) NOT NULL,
  auth_tag            VARCHAR(64) NOT NULL,
  salt                VARCHAR(128) NOT NULL,
  kdf_iterations      INT NOT NULL DEFAULT 600000,
  seed_shown_to_client BOOLEAN NOT NULL DEFAULT FALSE,
  shamir_split_done   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_seed (project_id),
  CONSTRAINT fk_seed_project FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB;
```

#### `project_chains`
```sql
CREATE TABLE project_chains (
  id                        BIGINT NOT NULL AUTO_INCREMENT,
  project_id                BIGINT NOT NULL,
  chain_id                  INT NOT NULL,
  wallet_factory_address    VARCHAR(42) NULL,
  forwarder_factory_address VARCHAR(42) NULL,
  wallet_impl_address       VARCHAR(42) NULL,
  forwarder_impl_address    VARCHAR(42) NULL,
  hot_wallet_address        VARCHAR(42) NULL,
  hot_wallet_sequence_id    INT NOT NULL DEFAULT 0,
  deploy_status             ENUM('pending','deploying','ready','failed') NOT NULL DEFAULT 'pending',
  deploy_started_at         TIMESTAMP NULL,
  deploy_completed_at       TIMESTAMP NULL,
  deploy_error              TEXT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_chain (project_id, chain_id),
  CONSTRAINT fk_pc_project FOREIGN KEY (project_id) REFERENCES projects(id),
  INDEX idx_deploy_status (deploy_status)
) ENGINE=InnoDB;
```

#### `project_deploy_traces`
```sql
CREATE TABLE project_deploy_traces (
  id                      BIGINT NOT NULL AUTO_INCREMENT,
  project_id              BIGINT NOT NULL,
  chain_id                INT NOT NULL,
  project_chain_id        BIGINT NOT NULL,
  contract_type           ENUM('wallet_impl','forwarder_impl','wallet_factory','forwarder_factory','hot_wallet','forwarder') NOT NULL,
  contract_address        VARCHAR(42) NULL,
  tx_hash                 VARCHAR(66) NULL,
  block_number            BIGINT NULL,
  block_hash              VARCHAR(66) NULL,
  gas_used                VARCHAR(78) NULL,
  gas_price               VARCHAR(78) NULL,
  gas_cost_wei            VARCHAR(78) NULL,
  deployer_address        VARCHAR(42) NOT NULL,
  calldata_hex            MEDIUMTEXT NULL,
  constructor_args_json   JSON NULL,
  signed_tx_hex           MEDIUMTEXT NULL,
  rpc_request_json        JSON NULL,
  rpc_response_json       JSON NULL,
  abi_json                JSON NULL,
  bytecode_hash           VARCHAR(66) NULL,
  verification_proof_json JSON NULL,
  explorer_url            VARCHAR(500) NULL,
  status                  ENUM('pending','broadcasting','confirmed','failed') NOT NULL DEFAULT 'pending',
  error_message           TEXT NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at            TIMESTAMP NULL,
  PRIMARY KEY (id),
  INDEX idx_project_chain (project_id, chain_id),
  INDEX idx_tx_hash (tx_hash),
  CONSTRAINT fk_dt_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_dt_pc FOREIGN KEY (project_chain_id) REFERENCES project_chains(id)
) ENGINE=InnoDB;
```

### 2.3 Altered Tables

#### `derived_keys` — add `project_id`
```sql
ALTER TABLE cvh_keyvault.derived_keys
  ADD COLUMN project_id BIGINT NULL AFTER client_id,
  ADD INDEX idx_project_keys (project_id, key_type);
```

#### `deposit_addresses` — add `project_id`, `project_chain_id`
```sql
ALTER TABLE cvh_wallets.deposit_addresses
  ADD COLUMN project_id BIGINT NULL AFTER client_id,
  ADD COLUMN project_chain_id BIGINT NULL AFTER project_id;
```

---

## 3. Project Setup Flow

### Step 1: Create Project
- Client defines: name, description, selected chains, custody mode (full_custody | co_sign | client_only)
- Backend creates `projects` record + `project_chains` records (status: pending)

### Step 2: Key Ceremony
- System generates BIP-39 seed (24 words, 256 bits entropy) exclusive to the project
- Seed displayed to client on secure screen with backup instructions
- Client confirms they have recorded the seed
- System derives 3 key pairs from the seed:
  - `m/44'/60'/0'/0/0` → Platform Key (or Client Key 1 in client_only mode)
  - `m/44'/60'/1'/0/0` → Client Key (or Client Key 2 in client_only mode)
  - `m/44'/60'/2'/0/0` → Backup Key
- Shamir's Secret Sharing applied to Backup Key: 5 shares, 3-of-5 threshold
- Seed encrypted and stored in `project_seeds`
- Keys encrypted and stored in `derived_keys` with `project_id`

### Step 3: Gas Verification
- System shows Gas Tank addresses per chain (1 per chain per client, shared)
- Displays estimated gas cost for all deploys on each chain:
  - WalletImpl: ~2M gas
  - ForwarderImpl: ~1.5M gas
  - WalletFactory: ~1M gas
  - ForwarderFactory: ~1M gas
  - HotWallet (clone): ~150K gas
  - **Total: ~5.65M gas per chain**
- Client deposits gas
- System polls balance until sufficient, or client clicks "Verify Balance"

### Step 4: Contract Deployment (per chain, sequential)

For each selected chain:

1. **Deploy WalletImpl** (template contract)
   - Build: compile CvhWalletSimple bytecode
   - Sign: Gas Tank key signs deploy tx
   - Broadcast: submit via RPC
   - Trace: save full JSON (calldata, signed tx, RPC req/res)
   - Verify: compare deployed bytecode hash with expected
   - Store: `project_chains.wallet_impl_address`

2. **Deploy ForwarderImpl** (template contract)
   - Same flow as WalletImpl for CvhForwarder
   - Store: `project_chains.forwarder_impl_address`

3. **Deploy WalletFactory**
   - Constructor args: walletImpl address
   - Store: `project_chains.wallet_factory_address`

4. **Deploy ForwarderFactory**
   - Constructor args: forwarderImpl address
   - Store: `project_chains.forwarder_factory_address`

5. **Deploy Hot Wallet** (via WalletFactory.createWallet)
   - Args: 3 signers (based on custody mode), salt
   - Store: `project_chains.hot_wallet_address`

Each deploy creates a `project_deploy_traces` record with complete JSON artifacts.

### Step 5: Project Ready
- `project_chains.deploy_status` → `ready`
- Hot wallet operational
- Client can generate forwarders (deposit addresses)
- Client can receive/send crypto

---

## 4. Custody Mode Signers

| Mode | Signer 1 (msg.sender) | Signer 2 (ecrecover) | Signer 3 (backup) | Auto-sweep | Auto-withdrawal |
|------|----------------------|----------------------|-------------------|-----------|----------------|
| **full_custody** | Gas Tank | Platform Key (auto) | Backup (Shamir) | Yes | Yes |
| **co_sign** | Gas Tank | Client Key (manual) | Backup (Shamir) | No — needs client sign | No — needs client sign |
| **client_only** | Client Key 1 (manual) | Client Key 2 (manual) | Backup (Shamir) | No | No |

For `co_sign` and `client_only`: operations requiring signature are queued in the Co-Sign page. Client signs via the portal or exports the operation hash to sign externally.

---

## 5. Deploy Traceability — JSON Structure

Each `project_deploy_traces` record contains:

```json
{
  "contractType": "hot_wallet",
  "contractAddress": "0xabc...123",
  "txHash": "0xdef...456",
  "blockNumber": 19500000,
  "blockHash": "0x789...abc",
  "gasUsed": "148523",
  "gasPrice": "25000000000",
  "gasCostWei": "3713075000000000",
  "deployerAddress": "0xGasTank...",
  "calldataHex": "0x608060...",
  "constructorArgsJson": {
    "allowedSigners": ["0xPlatform...", "0xClient...", "0xBackup..."],
    "salt": "0x..."
  },
  "signedTxHex": "0xf8a680...",
  "rpcRequestJson": {
    "jsonrpc": "2.0",
    "method": "eth_sendRawTransaction",
    "params": ["0xf8a680..."],
    "id": 1
  },
  "rpcResponseJson": {
    "jsonrpc": "2.0",
    "result": "0xdef...456",
    "id": 1
  },
  "abiJson": [...],
  "bytecodeHash": "0xkeccak256...",
  "verificationProofJson": {
    "expectedBytecodeHash": "0xaaa...",
    "actualBytecodeHash": "0xaaa...",
    "match": true,
    "verifiedAt": "2026-04-16T10:00:00Z"
  },
  "explorerUrl": "https://etherscan.io/tx/0xdef...456"
}
```

---

## 6. Client Portal UI

### 6.1 Project Setup Wizard

Multi-step wizard at `/setup/new-project`:
- Step 1: Project name, description
- Step 2: Select chains (checkboxes with gas cost estimates)
- Step 3: Choose custody mode (cards with descriptions)
- Step 4: Key ceremony (seed display, confirmation, Shamir)
- Step 5: Gas deposit (show addresses, verify balances)
- Step 6: Deploy (real-time progress per chain, 5 contracts each)
- Step 7: Complete (summary, hot wallet addresses)

### 6.2 Deploy History Page

At `/projects/:projectId/deploys`:
- Timeline view of all deploys per chain
- Each deploy expandable to show full JSON
- Tabs for each JSON section: Transaction, Calldata, RPC, Verification
- Copy buttons for all hashes and addresses
- Status badges: confirmed (green), pending (yellow), failed (red)
- Link to block explorer for each tx

### 6.3 Export Page

At `/projects/:projectId/export`:
- "Export Project" button
- Generates downloadable ZIP:
  - `seed.enc` — seed encrypted with client-provided password
  - `addresses.json` — all contract addresses per chain
  - `abis/` — ABI files for each contract type
  - `deploy-traces/` — all deploy trace JSONs
  - `forwarders.csv` — all forwarder addresses
  - `keys-public.json` — public keys and derivation paths
- Warning: "This export contains everything needed to operate independently"

---

## 7. Gas Tank Model

- 1 Gas Tank EOA per chain per client (shared across projects)
- Derived from client's master seed at path `m/44'/60'/1000'/chainId/clientId`
- Funds all deploys and operations for all projects on that chain
- Balance monitoring: alerts when low
- Client deposits directly to the Gas Tank address

---

## 8. Service Changes

| Service | Change |
|---------|--------|
| **Key Vault** | `generateProjectKeys(projectId)` — seed per project, keys reference project_id |
| **Core Wallet** | Wallet/forwarder creation uses `project_chain_id` for factory lookup |
| **Core Wallet** | New `ProjectDeployService` — orchestrates 5-contract deploy sequence per chain |
| **Core Wallet** | `DeployTraceService` — records full JSON trace for each deploy tx |
| **Sweep/Withdrawal** | Uses project-scoped keys and project-specific hot wallet |
| **Chain Indexer** | Monitors forwarders by project |
| **Client API** | New endpoints: project CRUD, setup wizard, deploy history, export |
| **Client Portal** | Setup wizard, deploy history page, export page |
| **Admin Panel** | View projects per client, deploy status overview |

---

## 9. Migration Strategy

### Phase 1: New tables + backward compatible
- Create `project_seeds`, `project_chains`, `project_deploy_traces`
- Add `project_id` to `derived_keys` and `deposit_addresses` (nullable)
- Existing clients continue working (project_id = NULL = legacy mode)

### Phase 2: New project creation flow
- New projects use project-isolated architecture
- Setup wizard, key ceremony, deploy pipeline

### Phase 3: Legacy migration (optional)
- Migrate existing clients to project model
- Create project records for existing wallet configurations
- Backfill project_id in derived_keys and deposit_addresses

---

## 10. Decomposition

This is a large feature. Implementation phases:

1. **Database + Key Vault** — migrations, project seed generation, project-scoped key derivation
2. **Deploy Pipeline** — ProjectDeployService, deploy orchestration, trace recording, bytecode verification
3. **Client API + Setup Wizard** — project CRUD, setup wizard endpoints, gas verification
4. **Client Portal UI** — setup wizard pages, deploy history, export
5. **Integration** — sweep/withdrawal using project keys, chain indexer project awareness
6. **Admin Panel** — project overview per client, deploy status
