# Co-Sign Client-Side Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real client-side cryptographic signing for the co-sign custody mode, replacing the hardcoded placeholder with mnemonic-derived ECDSA signatures verified against the registered client key.

**Architecture:** New `CoSignModule` in core-wallet-service orchestrates co-sign operations. Client portal derives keys from mnemonic on demand, reconstructs and verifies the operationHash independently, signs with ethers.js, and submits. Backend recovers signer via ecrecover and gates withdrawal progression.

**Tech Stack:** ethers.js 6.x (ABI encoding, HD wallet, signing), NestJS (module/service/controller), Prisma (raw SQL for cross-DB), BullMQ (expiry cron), React (modal UI)

---

## File Structure

### Files to Create

| File | Responsibility |
|---|---|
| `database/038-co-sign-operations.sql` | New table + withdrawal ENUM change |
| `services/core-wallet-service/src/co-sign/co-sign.module.ts` | NestJS module wiring |
| `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.ts` | Core logic: create, verify, expire |
| `services/core-wallet-service/src/co-sign/co-sign.controller.ts` | HTTP endpoints for internal callers |
| `services/core-wallet-service/src/co-sign/dto/co-sign.dto.ts` | Request/response DTOs |
| `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.spec.ts` | Unit tests |

### Files to Modify

| File | Change |
|---|---|
| `services/core-wallet-service/src/app.module.ts` | Import `CoSignModule` |
| `services/core-wallet-service/src/withdrawal/withdrawal.service.ts` | Hook co-sign on approval |
| `services/core-wallet-service/src/withdrawal/withdrawal-executor.service.ts` | Fix operationHash (add hotWalletAddress) |
| `services/core-wallet-service/src/withdrawal/withdrawal-executor.service.spec.ts` | Update hash tests |
| `services/client-api/src/co-sign/co-sign.service.ts` | Redirect to core-wallet |
| `apps/client/app/co-sign/page.tsx` | Real signing flow |
| `packages/types/src/wallet.ts` | Add `CoSignOperationResponse` type |
| `packages/event-bus/src/topics.ts` | Add co-sign streams |

---

### Task 1: Database Migration

**Files:**
- Create: `database/038-co-sign-operations.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 038-co-sign-operations.sql
-- Co-sign operations table and withdrawal status extension

USE cvh_transactions;

-- Add pending_cosign to withdrawal status ENUM
ALTER TABLE withdrawals
  MODIFY COLUMN status ENUM(
    'pending_approval','pending_cosign','approved','broadcasting',
    'confirmed','failed','cancelled','rejected'
  ) NOT NULL DEFAULT 'pending_approval';

-- Co-sign operations table
CREATE TABLE IF NOT EXISTS co_sign_operations (
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
  INDEX idx_expires (status, expires_at),
  INDEX idx_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Verify migration syntax**

Run: `cat database/038-co-sign-operations.sql | head -40`
Expected: Valid SQL with no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add database/038-co-sign-operations.sql
git commit -m "feat(db): add co_sign_operations table and pending_cosign status"
```

---

### Task 2: Fix Withdrawal Executor OperationHash

**Files:**
- Modify: `services/core-wallet-service/src/withdrawal/withdrawal-executor.service.ts:388-444`
- Modify: `services/core-wallet-service/src/withdrawal/withdrawal-executor.service.spec.ts`

- [ ] **Step 1: Update the test for `buildNativeOperationHash` to expect `hotWalletAddress`**

In `withdrawal-executor.service.spec.ts`, find the test that calls `buildNativeOperationHash` and update it to pass `hotWalletAddress` as the second parameter and expect it in the encoded output. The test already verifies the hash against a manual ethers reference — add the `address` type as second in the encode types array.

Look for a test like:
```typescript
it('should build correct native operation hash', ...
```

Update the test's manual reference hash to include the hot wallet address:
```typescript
const expectedHash = ethers.keccak256(
  abiCoder.encode(
    ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
    [networkId, hotWalletAddress, toAddress, value, '0x', expireTime, sequenceId]
  )
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd services/core-wallet-service && npx jest --testPathPattern withdrawal-executor --no-coverage -t "operation hash" 2>&1 | tail -20`
Expected: FAIL — the current implementation doesn't include hotWalletAddress.

- [ ] **Step 3: Fix `buildNativeOperationHash`**

In `withdrawal-executor.service.ts` at line ~388, add `hotWalletAddress: string` parameter and include it in the encode:

```typescript
private buildNativeOperationHash(
  networkId: string,
  hotWalletAddress: string,
  toAddress: string,
  value: bigint,
  data: string,
  expireTime: number,
  sequenceId: number,
): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
    [networkId, hotWalletAddress, toAddress, value, data, expireTime, sequenceId],
  );
  return ethers.keccak256(encoded);
}
```

- [ ] **Step 4: Fix `buildTokenOperationHash` the same way**

At line ~421, add `hotWalletAddress: string` parameter:

```typescript
private buildTokenOperationHash(
  tokenNetworkId: string,
  hotWalletAddress: string,
  toAddress: string,
  value: bigint,
  tokenContractAddress: string,
  expireTime: number,
  sequenceId: number,
): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
    [tokenNetworkId, hotWalletAddress, toAddress, value, tokenContractAddress, expireTime, sequenceId],
  );
  return ethers.keccak256(encoded);
}
```

- [ ] **Step 5: Update all call sites in `executeWithdrawal`**

Find where `buildNativeOperationHash` and `buildTokenOperationHash` are called (around lines 182-206) and add the hot wallet address parameter. The hot wallet address should be available from the wallet record loaded earlier in the method — look for `wallet.address` or `hotWallet.address`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd services/core-wallet-service && npx jest --testPathPattern withdrawal-executor --no-coverage 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add services/core-wallet-service/src/withdrawal/withdrawal-executor.service.ts services/core-wallet-service/src/withdrawal/withdrawal-executor.service.spec.ts
git commit -m "fix(executor): include hotWalletAddress in operationHash to match contract"
```

---

### Task 3: Event Bus Topics + Shared Types

**Files:**
- Modify: `packages/event-bus/src/topics.ts`
- Modify: `packages/types/src/wallet.ts`

- [ ] **Step 1: Add co-sign streams to topics.ts**

In `packages/event-bus/src/topics.ts`, add to the `TOPICS` object (around line 3-20):

```typescript
CO_SIGN_LIFECYCLE: 'cvh.cosign.lifecycle',
```

Add to the `STREAM_TO_TOPIC` mapping (around line 27-42):

```typescript
'cosign:pending': TOPICS.CO_SIGN_LIFECYCLE,
'cosign:signed': TOPICS.CO_SIGN_LIFECYCLE,
'cosign:expired': TOPICS.CO_SIGN_LIFECYCLE,
```

- [ ] **Step 2: Add CoSignOperationResponse type**

In `packages/types/src/wallet.ts`, add after the existing types:

```typescript
export interface CoSignOperationResponse {
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

- [ ] **Step 3: Commit**

```bash
git add packages/event-bus/src/topics.ts packages/types/src/wallet.ts
git commit -m "feat(types): add co-sign event topics and CoSignOperationResponse type"
```

---

### Task 4: CoSign DTOs

**Files:**
- Create: `services/core-wallet-service/src/co-sign/dto/co-sign.dto.ts`

- [ ] **Step 1: Create the DTOs file**

```typescript
import { IsString, IsNumber, IsOptional, Matches } from 'class-validator';

export class SubmitCoSignatureDto {
  @IsNumber()
  clientId: number;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{130}$/, {
    message: 'Signature must be a 65-byte hex string (0x-prefixed, 130 hex chars)',
  })
  signature: string;

  @IsOptional()
  @IsString()
  publicKey?: string;
}

export class GetPendingDto {
  @IsNumber()
  clientId: number;

  @IsNumber()
  projectId: number;
}

export class ExpireStaleDto {
  // No body params — internal endpoint
}
```

- [ ] **Step 2: Commit**

```bash
git add services/core-wallet-service/src/co-sign/dto/co-sign.dto.ts
git commit -m "feat(co-sign): add request DTOs"
```

---

### Task 5: CoSign Orchestrator Service — Tests First

**Files:**
- Create: `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.spec.ts`

- [ ] **Step 1: Write the test file with all test cases**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CoSignOrchestratorService } from './co-sign-orchestrator.service';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

describe('CoSignOrchestratorService', () => {
  let service: CoSignOrchestratorService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockEventBus: any;
  let mockHttpService: any;

  const CLIENT_ID = 1;
  const PROJECT_ID = 10;
  const CHAIN_ID = 1;
  const HOT_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
  const TO_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const AMOUNT_RAW = '1000000000000000000'; // 1 ETH in wei
  const CLIENT_ADDRESS = '0x9876543210fedcba9876543210fedcba98765432';

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    mockRedis = {
      getCache: jest.fn(),
      setCache: jest.fn(),
    };
    mockEventBus = {
      publish: jest.fn(),
    };
    mockHttpService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoSignOrchestratorService,
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: 'RedisService', useValue: mockRedis },
        { provide: 'EventBusService', useValue: mockEventBus },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3005') } },
      ],
    }).compile();

    service = module.get<CoSignOrchestratorService>(CoSignOrchestratorService);
  });

  describe('buildOperationHash', () => {
    it('should build correct native ETH hash matching contract encoding', () => {
      const networkId = '1';
      const expireTime = 1714000000;
      const sequenceId = 1;

      const hash = service.buildOperationHash({
        networkId,
        hotWalletAddress: HOT_WALLET,
        toAddress: TO_ADDRESS,
        amountRaw: AMOUNT_RAW,
        tokenContractAddress: null,
        expireTime,
        sequenceId,
      });

      // Verify against manual ethers encoding
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const expected = ethers.keccak256(
        abiCoder.encode(
          ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          [networkId, HOT_WALLET, TO_ADDRESS, BigInt(AMOUNT_RAW), '0x', expireTime, sequenceId],
        ),
      );
      expect(hash).toBe(expected);
    });

    it('should build correct ERC-20 hash with token address', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const networkId = '1';
      const expireTime = 1714000000;
      const sequenceId = 2;

      const hash = service.buildOperationHash({
        networkId,
        hotWalletAddress: HOT_WALLET,
        toAddress: TO_ADDRESS,
        amountRaw: '1000000', // 1 USDC
        tokenContractAddress: tokenAddress,
        expireTime,
        sequenceId,
      });

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const expected = ethers.keccak256(
        abiCoder.encode(
          ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
          [`${networkId}-ERC20`, HOT_WALLET, TO_ADDRESS, BigInt('1000000'), tokenAddress, expireTime, sequenceId],
        ),
      );
      expect(hash).toBe(expected);
    });
  });

  describe('verifySignature', () => {
    it('should accept a valid signature from the correct client key', async () => {
      const wallet = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const signature = await wallet.signMessage(ethers.getBytes(operationHash));

      const result = service.verifySignature(operationHash, signature, wallet.address);
      expect(result).toBe(true);
    });

    it('should reject a signature from a different key', async () => {
      const wallet1 = ethers.Wallet.createRandom();
      const wallet2 = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const signature = await wallet1.signMessage(ethers.getBytes(operationHash));

      const result = service.verifySignature(operationHash, signature, wallet2.address);
      expect(result).toBe(false);
    });

    it('should reject a malformed signature', () => {
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      expect(() => {
        service.verifySignature(operationHash, '0xinvalid', CLIENT_ADDRESS);
      }).toThrow();
    });
  });

  describe('submitCoSignature', () => {
    it('should reject an expired operation', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 1n,
        operation_id: 'cosign_test',
        operation_hash: '0xabc',
        client_address: CLIENT_ADDRESS,
        status: 'pending',
        expires_at: new Date(Date.now() - 60000), // expired 1 min ago
        withdrawal_id: 100n,
      }]);

      await expect(
        service.submitCoSignature('cosign_test', CLIENT_ID, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow('expired');
    });

    it('should reject a non-pending operation', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 1n,
        operation_id: 'cosign_test',
        operation_hash: '0xabc',
        client_address: CLIENT_ADDRESS,
        status: 'signed',
        expires_at: new Date(Date.now() + 86400000),
        withdrawal_id: 100n,
      }]);

      await expect(
        service.submitCoSignature('cosign_test', CLIENT_ID, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow('not pending');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (service doesn't exist yet)**

Run: `cd services/core-wallet-service && npx jest --testPathPattern co-sign-orchestrator --no-coverage 2>&1 | tail -10`
Expected: FAIL — cannot find module `./co-sign-orchestrator.service`

- [ ] **Step 3: Commit**

```bash
git add services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.spec.ts
git commit -m "test(co-sign): add orchestrator unit tests (red phase)"
```

---

### Task 6: CoSign Orchestrator Service — Implementation

**Files:**
- Create: `services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.ts`

- [ ] **Step 1: Implement the service**

```typescript
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventBusService } from '@cvh/event-bus';
import { ethers } from 'ethers';
import axios from 'axios';

interface BuildHashParams {
  networkId: string;
  hotWalletAddress: string;
  toAddress: string;
  amountRaw: string;
  tokenContractAddress: string | null;
  expireTime: number;
  sequenceId: number;
}

@Injectable()
export class CoSignOrchestratorService {
  private readonly logger = new Logger(CoSignOrchestratorService.name);
  private readonly keyVaultUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventBus: EventBusService,
    private readonly config: ConfigService,
  ) {
    this.keyVaultUrl = this.config.get<string>('KEY_VAULT_URL', 'http://key-vault-service:3005');
    this.internalKey = this.config.get<string>('INTERNAL_SERVICE_KEY', '');
  }

  buildOperationHash(params: BuildHashParams): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    if (params.tokenContractAddress) {
      const encoded = abiCoder.encode(
        ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [
          `${params.networkId}-ERC20`,
          params.hotWalletAddress,
          params.toAddress,
          BigInt(params.amountRaw),
          params.tokenContractAddress,
          params.expireTime,
          params.sequenceId,
        ],
      );
      return ethers.keccak256(encoded);
    }

    const encoded = abiCoder.encode(
      ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [
        params.networkId,
        params.hotWalletAddress,
        params.toAddress,
        BigInt(params.amountRaw),
        '0x',
        params.expireTime,
        params.sequenceId,
      ],
    );
    return ethers.keccak256(encoded);
  }

  verifySignature(operationHash: string, signature: string, expectedAddress: string): boolean {
    const recovered = ethers.verifyMessage(ethers.getBytes(operationHash), signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  }

  async createCoSignOperation(
    withdrawalId: number,
    clientId: number,
    projectId: number,
  ): Promise<{ operationId: string }> {
    // 1. Load the withdrawal
    const [withdrawal] = await this.prisma.$queryRaw<any[]>`
      SELECT w.*, t.contract_address AS token_contract_address
      FROM cvh_transactions.withdrawals w
      LEFT JOIN cvh_admin.tokens t ON w.token_id = t.id
      WHERE w.id = ${BigInt(withdrawalId)} AND w.client_id = ${BigInt(clientId)}
    `;
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    // 2. Get hot wallet address
    const [wallet] = await this.prisma.$queryRaw<any[]>`
      SELECT address FROM cvh_wallets.wallets
      WHERE client_id = ${BigInt(clientId)} AND project_id = ${BigInt(projectId)}
        AND chain_id = ${withdrawal.chain_id} AND wallet_type = 'hot'
      LIMIT 1
    `;
    if (!wallet) throw new NotFoundException('Hot wallet not found');

    // 3. Get sequence ID
    const [projectChain] = await this.prisma.$queryRaw<any[]>`
      SELECT hot_wallet_sequence_id FROM cvh_admin.project_chains
      WHERE project_id = ${BigInt(projectId)} AND chain_id = ${withdrawal.chain_id}
    `;
    const sequenceId = Number(projectChain?.hot_wallet_sequence_id ?? 0) + 1;

    // 4. Compute expiry (24h from now)
    const expireTime = Math.floor(Date.now() / 1000) + 86400;

    // 5. Build operation hash
    const networkId = String(withdrawal.chain_id);
    const operationHash = this.buildOperationHash({
      networkId,
      hotWalletAddress: wallet.address,
      toAddress: withdrawal.to_address,
      amountRaw: withdrawal.amount_raw,
      tokenContractAddress: withdrawal.token_contract_address || null,
      expireTime,
      sequenceId,
    });

    // 6. Get client key address from key-vault
    const clientAddress = await this.getClientKeyAddress(clientId, projectId);

    // 7. Generate operation ID
    const operationId = `cosign_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    // 8. Insert co-sign operation
    const expiresAt = new Date(Date.now() + 86400000);
    await this.prisma.$executeRaw`
      INSERT INTO cvh_transactions.co_sign_operations
        (operation_id, withdrawal_id, client_id, project_id, chain_id,
         operation_hash, hot_wallet_address, to_address, amount_raw,
         token_contract_address, expire_time, sequence_id, network_id,
         status, client_address, expires_at)
      VALUES
        (${operationId}, ${BigInt(withdrawalId)}, ${BigInt(clientId)}, ${BigInt(projectId)},
         ${withdrawal.chain_id}, ${operationHash}, ${wallet.address}, ${withdrawal.to_address},
         ${withdrawal.amount_raw}, ${withdrawal.token_contract_address || null},
         ${expireTime}, ${sequenceId}, ${networkId}, 'pending', ${clientAddress}, ${expiresAt})
    `;

    // 9. Update withdrawal status
    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals SET status = 'pending_cosign'
      WHERE id = ${BigInt(withdrawalId)}
    `;

    // 10. Publish event
    await this.eventBus.publish('cosign:pending', {
      operationId,
      withdrawalId,
      clientId,
      projectId,
      chainId: withdrawal.chain_id,
      toAddress: withdrawal.to_address,
      amount: withdrawal.amount,
      eventType: 'withdrawal.pending_cosign',
    });

    this.logger.log(`Created co-sign operation ${operationId} for withdrawal ${withdrawalId}`);
    return { operationId };
  }

  async getClientKeyAddress(clientId: number, projectId: number): Promise<string> {
    const { data } = await axios.get(
      `${this.keyVaultUrl}/keys/address`,
      {
        params: { clientId, projectId, keyType: 'client' },
        headers: { 'X-Internal-Service-Key': this.internalKey },
        timeout: 10000,
      },
    );
    return data.address;
  }

  async submitCoSignature(
    operationId: string,
    clientId: number,
    signature: string,
  ): Promise<{ success: boolean }> {
    // 1. Load the operation
    const [operation] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM cvh_transactions.co_sign_operations
      WHERE operation_id = ${operationId} AND client_id = ${BigInt(clientId)}
    `;
    if (!operation) throw new NotFoundException('Co-sign operation not found');

    // 2. Check status
    if (operation.status !== 'pending') {
      throw new BadRequestException(`Operation is not pending (current: ${operation.status})`);
    }

    // 3. Check expiry
    if (new Date(operation.expires_at) <= new Date()) {
      throw new BadRequestException('Co-sign operation has expired');
    }

    // 4. Verify signature
    const valid = this.verifySignature(
      operation.operation_hash,
      signature,
      operation.client_address,
    );
    if (!valid) {
      throw new BadRequestException('Signature does not match the registered client key');
    }

    // 5. Update co-sign operation
    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.co_sign_operations
      SET status = 'signed', client_signature = ${signature}, signed_at = NOW(3)
      WHERE id = ${operation.id}
    `;

    // 6. Update withdrawal to approved
    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals SET status = 'approved'
      WHERE id = ${operation.withdrawal_id} AND status = 'pending_cosign'
    `;

    // 7. Publish event
    await this.eventBus.publish('cosign:signed', {
      operationId,
      withdrawalId: Number(operation.withdrawal_id),
      clientId,
      eventType: 'withdrawal.cosigned',
    });

    this.logger.log(`Co-sign operation ${operationId} signed successfully`);
    return { success: true };
  }

  async getPendingOperations(clientId: number, projectId: number): Promise<any[]> {
    return this.prisma.$queryRaw<any[]>`
      SELECT co.*, c.name AS chain_name, t.symbol AS token_symbol
      FROM cvh_transactions.co_sign_operations co
      LEFT JOIN cvh_admin.chains c ON co.chain_id = c.id
      LEFT JOIN cvh_admin.tokens t ON t.contract_address = co.token_contract_address AND t.chain_id = co.chain_id
      WHERE co.client_id = ${BigInt(clientId)}
        AND co.project_id = ${BigInt(projectId)}
        AND co.status = 'pending'
      ORDER BY co.created_at DESC
    `;
  }

  async getOperation(operationId: string, clientId: number): Promise<any> {
    const [op] = await this.prisma.$queryRaw<any[]>`
      SELECT co.*, c.name AS chain_name, t.symbol AS token_symbol
      FROM cvh_transactions.co_sign_operations co
      LEFT JOIN cvh_admin.chains c ON co.chain_id = c.id
      LEFT JOIN cvh_admin.tokens t ON t.contract_address = co.token_contract_address AND t.chain_id = co.chain_id
      WHERE co.operation_id = ${operationId} AND co.client_id = ${BigInt(clientId)}
    `;
    if (!op) throw new NotFoundException('Operation not found');
    return op;
  }

  async expireStaleOperations(): Promise<number> {
    const stale = await this.prisma.$queryRaw<any[]>`
      SELECT id, operation_id, withdrawal_id, client_id, project_id, chain_id, to_address, amount_raw
      FROM cvh_transactions.co_sign_operations
      WHERE status = 'pending' AND expires_at < NOW(3)
    `;

    for (const op of stale) {
      await this.prisma.$executeRaw`
        UPDATE cvh_transactions.co_sign_operations SET status = 'expired' WHERE id = ${op.id}
      `;
      await this.prisma.$executeRaw`
        UPDATE cvh_transactions.withdrawals SET status = 'cancelled'
        WHERE id = ${op.withdrawal_id} AND status = 'pending_cosign'
      `;
      await this.eventBus.publish('cosign:expired', {
        operationId: op.operation_id,
        withdrawalId: Number(op.withdrawal_id),
        clientId: Number(op.client_id),
        eventType: 'withdrawal.cosign_expired',
      });
      this.logger.warn(`Co-sign operation ${op.operation_id} expired — withdrawal ${op.withdrawal_id} cancelled`);
    }

    return stale.length;
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd services/core-wallet-service && npx jest --testPathPattern co-sign-orchestrator --no-coverage 2>&1 | tail -20`
Expected: PASS (at least the `buildOperationHash` and `verifySignature` tests)

- [ ] **Step 3: Commit**

```bash
git add services/core-wallet-service/src/co-sign/co-sign-orchestrator.service.ts
git commit -m "feat(co-sign): implement CoSignOrchestratorService"
```

---

### Task 7: CoSign Controller + Module

**Files:**
- Create: `services/core-wallet-service/src/co-sign/co-sign.controller.ts`
- Create: `services/core-wallet-service/src/co-sign/co-sign.module.ts`
- Modify: `services/core-wallet-service/src/app.module.ts`

- [ ] **Step 1: Create the controller**

```typescript
import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CoSignOrchestratorService } from './co-sign-orchestrator.service';
import { SubmitCoSignatureDto } from './dto/co-sign.dto';

@Controller('co-sign')
export class CoSignController {
  constructor(private readonly coSign: CoSignOrchestratorService) {}

  @Get('pending')
  async getPending(
    @Query('clientId', ParseIntPipe) clientId: number,
    @Query('projectId', ParseIntPipe) projectId: number,
  ) {
    const operations = await this.coSign.getPendingOperations(clientId, projectId);
    return { operations };
  }

  @Get(':operationId')
  async getOperation(
    @Param('operationId') operationId: string,
    @Query('clientId', ParseIntPipe) clientId: number,
  ) {
    return this.coSign.getOperation(operationId, clientId);
  }

  @Post(':operationId/sign')
  async sign(
    @Param('operationId') operationId: string,
    @Body() body: SubmitCoSignatureDto,
  ) {
    return this.coSign.submitCoSignature(operationId, body.clientId, body.signature);
  }

  @Post('expire-stale')
  async expireStale() {
    const count = await this.coSign.expireStaleOperations();
    return { expired: count };
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
import { Module } from '@nestjs/common';
import { CoSignOrchestratorService } from './co-sign-orchestrator.service';
import { CoSignController } from './co-sign.controller';

@Module({
  controllers: [CoSignController],
  providers: [CoSignOrchestratorService],
  exports: [CoSignOrchestratorService],
})
export class CoSignModule {}
```

- [ ] **Step 3: Import CoSignModule in app.module.ts**

In `services/core-wallet-service/src/app.module.ts`, add `CoSignModule` to the imports array (after line 45):

```typescript
import { CoSignModule } from './co-sign/co-sign.module';
// Add to imports array:
CoSignModule,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd services/core-wallet-service && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add services/core-wallet-service/src/co-sign/co-sign.controller.ts services/core-wallet-service/src/co-sign/co-sign.module.ts services/core-wallet-service/src/app.module.ts
git commit -m "feat(co-sign): add CoSignController, CoSignModule, wire into AppModule"
```

---

### Task 8: Hook Co-Sign Into Withdrawal Approval

**Files:**
- Modify: `services/core-wallet-service/src/withdrawal/withdrawal.service.ts:232-257`

- [ ] **Step 1: Inject CoSignOrchestratorService into WithdrawalService**

Add to the constructor:
```typescript
private readonly coSignOrchestrator: CoSignOrchestratorService,
```

Add import at top:
```typescript
import { CoSignOrchestratorService } from '../co-sign/co-sign-orchestrator.service';
```

- [ ] **Step 2: Modify approveWithdrawal to check custody mode**

After the existing status update to `approved` (around line 247-250), add:

```typescript
// Check if this project uses co-sign custody
const [project] = await this.prisma.$queryRaw<any[]>`
  SELECT custody_mode FROM cvh_admin.projects
  WHERE id = ${BigInt(withdrawal.projectId)} AND client_id = ${BigInt(clientId)}
`;

if (project?.custody_mode === 'co_sign') {
  await this.coSignOrchestrator.createCoSignOperation(
    withdrawalId,
    clientId,
    Number(withdrawal.projectId),
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd services/core-wallet-service && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 4: Run existing withdrawal tests**

Run: `cd services/core-wallet-service && npx jest --testPathPattern withdrawal.service.spec --no-coverage 2>&1 | tail -20`
Expected: PASS (existing tests are for full_custody which skips co-sign)

- [ ] **Step 5: Commit**

```bash
git add services/core-wallet-service/src/withdrawal/withdrawal.service.ts
git commit -m "feat(co-sign): hook co-sign operation creation into withdrawal approval"
```

---

### Task 9: Update Client API Co-Sign Service

**Files:**
- Modify: `services/client-api/src/co-sign/co-sign.service.ts`

- [ ] **Step 1: Redirect from key-vault to core-wallet**

Replace the `keyVaultUrl` config with `coreWalletUrl`:

```typescript
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class CoSignService {
  private readonly logger = new Logger(CoSignService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly config: ConfigService) {
    this.coreWalletUrl = this.config.get<string>(
      'CORE_WALLET_URL',
      'http://core-wallet-service:3004',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': this.config.get<string>('INTERNAL_SERVICE_KEY', ''),
    };
  }

  async listPending(clientId: number, projectId: number) {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/co-sign/pending`, {
        headers: this.headers,
        params: { clientId, projectId },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to list pending co-sign operations: ${error.message}`);
      if (error.response) throw error;
      throw new InternalServerErrorException('Co-sign service unavailable');
    }
  }

  async getOperation(operationId: string, clientId: number) {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/co-sign/${operationId}`, {
        headers: this.headers,
        params: { clientId },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to get co-sign operation: ${error.message}`);
      if (error.response) throw error;
      throw new InternalServerErrorException('Co-sign service unavailable');
    }
  }

  async submitSignature(clientId: number, operationId: string, data: { signature: string }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/co-sign/${operationId}/sign`,
        { clientId, signature: data.signature },
        { headers: this.headers, timeout: 10000 },
      );
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to submit co-sign signature: ${error.message}`);
      if (error.response) throw error;
      throw new InternalServerErrorException('Co-sign service unavailable');
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/client-api && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors (may need to update the controller to pass `projectId`)

- [ ] **Step 3: Commit**

```bash
git add services/client-api/src/co-sign/co-sign.service.ts
git commit -m "feat(co-sign): redirect client-api co-sign to core-wallet-service"
```

---

### Task 10: Frontend — Real Signing Flow

**Files:**
- Modify: `apps/client/app/co-sign/page.tsx`

- [ ] **Step 1: Replace the placeholder signing with real implementation**

This is the largest change. The key modifications to `apps/client/app/co-sign/page.tsx`:

1. Add `ethers` import at the top:
```typescript
import { ethers } from 'ethers';
```

2. Add state for the signing modal:
```typescript
const [signingOp, setSigningOp] = useState<CoSignOperation | null>(null);
const [showSignModal, setShowSignModal] = useState(false);
const [signingError, setSigningError] = useState<string | null>(null);
const [isSigning, setIsSigning] = useState(false);
const mnemonicRef = useRef<string>('');
```

3. Update the `CoSignOperation` interface to include raw params:
```typescript
interface CoSignOperation {
  operationId: string;
  type: 'withdrawal';
  txHash: string;
  chainId: number;
  chainName: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string;
  status: string;
  relatedId: string;
  createdAt: string;
  expiresAt: string;
  // Raw params for hash verification
  operationHash: string;
  hotWalletAddress: string;
  amountRaw: string;
  tokenContractAddress: string | null;
  expireTime: number;
  sequenceId: number;
  networkId: string;
  clientAddress: string;
}
```

4. Replace `handleSign` (around line 245-279) with:
```typescript
const handleSign = (operation: CoSignOperation) => {
  setSigningOp(operation);
  setSigningError(null);
  setShowSignModal(true);
};

const executeSign = async () => {
  if (!signingOp) return;
  setIsSigning(true);
  setSigningError(null);

  try {
    const mnemonic = mnemonicRef.current.trim();
    if (!mnemonic) throw new Error('Please enter your mnemonic phrase');

    // 1. Derive client key
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, "m/44'/60'/1'/0/0");

    // 2. Verify key matches this project
    if (wallet.address.toLowerCase() !== signingOp.clientAddress.toLowerCase()) {
      throw new Error('Wrong mnemonic — does not match this project\'s client key');
    }

    // 3. Reconstruct and verify operationHash
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    let reconstructed: string;

    if (signingOp.tokenContractAddress) {
      reconstructed = ethers.keccak256(
        abiCoder.encode(
          ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
          [
            signingOp.networkId + '-ERC20',
            signingOp.hotWalletAddress,
            signingOp.toAddress,
            BigInt(signingOp.amountRaw),
            signingOp.tokenContractAddress,
            signingOp.expireTime,
            signingOp.sequenceId,
          ],
        ),
      );
    } else {
      reconstructed = ethers.keccak256(
        abiCoder.encode(
          ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          [
            signingOp.networkId,
            signingOp.hotWalletAddress,
            signingOp.toAddress,
            BigInt(signingOp.amountRaw),
            '0x',
            signingOp.expireTime,
            signingOp.sequenceId,
          ],
        ),
      );
    }

    if (reconstructed !== signingOp.operationHash) {
      throw new Error('SECURITY: Hash mismatch — the operation may have been tampered with. Do NOT proceed.');
    }

    // 4. Sign with Ethereum message prefix
    const signature = await wallet.signMessage(ethers.getBytes(signingOp.operationHash));

    // 5. Zero key material
    mnemonicRef.current = '';

    // 6. Submit
    await clientFetch(`/v1/co-sign/${signingOp.operationId}/sign`, {
      method: 'POST',
      body: JSON.stringify({ signature }),
    });

    // 7. Success
    setShowSignModal(false);
    setSigningOp(null);
    fetchPending();
  } catch (err: any) {
    setSigningError(err.message || 'Signing failed');
  } finally {
    mnemonicRef.current = '';
    setIsSigning(false);
  }
};
```

5. Add the signing modal JSX (before the closing `</div>` of the page):
```tsx
{showSignModal && signingOp && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-[var(--bg-secondary)] rounded-xl p-6 max-w-lg w-full space-y-4">
      <h3 className="text-lg font-semibold">Co-Sign Operation</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Amount:</span>
          <span className="font-mono">{signingOp.amount} {signingOp.tokenSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">To:</span>
          <span className="font-mono text-xs">{signingOp.toAddress}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Chain:</span>
          <span>{signingOp.chainName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Expires:</span>
          <span>{new Date(signingOp.expiresAt).toLocaleString()}</span>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Recovery Phrase (24 words)</label>
        <textarea
          rows={3}
          className="w-full p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] font-mono text-sm"
          placeholder="Enter your 24-word mnemonic phrase..."
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => { mnemonicRef.current = e.target.value; }}
        />
      </div>
      {signingError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {signingError}
        </div>
      )}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => { setShowSignModal(false); mnemonicRef.current = ''; }}
          className="px-4 py-2 rounded-lg border border-[var(--border-primary)] text-sm"
        >
          Cancel
        </button>
        <button
          onClick={executeSign}
          disabled={isSigning}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-white text-sm disabled:opacity-50"
        >
          {isSigning ? 'Signing...' : 'Verify & Sign'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Update fetchPending to use GET instead of POST**

Change the `fetchPending` function (around line 205) to use `GET` and include `projectId`:

```typescript
const res = await clientFetch<{ operations: CoSignOperation[] }>(
  `/v1/co-sign/pending?projectId=${activeProjectId}`,
);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/client && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/client/app/co-sign/page.tsx
git commit -m "feat(co-sign): implement client-side mnemonic signing with hash verification"
```

---

### Task 11: Final Integration Test + All Tests Pass

**Files:**
- All modified files

- [ ] **Step 1: Run all core-wallet-service tests**

Run: `cd services/core-wallet-service && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 2: Run all client-api tests**

Run: `cd services/client-api && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 3: Run smart contract tests**

Run: `cd contracts && npx hardhat test 2>&1 | tail -20`
Expected: Tests pass (127+, with 1 pre-existing batcher failure)

- [ ] **Step 4: TypeScript check all services**

Run: `npx turbo typecheck 2>&1 | tail -30`
Expected: No new type errors

- [ ] **Step 5: Final commit with all changes**

```bash
git add -A
git status
git commit -m "feat(co-sign): complete client-side signing implementation

Implements real cryptographic co-sign flow:
- New co_sign_operations DB table with migration 038
- CoSignOrchestratorService: create, verify, expire operations
- CoSignController with internal service endpoints
- Withdrawal approval hooks for co_sign custody mode
- Client-api redirected from key-vault to core-wallet
- Frontend: mnemonic input modal with independent hash verification
- Fixed withdrawal executor operationHash (missing hotWalletAddress)
- Event bus topics for co-sign lifecycle events

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
