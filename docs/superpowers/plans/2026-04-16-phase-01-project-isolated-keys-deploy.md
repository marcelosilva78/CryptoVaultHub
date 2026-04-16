# Phase 1: Project-Isolated Keys & Deploy Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable per-project seed generation, key derivation, and 5-contract deploy pipeline with full JSON traceability — so that each project has its own isolated on-chain infrastructure.

**Architecture:** Extend Key Vault to generate seeds scoped to `projectId` instead of global. Add `project_chains` and `project_deploy_traces` tables. Build a `ProjectDeployService` in core-wallet that orchestrates sequential deploy of 5 contracts per chain, recording full trace JSONs. Client API exposes project setup endpoints consumed by the setup wizard.

**Tech Stack:** NestJS, Prisma, ethers.js v6, MySQL, Redis, native secp256k1 signing

**Spec:** `docs/superpowers/specs/2026-04-16-project-isolated-contracts-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `database/031-project-chains.sql` | Create `project_chains` and `project_deploy_traces` tables |
| `database/032-project-seeds.sql` | Create `project_seeds` table, add `project_id` to `derived_keys` |
| `services/key-vault-service/src/key-generation/project-key.service.ts` | Project-scoped seed generation and key derivation |
| `services/key-vault-service/src/key-generation/project-key.controller.ts` | HTTP endpoints for project key operations |
| `services/core-wallet-service/src/deploy/project-deploy.service.ts` | Orchestrate 5-contract deploy sequence per chain |
| `services/core-wallet-service/src/deploy/deploy-trace.service.ts` | Record full JSON traces for each deploy tx |
| `services/core-wallet-service/src/deploy/deploy.module.ts` | NestJS module for deploy services |
| `services/core-wallet-service/src/deploy/deploy.controller.ts` | HTTP endpoints for deploy operations |
| `services/client-api/src/project-setup/project-setup.controller.ts` | Client-facing project setup endpoints |
| `services/client-api/src/project-setup/project-setup.service.ts` | Orchestrates setup flow: create → keys → gas check → deploy |
| `services/client-api/src/project-setup/project-setup.module.ts` | NestJS module |

### Modified Files
| File | Change |
|------|--------|
| `services/key-vault-service/prisma/schema.prisma` | Add ProjectSeed model, add projectId to DerivedKey |
| `services/key-vault-service/src/key-generation/key-generation.module.ts` | Register ProjectKeyService/Controller |
| `services/core-wallet-service/prisma/schema.prisma` | Add ProjectChain, ProjectDeployTrace models |
| `services/core-wallet-service/src/app.module.ts` | Register DeployModule |
| `services/client-api/src/app.module.ts` | Register ProjectSetupModule |
| `packages/types/src/wallet.ts` | Add ProjectChain, DeployTrace, CustodyMode types |

---

## Task 1: Database Migrations

**Files:**
- Create: `database/031-project-chains.sql`
- Create: `database/032-project-seeds.sql`

- [ ] **Step 1: Create project_chains migration**

```sql
-- database/031-project-chains.sql
-- Project-isolated chain deployments and deploy traces

USE cvh_wallets;

CREATE TABLE IF NOT EXISTS project_chains (
  id                        BIGINT NOT NULL AUTO_INCREMENT,
  project_id                BIGINT NOT NULL,
  chain_id                  INT NOT NULL,
  wallet_factory_address    VARCHAR(42) NULL,
  forwarder_factory_address VARCHAR(42) NULL,
  wallet_impl_address       VARCHAR(42) NULL,
  forwarder_impl_address    VARCHAR(42) NULL,
  hot_wallet_address        VARCHAR(42) NULL,
  hot_wallet_sequence_id    INT NOT NULL DEFAULT 0,
  deploy_status             VARCHAR(20) NOT NULL DEFAULT 'pending',
  deploy_started_at         TIMESTAMP NULL,
  deploy_completed_at       TIMESTAMP NULL,
  deploy_error              TEXT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_chain (project_id, chain_id),
  INDEX idx_deploy_status (deploy_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_deploy_traces (
  id                      BIGINT NOT NULL AUTO_INCREMENT,
  project_id              BIGINT NOT NULL,
  chain_id                INT NOT NULL,
  project_chain_id        BIGINT NOT NULL,
  contract_type           VARCHAR(30) NOT NULL,
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
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message           TEXT NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at            TIMESTAMP NULL,
  PRIMARY KEY (id),
  INDEX idx_project_chain_trace (project_id, chain_id),
  INDEX idx_tx_hash (tx_hash),
  CONSTRAINT fk_dt_pc FOREIGN KEY (project_chain_id) REFERENCES project_chains(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Create project_seeds migration**

```sql
-- database/032-project-seeds.sql
-- Per-project seed storage and project-scoped key derivation

USE cvh_keyvault;

CREATE TABLE IF NOT EXISTS project_seeds (
  id                    BIGINT NOT NULL AUTO_INCREMENT,
  project_id            BIGINT NOT NULL,
  encrypted_seed        TEXT NOT NULL,
  encrypted_dek         TEXT NOT NULL,
  iv                    VARCHAR(64) NOT NULL,
  auth_tag              VARCHAR(64) NOT NULL,
  salt                  VARCHAR(128) NOT NULL,
  kdf_iterations        INT NOT NULL DEFAULT 600000,
  seed_shown_to_client  BOOLEAN NOT NULL DEFAULT FALSE,
  shamir_split_done     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_seed (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add project_id to derived_keys for project-scoped keys
ALTER TABLE derived_keys
  ADD COLUMN project_id BIGINT NULL AFTER client_id,
  ADD INDEX idx_project_keys (project_id, key_type);
```

- [ ] **Step 3: Run migrations on server**

```bash
ssh green@10.10.30.15 "cd /docker/CryptoVaultHub && \
  PASS=\$(grep MYSQL_PASSWORD .env | head -1 | cut -d= -f2) && \
  docker compose exec -T mysql mysql -u root -p\$PASS < database/031-project-chains.sql && \
  docker compose exec -T mysql mysql -u root -p\$PASS < database/032-project-seeds.sql"
```

- [ ] **Step 4: Commit**

```bash
git add database/031-project-chains.sql database/032-project-seeds.sql
git commit -m "feat(database): add project_chains, project_deploy_traces, project_seeds tables"
```

---

## Task 2: Key Vault — Project Seed & Key Generation

**Files:**
- Create: `services/key-vault-service/src/key-generation/project-key.service.ts`
- Create: `services/key-vault-service/src/key-generation/project-key.controller.ts`
- Modify: `services/key-vault-service/prisma/schema.prisma`
- Modify: `services/key-vault-service/src/key-generation/key-generation.module.ts`

- [ ] **Step 1: Update Key Vault Prisma schema**

Add to `services/key-vault-service/prisma/schema.prisma`:

```prisma
model ProjectSeed {
  id                  BigInt   @id @default(autoincrement())
  projectId           BigInt   @unique @map("project_id")
  encryptedSeed       String   @db.Text @map("encrypted_seed")
  encryptedDek        String   @db.Text @map("encrypted_dek")
  iv                  String   @db.VarChar(64)
  authTag             String   @db.VarChar(64) @map("auth_tag")
  salt                String   @db.VarChar(128)
  kdfIterations       Int      @default(600000) @map("kdf_iterations")
  seedShownToClient   Boolean  @default(false) @map("seed_shown_to_client")
  shamirSplitDone     Boolean  @default(false) @map("shamir_split_done")
  createdAt           DateTime @default(now()) @map("created_at")

  @@map("project_seeds")
}
```

Add `projectId` field to existing `DerivedKey` model:

```prisma
  projectId     BigInt?  @map("project_id")
```

Run `npx prisma generate --schema=services/key-vault-service/prisma/schema.prisma`

- [ ] **Step 2: Create ProjectKeyService**

Create `services/key-vault-service/src/key-generation/project-key.service.ts`:

The service must implement:

1. `generateProjectSeed(projectId, requestedBy)`:
   - Generate BIP-39 mnemonic (24 words, 256 bits)
   - Encrypt with EncryptionService
   - Store in `project_seeds` with kdfIterations
   - Return the mnemonic phrase (shown to client ONCE)

2. `generateProjectKeys(projectId, clientId, custodyMode, requestedBy)`:
   - Load project seed from `project_seeds`
   - Decrypt mnemonic
   - Derive 3 keys from seed using `HDNodeWallet.fromSeed()`:
     - `m/44'/60'/0'/0/0` → Platform Key (or Client Key 1)
     - `m/44'/60'/1'/0/0` → Client Key (or Client Key 2)
     - `m/44'/60'/2'/0/0` → Backup Key
   - Store in `derived_keys` with `projectId` set
   - Apply Shamir (3-of-5) to backup key
   - Update `project_seeds.shamir_split_done = true`

3. `markSeedShown(projectId)`:
   - Set `seed_shown_to_client = true`

4. `getProjectPublicKeys(projectId)`:
   - Return public keys and addresses for the project

5. `signProjectTransaction(projectId, keyType, txData)`:
   - Same as existing signTransaction but scoped to project keys

Pattern: follow exactly the same encryption, zeroing, and audit patterns as `key-generation.service.ts`.

- [ ] **Step 3: Create ProjectKeyController**

Create `services/key-vault-service/src/key-generation/project-key.controller.ts`:

```
POST /projects/:projectId/generate-seed → generateProjectSeed()
POST /projects/:projectId/generate-keys → generateProjectKeys()
POST /projects/:projectId/mark-seed-shown → markSeedShown()
GET  /projects/:projectId/public-keys → getProjectPublicKeys()
POST /projects/:projectId/sign-transaction → signProjectTransaction()
```

All guarded by `InternalServiceGuard`.

- [ ] **Step 4: Register in module**

Update `services/key-vault-service/src/key-generation/key-generation.module.ts`:
- Add `ProjectKeyService` to providers
- Add `ProjectKeyController` to controllers

- [ ] **Step 5: Commit**

```bash
git add services/key-vault-service/
git commit -m "feat(key-vault): project-scoped seed generation and key derivation"
```

---

## Task 3: Core Wallet — Deploy Trace Service

**Files:**
- Create: `services/core-wallet-service/src/deploy/deploy-trace.service.ts`
- Modify: `services/core-wallet-service/prisma/schema.prisma`

- [ ] **Step 1: Update Core Wallet Prisma schema**

Add to `services/core-wallet-service/prisma/schema.prisma`:

```prisma
model ProjectChain {
  id                        BigInt   @id @default(autoincrement())
  projectId                 BigInt   @map("project_id")
  chainId                   Int      @map("chain_id")
  walletFactoryAddress      String?  @db.VarChar(42) @map("wallet_factory_address")
  forwarderFactoryAddress   String?  @db.VarChar(42) @map("forwarder_factory_address")
  walletImplAddress         String?  @db.VarChar(42) @map("wallet_impl_address")
  forwarderImplAddress      String?  @db.VarChar(42) @map("forwarder_impl_address")
  hotWalletAddress          String?  @db.VarChar(42) @map("hot_wallet_address")
  hotWalletSequenceId       Int      @default(0) @map("hot_wallet_sequence_id")
  deployStatus              String   @default("pending") @db.VarChar(20) @map("deploy_status")
  deployStartedAt           DateTime? @map("deploy_started_at")
  deployCompletedAt         DateTime? @map("deploy_completed_at")
  deployError               String?  @db.Text @map("deploy_error")
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")
  traces                    ProjectDeployTrace[]

  @@unique([projectId, chainId], name: "uq_project_chain")
  @@map("project_chains")
}

model ProjectDeployTrace {
  id                    BigInt   @id @default(autoincrement())
  projectId             BigInt   @map("project_id")
  chainId               Int      @map("chain_id")
  projectChainId        BigInt   @map("project_chain_id")
  contractType          String   @db.VarChar(30) @map("contract_type")
  contractAddress       String?  @db.VarChar(42) @map("contract_address")
  txHash                String?  @db.VarChar(66) @map("tx_hash")
  blockNumber           BigInt?  @map("block_number")
  blockHash             String?  @db.VarChar(66) @map("block_hash")
  gasUsed               String?  @db.VarChar(78) @map("gas_used")
  gasPrice              String?  @db.VarChar(78) @map("gas_price")
  gasCostWei            String?  @db.VarChar(78) @map("gas_cost_wei")
  deployerAddress       String   @db.VarChar(42) @map("deployer_address")
  calldataHex           String?  @db.MediumText @map("calldata_hex")
  constructorArgsJson   Json?    @map("constructor_args_json")
  signedTxHex           String?  @db.MediumText @map("signed_tx_hex")
  rpcRequestJson        Json?    @map("rpc_request_json")
  rpcResponseJson       Json?    @map("rpc_response_json")
  abiJson               Json?    @map("abi_json")
  bytecodeHash          String?  @db.VarChar(66) @map("bytecode_hash")
  verificationProofJson Json?    @map("verification_proof_json")
  explorerUrl           String?  @db.VarChar(500) @map("explorer_url")
  status                String   @default("pending") @db.VarChar(20)
  errorMessage          String?  @db.Text @map("error_message")
  createdAt             DateTime @default(now()) @map("created_at")
  confirmedAt           DateTime? @map("confirmed_at")
  projectChain          ProjectChain @relation(fields: [projectChainId], references: [id])

  @@index([projectId, chainId])
  @@index([txHash])
  @@map("project_deploy_traces")
}
```

Run `npx prisma generate --schema=services/core-wallet-service/prisma/schema.prisma`

- [ ] **Step 2: Create DeployTraceService**

Create `services/core-wallet-service/src/deploy/deploy-trace.service.ts`:

Implements:
1. `createTrace(data)` — Creates a pending trace record before broadcasting
2. `updateTraceConfirmed(traceId, receipt, rpcResponse)` — Updates with block data, gas, bytecode hash
3. `updateTraceFailed(traceId, error)` — Marks as failed with error message
4. `buildVerificationProof(deployedAddress, expectedBytecodeHash, provider)` — Fetches on-chain bytecode, computes keccak256, compares
5. `getTracesByProject(projectId)` — Returns all traces for a project
6. `getTracesByProjectChain(projectId, chainId)` — Returns traces for a specific chain

Each trace records: calldata, signed tx, RPC request/response, constructor args, ABI, bytecode hash, verification proof, explorer URL.

- [ ] **Step 3: Commit**

```bash
git add services/core-wallet-service/
git commit -m "feat(core-wallet): deploy trace service for full JSON traceability"
```

---

## Task 4: Core Wallet — Project Deploy Service

**Files:**
- Create: `services/core-wallet-service/src/deploy/project-deploy.service.ts`
- Create: `services/core-wallet-service/src/deploy/deploy.controller.ts`
- Create: `services/core-wallet-service/src/deploy/deploy.module.ts`
- Modify: `services/core-wallet-service/src/app.module.ts`

- [ ] **Step 1: Create ProjectDeployService**

Create `services/core-wallet-service/src/deploy/project-deploy.service.ts`:

Core method: `deployProjectChain(projectId, clientId, chainId, signers)`:

1. Create `ProjectChain` record (status: deploying)
2. Get Gas Tank key for client+chain
3. Get RPC provider for chain
4. **Deploy WalletImpl**:
   - Build CvhWalletSimple bytecode (from compiled artifacts)
   - Estimate gas, get nonce
   - Call Key Vault to sign deploy tx from Gas Tank
   - Broadcast, wait for receipt
   - Record full trace (calldata, signed tx, RPC req/res)
   - Verify bytecode on-chain
5. **Deploy ForwarderImpl**: same flow for CvhForwarder
6. **Deploy WalletFactory**: constructor arg = walletImpl address
7. **Deploy ForwarderFactory**: constructor arg = forwarderImpl address
8. **Deploy Hot Wallet** via WalletFactory.createWallet:
   - Signers based on custody mode
   - Salt = keccak256(projectId + chainId)
   - Record trace with factory call details
9. Update `ProjectChain`: all addresses, status = ready

Each step creates a `ProjectDeployTrace` record with complete JSON artifacts.

On any failure: update `ProjectChain` status = failed, record error, stop sequence.

Helper methods:
- `deployContract(gasKey, provider, bytecode, constructorArgs, chain)` — generic deploy flow
- `deployViaFactory(gasKey, provider, factoryAddress, factoryAbi, method, args, chain)` — factory call flow
- `getCompiledBytecode(contractName)` — loads from contracts/artifacts/
- `getContractAbi(contractName)` — loads from contracts/artifacts/
- `buildExplorerUrl(chainId, txHash)` — constructs etherscan/bscscan/polygonscan URL

- [ ] **Step 2: Create DeployController**

Create `services/core-wallet-service/src/deploy/deploy.controller.ts`:

```
POST /deploy/project/:projectId/chain/:chainId  → deployProjectChain()
GET  /deploy/project/:projectId/traces           → getTracesByProject()
GET  /deploy/project/:projectId/chain/:chainId/traces → getTracesByProjectChain()
GET  /deploy/project/:projectId/chain/:chainId/status → getProjectChainStatus()
```

All guarded by `InternalServiceGuard`.

- [ ] **Step 3: Create DeployModule**

Create `services/core-wallet-service/src/deploy/deploy.module.ts`:
- Providers: ProjectDeployService, DeployTraceService
- Controllers: DeployController
- Imports: BlockchainModule, PrismaModule

Register in `services/core-wallet-service/src/app.module.ts`.

- [ ] **Step 4: Commit**

```bash
git add services/core-wallet-service/
git commit -m "feat(core-wallet): project deploy pipeline with 5-contract sequence"
```

---

## Task 5: Client API — Project Setup Endpoints

**Files:**
- Create: `services/client-api/src/project-setup/project-setup.controller.ts`
- Create: `services/client-api/src/project-setup/project-setup.service.ts`
- Create: `services/client-api/src/project-setup/project-setup.module.ts`
- Modify: `services/client-api/src/app.module.ts`

- [ ] **Step 1: Create ProjectSetupService**

Create `services/client-api/src/project-setup/project-setup.service.ts`:

Methods:

1. `createProject(clientId, data: { name, description, chains[], custodyMode })`:
   - Create project record in cvh_admin.projects
   - Create project_chains records for each selected chain (status: pending)
   - Return project with chain list

2. `initializeKeys(clientId, projectId)`:
   - Call Key Vault: `POST /projects/:projectId/generate-seed`
   - Returns mnemonic (24 words) — shown to client ONCE
   - Call Key Vault: `POST /projects/:projectId/generate-keys` with custodyMode
   - Call Key Vault: `POST /projects/:projectId/mark-seed-shown`
   - Return public keys

3. `checkGasBalance(clientId, projectId)`:
   - For each chain in project, get Gas Tank balance via RPC
   - Estimate required gas for 5-contract deploy
   - Return: `{ chains: [{ chainId, gasTankAddress, balance, required, sufficient }] }`

4. `startDeploy(clientId, projectId)`:
   - Verify all chains have sufficient gas
   - For each chain: call core-wallet `POST /deploy/project/:projectId/chain/:chainId`
   - Return deploy status

5. `getDeployStatus(clientId, projectId)`:
   - Get all project_chains statuses
   - Return aggregated status

6. `getDeployTraces(clientId, projectId, chainId?)`:
   - Proxy to core-wallet deploy trace endpoints
   - Return full JSON traces

All methods verify `clientId` owns the `projectId` before proceeding.

- [ ] **Step 2: Create ProjectSetupController**

Create `services/client-api/src/project-setup/project-setup.controller.ts`:

```
POST   /client/v1/projects/setup              → createProject()
POST   /client/v1/projects/:id/keys           → initializeKeys()
GET    /client/v1/projects/:id/gas-check       → checkGasBalance()
POST   /client/v1/projects/:id/deploy          → startDeploy()
GET    /client/v1/projects/:id/deploy/status    → getDeployStatus()
GET    /client/v1/projects/:id/deploy/traces    → getDeployTraces()
GET    /client/v1/projects/:id/deploy/traces/:chainId → getDeployTraces(chainId)
```

All guarded by `@ClientAuth('write')` except GET endpoints which use `@ClientAuth('read')`.

- [ ] **Step 3: Create module and register**

Create `services/client-api/src/project-setup/project-setup.module.ts`.
Register in `services/client-api/src/app.module.ts`.

- [ ] **Step 4: Commit**

```bash
git add services/client-api/
git commit -m "feat(client-api): project setup endpoints for wizard flow"
```

---

## Task 6: Types Package Update

**Files:**
- Modify: `packages/types/src/wallet.ts`

- [ ] **Step 1: Add project-related types**

Add to `packages/types/src/wallet.ts`:

```typescript
export interface ProjectChain {
  id: number;
  projectId: number;
  chainId: number;
  walletFactoryAddress: string | null;
  forwarderFactoryAddress: string | null;
  walletImplAddress: string | null;
  forwarderImplAddress: string | null;
  hotWalletAddress: string | null;
  deployStatus: 'pending' | 'deploying' | 'ready' | 'failed';
  deployStartedAt: string | null;
  deployCompletedAt: string | null;
}

export interface DeployTrace {
  id: number;
  projectId: number;
  chainId: number;
  contractType: 'wallet_impl' | 'forwarder_impl' | 'wallet_factory' | 'forwarder_factory' | 'hot_wallet' | 'forwarder';
  contractAddress: string | null;
  txHash: string | null;
  blockNumber: number | null;
  gasUsed: string | null;
  gasCostWei: string | null;
  deployerAddress: string;
  calldataHex: string | null;
  constructorArgsJson: Record<string, any> | null;
  signedTxHex: string | null;
  rpcRequestJson: Record<string, any> | null;
  rpcResponseJson: Record<string, any> | null;
  abiJson: any[] | null;
  bytecodeHash: string | null;
  verificationProofJson: {
    expectedBytecodeHash: string;
    actualBytecodeHash: string;
    match: boolean;
    verifiedAt: string;
  } | null;
  explorerUrl: string | null;
  status: 'pending' | 'broadcasting' | 'confirmed' | 'failed';
  createdAt: string;
  confirmedAt: string | null;
}

export interface GasCheckResult {
  chainId: number;
  chainName: string;
  gasTankAddress: string;
  balanceWei: string;
  balanceFormatted: string;
  requiredWei: string;
  requiredFormatted: string;
  sufficient: boolean;
}

export type ProjectCustodyMode = 'full_custody' | 'co_sign' | 'client_only';
```

- [ ] **Step 2: Commit**

```bash
git add packages/types/
git commit -m "feat(types): add ProjectChain, DeployTrace, GasCheckResult types"
```

---

## Task 7: Build, Test & Deploy

- [ ] **Step 1: Build all packages**

```bash
npx tsc -p packages/config/tsconfig.json
npx tsc -p packages/types/tsconfig.json
npx tsc -p packages/event-bus/tsconfig.json
npx tsc -p packages/posthog/tsconfig.json
```

- [ ] **Step 2: Verify all services compile**

```bash
for svc in key-vault-service core-wallet-service client-api admin-api auth-service chain-indexer-service notification-service cron-worker-service rpc-gateway-service; do
  echo "=== $svc ===" && npx tsc --noEmit -p services/$svc/tsconfig.json 2>&1 | grep -c "error TS"
done
```

Expected: all 0 errors.

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 4: Deploy to server**

```bash
ssh green@10.10.30.15 "cd /docker/CryptoVaultHub && git pull origin main && \
  PASS=\$(grep MYSQL_PASSWORD .env | head -1 | cut -d= -f2) && \
  docker compose exec -T mysql mysql -u root -p\$PASS < database/031-project-chains.sql && \
  docker compose exec -T mysql mysql -u root -p\$PASS < database/032-project-seeds.sql && \
  docker compose build --parallel key-vault-service core-wallet-service client-api client && \
  docker compose up -d key-vault-service core-wallet-service client-api client"
```

- [ ] **Step 5: Verify endpoints**

```bash
TOKEN=$(curl -sk https://api.vaulthub.live/auth/login -X POST -H 'Content-Type: application/json' -d '{"email":"admin@cryptovaulthub.com","password":"changeme"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["tokens"]["accessToken"])')

# Test project setup endpoint
curl -sk https://api.vaulthub.live/client/v1/projects/setup -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Project","chains":[1],"custodyMode":"full_custody"}'
```

---

## Next Phases

After Phase 1 is complete and verified:
- **Phase 2**: Client Portal Setup Wizard UI (multi-step wizard with real-time deploy progress)
- **Phase 3**: Export functionality (ZIP generation with seed, addresses, ABIs, traces)
- **Phase 4**: Integration (sweep/withdrawal using project keys, indexer project awareness)
- **Phase 5**: Admin Panel (project overview per client)
