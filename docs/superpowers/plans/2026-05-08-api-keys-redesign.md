# API Keys Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api-keys` fully functional for client-portal users — generate per-project keys with granular scopes, IP/CIDR allowlist, and optional expiration — while keeping every existing API key working unchanged.

**Architecture:** Browser → `client-api` (JWT-only) → `auth-service` (internal-service-key). Granular scopes added; legacy `read`/`write`/`withdraw` macros expand at validation time so old keys keep working without migration. UI is a list view + 4-step wizard + one-time reveal modal.

**Tech Stack:** NestJS 10 (`auth-service`, `client-api`), Prisma 5, Next.js 14 App Router (`apps/client`), Jest, axios, class-validator, Tailwind via existing design tokens.

**Spec:** `docs/superpowers/specs/2026-05-08-api-keys-redesign-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `services/client-api/src/common/guards/jwt-only-auth.guard.ts` | Authenticate exclusively via JWT (rejects API-key auth). Used for self-service account management endpoints. |
| `services/client-api/src/common/decorators/portal-auth.decorator.ts` | `@PortalAuth(...scopes)` — JWT-only guard + scope metadata. |
| `services/client-api/src/common/scopes/scope-catalog.ts` | Single source of truth for all granular scope strings + legacy macro expansion logic. |
| `services/client-api/src/api-key/api-key.controller.ts` | `GET /client/v1/api-keys`, `POST /client/v1/api-keys`, `DELETE /client/v1/api-keys/:id`. |
| `services/client-api/src/api-key/dto/api-key.dto.ts` | DTOs: `CreateApiKeyDto`, `ApiKeyResponseDto`. |
| `services/auth-service/src/api-key/cidr.ts` | `matchesAllowlist(ip, allowlist)` helper. Pure function, no deps. |
| `apps/client/components/api-keys/ip-chip-input.tsx` | Chip-style IP/CIDR input with client-side validation. |
| `apps/client/components/api-keys/scope-picker.tsx` | Grouped checkbox permission picker + "Read-only" quick-pick toggle. |
| `apps/client/components/api-keys/one-time-key-modal.tsx` | Blocking modal that shows the raw key once. |
| `apps/client/components/api-keys/create-key-wizard.tsx` | 4-step modal wizard composing IpChipInput + ScopePicker. |
| `apps/client/components/api-keys/revoke-confirm-modal.tsx` | Confirm-revoke dialog. |
| `apps/client/lib/scope-catalog.ts` | Mirror of the granular scopes for front-end use (display labels, sensitivity flag, group). |
| `apps/client/lib/cidr.ts` | `isValidIpOrCidr(value)` helper. |

### Modified files

| Path | Change |
|---|---|
| `services/client-api/src/api-key/api-key.module.ts` | Replace existing single-provider module with full controller+service module. |
| `services/client-api/src/api-key/api-key.service.ts` | Replace token-listing helper with real API-key management calls to `auth-service`. |
| `services/client-api/src/common/guards/api-key-auth.guard.ts` | Apply `expandLegacyScopes()` before scope match. |
| `services/client-api/src/app.module.ts` | Confirm `ApiKeyModule` is imported. |
| `services/client-api/src/main.ts` | No change (Swagger declares `X-API-Key` already). |
| `services/auth-service/src/api-key/api-key.service.ts` | CIDR-aware IP matching; expiry validation. |
| `services/auth-service/src/auth.controller.ts` | Add `POST /auth/internal/api-keys`, `DELETE /auth/internal/api-keys/:id`. |
| `services/auth-service/src/common/dto/auth.dto.ts` | Add `CreateInternalApiKeyDto`. |
| Each `*.controller.ts` in `services/client-api/src/` | Re-decorate with granular scopes (see Task 7–11). |
| `apps/client/app/api-keys/page.tsx` | Full rewrite: route through `clientFetch`; list + wizard composition. |
| `apps/client/app/support/kb/data/integrations.ts` | Add "API Keys — escopo granular e melhores práticas" article. |
| `docs/integration/CryptoVaultHub.postman_collection.json` | Add "Self-service API key management" folder. Mirror to `apps/client/public/postman/`. |
| `docs/integration/postman-walkthrough.md` | Mention the new folder in the walkthrough. |
| `docs/superpowers/automation/suites/api.ts` | Add 3 phases (list, create+exercise, revoke). |

---

## Task 1: CIDR helper in auth-service

**Files:**
- Create: `services/auth-service/src/api-key/cidr.ts`
- Test: `services/auth-service/src/api-key/cidr.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/auth-service/src/api-key/cidr.spec.ts
import { matchesAllowlist } from './cidr';

describe('matchesAllowlist', () => {
  it('returns true when allowlist is empty (no restriction)', () => {
    expect(matchesAllowlist('1.2.3.4', [])).toBe(true);
    expect(matchesAllowlist('1.2.3.4', null)).toBe(true);
    expect(matchesAllowlist('1.2.3.4', undefined)).toBe(true);
  });

  it('matches an exact IP entry', () => {
    expect(matchesAllowlist('203.0.113.4', ['203.0.113.4'])).toBe(true);
    expect(matchesAllowlist('203.0.113.5', ['203.0.113.4'])).toBe(false);
  });

  it('matches an IP inside a CIDR block', () => {
    expect(matchesAllowlist('203.0.113.42', ['203.0.113.0/24'])).toBe(true);
    expect(matchesAllowlist('203.0.114.1', ['203.0.113.0/24'])).toBe(false);
  });

  it('treats a single IP as /32', () => {
    expect(matchesAllowlist('10.0.0.1', ['10.0.0.1/32'])).toBe(true);
    expect(matchesAllowlist('10.0.0.2', ['10.0.0.1/32'])).toBe(false);
  });

  it('matches when any one entry of a multi-entry allowlist matches', () => {
    expect(
      matchesAllowlist('192.168.1.5', ['10.0.0.0/8', '192.168.0.0/16']),
    ).toBe(true);
  });

  it('returns false for malformed entries instead of throwing', () => {
    expect(matchesAllowlist('1.2.3.4', ['not-an-ip'])).toBe(false);
    expect(matchesAllowlist('1.2.3.4', ['1.2.3.0/33'])).toBe(false);
  });

  it('returns false when requestIp is missing', () => {
    expect(matchesAllowlist(undefined, ['1.2.3.0/24'])).toBe(false);
    expect(matchesAllowlist('', ['1.2.3.0/24'])).toBe(false);
  });

  it('strips IPv6-mapped IPv4 prefix from requestIp', () => {
    expect(matchesAllowlist('::ffff:203.0.113.4', ['203.0.113.0/24'])).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/auth-service && npx jest src/api-key/cidr.spec.ts`
Expected: FAIL with `Cannot find module './cidr'`.

- [ ] **Step 3: Implement `matchesAllowlist`**

Create `services/auth-service/src/api-key/cidr.ts`:

```ts
/**
 * Pure helpers for matching a request IP against an allowlist that can mix
 * exact IPv4 addresses and CIDR blocks. IPv4 only.
 *
 * matchesAllowlist returns true when:
 *   - allowlist is empty / null / undefined (no restriction), OR
 *   - any entry of the allowlist matches the request IP.
 *
 * Entries that are syntactically invalid produce a `false` match for that
 * entry rather than throwing — the allowlist is best-effort and malformed
 * entries should never crash an authentication flow.
 */

const IPV4_MAPPED_PREFIX = '::ffff:';

function normalizeIp(ip: string): string {
  return ip.startsWith(IPV4_MAPPED_PREFIX)
    ? ip.slice(IPV4_MAPPED_PREFIX.length)
    : ip;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  // Force unsigned 32-bit
  return n >>> 0;
}

function entryMatches(ip: string, entry: string): boolean {
  const [addr, prefixStr] = entry.includes('/')
    ? entry.split('/')
    : [entry, '32'];
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const reqInt = ipToInt(ip);
  const entryInt = ipToInt(addr);
  if (reqInt === null || entryInt === null) return false;

  if (prefix === 0) return true; // 0.0.0.0/0 matches everything
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (reqInt & mask) === (entryInt & mask);
}

export function matchesAllowlist(
  requestIp: string | undefined,
  allowlist: string[] | null | undefined,
): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  if (!requestIp) return false;
  const ip = normalizeIp(requestIp);
  return allowlist.some((entry) => entryMatches(ip, entry));
}

export function isValidIpOrCidr(value: string): boolean {
  if (!value) return false;
  const [addr, prefixStr] = value.includes('/') ? value.split('/') : [value, '32'];
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  return ipToInt(addr) !== null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/auth-service && npx jest src/api-key/cidr.spec.ts`
Expected: PASS — 8 passed.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/api-key/cidr.ts services/auth-service/src/api-key/cidr.spec.ts
git commit -m "feat(auth): CIDR-aware allowlist matching helper"
```

---

## Task 2: Use CIDR helper in `validateApiKey`

**Files:**
- Modify: `services/auth-service/src/api-key/api-key.service.ts:160-170`
- Test: `services/auth-service/src/api-key/api-key.service.spec.ts`

- [ ] **Step 1: Add the failing test**

Append to `services/auth-service/src/api-key/api-key.service.spec.ts`:

```ts
describe('validateApiKey IP allowlist (CIDR)', () => {
  let service: ApiKeyService;
  const prismaMock = {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService(prismaMock);
  });

  it('rejects when request IP is outside the CIDR block', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: 1n,
      keyPrefix: 'cvh_live_x',
      isActive: true,
      expiresAt: null,
      ipAllowlist: ['203.0.113.0/24'],
      clientId: 7n,
      projectId: 11n,
      scopes: ['read'],
      allowedChains: null,
    });

    const result = await service.validateApiKey('cvh_live_xx', '198.51.100.7');
    expect(result.valid).toBe(false);
  });

  it('accepts when request IP is inside the CIDR block', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: 1n,
      keyPrefix: 'cvh_live_x',
      isActive: true,
      expiresAt: null,
      ipAllowlist: ['203.0.113.0/24'],
      clientId: 7n,
      projectId: 11n,
      scopes: ['read'],
      allowedChains: null,
    });

    const result = await service.validateApiKey('cvh_live_xx', '203.0.113.42');
    expect(result.valid).toBe(true);
    expect(result.clientId).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd services/auth-service && npx jest src/api-key/api-key.service.spec.ts -t "CIDR"`
Expected: FAIL — `accepts when request IP is inside the CIDR block` fails because the current `includes()` check rejects the CIDR string.

- [ ] **Step 3: Replace exact-match with CIDR helper**

Edit `services/auth-service/src/api-key/api-key.service.ts`. Replace the block:

```ts
    // Check IP allowlist
    if (key.ipAllowlist && requestIp) {
      const allowlist = key.ipAllowlist as string[];
      if (allowlist.length > 0 && !allowlist.includes(requestIp)) {
        this.logger.warn(
          `API key ${key.keyPrefix} rejected: IP ${requestIp} not in allowlist`,
        );
        return { valid: false };
      }
    }
```

with:

```ts
    // Check IP allowlist (CIDR-aware; entries may be exact IPs or CIDR blocks)
    const allowlist = (key.ipAllowlist as string[] | null) ?? null;
    if (allowlist && allowlist.length > 0) {
      if (!matchesAllowlist(requestIp, allowlist)) {
        this.logger.warn(
          `API key ${key.keyPrefix} rejected: IP ${requestIp} not in allowlist ${JSON.stringify(allowlist)}`,
        );
        return { valid: false };
      }
    }
```

Add to the imports at the top of the same file:

```ts
import { matchesAllowlist } from './cidr';
```

- [ ] **Step 4: Run tests**

Run: `cd services/auth-service && npx jest src/api-key/api-key.service.spec.ts`
Expected: All previous tests + 2 new CIDR tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/api-key/api-key.service.ts services/auth-service/src/api-key/api-key.service.spec.ts
git commit -m "fix(auth): use CIDR-aware matching for ApiKey IP allowlist"
```

---

## Task 3: Reject past `expiresAt` in createApiKey

**Files:**
- Modify: `services/auth-service/src/api-key/api-key.service.ts:39-69`
- Test: `services/auth-service/src/api-key/api-key.service.spec.ts`

- [ ] **Step 1: Add the failing test**

Append to `services/auth-service/src/api-key/api-key.service.spec.ts`:

```ts
describe('createApiKey expiresAt validation', () => {
  let service: ApiKeyService;
  const prismaMock = {
    apiKey: { create: jest.fn().mockResolvedValue({ id: 1n, expiresAt: null, keyPrefix: 'p' }) },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService(prismaMock);
  });

  it('rejects expiresAt in the past with BadRequestException', async () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    await expect(
      service.createApiKey(1, 1, ['read'], { expiresAt: past }),
    ).rejects.toThrow(/expiresAt must be a future date/);
    expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
  });

  it('accepts expiresAt in the future', async () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    await service.createApiKey(1, 1, ['read'], { expiresAt: future });
    expect(prismaMock.apiKey.create).toHaveBeenCalled();
  });

  it('accepts undefined expiresAt (indefinite)', async () => {
    await service.createApiKey(1, 1, ['read']);
    expect(prismaMock.apiKey.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd services/auth-service && npx jest src/api-key/api-key.service.spec.ts -t "expiresAt validation"`
Expected: FAIL on the past-date test — no validation today.

- [ ] **Step 3: Add validation in `createApiKey`**

Edit `services/auth-service/src/api-key/api-key.service.ts`. At the top of the `createApiKey` method, before `const raw = randomBytes(...)`:

```ts
    if (options?.expiresAt) {
      const exp = new Date(options.expiresAt);
      if (Number.isNaN(exp.getTime())) {
        throw new BadRequestException('expiresAt must be a valid ISO date');
      }
      if (exp.getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt must be a future date');
      }
    }
```

Add `BadRequestException` to the imports at the top of that file:

```ts
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
```

- [ ] **Step 4: Run tests**

Run: `cd services/auth-service && npx jest src/api-key/api-key.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src/api-key/api-key.service.ts services/auth-service/src/api-key/api-key.service.spec.ts
git commit -m "feat(auth): reject past expiresAt on ApiKey creation"
```

---

## Task 4: Internal endpoints `POST/DELETE /auth/internal/api-keys`

**Files:**
- Modify: `services/auth-service/src/auth.controller.ts` (add two methods)
- Modify: `services/auth-service/src/common/dto/auth.dto.ts` (add DTO)
- Test: `services/auth-service/src/auth.controller.spec.ts`

- [ ] **Step 1: Add the DTO**

Append to `services/auth-service/src/common/dto/auth.dto.ts`:

```ts
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ArrayMinSize,
  IsDateString,
  IsPositive,
  ArrayUnique,
} from 'class-validator';

export class CreateInternalApiKeyDto {
  @IsInt()
  @IsPositive()
  clientId!: number;

  @IsInt()
  @IsPositive()
  projectId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedChains?: number[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
```

- [ ] **Step 2: Add the failing controller test**

Append to `services/auth-service/src/auth.controller.spec.ts`:

```ts
describe('Internal API key endpoints', () => {
  let controller: AuthController;
  const apiKeyService = {
    createApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
    listApiKeys: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      { generate: jest.fn(), validate: jest.fn() } as any,
      { findUserByEmail: jest.fn() } as any,
      apiKeyService,
      { log: jest.fn() } as any, // audit
    );
  });

  it('POST /internal/api-keys forwards to ApiKeyService.createApiKey', async () => {
    apiKeyService.createApiKey.mockResolvedValue({
      id: '1',
      key: 'cvh_live_abc',
      prefix: 'cvh_live_a',
      clientId: 7,
      scopes: ['wallets:read'],
    });

    const dto = {
      clientId: 7,
      projectId: 11,
      scopes: ['wallets:read'],
      label: 'Test',
    } as any;

    const result = await controller.createInternalApiKey(dto);
    expect(apiKeyService.createApiKey).toHaveBeenCalledWith(
      7,
      11,
      ['wallets:read'],
      expect.objectContaining({ label: 'Test' }),
    );
    expect(result.success).toBe(true);
    expect(result.apiKey.key).toBe('cvh_live_abc');
  });

  it('DELETE /internal/api-keys/:id forwards to ApiKeyService.revokeApiKey', async () => {
    apiKeyService.revokeApiKey.mockResolvedValue(undefined);
    await controller.revokeInternalApiKey(42);
    expect(apiKeyService.revokeApiKey).toHaveBeenCalledWith(42);
  });
});
```

- [ ] **Step 3: Run failing test**

Run: `cd services/auth-service && npx jest src/auth.controller.spec.ts -t "Internal API key endpoints"`
Expected: FAIL — methods not defined.

- [ ] **Step 4: Add the controller methods**

Edit `services/auth-service/src/auth.controller.ts`. After the existing `revokeApiKey` (line ~336), add:

```ts
  // ─── Internal API key endpoints (called by client-api on behalf of clients) ───

  @Post('internal/api-keys')
  @UseGuards(InternalServiceGuard)
  async createInternalApiKey(@Body() dto: CreateInternalApiKeyDto) {
    const result = await this.apiKeyService.createApiKey(
      dto.clientId,
      dto.projectId,
      dto.scopes,
      {
        ipAllowlist: dto.ipAllowlist,
        allowedChains: dto.allowedChains,
        label: dto.label,
        expiresAt: dto.expiresAt,
      },
    );
    return { success: true, apiKey: result };
  }

  @Delete('internal/api-keys/:id')
  @UseGuards(InternalServiceGuard)
  async revokeInternalApiKey(@Param('id', ParseIntPipe) id: number) {
    await this.apiKeyService.revokeApiKey(id);
    return { success: true, message: 'API key revoked' };
  }
```

Add the DTO import at the top:

```ts
import { CreateInternalApiKeyDto } from './common/dto/auth.dto';
```

- [ ] **Step 5: Run tests**

Run: `cd services/auth-service && npx jest`
Expected: All tests PASS, including the 2 new ones.

- [ ] **Step 6: Smoke-test the route registration**

Run: `cd services/auth-service && npx ts-node -e "import('./src/main').catch(console.error)"` and stop after seeing `Mapped {/auth/internal/api-keys` in logs (or use `grep` on the boot output). If the env vars block boot, skip — the unit tests already prove the wiring.

- [ ] **Step 7: Commit**

```bash
git add services/auth-service/src/auth.controller.ts services/auth-service/src/auth.controller.spec.ts services/auth-service/src/common/dto/auth.dto.ts
git commit -m "feat(auth): internal POST/DELETE /auth/internal/api-keys for client-api"
```

---

## Task 5: Scope catalog + macro expansion in `client-api`

**Files:**
- Create: `services/client-api/src/common/scopes/scope-catalog.ts`
- Test: `services/client-api/src/common/scopes/scope-catalog.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/client-api/src/common/scopes/scope-catalog.spec.ts
import {
  GRANULAR_SCOPES,
  expandLegacyScopes,
  ALL_READ_SCOPES,
  LEGACY_WRITE_SCOPES,
  LEGACY_WITHDRAW_SCOPES,
} from './scope-catalog';

describe('scope-catalog', () => {
  it('GRANULAR_SCOPES has 30 entries and no duplicates', () => {
    expect(GRANULAR_SCOPES.length).toBe(30);
    expect(new Set(GRANULAR_SCOPES).size).toBe(30);
  });

  it('every ALL_READ_SCOPES entry ends with :read', () => {
    for (const s of ALL_READ_SCOPES) {
      expect(s.endsWith(':read')).toBe(true);
    }
  });

  it('expands "read" to all *:read scopes', () => {
    const out = expandLegacyScopes(['read']);
    for (const s of ALL_READ_SCOPES) expect(out).toContain(s);
  });

  it('expands "write" to legacy-write scopes', () => {
    const out = expandLegacyScopes(['write']);
    for (const s of LEGACY_WRITE_SCOPES) expect(out).toContain(s);
  });

  it('expands "withdraw" to both withdrawal scopes', () => {
    const out = expandLegacyScopes(['withdraw']);
    expect(out).toContain('withdrawals:hot');
    expect(out).toContain('withdrawals:gas-tank');
  });

  it('passes through granular scopes unchanged', () => {
    expect(expandLegacyScopes(['wallets:create', 'webhooks:read'])).toEqual(
      expect.arrayContaining(['wallets:create', 'webhooks:read']),
    );
  });

  it('deduplicates the result', () => {
    const out = expandLegacyScopes(['read', 'wallets:read', 'read']);
    const occurrences = out.filter((s) => s === 'wallets:read').length;
    expect(occurrences).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(expandLegacyScopes([])).toEqual([]);
  });

  it('handles undefined input gracefully', () => {
    expect(expandLegacyScopes(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd services/client-api && npx jest src/common/scopes/scope-catalog.spec.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the catalog**

Create `services/client-api/src/common/scopes/scope-catalog.ts`:

```ts
/**
 * Single source of truth for granular API key scopes used across client-api
 * controllers, plus runtime expansion of the legacy macros (`read`, `write`,
 * `withdraw`) so existing keys keep working without data migration.
 */

export const GRANULAR_SCOPES = [
  'wallets:read',
  'wallets:create',
  'forwarders:read',
  'forwarders:flush',
  'address-book:read',
  'address-book:write',
  'address-groups:read',
  'address-groups:write',
  'withdrawals:read',
  'withdrawals:hot',
  'withdrawals:gas-tank',
  'webhooks:read',
  'webhooks:write',
  'deposits:read',
  'tokens:read',
  'chains:read',
  'gas-tanks:read',
  'gas-tanks:write',
  'co-sign:read',
  'co-sign:write',
  'projects:read',
  'project-setup:read',
  'project-setup:write',
  'notifications:read',
  'notifications:write',
  'security:read',
  'security:write',
  'deploy-trace:read',
  'export:read',
  'admin', // Reserved for JWT-mapped owner role; not selectable by users.
] as const;

export type GranularScope = (typeof GRANULAR_SCOPES)[number];

export const ALL_READ_SCOPES: string[] = GRANULAR_SCOPES.filter((s) =>
  s.endsWith(':read'),
);

export const LEGACY_WRITE_SCOPES: string[] = [
  'wallets:create',
  'forwarders:flush',
  'address-book:write',
  'address-groups:write',
  'webhooks:write',
  'gas-tanks:write',
  'co-sign:write',
  'project-setup:write',
  'notifications:write',
  'security:write',
  'export:read',
];

export const LEGACY_WITHDRAW_SCOPES: string[] = [
  'withdrawals:hot',
  'withdrawals:gas-tank',
];

const LEGACY_ALIASES: Record<string, string[]> = {
  read: ALL_READ_SCOPES,
  write: LEGACY_WRITE_SCOPES,
  withdraw: LEGACY_WITHDRAW_SCOPES,
};

export function expandLegacyScopes(scopes: string[] | undefined): string[] {
  if (!scopes || scopes.length === 0) return [];
  const out = new Set<string>();
  for (const s of scopes) {
    const expansion = LEGACY_ALIASES[s];
    if (expansion) {
      for (const x of expansion) out.add(x);
    } else {
      out.add(s);
    }
  }
  return [...out];
}

export function isKnownScope(s: string): boolean {
  return (
    (GRANULAR_SCOPES as readonly string[]).includes(s) ||
    s in LEGACY_ALIASES
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd services/client-api && npx jest src/common/scopes/scope-catalog.spec.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add services/client-api/src/common/scopes/scope-catalog.ts services/client-api/src/common/scopes/scope-catalog.spec.ts
git commit -m "feat(client-api): granular scope catalog + legacy macro expansion"
```

---

## Task 6: Apply macro expansion in `ApiKeyAuthGuard.checkScopes`

**Files:**
- Modify: `services/client-api/src/common/guards/api-key-auth.guard.ts:131-150`
- Modify: `services/client-api/src/common/guards/api-key-auth.guard.spec.ts` (or create if missing)

- [ ] **Step 1: Write the failing test**

If `services/client-api/src/common/guards/api-key-auth.guard.spec.ts` does not exist, create it. Otherwise, append. Full file:

```ts
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

function makeContextWithMetadata(required: string[] | null) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as any;
}

describe('ApiKeyAuthGuard.checkScopes — legacy macro expansion', () => {
  const cfg = { get: () => 'http://x' } as unknown as ConfigService;

  function makeGuard(required: string[]) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new ApiKeyAuthGuard(cfg, reflector);
  }

  it('grants access when key has legacy "read" and route requires a granular *:read', () => {
    const guard = makeGuard(['wallets:read']);
    expect(() =>
      (guard as any).checkScopes(makeContextWithMetadata(['wallets:read']), [
        'read',
      ]),
    ).not.toThrow();
  });

  it('grants access when key has legacy "write" and route requires forwarders:flush', () => {
    const guard = makeGuard(['forwarders:flush']);
    expect(() =>
      (guard as any).checkScopes(
        makeContextWithMetadata(['forwarders:flush']),
        ['write'],
      ),
    ).not.toThrow();
  });

  it('grants access when key has legacy "withdraw" and route requires withdrawals:hot', () => {
    const guard = makeGuard(['withdrawals:hot']);
    expect(() =>
      (guard as any).checkScopes(makeContextWithMetadata(['withdrawals:hot']), [
        'withdraw',
      ]),
    ).not.toThrow();
  });

  it('denies access when granular key lacks the required granular scope', () => {
    const guard = makeGuard(['wallets:create']);
    expect(() =>
      (guard as any).checkScopes(
        makeContextWithMetadata(['forwarders:flush']),
        ['wallets:create'],
      ),
    ).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd services/client-api && npx jest src/common/guards/api-key-auth.guard.spec.ts`
Expected: FAIL — without expansion, the legacy-key tests throw ForbiddenException.

- [ ] **Step 3: Patch `checkScopes` to expand**

Edit `services/client-api/src/common/guards/api-key-auth.guard.ts`. At the top, add the import:

```ts
import { expandLegacyScopes } from '../scopes/scope-catalog';
```

Replace the existing `checkScopes` method body:

```ts
  private checkScopes(
    context: ExecutionContext,
    userScopes?: string[],
  ): void {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) return;

    const expanded = expandLegacyScopes(userScopes);
    const hasScope = requiredScopes.some((scope) => expanded.includes(scope));
    if (!hasScope) {
      throw new ForbiddenException(
        `Insufficient scopes. Required: ${requiredScopes.join(' | ')}`,
      );
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `cd services/client-api && npx jest src/common/guards/api-key-auth.guard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/client-api/src/common/guards/api-key-auth.guard.ts services/client-api/src/common/guards/api-key-auth.guard.spec.ts
git commit -m "feat(client-api): expand legacy scopes in ApiKeyAuthGuard"
```

---

## Task 7: `JwtOnlyAuthGuard` + `@PortalAuth` decorator

**Files:**
- Create: `services/client-api/src/common/guards/jwt-only-auth.guard.ts`
- Create: `services/client-api/src/common/decorators/portal-auth.decorator.ts`
- Test: `services/client-api/src/common/guards/jwt-only-auth.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/client-api/src/common/guards/jwt-only-auth.guard.spec.ts
import { JwtOnlyAuthGuard } from './jwt-only-auth.guard';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtOnlyAuthGuard', () => {
  function makeContext(headers: Record<string, string>) {
    const req: any = { headers, ip: '1.2.3.4' };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it('rejects requests presenting an X-API-Key header', async () => {
    const guard = new JwtOnlyAuthGuard(
      { get: () => 'http://auth' } as unknown as ConfigService,
      { getAllAndOverride: () => null } as any,
    );
    await expect(
      guard.canActivate(makeContext({ 'x-api-key': 'cvh_live_xxx' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests with no Authorization header', async () => {
    const guard = new JwtOnlyAuthGuard(
      { get: () => 'http://auth' } as unknown as ConfigService,
      { getAllAndOverride: () => null } as any,
    );
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd services/client-api && npx jest src/common/guards/jwt-only-auth.guard.spec.ts`
Expected: FAIL — guard does not exist.

- [ ] **Step 3: Implement the guard**

Create `services/client-api/src/common/guards/jwt-only-auth.guard.ts`:

```ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import axios from 'axios';

/**
 * JWT-only authentication for self-service account endpoints (e.g. API key
 * management). Rejects API-key auth explicitly to prevent privilege
 * escalation: a programmatic API key must NOT be able to create more API
 * keys.
 */
@Injectable()
export class JwtOnlyAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtOnlyAuthGuard.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (request.headers['x-api-key']) {
      throw new UnauthorizedException(
        'This endpoint requires portal session auth, not API key auth',
      );
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing portal session — please log in',
      );
    }

    const token = authHeader.slice(7);
    try {
      const response = await axios.get(
        `${this.authServiceUrl}/auth/validate`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        },
      );
      const user = response.data?.user;
      if (!user || !user.id || !user.clientId) {
        throw new UnauthorizedException(
          'JWT does not identify a client portal user',
        );
      }
      request.user = user;
      request.clientId = Number(user.clientId);
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `JWT validation failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
```

Create `services/client-api/src/common/decorators/portal-auth.decorator.ts`:

```ts
import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtOnlyAuthGuard } from '../guards/jwt-only-auth.guard';

/**
 * Decorator for self-service account endpoints — e.g. API key management.
 * Authenticates exclusively via the portal JWT cookie path. Programmatic
 * API keys are rejected.
 */
export const PortalAuth = () =>
  applyDecorators(UseGuards(JwtOnlyAuthGuard));
```

- [ ] **Step 4: Run tests**

Run: `cd services/client-api && npx jest src/common/guards/jwt-only-auth.guard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/client-api/src/common/guards/jwt-only-auth.guard.ts services/client-api/src/common/guards/jwt-only-auth.guard.spec.ts services/client-api/src/common/decorators/portal-auth.decorator.ts
git commit -m "feat(client-api): JwtOnlyAuthGuard + PortalAuth decorator"
```

---

## Task 8: Replace `client-api/api-key` module with real management

**Files:**
- Modify: `services/client-api/src/api-key/api-key.module.ts`
- Modify: `services/client-api/src/api-key/api-key.service.ts` (full rewrite)
- Create: `services/client-api/src/api-key/api-key.controller.ts`
- Create: `services/client-api/src/api-key/dto/api-key.dto.ts`
- Test: `services/client-api/src/api-key/api-key.service.spec.ts`

- [ ] **Step 1: Define DTOs**

Create `services/client-api/src/api-key/dto/api-key.dto.ts`:

```ts
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ArrayMinSize,
  ArrayUnique,
  IsDateString,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'ID of the project this key will be scoped to.',
    example: 7,
  })
  @IsInt()
  @IsPositive()
  projectId!: number;

  @ApiProperty({
    description:
      'Granular scope strings (see /support/kb for the full list). At least one required.',
    example: ['wallets:create', 'forwarders:flush'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  scopes!: string[];

  @ApiPropertyOptional({
    description: 'Human-readable label shown in the dashboard.',
    example: 'Production settlement bot',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description:
      'List of IPv4 addresses or CIDR blocks the key may be used from. Empty = any IP.',
    example: ['203.0.113.0/24', '198.51.100.7'],
    isArray: true,
    type: String,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];

  @ApiPropertyOptional({
    description:
      'Chain IDs the key may operate on. Empty = all chains enabled for the project.',
    example: [56, 137],
    isArray: true,
    type: Number,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedChains?: number[];

  @ApiPropertyOptional({
    description:
      'ISO 8601 date when the key expires. Omit for an indefinite key.',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
```

- [ ] **Step 2: Write failing service test**

Replace the contents of `services/client-api/src/api-key/api-key.service.spec.ts` (create if missing):

```ts
import axios from 'axios';
import { ApiKeyService } from './api-key.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('ApiKeyService (client-api)', () => {
  const cfg = {
    get: (k: string, d?: any) =>
      k === 'AUTH_SERVICE_URL' ? 'http://auth' : d,
  } as any;
  const projects = {
    listProjects: jest
      .fn()
      .mockResolvedValue([{ id: 11, name: 'BrPay' }, { id: 12, name: 'Other' }]),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('list returns masked keys with project names attached', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        keys: [
          {
            id: '1',
            keyPrefix: 'cvh_live_a',
            scopes: ['wallets:read'],
            label: 'Prod',
            ipAllowlist: null,
            allowedChains: null,
            expiresAt: null,
            lastUsedAt: null,
            usageCount: 0,
            createdAt: '2026-05-08T00:00:00Z',
            projectId: 11,
          },
        ],
      },
    });
    const svc = new ApiKeyService(cfg, projects);
    const out = await svc.list(7);
    expect(out.keys).toHaveLength(1);
    expect(out.keys[0].projectName).toBe('BrPay');
  });

  it('create rejects projectId not owned by client', async () => {
    const svc = new ApiKeyService(cfg, projects);
    await expect(
      svc.create(7, { projectId: 999, scopes: ['wallets:read'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create rejects unknown scope strings', async () => {
    const svc = new ApiKeyService(cfg, projects);
    await expect(
      svc.create(7, { projectId: 11, scopes: ['totally:bogus'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('create forwards to auth-service internal endpoint and returns rawKey once', async () => {
    mockAxios.post.mockResolvedValue({
      data: {
        success: true,
        apiKey: {
          id: '5',
          key: 'cvh_live_full_secret',
          prefix: 'cvh_live_f',
          clientId: 7,
          scopes: ['wallets:read'],
        },
      },
    });
    const svc = new ApiKeyService(cfg, projects);
    const out = await svc.create(7, {
      projectId: 11,
      scopes: ['wallets:read'],
      label: 'L',
    });
    expect(out.apiKey.key).toBe('cvh_live_full_secret');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://auth/auth/internal/api-keys',
      expect.objectContaining({ clientId: 7, projectId: 11 }),
      expect.any(Object),
    );
  });

  it('revoke verifies ownership before forwarding to auth-service', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        keys: [{ id: '5', keyPrefix: 'cvh_live_f', projectId: 11 }],
      },
    });
    mockAxios.delete.mockResolvedValue({ data: { success: true } });
    const svc = new ApiKeyService(cfg, projects);
    await svc.revoke(7, 5);
    expect(mockAxios.delete).toHaveBeenCalledWith(
      'http://auth/auth/internal/api-keys/5',
      expect.any(Object),
    );
  });

  it('revoke rejects key not owned by the calling client', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, keys: [] } });
    const svc = new ApiKeyService(cfg, projects);
    await expect(svc.revoke(7, 99)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 3: Run failing test**

Run: `cd services/client-api && npx jest src/api-key/api-key.service.spec.ts`
Expected: FAIL — methods undefined.

- [ ] **Step 4: Implement the service**

Replace `services/client-api/src/api-key/api-key.service.ts`:

```ts
import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { isKnownScope } from '../common/scopes/scope-catalog';
import { ProjectService } from '../project/project.service';

export interface CreateApiKeyInput {
  projectId: number;
  scopes: string[];
  label?: string;
  ipAllowlist?: string[];
  allowedChains?: number[];
  expiresAt?: string;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly projectService: ProjectService,
  ) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  private get internalHeaders() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async list(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.authServiceUrl}/auth/internal/api-keys/by-client/${clientId}`,
        { headers: this.internalHeaders, timeout: 10_000 },
      );
      const projects = await this.projectService.listProjects(clientId);
      const projectNameById = new Map(
        projects.map((p: any) => [Number(p.id), p.name]),
      );
      const keys = (data?.keys ?? []).map((k: any) => ({
        ...k,
        projectName: k.projectId
          ? projectNameById.get(Number(k.projectId)) ?? null
          : null,
      }));
      return { keys };
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data?.message ?? 'auth-service error',
          err.response.status,
        );
      }
      this.logger.error(`Failed to list API keys: ${err.message}`);
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }

  async create(clientId: number, input: CreateApiKeyInput) {
    // 1. validate every scope
    for (const s of input.scopes) {
      if (!isKnownScope(s)) {
        throw new BadRequestException(`Unknown scope: ${s}`);
      }
    }
    // 2. verify projectId belongs to this client
    const projects = await this.projectService.listProjects(clientId);
    const owned = projects.some((p: any) => Number(p.id) === input.projectId);
    if (!owned) {
      throw new ForbiddenException(
        `Project ${input.projectId} does not belong to client ${clientId}`,
      );
    }
    // 3. forward to auth-service
    try {
      const { data } = await axios.post(
        `${this.authServiceUrl}/auth/internal/api-keys`,
        {
          clientId,
          projectId: input.projectId,
          scopes: input.scopes,
          label: input.label,
          ipAllowlist: input.ipAllowlist,
          allowedChains: input.allowedChains,
          expiresAt: input.expiresAt,
        },
        { headers: this.internalHeaders, timeout: 10_000 },
      );
      return data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data?.message ?? 'auth-service error',
          err.response.status,
        );
      }
      this.logger.error(`Failed to create API key: ${err.message}`);
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }

  async revoke(clientId: number, keyId: number) {
    // Ownership check: the key MUST belong to this client.
    const { keys } = await this.list(clientId);
    const owned = keys.some((k: any) => Number(k.id) === keyId);
    if (!owned) {
      throw new ForbiddenException(
        `API key ${keyId} does not belong to client ${clientId}`,
      );
    }
    try {
      await axios.delete(
        `${this.authServiceUrl}/auth/internal/api-keys/${keyId}`,
        { headers: this.internalHeaders, timeout: 10_000 },
      );
      return { success: true };
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data?.message ?? 'auth-service error',
          err.response.status,
        );
      }
      this.logger.error(`Failed to revoke API key: ${err.message}`);
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }
}
```

- [ ] **Step 5: Implement the controller**

Create `services/client-api/src/api-key/api-key.controller.ts`:

```ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { PortalAuth } from '../common/decorators/portal-auth.decorator';

@ApiTags('API Keys')
@Controller('client/v1/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @PortalAuth()
  @ApiOperation({
    summary: 'List API keys for the current client (masked)',
  })
  async list(@Req() req: Request) {
    const clientId = (req as any).clientId as number;
    return this.apiKeyService.list(clientId);
  }

  @Post()
  @PortalAuth()
  @ApiOperation({
    summary: 'Create a new API key for a project. Returns the raw key once.',
  })
  async create(@Req() req: Request, @Body() dto: CreateApiKeyDto) {
    const clientId = (req as any).clientId as number;
    return this.apiKeyService.create(clientId, dto);
  }

  @Delete(':id')
  @PortalAuth()
  @ApiOperation({ summary: 'Revoke an API key.' })
  async revoke(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const clientId = (req as any).clientId as number;
    return this.apiKeyService.revoke(clientId, id);
  }
}
```

- [ ] **Step 6: Wire the module**

Replace `services/client-api/src/api-key/api-key.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [ProjectModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
```

Verify `services/client-api/src/app.module.ts` already imports `ApiKeyModule` (it does — no change needed). If not, add it to the `imports` array.

`ProjectService.listProjects(clientId)` already exists (returns `ProjectSummary[]` with `id: string`). No change needed in `project.service.ts`. The `ApiKeyService.create` and `.list` methods above call `this.projectService.listProjects(clientId)` and compare `Number(p.id) === input.projectId`. Confirm `ProjectModule` exports `ProjectService` (it should — `ProjectController` already injects it). If the export is missing, add `exports: [ProjectService]` to the `@Module` decorator in `project.module.ts`.

- [ ] **Step 7: Run tests**

Run: `cd services/client-api && npx jest src/api-key/`
Expected: PASS — all 6 service tests.

- [ ] **Step 8: Commit**

```bash
git add services/client-api/src/api-key/ services/client-api/src/project/project.service.ts
git commit -m "feat(client-api): self-service API key management endpoints"
```

---

## Task 9: Re-decorate Wallets, Forwarders, Deposits controllers

**Files:**
- Modify: `services/client-api/src/wallet/wallet.controller.ts`
- Modify: `services/client-api/src/flush/flush.controller.ts`
- Modify: `services/client-api/src/deposit/deposit.controller.ts`

- [ ] **Step 1: Replace decorators in `wallet.controller.ts`**

For every `@ClientAuth('read')` on a GET handler in `services/client-api/src/wallet/wallet.controller.ts`, change to `@ClientAuth('wallets:read')`. For the wallet creation/deploy POST handler currently under `@ClientAuth('write')` (or similar), change to `@ClientAuth('wallets:create')`.

Search inside the file for `@ClientAuth('` and replace each one with the granular equivalent. The set of replacements:

```
@ClientAuth('read')   → @ClientAuth('wallets:read')
@ClientAuth('write')  → @ClientAuth('wallets:create')
```

Update each `@ApiOperation({ summary: ... })` to mention the new scope at the end of the summary, e.g.:

```ts
@ApiOperation({ summary: 'List wallets for the client (scope: wallets:read)' })
```

- [ ] **Step 2: Replace decorators in `flush.controller.ts`**

```
@ClientAuth('read')   → @ClientAuth('forwarders:read')
@ClientAuth('write')  → @ClientAuth('forwarders:flush')
```

- [ ] **Step 3: Replace decorators in `deposit.controller.ts`**

Inspect each handler. Routes that read deposits are tagged with `@ClientAuth('read')` → `@ClientAuth('deposits:read')`. The `@ClientAuth('write')` handlers in this file are for forwarder management; map those to `@ClientAuth('forwarders:flush')` (the deposit "create-forwarder" is part of the forwarder lifecycle).

If a handler genuinely creates a deposit registration that isn't a forwarder action (rare), use `@ClientAuth('deposits:read')` for reads and decide per route. Re-read each handler's purpose; this re-tagging must reflect **what the handler does**, not just keep the old level.

- [ ] **Step 4: Run client-api tests**

Run: `cd services/client-api && npx jest`
Expected: PASS — existing tests for these modules continue to pass because the legacy macro expansion in Task 6 maps old keys forward.

- [ ] **Step 5: Commit**

```bash
git add services/client-api/src/wallet/ services/client-api/src/flush/ services/client-api/src/deposit/
git commit -m "feat(client-api): granular scopes for wallets, forwarders, deposits"
```

---

## Task 10: Re-decorate Withdrawals (hot vs gas-tank split)

**Files:**
- Modify: `services/client-api/src/withdrawal/withdrawal.controller.ts`

- [ ] **Step 1: Identify the create-withdrawal handler**

Open `services/client-api/src/withdrawal/withdrawal.controller.ts`. Find the POST handler for creating a withdrawal. It already inspects `dto.sourceWallet` ("hot" vs "gas_tank"). The decorator currently is `@ClientAuth('write')` (or `'withdraw'`).

- [ ] **Step 2: Add a custom guard for the source-wallet split**

Replace the create handler's decorator with TWO scope alternatives so that any one of them grants access:

```ts
@Post()
@ClientAuth('withdrawals:hot', 'withdrawals:gas-tank')
async createWithdrawal(...)
```

Inside the handler, after the body is validated, enforce the precise source-vs-scope match. Pattern:

```ts
import { ForbiddenException } from '@nestjs/common';

// ... inside the handler body:
const scopes = (req as any).scopes as string[]; // set by the guard
const expanded = expandLegacyScopes(scopes); // import from common/scopes/scope-catalog
const required = dto.sourceWallet === 'gas_tank'
  ? 'withdrawals:gas-tank'
  : 'withdrawals:hot';
if (!expanded.includes(required)) {
  throw new ForbiddenException(
    `This key cannot withdraw from ${dto.sourceWallet ?? 'hot'} (missing scope ${required})`,
  );
}
```

(Add the `expandLegacyScopes` and `ForbiddenException` imports at the top of the file. Inject `req: Request` via `@Req()` if not already.)

- [ ] **Step 3: Re-decorate read handlers**

```
GET    @ClientAuth('read')  → @ClientAuth('withdrawals:read')
```

(Approve/cancel handlers are re-checks of an existing pending withdrawal — keep as `@ClientAuth('withdrawals:hot', 'withdrawals:gas-tank')` so any withdrawal-capable key can finalize.)

- [ ] **Step 4: Update the homologation suite IF it relies on the `withdraw` legacy macro**

Open `docs/superpowers/automation/suites/api.ts`. Search for any test API key declared with `scopes: ['withdraw']`. Leave it as-is — the legacy macro keeps working through expansion (Task 6 covers this).

- [ ] **Step 5: Run tests**

Run: `cd services/client-api && npx jest src/withdrawal/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/client-api/src/withdrawal/
git commit -m "feat(client-api): split withdrawal scope into withdrawals:hot vs withdrawals:gas-tank"
```

---

## Task 11: Re-decorate Address Book / Address Groups / Webhooks

**Files:**
- Modify: `services/client-api/src/address-book/address-book.controller.ts`
- Modify: `services/client-api/src/address-group/address-group.controller.ts`
- Modify: `services/client-api/src/webhook/webhook.controller.ts`

- [ ] **Step 1: Apply the mapping**

In each file, replace decorators per this table. Read each handler's purpose first to confirm the mapping fits.

| File | Old | New |
|---|---|---|
| address-book | `@ClientAuth('read')` | `@ClientAuth('address-book:read')` |
| address-book | `@ClientAuth('write')` / `@ClientAuthWithProject('write')` | `@ClientAuth('address-book:write')` / `@ClientAuthWithProject('address-book:write')` |
| address-group | `@ClientAuth('read')` | `@ClientAuth('address-groups:read')` |
| address-group | `@ClientAuth('write')` | `@ClientAuth('address-groups:write')` |
| webhook | `@ClientAuth('read')` | `@ClientAuth('webhooks:read')` |
| webhook | `@ClientAuth('write')` | `@ClientAuth('webhooks:write')` |

- [ ] **Step 2: Run tests**

Run: `cd services/client-api && npx jest src/address-book/ src/address-group/ src/webhook/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add services/client-api/src/address-book/ services/client-api/src/address-group/ services/client-api/src/webhook/
git commit -m "feat(client-api): granular scopes for address-book, address-groups, webhooks"
```

---

## Task 12: Re-decorate Gas Tanks / Co-sign / Security

**Files:**
- Modify: `services/client-api/src/gas-tanks/gas-tanks.controller.ts`
- Modify: `services/client-api/src/co-sign/co-sign.controller.ts`
- Modify: `services/client-api/src/security/security.controller.ts`

- [ ] **Step 1: Apply the mapping**

| File | Old | New |
|---|---|---|
| gas-tanks | `@ClientAuthWithProject('read')` | `@ClientAuthWithProject('gas-tanks:read')` |
| gas-tanks | `@ClientAuthWithProject('write')` | `@ClientAuthWithProject('gas-tanks:write')` |
| co-sign | `@ClientAuthWithProject('read')` | `@ClientAuthWithProject('co-sign:read')` |
| co-sign | `@ClientAuth('write')` | `@ClientAuth('co-sign:write')` |
| security | `@ClientAuth('read')` | `@ClientAuth('security:read')` |
| security | `@ClientAuth('write')` | `@ClientAuth('security:write')` |

- [ ] **Step 2: Run tests**

Run: `cd services/client-api && npx jest src/gas-tanks/ src/co-sign/ src/security/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add services/client-api/src/gas-tanks/ services/client-api/src/co-sign/ services/client-api/src/security/
git commit -m "feat(client-api): granular scopes for gas-tanks, co-sign, security"
```

---

## Task 13: Re-decorate Notifications, Project, Project-Setup, Deploy-Trace, Export, Token, Chain

**Files:**
- Modify: `services/client-api/src/notification-rules/notification-rules.controller.ts`
- Modify: `services/client-api/src/project/project.controller.ts`
- Modify: `services/client-api/src/project-setup/project-setup.controller.ts`
- Modify: `services/client-api/src/deploy-trace/deploy-trace.controller.ts`
- Modify: `services/client-api/src/export/export.controller.ts`
- Modify: `services/client-api/src/token/token.controller.ts`
- Modify: `services/client-api/src/chain/chain.controller.ts`

- [ ] **Step 1: Apply the mapping**

| File | Old | New |
|---|---|---|
| notification-rules | `@ClientAuth('read')` | `@ClientAuth('notifications:read')` |
| notification-rules | `@ClientAuth('write')` | `@ClientAuth('notifications:write')` |
| project | `@ClientAuth('read')` | `@ClientAuth('projects:read')` |
| project-setup | `@ClientAuth('read')` | `@ClientAuth('project-setup:read')` |
| project-setup | `@ClientAuth('write')` | `@ClientAuth('project-setup:write')` |
| deploy-trace | `@ClientAuth('read')` | `@ClientAuth('deploy-trace:read')` |
| export | `@ClientAuth('read')` | `@ClientAuth('export:read')` |
| token | `@ClientAuth('read')` | `@ClientAuth('tokens:read')` |
| chain | `@ClientAuth('read')` | `@ClientAuth('chains:read')` |

- [ ] **Step 2: Run all client-api tests**

Run: `cd services/client-api && npx jest`
Expected: PASS — full suite.

- [ ] **Step 3: Commit**

```bash
git add services/client-api/src/notification-rules/ services/client-api/src/project/ services/client-api/src/project-setup/ services/client-api/src/deploy-trace/ services/client-api/src/export/ services/client-api/src/token/ services/client-api/src/chain/
git commit -m "feat(client-api): granular scopes across remaining controllers"
```

---

## Task 14: Front-end CIDR helper

**Files:**
- Create: `apps/client/lib/cidr.ts`
- Test: `apps/client/lib/__tests__/cidr.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/lib/__tests__/cidr.test.ts
import { isValidIpOrCidr } from './cidr';

describe('isValidIpOrCidr', () => {
  it.each([
    ['1.2.3.4', true],
    ['1.2.3.4/24', true],
    ['255.255.255.255', true],
    ['0.0.0.0/0', true],
    ['', false],
    ['1.2.3', false],
    ['1.2.3.4.5', false],
    ['1.2.3.4/33', false],
    ['1.2.3.4/-1', false],
    ['1.2.3.999', false],
    ['abc.def.ghi.jkl', false],
    ['1.2.3.4/abc', false],
  ])('%s → %s', (input, expected) => {
    expect(isValidIpOrCidr(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd apps/client && npx jest lib/__tests__/cidr.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/client/lib/cidr.ts`:

```ts
export function isValidIpOrCidr(value: string): boolean {
  if (!value) return false;
  const [addr, prefixStr] = value.includes('/')
    ? value.split('/')
    : [value, '32'];
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return false;
    const v = Number(p);
    if (v < 0 || v > 255) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/client && npx jest lib/__tests__/cidr.test.ts`
Expected: PASS — all parameterized cases.

- [ ] **Step 5: Commit**

```bash
git add apps/client/lib/cidr.ts apps/client/lib/__tests__/cidr.test.ts
git commit -m "feat(client): IP/CIDR validation helper"
```

---

## Task 15: Front-end scope catalog

**Files:**
- Create: `apps/client/lib/scope-catalog.ts`

- [ ] **Step 1: Implement the catalog**

Create `apps/client/lib/scope-catalog.ts`:

```ts
export type Sensitivity = 'standard' | 'sensitive';

export interface ScopeDef {
  scope: string;
  group: string;
  label: string;
  helper: string;
  sensitivity: Sensitivity;
}

export const SCOPE_GROUPS = [
  'Wallets',
  'Forwarders',
  'Address Book',
  'Address Groups',
  'Withdrawals',
  'Deposits',
  'Webhooks',
  'Gas Tanks',
  'Co-sign',
  'Tokens & Chains',
  'Projects',
  'Notifications',
  'Security',
  'Deploy Trace',
  'Export',
] as const;

export const SCOPE_CATALOG: ScopeDef[] = [
  { scope: 'wallets:read', group: 'Wallets', label: 'wallets:read', helper: 'List wallets, balances, addresses.', sensitivity: 'standard' },
  { scope: 'wallets:create', group: 'Wallets', label: 'wallets:create', helper: 'Generate / deploy new wallet contracts.', sensitivity: 'standard' },
  { scope: 'forwarders:read', group: 'Forwarders', label: 'forwarders:read', helper: 'List deposit forwarders and state.', sensitivity: 'standard' },
  { scope: 'forwarders:flush', group: 'Forwarders', label: 'forwarders:flush', helper: 'Flush deposit forwarders to hot wallet.', sensitivity: 'sensitive' },
  { scope: 'address-book:read', group: 'Address Book', label: 'address-book:read', helper: 'List whitelisted withdrawal destinations.', sensitivity: 'standard' },
  { scope: 'address-book:write', group: 'Address Book', label: 'address-book:write', helper: 'Register/update/delete withdrawal destinations.', sensitivity: 'sensitive' },
  { scope: 'address-groups:read', group: 'Address Groups', label: 'address-groups:read', helper: 'List address groups.', sensitivity: 'standard' },
  { scope: 'address-groups:write', group: 'Address Groups', label: 'address-groups:write', helper: 'Create / provision address groups.', sensitivity: 'standard' },
  { scope: 'withdrawals:read', group: 'Withdrawals', label: 'withdrawals:read', helper: 'List withdrawal history and details.', sensitivity: 'standard' },
  { scope: 'withdrawals:hot', group: 'Withdrawals', label: 'withdrawals:hot', helper: 'Initiate withdrawal from Hot Wallet (multisig).', sensitivity: 'sensitive' },
  { scope: 'withdrawals:gas-tank', group: 'Withdrawals', label: 'withdrawals:gas-tank', helper: 'Initiate withdrawal from Gas Tank (EOA).', sensitivity: 'sensitive' },
  { scope: 'deposits:read', group: 'Deposits', label: 'deposits:read', helper: 'List inbound deposits.', sensitivity: 'standard' },
  { scope: 'webhooks:read', group: 'Webhooks', label: 'webhooks:read', helper: 'List webhook subscriptions and deliveries.', sensitivity: 'standard' },
  { scope: 'webhooks:write', group: 'Webhooks', label: 'webhooks:write', helper: 'Create/update/delete webhooks.', sensitivity: 'standard' },
  { scope: 'gas-tanks:read', group: 'Gas Tanks', label: 'gas-tanks:read', helper: 'List gas tanks, balances, alert config.', sensitivity: 'standard' },
  { scope: 'gas-tanks:write', group: 'Gas Tanks', label: 'gas-tanks:write', helper: 'Update alert config; export keystore.', sensitivity: 'sensitive' },
  { scope: 'co-sign:read', group: 'Co-sign', label: 'co-sign:read', helper: 'List pending co-sign operations.', sensitivity: 'standard' },
  { scope: 'co-sign:write', group: 'Co-sign', label: 'co-sign:write', helper: 'Submit a co-signature.', sensitivity: 'standard' },
  { scope: 'tokens:read', group: 'Tokens & Chains', label: 'tokens:read', helper: 'List supported tokens per chain.', sensitivity: 'standard' },
  { scope: 'chains:read', group: 'Tokens & Chains', label: 'chains:read', helper: 'List supported chains.', sensitivity: 'standard' },
  { scope: 'projects:read', group: 'Projects', label: 'projects:read', helper: 'Read project metadata.', sensitivity: 'standard' },
  { scope: 'project-setup:read', group: 'Projects', label: 'project-setup:read', helper: 'Read project setup state.', sensitivity: 'standard' },
  { scope: 'project-setup:write', group: 'Projects', label: 'project-setup:write', helper: 'Modify project setup, enable/disable chains.', sensitivity: 'standard' },
  { scope: 'notifications:read', group: 'Notifications', label: 'notifications:read', helper: 'Read notification rules.', sensitivity: 'standard' },
  { scope: 'notifications:write', group: 'Notifications', label: 'notifications:write', helper: 'Create/update/delete notification rules.', sensitivity: 'standard' },
  { scope: 'security:read', group: 'Security', label: 'security:read', helper: 'Read security settings.', sensitivity: 'standard' },
  { scope: 'security:write', group: 'Security', label: 'security:write', helper: 'Change custody mode; toggle safe mode.', sensitivity: 'sensitive' },
  { scope: 'deploy-trace:read', group: 'Deploy Trace', label: 'deploy-trace:read', helper: 'Read on-chain deploy traces.', sensitivity: 'standard' },
  { scope: 'export:read', group: 'Export', label: 'export:read', helper: 'Generate exports (CSV/JSON).', sensitivity: 'standard' },
];

export const ALL_READ_SCOPES = SCOPE_CATALOG
  .filter((s) => s.scope.endsWith(':read'))
  .map((s) => s.scope);
```

- [ ] **Step 2: Commit (no test — pure data)**

```bash
git add apps/client/lib/scope-catalog.ts
git commit -m "feat(client): scope catalog mirror for portal UI"
```

---

## Task 16: `IpChipInput` component

**Files:**
- Create: `apps/client/components/api-keys/ip-chip-input.tsx`

- [ ] **Step 1: Implement**

Create `apps/client/components/api-keys/ip-chip-input.tsx`:

```tsx
"use client";

import { useState } from "react";
import { isValidIpOrCidr } from "@/lib/cidr";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function IpChipInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!isValidIpOrCidr(trimmed)) {
      setErr(`"${trimmed}" is not a valid IP or CIDR`);
      return;
    }
    if (value.includes(trimmed)) {
      setErr(`"${trimmed}" already added`);
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
    setErr(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 p-2 bg-surface-input border border-border-default rounded-input min-h-[44px]">
        {value.map((ip) => (
          <span
            key={ip}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-button bg-surface-card border border-border-subtle text-text-primary font-mono text-micro"
          >
            {ip}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== ip))}
              aria-label={`Remove ${ip}`}
              className="text-text-muted hover:text-status-error"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={placeholder ?? "Type IP or CIDR, then press Enter"}
          className="flex-1 min-w-[140px] bg-transparent outline-none font-mono text-body text-text-primary placeholder:text-text-muted"
        />
      </div>
      {err && (
        <p className="mt-1 text-micro text-status-error font-display">{err}</p>
      )}
      {value.length === 0 && !draft && !err && (
        <p className="mt-1 text-micro text-text-muted font-display">
          Empty list = any IP allowed.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/components/api-keys/ip-chip-input.tsx
git commit -m "feat(client): IpChipInput component"
```

---

## Task 17: `ScopePicker` component

**Files:**
- Create: `apps/client/components/api-keys/scope-picker.tsx`

- [ ] **Step 1: Implement**

Create `apps/client/components/api-keys/scope-picker.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { SCOPE_CATALOG, ALL_READ_SCOPES } from "@/lib/scope-catalog";

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

export function ScopePicker({ selected, onChange }: Props) {
  const groups = useMemo(() => {
    const out = new Map<string, typeof SCOPE_CATALOG>();
    for (const s of SCOPE_CATALOG) {
      const arr = out.get(s.group) ?? [];
      arr.push(s);
      out.set(s.group, arr);
    }
    return [...out.entries()];
  }, []);

  const readOnly =
    ALL_READ_SCOPES.every((s) => selected.includes(s)) &&
    selected.every((s) => ALL_READ_SCOPES.includes(s));

  const toggleReadOnly = () => {
    onChange(readOnly ? [] : [...ALL_READ_SCOPES]);
  };

  const toggle = (scope: string) => {
    if (readOnly) return; // locked while read-only mode is on
    if (selected.includes(scope)) {
      onChange(selected.filter((s) => s !== scope));
    } else {
      onChange([...selected, scope]);
    }
  };

  const hasSensitive = selected.some(
    (s) => SCOPE_CATALOG.find((c) => c.scope === s)?.sensitivity === "sensitive",
  );

  return (
    <div>
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={readOnly}
          onChange={toggleReadOnly}
          style={{ accentColor: "var(--accent-primary)" }}
        />
        <span className="text-caption font-display font-semibold">
          Read-only key
        </span>
        <span className="text-micro text-text-muted">
          (selects every <code className="font-mono">*:read</code> at once and locks writes)
        </span>
      </label>

      {hasSensitive && (
        <div className="mb-3 p-2 rounded-card bg-status-warning-subtle border border-status-warning text-caption font-display">
          This key can move funds — combine with an IP allowlist on the next step.
        </div>
      )}

      <div className="grid gap-3">
        {groups.map(([group, scopes]) => (
          <div key={group} className="border border-border-subtle rounded-card p-3">
            <div className="text-caption font-semibold font-display mb-2">{group}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {scopes.map((s) => (
                <label
                  key={s.scope}
                  className={`flex items-start gap-2 p-2 rounded-input border cursor-pointer transition-colors duration-fast ${
                    selected.includes(s.scope)
                      ? "border-accent-primary bg-surface-card"
                      : "border-border-subtle hover:border-border-default"
                  } ${readOnly && !s.scope.endsWith(":read") ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(s.scope)}
                    onChange={() => toggle(s.scope)}
                    disabled={readOnly && !s.scope.endsWith(":read")}
                    style={{ accentColor: "var(--accent-primary)" }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-micro text-text-primary flex items-center gap-1.5">
                      {s.scope}
                      {s.sensitivity === "sensitive" && (
                        <span title="Sensitive scope" aria-label="Sensitive scope" className="text-status-error">🛡</span>
                      )}
                    </div>
                    <div className="text-micro text-text-muted">{s.helper}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/components/api-keys/scope-picker.tsx
git commit -m "feat(client): ScopePicker grouped permissions component"
```

---

## Task 18: `OneTimeKeyModal` and `RevokeConfirmModal`

**Files:**
- Create: `apps/client/components/api-keys/one-time-key-modal.tsx`
- Create: `apps/client/components/api-keys/revoke-confirm-modal.tsx`

- [ ] **Step 1: Implement OneTimeKeyModal**

Create `apps/client/components/api-keys/one-time-key-modal.tsx`:

```tsx
"use client";

import { useState } from "react";

interface Props {
  rawKey: string;
  onClose: () => void;
}

export function OneTimeKeyModal({ rawKey, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otk-title"
    >
      <div className="bg-surface-card border-2 border-status-warning rounded-card p-6 max-w-2xl w-full mx-4 shadow-glow">
        <h2 id="otk-title" className="text-heading font-display text-status-warning mb-1">
          Save your new API key
        </h2>
        <p className="text-caption text-text-muted font-display mb-4">
          This is the only time the full key will be displayed.
        </p>

        <div className="bg-surface-page border border-border-subtle rounded-input p-3 mb-3">
          <code className="font-mono text-code text-accent-primary break-all select-all">
            {rawKey}
          </code>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center px-3 py-1.5 rounded-button font-display text-caption font-semibold transition-colors duration-fast ${
              copied
                ? "bg-status-success-subtle text-status-success border border-status-success"
                : "bg-accent-primary text-accent-text hover:bg-accent-hover"
            }`}
          >
            {copied ? "Copied!" : "Copy key"}
          </button>
        </div>

        <label className="flex items-center gap-2 text-caption font-display mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <span>I have stored this key in a secure location</span>
        </label>

        <button
          type="button"
          disabled={!confirmed}
          onClick={onClose}
          className="w-full px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done — close
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement RevokeConfirmModal**

Create `apps/client/components/api-keys/revoke-confirm-modal.tsx`:

```tsx
"use client";

interface Props {
  prefix: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

export function RevokeConfirmModal({ prefix, onCancel, onConfirm, busy }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-surface-card border border-status-error rounded-card p-6 max-w-md w-full mx-4">
        <h3 className="text-subheading font-display text-text-primary mb-2">
          Revoke {prefix}…?
        </h3>
        <p className="text-caption text-text-muted font-display mb-4">
          This cannot be undone. Any integrations using this key will start
          failing immediately.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-status-error text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Revoking…" : "Revoke key"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/components/api-keys/one-time-key-modal.tsx apps/client/components/api-keys/revoke-confirm-modal.tsx
git commit -m "feat(client): OneTimeKeyModal and RevokeConfirmModal"
```

---

## Task 19: `CreateKeyWizard`

**Files:**
- Create: `apps/client/components/api-keys/create-key-wizard.tsx`

- [ ] **Step 1: Implement**

Create `apps/client/components/api-keys/create-key-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ScopePicker } from "./scope-picker";
import { IpChipInput } from "./ip-chip-input";

interface Project {
  id: number;
  name: string;
}

interface Props {
  projects: Project[];
  onCancel: () => void;
  onCreate: (input: {
    label: string;
    projectId: number;
    scopes: string[];
    ipAllowlist: string[];
    expiresAt?: string;
  }) => Promise<void>;
  submitting?: boolean;
  submitError?: string | null;
}

type ExpiryMode = "days" | "date" | "indefinite";

export function CreateKeyWizard({ projects, onCancel, onCreate, submitting, submitError }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [label, setLabel] = useState("");
  const [projectId, setProjectId] = useState<number | "">(
    projects.length === 1 ? projects[0].id : "",
  );
  const [scopes, setScopes] = useState<string[]>([]);
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("days");
  const [expiryDays, setExpiryDays] = useState<number>(90);
  const [expiryDate, setExpiryDate] = useState<string>("");

  const stepValid =
    (step === 1 && label.trim().length > 0 && projectId !== "") ||
    (step === 2 && scopes.length > 0) ||
    step === 3 ||
    step === 4;

  const computeExpiresAt = (): string | undefined => {
    if (expiryMode === "indefinite") return undefined;
    if (expiryMode === "date" && expiryDate) {
      return new Date(expiryDate + "T23:59:59Z").toISOString();
    }
    if (expiryMode === "days" && expiryDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + expiryDays);
      return d.toISOString();
    }
    return undefined;
  };

  const submit = async () => {
    if (projectId === "") return;
    await onCreate({
      label: label.trim(),
      projectId,
      scopes,
      ipAllowlist,
      expiresAt: computeExpiresAt(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40" role="dialog" aria-modal="true">
      <div className="bg-surface-card border border-border-default rounded-card max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-heading font-display text-text-primary">Create API Key</h2>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-micro font-display font-semibold ${
                  step === n
                    ? "bg-accent-primary text-accent-text"
                    : step > n
                      ? "bg-status-success-subtle text-status-success"
                      : "bg-surface-input text-text-muted"
                }`}
              >
                {n}
              </span>
            ))}
          </div>
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="grid gap-4">
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Production API"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus"
                />
              </div>
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus"
                >
                  <option value="">— Select —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && <ScopePicker selected={scopes} onChange={setScopes} />}

          {step === 3 && (
            <div className="grid gap-5">
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">IP allowlist</label>
                <IpChipInput value={ipAllowlist} onChange={setIpAllowlist} />
              </div>
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">Expiration</label>
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="expmode" checked={expiryMode === "days"} onChange={() => setExpiryMode("days")} style={{ accentColor: "var(--accent-primary)" }} />
                    <span className="text-caption font-display">In</span>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(Math.max(1, Number(e.target.value) || 1))}
                      disabled={expiryMode !== "days"}
                      className="w-20 bg-surface-input border border-border-default rounded-input px-2 py-1 text-text-primary font-display text-body outline-none disabled:opacity-50"
                    />
                    <span className="text-caption font-display">days</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="expmode" checked={expiryMode === "date"} onChange={() => setExpiryMode("date")} style={{ accentColor: "var(--accent-primary)" }} />
                    <span className="text-caption font-display">On a specific date</span>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      disabled={expiryMode !== "date"}
                      className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-text-primary font-display text-body outline-none disabled:opacity-50"
                    />
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="expmode" checked={expiryMode === "indefinite"} onChange={() => setExpiryMode("indefinite")} style={{ accentColor: "var(--accent-primary)" }} />
                    <span className="text-caption font-display">Indefinite</span>
                    <span className="text-micro text-text-muted">(not recommended for production)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-2 text-caption font-display">
              <div><span className="text-text-muted">Label:</span> <strong className="text-text-primary">{label}</strong></div>
              <div><span className="text-text-muted">Project:</span> <strong className="text-text-primary">{projects.find((p) => p.id === projectId)?.name}</strong></div>
              <div><span className="text-text-muted">Scopes:</span> {scopes.map((s) => <code key={s} className="font-mono text-micro mr-1.5 px-1.5 py-0.5 rounded bg-surface-input">{s}</code>)}</div>
              <div><span className="text-text-muted">IPs:</span> {ipAllowlist.length === 0 ? <em className="text-text-muted">Any</em> : ipAllowlist.map((i) => <code key={i} className="font-mono text-micro mr-1.5 px-1.5 py-0.5 rounded bg-surface-input">{i}</code>)}</div>
              <div><span className="text-text-muted">Expiration:</span> <strong className="text-text-primary">{expiryMode === "indefinite" ? "Indefinite" : expiryMode === "date" ? expiryDate || "(no date)" : `In ${expiryDays} days`}</strong></div>
              {submitError && <div className="mt-2 p-2 rounded bg-status-error-subtle border border-status-error text-status-error">{submitError}</div>}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border-subtle flex justify-between">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep((s) => (s - 1) as any)} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
                Back
              </button>
            )}
            {step < 4 ? (
              <button type="button" disabled={!stepValid} onClick={() => setStep((s) => (s + 1) as any)} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50">
                Continue
              </button>
            ) : (
              <button type="button" disabled={submitting} onClick={submit} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 inline-flex items-center gap-2">
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create Key
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/components/api-keys/create-key-wizard.tsx
git commit -m "feat(client): CreateKeyWizard 4-step modal"
```

---

## Task 20: Rewrite `apps/client/app/api-keys/page.tsx`

**Files:**
- Modify: `apps/client/app/api-keys/page.tsx` (full rewrite)

- [ ] **Step 1: Replace the page contents**

Overwrite `apps/client/app/api-keys/page.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { clientFetch } from "@/lib/api";
import { CreateKeyWizard } from "@/components/api-keys/create-key-wizard";
import { OneTimeKeyModal } from "@/components/api-keys/one-time-key-modal";
import { RevokeConfirmModal } from "@/components/api-keys/revoke-confirm-modal";

interface ApiKeyItem {
  id: string;
  keyPrefix: string;
  label: string | null;
  projectId: number;
  projectName: string | null;
  scopes: string[];
  ipAllowlist: string[] | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
}

interface Project {
  id: number;
  name: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}

function expiryLabel(iso: string | null): { text: string; tone: "muted" | "warning" | "error" | "default" } {
  if (!iso) return { text: "Indefinite", tone: "muted" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "Expired", tone: "error" };
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 7) return { text: `In ${days}d`, tone: "warning" };
  return { text: `In ${days}d`, tone: "default" };
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [keysRes, projectsRes] = await Promise.all([
        clientFetch<{ keys: ApiKeyItem[] }>("/v1/api-keys"),
        clientFetch<{ projects: Project[] }>("/v1/projects"),
      ]);
      setKeys(keysRes.keys ?? []);
      setProjects(projectsRes.projects ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreate = async (input: {
    label: string;
    projectId: number;
    scopes: string[];
    ipAllowlist: string[];
    expiresAt?: string;
  }) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await clientFetch<{ apiKey: { key: string } }>("/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          projectId: input.projectId,
          scopes: input.scopes,
          label: input.label,
          ipAllowlist: input.ipAllowlist.length > 0 ? input.ipAllowlist : undefined,
          expiresAt: input.expiresAt,
        }),
      });
      setShowWizard(false);
      setRevealedKey(res.apiKey?.key ?? null);
      // Refresh list in background
      const keysRes = await clientFetch<{ keys: ApiKeyItem[] }>("/v1/api-keys");
      setKeys(keysRes.keys ?? []);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create key");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await clientFetch(`/v1/api-keys/${revokeTarget.id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch (err: any) {
      setError(err.message || "Failed to revoke key");
    } finally {
      setRevokeBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading API keys…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">API Keys</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Manage API keys for programmatic access to CryptoVaultHub.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover"
        >
          + Create Key
        </button>
      </div>

      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-section-gap text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

      <DataTable headers={["Key", "Label", "Project", "Scopes", "IPs", "Expires", "Last used", "Actions"]}>
        {keys.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-[14px] py-6 text-center text-text-muted font-display">
              No API keys yet
            </td>
          </tr>
        ) : (
          keys.map((k) => {
            const exp = expiryLabel(k.expiresAt);
            const ips = k.ipAllowlist ?? [];
            return (
              <tr key={k.id} className="hover:bg-surface-hover transition-colors duration-fast">
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">{k.keyPrefix}…</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-semibold font-display">{k.label || "—"}</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-display">{k.projectName || `#${k.projectId}`}</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.slice(0, 3).map((s) => <Badge key={s} variant="accent" className="text-[9px]">{s}</Badge>)}
                    {k.scopes.length > 3 && <Badge variant="default" className="text-[9px]" title={k.scopes.join(", ")}>+{k.scopes.length - 3}</Badge>}
                  </div>
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-micro">
                  {ips.length === 0 ? <span className="text-text-muted">Any</span> : ips.length === 1 ? ips[0] : `${ips[0]} +${ips.length - 1}`}
                </td>
                <td className={`px-[14px] py-2.5 border-b border-border-subtle text-micro font-display ${exp.tone === "error" ? "text-status-error" : exp.tone === "warning" ? "text-status-warning" : exp.tone === "muted" ? "text-text-muted" : "text-text-primary"}`}>
                  {exp.text}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-micro font-display text-text-muted">{relativeTime(k.lastUsedAt)}</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(k)}
                    className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold bg-status-error-subtle text-status-error border border-status-error-subtle hover:border-status-error"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </DataTable>

      <div className="mt-section-gap p-3 bg-surface-elevated rounded-input text-caption text-text-muted font-display border border-border-subtle">
        <span className="font-semibold text-status-warning">Security note:</span> API keys provide programmatic access to your CryptoVaultHub account. Use the minimum required scopes, restrict by IP/CIDR for production, and rotate keys periodically.
      </div>

      {showWizard && (
        <CreateKeyWizard
          projects={projects}
          onCancel={() => { setShowWizard(false); setSubmitError(null); }}
          onCreate={handleCreate}
          submitting={submitting}
          submitError={submitError}
        />
      )}
      {revealedKey && (
        <OneTimeKeyModal rawKey={revealedKey} onClose={() => setRevealedKey(null)} />
      )}
      {revokeTarget && (
        <RevokeConfirmModal
          prefix={revokeTarget.keyPrefix}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          busy={revokeBusy}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/app/api-keys/page.tsx
git commit -m "feat(client): rewrite api-keys page with wizard and granular scopes"
```

---

## Task 21: Knowledge Base article

**Files:**
- Modify: `apps/client/app/support/kb/data/integrations.ts`

- [ ] **Step 1: Add the article**

Open `apps/client/app/support/kb/data/integrations.ts`. Find the array of articles (object literal with `id`, `title`, `body`). Append a new entry:

```ts
  {
    id: 'api-keys-granular',
    title: 'API Keys — escopo granular e melhores práticas',
    body: `
# API Keys — escopo granular e melhores práticas

Cada chave de API é vinculada a um **projeto**, recebe um conjunto de **escopos granulares** (não mais só read/write/withdraw) e pode ser restringida por IP/CIDR e prazo de expiração.

## Geração

1. Acesse **Portal → Integration → API Keys**.
2. Clique em **+ Create Key** e preencha o assistente:
   - **Identificação:** label e projeto.
   - **Permissões:** marque exatamente os escopos necessários. Use o atalho "Read-only key" para uma chave de auditoria. Escopos sensíveis (com escudo 🛡) movem fundos ou alteram custódia — combine com IP allowlist.
   - **Restrições:** adicione IPs ou CIDRs (digite e tecle Enter para virar chip). Vazio = qualquer IP. Escolha expiração em dias, data fixa ou "Indefinite".
   - **Revisão:** confira e clique em Create Key.
3. **A chave bruta aparece uma única vez.** Copie e guarde em local seguro. O sistema só armazena o hash.

## Escopos disponíveis

| Domínio | Escopos |
| --- | --- |
| Wallets | wallets:read, wallets:create |
| Forwarders (depósitos) | forwarders:read, forwarders:flush |
| Address Book / Whitelist | address-book:read, address-book:write |
| Address Groups | address-groups:read, address-groups:write |
| Withdrawals | withdrawals:read, withdrawals:hot, withdrawals:gas-tank |
| Webhooks | webhooks:read, webhooks:write |
| Deposits | deposits:read |
| Tokens / Chains | tokens:read, chains:read |
| Gas Tanks | gas-tanks:read, gas-tanks:write |
| Co-sign | co-sign:read, co-sign:write |
| Projects / Setup | projects:read, project-setup:read, project-setup:write |
| Notifications | notifications:read, notifications:write |
| Security | security:read, security:write |
| Deploy Trace | deploy-trace:read |
| Export | export:read |

## Compatibilidade com chaves antigas

Chaves criadas antes desta release com escopos legados (read, write, withdraw) continuam funcionando — o gateway expande os macros automaticamente. Não é necessário recriar.

## IP allowlist com CIDR

Aceita IPs exatos (203.0.113.7) e blocos CIDR (203.0.113.0/24). Vazio = qualquer IP.

## Rotação

A v1 não tem rotação automática. O fluxo recomendado é "criar nova → migrar integrações → revogar antiga".

## Troubleshooting

- **"Failed to fetch"**: o portal usa o backend em api.vaulthub.live; verifique se você está autenticado e atualize a página.
- **403 com "Insufficient scopes"**: a chave não tem o escopo exigido. Crie uma nova chave com o escopo correto e migre.
- **401 em request a partir de IP novo**: o IP não está na allowlist. Edite a chave (revogando-a e criando uma nova com a allowlist atualizada).
`,
    tags: ['integrations', 'api-keys', 'security'],
    updatedAt: '2026-05-08',
  },
```

(Use the same shape as the existing entries in the array — adjust the property names if the file uses a different schema.)

- [ ] **Step 2: Smoke-test**

Run: `cd apps/client && npx tsc --noEmit -p .`
Expected: no errors. Open `/support/kb` in dev or staging and confirm the article renders.

- [ ] **Step 3: Commit**

```bash
git add apps/client/app/support/kb/data/integrations.ts
git commit -m "docs(kb): API Keys — escopo granular e melhores práticas"
```

---

## Task 22: Postman collection update

**Files:**
- Modify: `docs/integration/CryptoVaultHub.postman_collection.json`
- Modify: `apps/client/public/postman/CryptoVaultHub.postman_collection.json` (mirror)
- Modify: `docs/integration/postman-walkthrough.md`

- [ ] **Step 1: Add a "Self-service API key management" folder**

Open the JSON. Inside the top-level `item` array, add a new folder block:

```json
{
  "name": "Self-service API key management",
  "description": "Endpoints reachable from a logged-in portal session (JWT cookie). Cannot be exercised with an API key — they are guarded by JwtOnlyAuthGuard to prevent privilege escalation.",
  "item": [
    {
      "name": "List my API keys",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/client/v1/api-keys",
          "host": ["{{baseUrl}}"],
          "path": ["client", "v1", "api-keys"]
        }
      }
    },
    {
      "name": "Create API key",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"projectId\": 1,\n  \"scopes\": [\"wallets:read\", \"forwarders:flush\"],\n  \"label\": \"Postman test\",\n  \"ipAllowlist\": [\"203.0.113.0/24\"],\n  \"expiresAt\": \"2026-12-31T23:59:59Z\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/client/v1/api-keys",
          "host": ["{{baseUrl}}"],
          "path": ["client", "v1", "api-keys"]
        }
      }
    },
    {
      "name": "Revoke API key",
      "request": {
        "method": "DELETE",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/client/v1/api-keys/:id",
          "host": ["{{baseUrl}}"],
          "path": ["client", "v1", "api-keys", ":id"],
          "variable": [{ "key": "id", "value": "1" }]
        }
      }
    }
  ]
}
```

Mirror the same change into `apps/client/public/postman/CryptoVaultHub.postman_collection.json` so the public download stays in sync.

- [ ] **Step 2: Update the walkthrough**

Append a section to `docs/integration/postman-walkthrough.md`:

```markdown
## Self-service API key management

The "Self-service API key management" folder requires a logged-in **portal session** — it does not accept an API key (a key cannot create another key, by design). Use Postman's Cookie Manager: log in to https://portal.vaulthub.live in your browser, copy the cookies for the `api.vaulthub.live` domain into Postman, and the requests will authenticate.

The `Create API key` request returns the raw key in the response **only once** — capture it from the response body and store it in your secrets manager immediately.
```

- [ ] **Step 3: Commit**

```bash
git add docs/integration/CryptoVaultHub.postman_collection.json apps/client/public/postman/CryptoVaultHub.postman_collection.json docs/integration/postman-walkthrough.md
git commit -m "docs(postman): self-service API key management folder"
```

---

## Task 23: Homologation suite — list, create+exercise, revoke

**Files:**
- Modify: `docs/superpowers/automation/suites/api.ts`

- [ ] **Step 1: Add three phases**

Open the file. After the existing phases, append three new phase definitions. Use the suite's existing pattern (each phase has a `name`, runs an action, asserts an outcome). Skeleton:

```ts
{
  name: 'List API keys (self-service)',
  run: async (ctx) => {
    const res = await ctx.portal.fetch('/v1/api-keys');
    if (!res.ok) throw new Error(`expected 200, got ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body.keys)) throw new Error('keys[] missing');
  },
},
{
  name: 'Create API key (granular scopes, IP allowlist, 90-day expiry)',
  run: async (ctx) => {
    const create = await ctx.portal.fetch('/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        projectId: ctx.projectId,
        scopes: ['wallets:read'],
        label: 'homolog-suite',
        ipAllowlist: undefined, // homolog runs from a fixed IP; allowlist disabled
        expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(),
      }),
    });
    if (!create.ok) throw new Error(`create failed: ${create.status}`);
    const { apiKey } = await create.json();
    ctx.scratchpad.tempKeyId = apiKey.id;
    ctx.scratchpad.tempKeyRaw = apiKey.key;

    // Use the new key against /v1/wallets — should succeed (wallets:read).
    const ok = await fetch(`${ctx.apiBase}/v1/wallets`, {
      headers: { 'X-API-Key': apiKey.key },
    });
    if (!ok.ok) throw new Error(`granular key failed wallets:read (${ok.status})`);

    // Use the new key against POST /v1/withdrawals — should 403 (no withdrawals:hot).
    const denied = await fetch(`${ctx.apiBase}/v1/withdrawals`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: 56, tokenSymbol: 'BNB', toAddress: '0x0000000000000000000000000000000000000000', amount: '0' }),
    });
    if (denied.status !== 403) throw new Error(`expected 403 for missing scope, got ${denied.status}`);
  },
},
{
  name: 'Revoke API key',
  run: async (ctx) => {
    const id = ctx.scratchpad.tempKeyId;
    const raw = ctx.scratchpad.tempKeyRaw;
    if (!id || !raw) throw new Error('previous phase did not store key');
    const del = await ctx.portal.fetch(`/v1/api-keys/${id}`, { method: 'DELETE' });
    if (!del.ok) throw new Error(`revoke failed: ${del.status}`);
    const after = await fetch(`${ctx.apiBase}/v1/wallets`, { headers: { 'X-API-Key': raw } });
    if (after.status !== 401) throw new Error(`expected 401 after revoke, got ${after.status}`);
  },
},
```

(Adapt the property names — `ctx.portal.fetch`, `ctx.apiBase`, `ctx.scratchpad`, etc. — to whatever the existing suite uses. Read the top of the file once to confirm.)

- [ ] **Step 2: Run the suite locally**

Run the suite using the same command the project uses (likely a `tsx` or `node` invocation under `docs/superpowers/automation/`). If the entry script is `pnpm run homolog` or similar, use that; otherwise: `cd docs/superpowers/automation && npx tsx suites/api.ts`.

Expected: every phase passes, including the 3 new ones.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/automation/suites/api.ts
git commit -m "test(homolog): API key list/create/revoke phases"
```

---

## Task 24: Build & deploy to production

**Files:** none (deploy step)

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: SSH to production and rebuild affected services**

```bash
ssh green@vaulthub.live "cd /docker/CryptoVaultHub && git pull --ff-only && docker compose build auth-service client-api client && docker compose up -d --force-recreate --no-deps auth-service client-api client"
```

- [ ] **Step 3: Smoke-test**

```bash
# 1) GET list (unauthenticated → expect 401, proves route exists)
curl -sk -o /dev/null -w 'GET /v1/api-keys (no auth): %{http_code}\n' https://api.vaulthub.live/client/v1/api-keys

# 2) CORS preflight from portal origin
curl -sk -i -X OPTIONS \
  -H 'Origin: https://portal.vaulthub.live' \
  -H 'Access-Control-Request-Method: GET' \
  https://api.vaulthub.live/client/v1/api-keys | head -10

# 3) auth-service internal endpoint reachable
curl -sk -o /dev/null -w 'POST /auth/internal/api-keys (no key): %{http_code}\n' -X POST https://api.vaulthub.live/auth/internal/api-keys
```

Expected:
- `(1)` returns `401`.
- `(2)` returns `200` with `access-control-allow-origin: https://portal.vaulthub.live`.
- `(3)` returns `401` (no internal-service-key).

- [ ] **Step 4: Manual UAT in browser**

Open `https://portal.vaulthub.live/api-keys`. Verify:
- Page loads without "Failed to fetch".
- "+ Create Key" opens the wizard. Walk through all 4 steps; create a test key.
- One-time reveal modal cannot be dismissed without the checkbox.
- After closing, the new (masked) key is at the top of the list with the right project/scopes/IPs/expiry.
- Revoking it asks for confirmation; on confirm the row disappears immediately.
- Use the raw key via `curl -H 'X-API-Key: <key>' https://api.vaulthub.live/client/v1/wallets` — expect 200 if `wallets:read` was granted.
- Repeat against `/client/v1/withdrawals` POST without `withdrawals:hot` — expect 403 with a message naming the missing scope.

- [ ] **Step 5: Update auto-memory**

If anything noteworthy emerges (a new gotcha, a recurring user preference), save it to `~/.claude/projects/-Users-marcelosilva-Nextcloud-Development-JavaScript-CryptoVaultHub/memory/`. No commit needed.

- [ ] **Step 6: Done**

The acceptance criteria in `docs/superpowers/specs/2026-05-08-api-keys-redesign-design.md` §12 should all be green. Update `MEMORY.md` only if a new high-level project state needs recording (e.g., "API keys redesign deployed 2026-05-08").

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| §3 Architecture (browser → client-api → auth-service) | Tasks 7, 8 |
| §4.1 30 granular scopes | Task 5 |
| §4.3 Legacy macro expansion | Tasks 5, 6 |
| §4.4 Controller re-decoration | Tasks 9, 10, 11, 12, 13 |
| §5.1 Page layout (list + columns) | Task 20 |
| §5.2 4-step wizard | Tasks 16, 17, 19 |
| §5.3 One-time reveal modal | Task 18 |
| §5.4 Revoke confirm | Task 18, 20 |
| §6.1 auth-service CIDR + internal endpoints + expiry validation | Tasks 1, 2, 3, 4 |
| §6.2 client-api new module + JwtOnlyAuth | Tasks 5, 6, 7, 8 |
| §7 Data model (no migration) | (none — design choice) |
| §8 Error handling | Tasks 4, 8, 16, 17, 19 |
| §9 Doc-sync (KB + Swagger + Postman) | Tasks 8 (Swagger), 21 (KB), 22 (Postman) |
| §10.1 Unit tests | Tasks 1, 2, 3, 4, 5, 6, 7, 8, 14 |
| §10.2 Homologation suite | Task 23 |
| §10.3 Manual UAT | Task 24 step 4 |
| §12 Acceptance criteria | Verified end-to-end in Task 24 |
