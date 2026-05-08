# Withdrawals Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gas Tank as a valid withdrawal source and redesign `/withdrawals` UI so the client picks the source via two clickable cards (which double as live balance display) and can copy/open every confirmed tx in one click. End-to-end validated by extending the homologation suite to 14/14 PASS.

**Architecture:** New `sourceWallet: 'hot' | 'gas_tank'` discriminator on `POST /withdrawals`. Hot path is unchanged (CvhWalletSimple 2-of-3 multisig). Gas Tank path is a single-sig value-transfer reusing `TransactionSubmitterService.signAndSubmit({keyType:'gas_tank', value})` already shipped in the multisig-correctness work. Frontend composes two new components (`SourceWalletPicker`, `TxActions`) and two pure helpers (`explorer.ts`, `clipboard.ts`).

**Tech Stack:** NestJS 10, Prisma 5, Next.js 14 (App Router), React Testing Library, Jest, BullMQ, MySQL 8, ethers v6.

**Spec:** `docs/superpowers/specs/2026-05-08-withdrawals-screen-redesign-design.md`.

---

## File Structure

**Created (backend):**
- `infra/sql/migrations/2026-05-08-withdrawal-source-wallet.sql` — adds `source_wallet` column.

**Modified (backend):**
- `services/core-wallet-service/prisma/schema.prisma` — `Withdrawal.sourceWallet` field.
- `services/cron-worker-service/prisma/schema.prisma` — mirror.
- `services/client-api/src/common/dto/withdrawal.dto.ts` — add `sourceWallet?` with `@ApiProperty`.
- `services/client-api/src/withdrawal/withdrawal.service.ts` — forward sourceWallet; force native token when gas_tank.
- `services/client-api/src/withdrawal/withdrawal.controller.ts` — Swagger examples + new 422 docs.
- `services/core-wallet-service/src/withdrawal/withdrawal.service.ts` — branch on sourceWallet, validate reserve, persist discriminator.
- `services/cron-worker-service/src/withdrawal/withdrawal-worker.service.ts` — branch on source_wallet; new `executeGasTankWithdrawal()`.

**Created (frontend):**
- `apps/client/lib/explorer.ts` + `apps/client/lib/explorer.spec.ts`.
- `apps/client/lib/clipboard.ts` + `apps/client/lib/clipboard.spec.ts`.
- `apps/client/components/withdrawals/tx-actions.tsx` + spec.
- `apps/client/components/withdrawals/source-wallet-picker.tsx` + spec.

**Modified (frontend):**
- `apps/client/app/withdrawals/page.tsx` — composes new components, plumbs sourceWallet into the request.

**Created/modified (docs sync):**
- `apps/client/app/support/kb/data/integrations.ts` — postman article variables table gains `sourceWallet`.
- `apps/client/app/support/kb/data/deposits-withdrawals.ts` — new article "Saque do Gas Tank".
- `docs/integration/CryptoVaultHub.postman_collection.json` — new request "Create withdrawal (gas tank)".
- `docs/integration/postman-walkthrough.md` — new section explaining the variant.
- `apps/client/public/postman/CryptoVaultHub.postman_collection.json` — mirror of the file above.
- `apps/client/public/postman/postman-walkthrough.md` — mirror.

**Modified (homologation suite):**
- `docs/superpowers/automation/suites/api.ts` — adds a 14th phase: Gas Tank withdrawal.

---

## Task 1 — Migration: `source_wallet` column

**Files:**
- Create: `infra/sql/migrations/2026-05-08-withdrawal-source-wallet.sql`

- [ ] **Step 1: Write the migration**

Create `infra/sql/migrations/2026-05-08-withdrawal-source-wallet.sql`:

```sql
-- Discriminates which project wallet originates the withdrawal.
-- 'hot' (default) = CvhWalletSimple multisig path; 'gas_tank' = single-sig EOA value-transfer.
ALTER TABLE cvh_transactions.withdrawals
  ADD COLUMN source_wallet VARCHAR(16) NOT NULL DEFAULT 'hot' AFTER project_id;
```

Note: `cvh_wallets.withdrawals` is a VIEW over the table above. The view must be recreated so it includes the new column.

```sql
DROP VIEW IF EXISTS cvh_wallets.withdrawals;
CREATE VIEW cvh_wallets.withdrawals AS SELECT * FROM cvh_transactions.withdrawals;
```

Append both blocks to the same `.sql` file.

- [ ] **Step 2: Apply on production**

```
cat infra/sql/migrations/2026-05-08-withdrawal-source-wallet.sql | ssh green@vaulthub.live 'cat > /tmp/m.sql'
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && PWD_VAL=$(grep -E "^MYSQL_PASSWORD=" .env | cut -d= -f2-) && docker compose exec -T mysql mysql -uroot -p"$PWD_VAL" < /tmp/m.sql'
```

Verify:

```
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && PWD_VAL=$(grep -E "^MYSQL_PASSWORD=" .env | cut -d= -f2-) && docker compose exec -T mysql mysql -uroot -p"$PWD_VAL" -N -e "DESC cvh_transactions.withdrawals;" 2>&1 | grep source_wallet'
```

Expected: `source_wallet  varchar(16)  NO  ...  hot`.

- [ ] **Step 3: Commit**

```
git add infra/sql/migrations/2026-05-08-withdrawal-source-wallet.sql
git commit -m "feat(withdrawals): add source_wallet discriminator column

Distinguishes hot wallet (multisig) from gas tank (EOA) withdrawals.
Defaults to 'hot' so existing rows are unchanged. Recreates the
cvh_wallets.withdrawals VIEW to include the new column.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Prisma schema mirror in both services

**Files:**
- Modify: `services/core-wallet-service/prisma/schema.prisma`
- Modify: `services/cron-worker-service/prisma/schema.prisma`

- [ ] **Step 1: Add field to core-wallet schema**

In `services/core-wallet-service/prisma/schema.prisma`, find `model Withdrawal {` (search for that exact string). Inside the model, after the `projectId` field, add:

```prisma
  sourceWallet          String    @default("hot") @map("source_wallet") @db.VarChar(16)
```

- [ ] **Step 2: Add field to cron-worker schema**

In `services/cron-worker-service/prisma/schema.prisma`, find the same `model Withdrawal {`. Add the same line in the same position.

- [ ] **Step 3: Regenerate Prisma clients**

```
cd services/core-wallet-service && npx prisma generate
cd services/cron-worker-service && npx prisma generate
```

Both should report "Generated Prisma Client".

- [ ] **Step 4: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add services/core-wallet-service/prisma/schema.prisma services/cron-worker-service/prisma/schema.prisma
git commit -m "feat(prisma): Withdrawal.sourceWallet field in both services

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — DTO + Swagger updates in client-api

**Files:**
- Modify: `services/client-api/src/common/dto/withdrawal.dto.ts`
- Modify: `services/client-api/src/withdrawal/withdrawal.controller.ts`

- [ ] **Step 1: Add `sourceWallet` to `CreateWithdrawalDto`**

Open `services/client-api/src/common/dto/withdrawal.dto.ts`. Find `class CreateWithdrawalDto`. Add at the top of the class (right after `chainId`):

```typescript
  @ApiProperty({
    description: `Source of funds. 'hot' (default) withdraws from the project's hot wallet via 2-of-3 multisig; 'gas_tank' withdraws from the project's gas tank EOA via a single-sig value transfer. Gas Tank source supports only the chain's native token and applies a balance reserve to keep platform-key top-ups funded.`,
    example: 'hot',
    enum: ['hot', 'gas_tank'],
    default: 'hot',
    required: false,
  })
  @IsOptional()
  @IsIn(['hot', 'gas_tank'])
  sourceWallet?: 'hot' | 'gas_tank';
```

If `IsOptional` and `IsIn` are not already imported from `class-validator` at the top of the file, add them:

```typescript
import { IsString, IsInt, IsNotEmpty, Matches, IsOptional, IsIn } from 'class-validator';
```

(Adjust the existing import line; preserve any existing decorators that were already imported.)

- [ ] **Step 2: Update Swagger examples on the controller**

Open `services/client-api/src/withdrawal/withdrawal.controller.ts`. Find the `@ApiBody` block (look for `examples: { eth_withdrawal: ...`). Add a new example entry after `usdc_polygon`:

```typescript
      gas_tank_native: {
        summary: 'Gas Tank Withdrawal (native only)',
        description: 'Withdraw native BNB directly from the project gas tank. Source must be set explicitly.',
        value: {
          chainId: 56,
          sourceWallet: 'gas_tank',
          tokenSymbol: 'BNB',
          toAddress: '0x95DEda8f5FCB60bf02656b226950329e67c605a4',
          amount: '0.0005',
          memo: 'Gas tank ops withdrawal',
          idempotencyKey: 'gt-ops-2026-05-08-001',
        },
      },
```

Find the `@ApiResponse({status: 422, ...})` block and replace its `description` field with:

```typescript
    description: `Business rule violation. Possible reasons:
- Destination address not in whitelist
- Destination address still in 24-hour cooldown
- Insufficient wallet balance
- Daily withdrawal limit exceeded
- Token not supported on the specified chain
- 'gas_tank' source with a non-native token (only the chain's native asset is allowed)
- 'gas_tank' source with amount above (balance − reserved); reserve = 2 × platform_topup_amount_wei`,
```

- [ ] **Step 3: Build to verify**

```
cd services/client-api && npm run build 2>&1 | tail -3
```

Expected: clean build, no new errors. Pre-existing errors in unrelated files are fine.

- [ ] **Step 4: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add services/client-api/src/common/dto/withdrawal.dto.ts services/client-api/src/withdrawal/withdrawal.controller.ts
git commit -m "feat(client-api): sourceWallet field on CreateWithdrawalDto + Swagger

Documents the new discriminator with example payload for the gas-tank
variant and the two new 422 reasons (non-native token / reserve-violating
amount). API contract change: sourceWallet defaults to 'hot' so existing
clients keep working unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — client-api withdrawal.service: forward sourceWallet, force native for gas_tank

**Files:**
- Modify: `services/client-api/src/withdrawal/withdrawal.service.ts`
- Modify: `services/client-api/src/withdrawal/withdrawal.service.spec.ts` (if it exists; else inline tests in this task)

- [ ] **Step 1: Read the current `createWithdrawal` shape**

Read `services/client-api/src/withdrawal/withdrawal.service.ts` lines 26–70 to see the exact `data` parameter shape.

- [ ] **Step 2: Update the `createWithdrawal` signature and body**

Replace the body of `createWithdrawal` so it handles `sourceWallet`. Find:

```typescript
  async createWithdrawal(
    clientId: number,
    data: {
      chainId: number;
      tokenSymbol: string;
      toAddress: string;
      amount: string;
      memo?: string;
      idempotencyKey?: string;
      callbackUrl?: string;
    },
  ) {
```

Replace with:

```typescript
  async createWithdrawal(
    clientId: number,
    data: {
      chainId: number;
      tokenSymbol: string;
      toAddress: string;
      amount: string;
      memo?: string;
      idempotencyKey?: string;
      callbackUrl?: string;
      sourceWallet?: 'hot' | 'gas_tank';
    },
  ) {
    const sourceWallet = data.sourceWallet ?? 'hot';
```

Then find:

```typescript
    // Resolve tokenId from (chainId, tokenSymbol)
    const tokenId = await this.resolveTokenId(data.chainId, data.tokenSymbol);
```

Replace with:

```typescript
    // For gas_tank source, force the chain's native token regardless of what
    // the client sent. Hot wallet path uses tokenSymbol verbatim.
    const tokenSymbol =
      sourceWallet === 'gas_tank'
        ? await this.resolveNativeSymbol(data.chainId)
        : data.tokenSymbol;
    const tokenId = await this.resolveTokenId(data.chainId, tokenSymbol);
```

In the `axios.post` body, add `sourceWallet`:

```typescript
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/withdrawals/create`,
        {
          clientId,
          chainId: data.chainId,
          sourceWallet,
          tokenId,
          toAddressId,
          amount: data.amount,
          memo: data.memo,
          idempotencyKey:
            data.idempotencyKey ??
            `cvh-${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          callbackUrl: data.callbackUrl,
        },
        { headers: this.headers, timeout: 30000 },
      );
```

- [ ] **Step 3: Add `resolveNativeSymbol` helper**

After the existing `resolveTokenId` method, add:

```typescript
  private async resolveNativeSymbol(chainId: number): Promise<string> {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/tokens`, {
        headers: this.headers,
        params: { chainId },
        timeout: 10_000,
      });
      const tokens: Array<{ symbol: string; isNative: boolean }> =
        data?.tokens ?? data ?? [];
      const native = tokens.find((t) => t.isNative);
      if (!native) {
        throw new BadRequestException(
          `Native token not configured for chain ${chainId}`,
        );
      }
      return native.symbol;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`resolveNativeSymbol failed: ${e.message}`);
      throw new InternalServerErrorException(
        `Failed to resolve native token for chain ${chainId}`,
      );
    }
  }
```

- [ ] **Step 4: Update the controller call to forward sourceWallet**

In `services/client-api/src/withdrawal/withdrawal.controller.ts`, the `createWithdrawal` handler currently passes `dto` directly. Confirm the dto type already includes `sourceWallet` (Task 3) and that the service method accepts it (Step 2 above). No further controller change.

- [ ] **Step 5: Build to verify**

```
cd services/client-api && npm run build 2>&1 | grep -E "withdrawal\.service|withdrawal\.controller" | head -5
```

Expected: no errors involving these files.

- [ ] **Step 6: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add services/client-api/src/withdrawal/withdrawal.service.ts
git commit -m "feat(client-api): plumb sourceWallet through withdrawal create

When sourceWallet='gas_tank', force the chain's native token regardless
of the client-supplied tokenSymbol. Otherwise pass through unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — core-wallet withdrawal.service: branch on sourceWallet, reserve check, persist discriminator

**Files:**
- Modify: `services/core-wallet-service/src/withdrawal/withdrawal.service.ts`

- [ ] **Step 1: Read the existing createWithdrawal**

Read `services/core-wallet-service/src/withdrawal/withdrawal.service.ts` lines 41–230 to see the existing flow.

- [ ] **Step 2: Add `sourceWallet` to the params type**

Find:

```typescript
  async createWithdrawal(params: {
    clientId: number;
    chainId: number;
    tokenId: number;
    toAddressId: number;
    amount: string;
    idempotencyKey: string;
    memo?: string;
    callbackUrl?: string;
  }) {
```

Replace with:

```typescript
  async createWithdrawal(params: {
    clientId: number;
    chainId: number;
    tokenId: number;
    toAddressId: number;
    amount: string;
    idempotencyKey: string;
    memo?: string;
    callbackUrl?: string;
    sourceWallet?: 'hot' | 'gas_tank';
  }) {
    const sourceWallet = params.sourceWallet ?? 'hot';
```

- [ ] **Step 3: After loading the token, validate the gas_tank constraint**

After the existing `const token = await this.prisma.token.findUnique(...)` block (around line 150), add:

```typescript
    if (sourceWallet === 'gas_tank' && !token.isNative) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Gas Tank source only supports the chain native token',
        details: { tokenSymbol: token.symbol, expected: 'native' },
      });
    }
```

If `UnprocessableEntityException` is not already imported, add:

```typescript
import { UnprocessableEntityException } from '@nestjs/common';
```

- [ ] **Step 4: After the `hotWallet` lookup, branch by source for the balance/reserve check**

Find the existing balance check (around line 175 or wherever `whitelisted.cooldownEndsAt` is verified). Right after the whitelist + cooldown verifications, add:

```typescript
    if (sourceWallet === 'gas_tank') {
      // Look up the gas tank EOA address
      const gasTank = await this.prisma.wallet.findUnique({
        where: {
          uq_client_chain_type: {
            clientId: BigInt(params.clientId),
            chainId: params.chainId,
            walletType: 'gas_tank',
          },
        },
      });
      if (!gasTank) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Gas tank wallet not configured for this chain',
          details: { chainId: params.chainId },
        });
      }

      // Resolve the chain's reserve amount
      const chain = await this.prisma.chain.findUnique({
        where: { id: params.chainId },
      });
      const topupAmount = chain?.platformTopupAmountWei
        ? BigInt(chain.platformTopupAmountWei)
        : 10_000_000_000_000_000n; // 0.01 native fallback
      const reserved = topupAmount * 2n;

      const provider = await this.evmProvider.getProvider(params.chainId);
      const balance = await provider.getBalance(gasTank.address);
      const requested = BigInt(amountRaw);

      if (requested > balance - reserved) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          message: 'Insufficient gas tank balance after reserve',
          details: {
            requested: requested.toString(),
            available: (balance - reserved).toString(),
            reserved: reserved.toString(),
          },
        });
      }
    }
```

`amountRaw` should be the variable already computed earlier in the function. If your local copy uses a different name, substitute consistently.

If `evmProvider` is not yet injected, add it to the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    // … existing deps …
  ) {}
```

and import:

```typescript
import { EvmProviderService } from '../blockchain/evm-provider.service';
```

- [ ] **Step 5: Persist `sourceWallet` on the insert**

Find the `prisma.withdrawal.create({data: {...}})` block. Add `sourceWallet,` to the data object. The full line set inside `data`:

```typescript
        data: {
          clientId: BigInt(params.clientId),
          projectId: hotWallet.projectId, // gas_tank still uses the project tied to the hot wallet record
          sourceWallet,
          chainId: params.chainId,
          tokenId: BigInt(params.tokenId),
          fromWallet:
            sourceWallet === 'gas_tank' ? gasTank.address : hotWallet.address,
          toAddressId: BigInt(params.toAddressId),
          toAddress: whitelisted.address,
          toLabel: whitelisted.label,
          amount,
          amountRaw,
          status: 'pending_approval',
          idempotencyKey: params.idempotencyKey,
          // … keep any other existing fields unchanged …
        },
```

If your local create call has additional fields (like memo, callbackUrl), keep them; only add `sourceWallet` and update the `fromWallet` ternary.

If `gasTank` is undefined when source is `'hot'`, scope the lookup so it's only resolved in the `gas_tank` branch above and fall through to the existing hot wallet resolution. Adjust the ternary to:

```typescript
          fromWallet:
            sourceWallet === 'gas_tank' && gasTank
              ? gasTank.address
              : hotWallet.address,
```

- [ ] **Step 6: Build to verify**

```
cd services/core-wallet-service && npm run build 2>&1 | grep -E "withdrawal\.service" | head -5
```

Expected: no new errors. Pre-existing errors in unrelated files OK.

- [ ] **Step 7: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add services/core-wallet-service/src/withdrawal/withdrawal.service.ts
git commit -m "feat(core-wallet): gas_tank source with reserve check

Adds the second branch in createWithdrawal: when sourceWallet='gas_tank',
require the token to be native, look up the gas tank EOA balance, and
reject with 422 'Insufficient gas tank balance after reserve' if the
amount would dip below 2 × platform_topup_amount_wei. Persists the
discriminator and uses the gas tank address as fromWallet on those rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — cron-worker withdrawal-worker: branch on source_wallet, executeGasTankWithdrawal

**Files:**
- Modify: `services/cron-worker-service/src/withdrawal/withdrawal-worker.service.ts`

- [ ] **Step 1: Update the withdrawal mapping to expose `sourceWallet`**

In `executeWithdrawal`, find the snake_case → camelCase mapping block (the one that copies `client_id` → `clientId` etc.). Add:

```typescript
      sourceWallet: rawWithdrawal.source_wallet ?? 'hot',
```

- [ ] **Step 2: Branch on sourceWallet right after the mapping**

Find the line that begins the on-chain work (after the mapping, before `provider.getBalance` or `getNextSequenceId`). Add an early branch:

```typescript
    if (withdrawal.sourceWallet === 'gas_tank') {
      return this.executeGasTankWithdrawal(withdrawal, withdrawalId, job);
    }
```

`withdrawalId` is the local string variable already in scope; `job` likewise. Adjust if your local names differ.

- [ ] **Step 3: Implement `executeGasTankWithdrawal`**

At the bottom of the class (after the existing private methods), add:

```typescript
  /**
   * Sign and broadcast a single-sig value-transfer from the gas tank EOA.
   * Used when withdrawal.source_wallet='gas_tank'. Reuses the sweep submitter,
   * which already supports value + keyType.
   */
  private async executeGasTankWithdrawal(
    withdrawal: any,
    withdrawalId: string,
    job: Job,
  ): Promise<WithdrawalJobResult> {
    const submitter: TransactionSubmitterService = (this as any).submitter
      ?? this.txSubmitter; // accept either name in the constructor

    const submittedAt = new Date();
    const txHash = await submitter.signAndSubmit({
      chainId: Number(withdrawal.chainId),
      clientId: Number(withdrawal.clientId),
      from: '', // submitter resolves it from the gas_tank key
      to: withdrawal.toAddress,
      data: '0x',
      value: BigInt(withdrawal.amountRaw),
      keyType: 'gas_tank',
    });

    this.logger.log(
      `Withdrawal ${withdrawalId} (gas_tank) broadcast: txHash=${txHash}`,
    );

    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals
      SET tx_hash = ${txHash}, submitted_at = ${submittedAt}
      WHERE id = ${BigInt(withdrawalId)}
    `;

    await this.confirmQueue.add(
      'track-confirmation',
      { withdrawalId, txHash, chainId: Number(withdrawal.chainId) } as WithdrawalConfirmJobData,
      {
        jobId: `confirm-withdrawal-${withdrawalId}`,
        delay: 15_000,
        attempts: 60,
        backoff: { type: 'fixed', delay: 15_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    const broadcastPayload = {
      withdrawalId,
      clientId: String(withdrawal.clientId),
      chainId: String(withdrawal.chainId),
      sourceWallet: 'gas_tank',
      txHash,
      timestamp: submittedAt.toISOString(),
    };
    await this.redis.publishToStream('withdrawals:broadcasting', broadcastPayload);
    await this.redis.publishToStream('withdrawals:submitted', broadcastPayload);

    return {
      withdrawalId,
      txHash,
      sequenceId: 0,
      status: 'broadcasting',
    };
  }
```

- [ ] **Step 4: Inject `TransactionSubmitterService` if not already**

Look at the constructor of `WithdrawalWorkerService`. If `TransactionSubmitterService` is already injected, skip this step. If not, add it as a constructor parameter:

```typescript
import { TransactionSubmitterService } from '../sweep/transaction-submitter.service';

constructor(
  // … existing params …
  private readonly txSubmitter: TransactionSubmitterService,
) {
  super();
  // … existing body …
}
```

Then ensure `WithdrawalModule` imports `SweepModule` (which exports `TransactionSubmitterService`). Open `services/cron-worker-service/src/withdrawal/withdrawal.module.ts` and add `SweepModule` to the `imports` array if missing:

```typescript
import { SweepModule } from '../sweep/sweep.module';

@Module({
  imports: [
    SweepModule,
    // … existing imports …
  ],
  // … rest unchanged …
})
```

If a circular import warning appears, instead provide `TransactionSubmitterService` directly in `WithdrawalModule`'s providers array (mirroring what `GasTankModule` already does for the topup service).

- [ ] **Step 5: Build to verify**

```
cd services/cron-worker-service && npm run build 2>&1 | grep -E "withdrawal-worker" | head -5
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add services/cron-worker-service/src/withdrawal/withdrawal-worker.service.ts services/cron-worker-service/src/withdrawal/withdrawal.module.ts
git commit -m "feat(cron-worker): gas_tank withdrawal branch

Adds executeGasTankWithdrawal — single-sig value transfer signed by the
gas_tank Key Vault key. Reuses TransactionSubmitterService.signAndSubmit
(already supports value + keyType from the multisig-correctness work).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Frontend pure helper: `lib/explorer.ts`

**Files:**
- Create: `apps/client/lib/explorer.ts`
- Create: `apps/client/lib/explorer.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/client/lib/explorer.spec.ts`:

```typescript
import { explorerTxUrl } from './explorer';

describe('explorerTxUrl', () => {
  const tx = '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd';

  it('resolves BSC to bscscan.com', () => {
    expect(explorerTxUrl(56, tx)).toBe(`https://bscscan.com/tx/${tx}`);
  });

  it('resolves Ethereum to etherscan.io', () => {
    expect(explorerTxUrl(1, tx)).toBe(`https://etherscan.io/tx/${tx}`);
  });

  it('resolves Polygon to polygonscan.com', () => {
    expect(explorerTxUrl(137, tx)).toBe(`https://polygonscan.com/tx/${tx}`);
  });

  it('resolves Arbitrum to arbiscan.io', () => {
    expect(explorerTxUrl(42161, tx)).toBe(`https://arbiscan.io/tx/${tx}`);
  });

  it('uses the provided fallback for unknown chains', () => {
    expect(
      explorerTxUrl(999, tx, 'https://custom.example.com'),
    ).toBe(`https://custom.example.com/tx/${tx}`);
  });

  it('returns null for unknown chain without a fallback', () => {
    expect(explorerTxUrl(999, tx)).toBeNull();
  });
});
```

- [ ] **Step 2: Verify test fails**

```
cd apps/client && npx jest lib/explorer.spec.ts
```

Expected: FAIL with `Cannot find module './explorer'`.

- [ ] **Step 3: Implement**

Create `apps/client/lib/explorer.ts`:

```typescript
const EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  43114: 'https://snowtrace.io',
};

export function explorerTxUrl(
  chainId: number,
  txHash: string,
  fallbackBase?: string,
): string | null {
  const base = EXPLORERS[chainId] ?? fallbackBase ?? null;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/tx/${txHash}`;
}
```

- [ ] **Step 4: Verify test passes**

```
cd apps/client && npx jest lib/explorer.spec.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add apps/client/lib/explorer.ts apps/client/lib/explorer.spec.ts
git commit -m "feat(client): explorerTxUrl helper for chain explorer URLs

Pure lookup table mapping chainId → explorer base URL. Used by the new
TxActions component to open tx hashes in the right explorer per chain.
Accepts an optional fallbackBase for chains not in the static table
(e.g., when the chain's explorer_url is provided via API).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Frontend pure helper: `lib/clipboard.ts`

**Files:**
- Create: `apps/client/lib/clipboard.ts`
- Create: `apps/client/lib/clipboard.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/client/lib/clipboard.spec.ts`:

```typescript
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  it('writes text via navigator.clipboard.writeText and returns true on success', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });

    const ok = await copyToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(ok).toBe(true);
  });

  it('returns false when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });

  it('returns false when writeText rejects', async () => {
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } },
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Verify test fails**

```
cd apps/client && npx jest lib/clipboard.spec.ts
```

Expected: FAIL with `Cannot find module './clipboard'`.

- [ ] **Step 3: Implement**

Create `apps/client/lib/clipboard.ts`:

```typescript
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Verify test passes**

```
cd apps/client && npx jest lib/clipboard.spec.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add apps/client/lib/clipboard.ts apps/client/lib/clipboard.spec.ts
git commit -m "feat(client): copyToClipboard helper

Thin wrapper over navigator.clipboard.writeText. Returns boolean for
success/failure so callers can show toast feedback without try/catch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — `<TxActions>` component

**Files:**
- Create: `apps/client/components/withdrawals/tx-actions.tsx`
- Create: `apps/client/components/withdrawals/tx-actions.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/client/components/withdrawals/tx-actions.spec.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TxActions } from './tx-actions';
import * as clipboard from '@/lib/clipboard';

jest.mock('@/lib/clipboard');

describe('TxActions', () => {
  const tx = '0xabc';

  beforeEach(() => {
    (clipboard.copyToClipboard as jest.Mock).mockResolvedValue(true);
    Object.defineProperty(window, 'open', { value: jest.fn(), configurable: true });
  });

  it('disables both buttons when txHash is null', () => {
    render(<TxActions txHash={null} chainId={56} />);
    expect(screen.getByLabelText('Copy tx hash')).toBeDisabled();
    expect(screen.getByLabelText('Open in explorer')).toBeDisabled();
  });

  it('copy invokes clipboard.copyToClipboard with the tx hash', async () => {
    render(<TxActions txHash={tx} chainId={56} />);
    fireEvent.click(screen.getByLabelText('Copy tx hash'));
    await waitFor(() =>
      expect(clipboard.copyToClipboard).toHaveBeenCalledWith(tx),
    );
  });

  it('open dispatches window.open with the BSC explorer URL', () => {
    render(<TxActions txHash={tx} chainId={56} />);
    fireEvent.click(screen.getByLabelText('Open in explorer'));
    expect(window.open).toHaveBeenCalledWith(
      `https://bscscan.com/tx/${tx}`,
      '_blank',
      'noopener,noreferrer',
    );
  });
});
```

- [ ] **Step 2: Verify test fails**

```
cd apps/client && npx jest components/withdrawals/tx-actions.spec.tsx
```

Expected: FAIL with `Cannot find module './tx-actions'`.

- [ ] **Step 3: Implement**

Create `apps/client/components/withdrawals/tx-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { explorerTxUrl } from "@/lib/explorer";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  txHash: string | null | undefined;
  chainId: number;
  /** Optional override (e.g. comes from `chains.explorer_url` API field). */
  explorerBaseUrl?: string;
}

export function TxActions({ txHash, chainId, explorerBaseUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const disabled = !txHash;
  const url = txHash ? explorerTxUrl(chainId, txHash, explorerBaseUrl) : null;

  async function handleCopy() {
    if (!txHash) return;
    const ok = await copyToClipboard(txHash);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function handleOpen() {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <button
        type="button"
        aria-label="Copy tx hash"
        title={copied ? "Copied!" : "Copy tx hash"}
        disabled={disabled}
        onClick={handleCopy}
        className="w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Open in explorer"
        title={url ?? "No tx hash yet"}
        disabled={disabled || !url}
        onClick={handleOpen}
        className="w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify test passes**

```
cd apps/client && npx jest components/withdrawals/tx-actions.spec.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add apps/client/components/withdrawals/tx-actions.tsx apps/client/components/withdrawals/tx-actions.spec.tsx
git commit -m "feat(client): TxActions component (copy + open in explorer)

Two icon buttons: copy tx hash (with 1.5s 'Copied' feedback via icon
swap) and open in chain explorer (target=_blank, noopener noreferrer).
Both disabled when txHash is null, so rows in pre-broadcast statuses
don't expose dead UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — `<SourceWalletPicker>` component

**Files:**
- Create: `apps/client/components/withdrawals/source-wallet-picker.tsx`
- Create: `apps/client/components/withdrawals/source-wallet-picker.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/client/components/withdrawals/source-wallet-picker.spec.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceWalletPicker } from './source-wallet-picker';

describe('SourceWalletPicker', () => {
  const noop = () => {};

  it('renders both cards with balances and addresses', () => {
    render(
      <SourceWalletPicker
        chainId={56}
        selected="hot"
        hot={{ address: '0x17193A58d73825485393E00ecE33051Fa2536415', balance: '0.005' }}
        gasTank={{ address: '0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1', balance: '0.010' }}
        nativeSymbol="BNB"
        onChange={noop}
      />,
    );
    expect(screen.getByText(/Hot Wallet/)).toBeInTheDocument();
    expect(screen.getByText(/Gas Tank/)).toBeInTheDocument();
    expect(screen.getByText('0.005 BNB')).toBeInTheDocument();
    expect(screen.getByText('0.010 BNB')).toBeInTheDocument();
    expect(screen.getByText(/0x17193A/)).toBeInTheDocument();
    expect(screen.getByText(/0x54f55b/)).toBeInTheDocument();
  });

  it('marks the selected card as active and unselected as inactive', () => {
    render(
      <SourceWalletPicker
        chainId={56}
        selected="gas_tank"
        hot={{ address: '0xhot', balance: '0.005' }}
        gasTank={{ address: '0xgas', balance: '0.010' }}
        nativeSymbol="BNB"
        onChange={noop}
      />,
    );
    const hotCard = screen.getByRole('button', { name: /Hot Wallet/i });
    const gasCard = screen.getByRole('button', { name: /Gas Tank/i });
    expect(gasCard).toHaveAttribute('aria-pressed', 'true');
    expect(hotCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when the user clicks the inactive card', () => {
    const onChange = jest.fn();
    render(
      <SourceWalletPicker
        chainId={56}
        selected="hot"
        hot={{ address: '0xhot', balance: '0.005' }}
        gasTank={{ address: '0xgas', balance: '0.010' }}
        nativeSymbol="BNB"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gas Tank/i }));
    expect(onChange).toHaveBeenCalledWith('gas_tank');
  });
});
```

- [ ] **Step 2: Verify test fails**

```
cd apps/client && npx jest components/withdrawals/source-wallet-picker.spec.tsx
```

Expected: FAIL with `Cannot find module './source-wallet-picker'`.

- [ ] **Step 3: Implement**

Create `apps/client/components/withdrawals/source-wallet-picker.tsx`:

```tsx
"use client";

export type SourceWallet = "hot" | "gas_tank";

interface WalletInfo {
  address: string;
  balance: string;
}

interface Props {
  chainId: number;
  selected: SourceWallet;
  hot: WalletInfo | null;
  gasTank: WalletInfo | null;
  nativeSymbol: string;
  onChange: (next: SourceWallet) => void;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SourceWalletPicker({
  selected,
  hot,
  gasTank,
  nativeSymbol,
  onChange,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Card
        title="Hot Wallet"
        balance={hot?.balance ?? "—"}
        address={hot?.address ?? "0x…"}
        symbol={nativeSymbol}
        tags={["2-of-3 multisig", "native + ERC-20"]}
        active={selected === "hot"}
        onClick={() => onChange("hot")}
      />
      <Card
        title="Gas Tank"
        balance={gasTank?.balance ?? "—"}
        address={gasTank?.address ?? "0x…"}
        symbol={nativeSymbol}
        tags={["single-sig", "native only"]}
        active={selected === "gas_tank"}
        onClick={() => onChange("gas_tank")}
      />
    </div>
  );
}

interface CardProps {
  title: string;
  balance: string;
  address: string;
  symbol: string;
  tags: string[];
  active: boolean;
  onClick: () => void;
}

function Card({ title, balance, address, symbol, tags, active, onClick }: CardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`text-left p-3 rounded-md border transition-colors ${
        active
          ? "border-[var(--accent-primary)] bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--accent-primary)]/10"
          : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--accent-primary)]/50"
      }`}
    >
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
        {title}
      </div>
      <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
        {balance} {symbol}
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{shortAddr(address)}</div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {tags.map((t) => (
          <span
            key={t}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
              active
                ? "bg-[var(--accent-primary)] text-[var(--bg-primary)] border-[var(--accent-primary)]"
                : "bg-[var(--bg-primary)] text-[var(--text-muted)] border-[var(--border-primary)]"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Verify test passes**

```
cd apps/client && npx jest components/withdrawals/source-wallet-picker.spec.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add apps/client/components/withdrawals/source-wallet-picker.tsx apps/client/components/withdrawals/source-wallet-picker.spec.tsx
git commit -m "feat(client): SourceWalletPicker component

Two clickable cards (Hot Wallet / Gas Tank) showing balance, address,
and behavior tags. Doubles as live balance display + source selector.
Pure component — caller passes balances; component owns no fetch state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — Wire components into the Withdrawals page

**Files:**
- Modify: `apps/client/app/withdrawals/page.tsx`

- [ ] **Step 1: Add imports + new state**

At the top of `apps/client/app/withdrawals/page.tsx`, add:

```typescript
import { SourceWalletPicker, type SourceWallet } from "@/components/withdrawals/source-wallet-picker";
import { TxActions } from "@/components/withdrawals/tx-actions";
```

Inside the page component (after the existing `useState` block), add:

```typescript
const [sourceWallet, setSourceWallet] = useState<SourceWallet>("hot");
const [gasTankBalance, setGasTankBalance] = useState<string | null>(null);
const [gasTankAddress, setGasTankAddress] = useState<string | null>(null);
const [hotAddress, setHotAddress] = useState<string | null>(null);
```

- [ ] **Step 2: Fetch the gas tank balance + addresses on chain change**

Inside the existing data-loading `useEffect`, after the wallets fetch resolves, add:

```typescript
const chainWallets = (apiWallets ?? []).filter((w) => w.chainId === formChain);
setHotAddress(chainWallets.find((w) => w.walletType === "hot")?.address ?? null);
setGasTankAddress(chainWallets.find((w) => w.walletType === "gas_tank")?.address ?? null);

try {
  const gt = await clientFetch<{ status: string; balanceFormatted?: string }>(
    `/v1/gas-tanks/${formChain}`,
  );
  setGasTankBalance(gt?.balanceFormatted ?? null);
} catch {
  setGasTankBalance(null);
}
```

`apiWallets` is the variable already used by the existing fetch; substitute the local name if different.

- [ ] **Step 3: Render the picker above the existing fields**

Find the JSX block that renders the New Withdrawal form's `<select>` for token (or chain). Just inside the form `<div>`, before the chain dropdown, render:

```tsx
<div className="mb-4">
  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2 block">From</label>
  <SourceWalletPicker
    chainId={formChain}
    selected={sourceWallet}
    hot={hotAddress ? { address: hotAddress, balance: hotWalletNativeBalance ?? "—" } : null}
    gasTank={gasTankAddress ? { address: gasTankAddress, balance: gasTankBalance ?? "—" } : null}
    nativeSymbol={nativeSymbolForChain(formChain)}
    onChange={(next) => {
      setSourceWallet(next);
      if (next === "gas_tank") {
        setFormToken(nativeSymbolForChain(formChain));
      }
    }}
  />
</div>
```

`hotWalletNativeBalance` is the existing native-balance state (rename to match what your local file uses). `nativeSymbolForChain` is a small inline helper added in Step 4.

- [ ] **Step 4: Add a small helper for native symbol per chain**

Inside the page component file, before the component function:

```typescript
const NATIVE_SYMBOLS: Record<number, string> = {
  1: "ETH",
  10: "ETH",
  56: "BNB",
  137: "MATIC",
  8453: "ETH",
  42161: "ETH",
  43114: "AVAX",
};
function nativeSymbolForChain(chainId: number): string {
  return NATIVE_SYMBOLS[chainId] ?? "NATIVE";
}
```

- [ ] **Step 5: Lock the token select when source is gas_tank**

Find the existing token `<select>`. Wrap or modify it so it disables when `sourceWallet === 'gas_tank'`:

```tsx
<select
  value={formToken}
  disabled={sourceWallet === "gas_tank"}
  onChange={(e) => setFormToken(e.target.value)}
  className={/* keep existing classes */}
>
  {/* keep existing options */}
</select>
{sourceWallet === "gas_tank" && (
  <p className="text-xs text-[var(--text-muted)] mt-1 italic">
    Gas Tank only holds the chain native ({nativeSymbolForChain(formChain)}).
  </p>
)}
```

- [ ] **Step 6: Add the `Available: …` hint under Amount**

Find the existing Amount `<input>`. Below it, add:

```tsx
{(() => {
  const balance = sourceWallet === "gas_tank" ? gasTankBalance : hotWalletNativeBalance;
  if (!balance) return null;
  return (
    <p className="text-xs text-[var(--accent-primary)] mt-1">
      Available: {balance} {nativeSymbolForChain(formChain)}{" "}
      <button
        type="button"
        onClick={() => setFormAmount(balance)}
        className="ml-2 underline hover:no-underline"
      >
        Use max
      </button>
    </p>
  );
})()}
```

- [ ] **Step 7: Forward `sourceWallet` in the submit body**

Find the `clientFetch` call that POSTs to `/v1/withdrawals` (or `axios.post`, depending on what the file uses). Add `sourceWallet` to the body:

```typescript
const body = {
  chainId: formChain,
  sourceWallet,
  tokenSymbol: formToken,
  toAddress: selectedDestinationAddress,
  amount: formAmount,
  // … existing fields …
};
```

- [ ] **Step 8: Add the actions column to the history rows**

Find the table render of the Withdrawal History (`<table>` or div-grid). Add a header cell `Actions` at the end and, in each row's render, append:

```tsx
<td className="text-right">
  <TxActions txHash={w.txHash ?? null} chainId={w.chainId} />
</td>
```

If the table uses divs/grid, append a column to the grid template and a `<TxActions … />` element inside each row.

- [ ] **Step 9: Build to verify**

```
cd apps/client && npm run build 2>&1 | grep -E "withdrawals/page" | head -5
```

Expected: clean build for this file.

- [ ] **Step 10: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add apps/client/app/withdrawals/page.tsx
git commit -m "feat(withdrawals): wire SourceWalletPicker + TxActions into the page

Replaces the implicit hot-wallet-only flow with an explicit source picker
above the form. Locks token selection to native when Gas Tank is selected.
Adds Available + Use max hint under Amount. Adds Copy / Open icons at
the end of each Withdrawal History row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12 — Knowledge Base sync (Postman article + new Saque do Gas Tank article)

**Files:**
- Modify: `apps/client/app/support/kb/data/integrations.ts`
- Modify: `apps/client/app/support/kb/data/deposits-withdrawals.ts`

- [ ] **Step 1: Update the postman article variables table**

Open `apps/client/app/support/kb/data/integrations.ts`. Locate the article with `slug: "postman-roteiro-integracao"`. Find the block with `headers: ["Variável", "Editar?", "Default", "Onde obter / como funciona"]`. Add a row before the `idempotencyKey` row:

```typescript
          ["sourceWallet", "Sim (opcional)", "hot", "Discriminador de fonte: 'hot' (default, multisig) ou 'gas_tank' (EOA single-sig)"],
```

Update the `updatedAt` field of the article to today's date (e.g. `"08 Mai 2026"`). Update `tags` to include `"gas-tank"`.

- [ ] **Step 2: Add a new article "Saque do Gas Tank"**

Open `apps/client/app/support/kb/data/deposits-withdrawals.ts`. At the end of the array (before the closing `];`), add:

```typescript
  {
    slug: "saque-do-gas-tank",
    title: "Saque do Gas Tank",
    description:
      "Como sacar saldo nativo diretamente do Gas Tank do projeto, quando usar, e quais limites a plataforma aplica para proteger as operações automáticas.",
    category: "deposits-withdrawals",
    icon: "ArrowUpFromLine",
    difficulty: "intermediate",
    tags: ["saque", "withdrawal", "gas-tank", "native"],
    updatedAt: "08 Mai 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Saque do Gas Tank — quando e por quê",
      },
      {
        type: "paragraph",
        text: "Por padrão, todo saque sai da Hot Wallet (a wallet transacional do projeto), via assinatura 2-of-3 multisig. O saque do Gas Tank é um caminho alternativo, indicado para operações administrativas: encerrar o projeto, recuperar saldo residual, ou consolidar fundos antes de uma manutenção.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Hot Wallet vs Gas Tank",
        text: "Hot Wallet: contrato CvhWalletSimple, multisig 2-of-3, aceita native + ERC-20. Gas Tank: EOA simples, single-sig assinado pela Key Vault, aceita apenas o token nativo da chain (BNB, ETH, MATIC, etc.).",
      },
      {
        type: "heading",
        level: 3,
        text: "Como solicitar pelo Portal",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar Withdrawals",
            description: "No menu lateral, abra Withdrawals. O formulário 'New Withdrawal' mostra dois cards no topo: Hot Wallet e Gas Tank.",
          },
          {
            title: "Selecionar Gas Tank",
            description: "Clique no card Gas Tank. O seletor de Token trava no nativo da chain (BNB, ETH, etc.) — Gas Tank não armazena ERC-20.",
          },
          {
            title: "Escolher destino",
            description: "Selecione um endereço já no whitelist. Endereços novos passam pelo cooldown de 24h normalmente.",
          },
          {
            title: "Definir valor",
            description: "O valor máximo é exibido em 'Available: X'. Use o botão 'Use max' para preencher automaticamente. A plataforma reserva 2 × platform_topup_amount_wei (0.02 BNB no BSC default) para garantir que o platform-key continue sendo abastecido.",
          },
          {
            title: "Confirmar",
            description: "O saque entra como 'pending_approval'. Em modo full-custody, faça o self-approve via API ou pelo Portal. O cron worker pega no próximo tick (≤ 30s) e broadcasta uma value-transfer simples (21k gas).",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Como solicitar pela API",
      },
      {
        type: "code",
        language: "bash",
        filename: "create-gas-tank-withdrawal.sh",
        code: 'curl -X POST https://api.vaulthub.live/client/v1/withdrawals \\\n  -H "X-API-Key: $CVH_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "chainId": 56,\n    "sourceWallet": "gas_tank",\n    "tokenSymbol": "BNB",\n    "toAddress": "0x95DEda8f5FCB60bf02656b226950329e67c605a4",\n    "amount": "0.001",\n    "memo": "Recuperação de saldo residual",\n    "idempotencyKey": "gt-recovery-001"\n  }\'',
      },
      {
        type: "callout",
        variant: "warning",
        title: "Reserve do Gas Tank",
        text: "A plataforma rejeita o saque se o valor + reserve exceder o saldo. O reserve mantém o platform-key abastecido — sem ele, saques da Hot Wallet falham por falta de gas. Mensagem do erro 422: 'Insufficient gas tank balance after reserve'.",
      },
      {
        type: "heading",
        level: 3,
        text: "Diferenças resumidas",
      },
      {
        type: "table",
        headers: ["Característica", "Hot Wallet", "Gas Tank"],
        rows: [
          ["Tipo de wallet", "Contrato (CvhWalletSimple proxy)", "EOA simples"],
          ["Assinatura", "2-of-3 multisig", "Single-sig (Key Vault)"],
          ["Tokens aceitos", "Native + ERC-20", "Apenas o nativo"],
          ["Gas estimado", "~80-120k", "21k"],
          ["Limite efetivo", "Saldo total", "Saldo − reserve (2× topup_amount)"],
          ["Caso de uso", "Pagamentos do dia-a-dia", "Operações administrativas"],
        ],
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/postman-roteiro-integracao",
        title: "Roteiro Postman End-to-End",
        description: "Coleção pronta inclui um request 'Create withdrawal (gas tank)' com sourceWallet=gas_tank.",
      },
    ],
  },
];
```

If the file's last line is not exactly `];`, find it and replace `];` with `,\n  { … }];` keeping JSON-array shape correct.

- [ ] **Step 3: Build to verify**

```
cd apps/client && npm run build 2>&1 | grep -E "kb/data" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add apps/client/app/support/kb/data/integrations.ts apps/client/app/support/kb/data/deposits-withdrawals.ts
git commit -m "docs(kb): Saque do Gas Tank article + sourceWallet in postman variables

New article in deposits-withdrawals explaining when to use Gas Tank
withdrawal vs Hot Wallet, Portal flow, API example, reserve rule, and a
side-by-side comparison table. Postman article variables table now
includes the sourceWallet field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13 — Postman collection + walkthrough sync

**Files:**
- Modify: `docs/integration/CryptoVaultHub.postman_collection.json`
- Modify: `apps/client/public/postman/CryptoVaultHub.postman_collection.json`
- Modify: `docs/integration/postman-walkthrough.md`
- Modify: `apps/client/public/postman/postman-walkthrough.md`

- [ ] **Step 1: Add `sourceWallet` to collection variables**

Open `docs/integration/CryptoVaultHub.postman_collection.json`. Locate the `variable` array. Add an entry next to the others:

```json
{
  "key": "sourceWallet",
  "value": "hot",
  "type": "string",
  "description": "Source of funds: 'hot' (default, multisig) or 'gas_tank' (EOA, native-only)."
}
```

- [ ] **Step 2: Add a new request "Create withdrawal (gas tank)"**

In the `4. Withdrawal` folder's `item` array, after the existing `Create withdrawal` entry, add:

```json
{
  "name": "Create withdrawal (gas tank)",
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [
          "const idem = `wd-gt-${Date.now()}`;",
          "pm.collectionVariables.set('idempotencyKey', idem);"
        ]
      }
    },
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('201 Created', () => pm.response.to.have.status(201));",
          "const j = pm.response.json();",
          "const wd = j.withdrawal?.withdrawal || j.withdrawal || j;",
          "pm.collectionVariables.set('withdrawalId', wd.id);",
          "console.log('gas_tank withdrawalId =', wd.id);"
        ]
      }
    }
  ],
  "request": {
    "method": "POST",
    "header": [{ "key": "Content-Type", "value": "application/json" }],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"chainId\": {{chainId}},\n  \"sourceWallet\": \"gas_tank\",\n  \"tokenSymbol\": \"{{tokenSymbol}}\",\n  \"toAddress\": \"{{withdrawalTarget}}\",\n  \"amount\": \"{{withdrawalAmount}}\",\n  \"memo\": \"Postman gas-tank test\",\n  \"idempotencyKey\": \"{{idempotencyKey}}\"\n}"
    },
    "url": {
      "raw": "{{baseUrl}}/withdrawals",
      "host": ["{{baseUrl}}"],
      "path": ["withdrawals"]
    },
    "description": "Variant of 'Create withdrawal' that explicitly uses sourceWallet='gas_tank'. Token is forced to the chain native by the API regardless of what is sent."
  }
}
```

- [ ] **Step 3: Mirror to the public asset**

```
cp docs/integration/CryptoVaultHub.postman_collection.json apps/client/public/postman/CryptoVaultHub.postman_collection.json
```

- [ ] **Step 4: Update the walkthrough markdown**

Open `docs/integration/postman-walkthrough.md`. Find the section "## 10. Create withdrawal". Add immediately below it (still in the Withdrawal section, before "## 11. Self-approve"):

```markdown
### 10b. Variant — sacar do Gas Tank

Mesmo endpoint, com `sourceWallet:'gas_tank'`. A API força o token para o nativo da chain (BNB na BSC, ETH na Ethereum, etc.) e aplica um *reserve* sobre o saldo do gas tank igual a `2 × platform_topup_amount_wei` (0.02 BNB no default da BSC). Use para operações administrativas — recuperar saldo residual, consolidar fundos antes de manutenção. Para pagamentos rotineiros, prefira o caminho default `hot`.

```http
POST {{baseUrl}}/withdrawals
X-API-Key: {{apiKey}}
Content-Type: application/json

{
  "chainId": {{chainId}},
  "sourceWallet": "gas_tank",
  "tokenSymbol": "{{tokenSymbol}}",
  "toAddress": "{{withdrawalTarget}}",
  "amount": "0.001",
  "idempotencyKey": "wd-gt-…"
}
```

**Erros específicos do gas_tank:**

| HTTP | Mensagem | Causa |
|---|---|---|
| 422 | `Gas Tank source only supports the chain native token` | Enviou tokenSymbol diferente do nativo |
| 422 | `Insufficient gas tank balance after reserve` | Pediu mais que `balance − reserved`. O body da resposta inclui `details: {requested, available, reserved}` |
```

Mirror to the public copy:

```
cp docs/integration/postman-walkthrough.md apps/client/public/postman/postman-walkthrough.md
```

- [ ] **Step 5: Commit**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add docs/integration/CryptoVaultHub.postman_collection.json docs/integration/postman-walkthrough.md apps/client/public/postman/CryptoVaultHub.postman_collection.json apps/client/public/postman/postman-walkthrough.md
git commit -m "docs(postman): sourceWallet variable + Create withdrawal (gas tank) request

Collection gains a 'sourceWallet' variable and a parallel request for the
gas_tank variant under the Withdrawal folder. Walkthrough markdown gets
section 10b explaining when to use it and the two specific 422 errors.
Public-asset mirrors updated to match.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14 — Deploy + production sanity-check

- [ ] **Step 1: Push everything**

```
git push origin main
```

- [ ] **Step 2: Pull + build + recreate the four affected services**

```
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && git pull origin main && docker compose build cron-worker-service core-wallet-service client-api admin-api && docker compose up -d --force-recreate --no-deps cron-worker-service core-wallet-service client-api'
```

(The `apps/client` UI is built by Next.js separately; it will rebuild on the next portal deploy. Confirm if that's part of your workflow or run a portal redeploy here.)

Wait for healthy:

```
until ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose ps cron-worker-service core-wallet-service client-api 2>&1 | grep -c "(healthy)"' | grep -q 3; do sleep 6; done
echo HEALTHY
```

- [ ] **Step 3: Smoke test the new endpoint**

```
curl -s -X POST -H 'X-Api-Key: cvh_live_ZOPeaw9uyM6Xi9PvzlxbPugn-Qz9xTfiG2pcJ5tiS-g' -H 'Content-Type: application/json' \
  https://api.vaulthub.live/client/v1/withdrawals \
  -d '{
    "chainId": 56,
    "sourceWallet": "gas_tank",
    "tokenSymbol": "USDT",
    "toAddress": "0x95DEda8f5FCB60bf02656b226950329e67c605a4",
    "amount": "0.001",
    "idempotencyKey": "smoke-gt-non-native"
  }'
```

Expected: HTTP 422 with `Gas Tank source only supports the chain native token` in the response body.

```
curl -s -X POST -H 'X-Api-Key: cvh_live_ZOPeaw9uyM6Xi9PvzlxbPugn-Qz9xTfiG2pcJ5tiS-g' -H 'Content-Type: application/json' \
  https://api.vaulthub.live/client/v1/withdrawals \
  -d '{
    "chainId": 56,
    "sourceWallet": "gas_tank",
    "tokenSymbol": "BNB",
    "toAddress": "0x95DEda8f5FCB60bf02656b226950329e67c605a4",
    "amount": "10",
    "idempotencyKey": "smoke-gt-over-reserve"
  }'
```

Expected: HTTP 422 with `Insufficient gas tank balance after reserve`.

- [ ] **Step 4: Commit a deploy note**

```
git commit --allow-empty -m "ops: deploy withdrawals redesign + gas-tank source

Smoke tests pass — both 422 reasons return the expected payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Task 15 — Add Gas Tank phase to the homologation suite

**Files:**
- Modify: `docs/superpowers/automation/suites/api.ts`

- [ ] **Step 1: Locate the existing "withdrawal.confirmed" step**

Open `docs/superpowers/automation/suites/api.ts`. Find the step labeled `Aguardar withdrawal.confirmed (até 5 min)`. Right after that step's closing `});`, before the cleanup section, add a new block:

```typescript
  // ─── B.13 Variant — Gas Tank withdrawal ────────────────────────────
  const gtAmount = '0.0005';
  const gtWithdrawalId = await reporter.step('Criar withdrawal (gas tank) de 0.0005 BNB', async () => {
    const r = await api.post<any>('/withdrawals', {
      chainId: config.chainId,
      sourceWallet: 'gas_tank',
      tokenSymbol: 'BNB',
      toAddress: withdrawalTarget,
      amount: gtAmount,
    });
    api.noteLastRequest('sourceWallet=gas_tank — saque single-sig direto do gas tank do projeto. Token forçado pra nativo no backend.');
    const id = (r as any).withdrawalId ?? (r as any).withdrawal?.id ?? (r as any).id;
    if (!id) throw new Error('Gas-tank withdrawal response missing id: ' + JSON.stringify(r).slice(0, 200));
    try {
      await api.post(`/withdrawals/${id}/approve`, {});
    } catch (e: any) {
      if (e?.response?.status !== 409 && e?.response?.status !== 400) throw e;
    }
    reporter.highlight('gas-tank withdrawalId', String(id));
    return String(id);
  });

  await reporter.step('Aguardar gas-tank withdrawal.confirmed (até 5 min)', async () => {
    return await api.pollUntil<any>(
      async () => {
        const r = await api.get<any>(`/withdrawals/${gtWithdrawalId}`);
        const status = wdStatus(r);
        return ['confirmed', 'failed', 'rejected'].includes(status) ? r : null;
      },
      { timeoutMs: 300_000, intervalMs: 8_000, label: 'gas_tank.withdrawal.confirmed' },
    );
  });
```

`wdStatus` is the helper added previously (extracts status from flat or nested API responses); reuse it. `withdrawalTarget` and `config.chainId` are already in scope.

- [ ] **Step 2: Run the suite end-to-end**

The user must have the deposit address funded with 0.005 BNB and the gas tank funded with at least `0.02 BNB (reserve) + 0.0005 BNB (test) + small gas margin`. With those funded:

```
cd docs/superpowers/automation && CVH_PHASE_RESUME=true CVH_AUTO_CONTINUE=true CVH_PROMPT_ANSWER=0x95DEda8f5FCB60bf02656b226950329e67c605a4 npm run api-only
```

Expected: `PASS: 14, FAIL: 0`. Both withdrawal confirmations land on-chain.

- [ ] **Step 3: Commit the suite change**

```
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
git add docs/superpowers/automation/suites/api.ts
git commit -m "test(homologation): 14th phase — Gas Tank withdrawal

Adds a Gas Tank variant of the withdrawal phase right after the existing
hot-wallet one. Same destination, same approve/poll machinery, but
sourceWallet='gas_tank' and amount within the gas tank reserve.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage check:**

- §3.1 (dual cards as source picker) → Tasks 10 + 11.
- §3.2 (Available + Use max hint) → Task 11 step 6.
- §3.3 (reserve = 2 × platform_topup_amount_wei + native fallback) → Task 5 step 4.
- §3.4 (history row actions copy + open) → Tasks 7, 8, 9, 11 step 8.
- §4.1 (frontend components) → Tasks 7, 8, 9, 10.
- §4.2 (client-api dto + service + Swagger) → Tasks 3, 4.
- §4.3 (core-wallet branch + reserve) → Task 5.
- §4.4 (cron-worker branch + executeGasTankWithdrawal) → Task 6.
- §4.5 (migration) → Task 1.
- §6 (error handling specifics) → Task 3 (Swagger docs) + Task 5 (server error shape) + Task 13 (walkthrough docs the same shape).
- §7 (doc sync requirement) → Tasks 12 + 13.
- §8 (testing) → Tasks 7-10 (specs); Task 15 (E2E).
- §9 (acceptance criteria 1-11):
  - 1, 2 → Task 11 step 3, 5.
  - 3 → Task 11 step 6.
  - 4 → Tasks 7, 9, 11 step 8.
  - 5 → Task 15.
  - 6, 7 → Task 14 step 3 (smoke tests verify the messages).
  - 8 → Task 12 step 2.
  - 9 → Task 3.
  - 10 → Task 13.
  - 11 → Task 15.

All spec sections have at least one task.

**Placeholder scan:** searched the plan for "TBD", "TODO", "implement later" — none present. All steps include the actual code, paths, and expected outputs.

**Type consistency:** `SourceWallet = 'hot' | 'gas_tank'` is consistent across DTO (Task 3), client-api service (Task 4), core-wallet service (Task 5), cron-worker mapping (Task 6), and frontend `SourceWalletPicker` (Task 10). The `executeGasTankWithdrawal` method name is consistent in Task 6 and referenced in §4.4. The `TxActions` props match across Task 9 (definition) and Task 11 (consumer). The Postman variable name `sourceWallet` matches between Task 13 step 1 and Task 13 step 4.
