# API Keys Redesign — Design Spec

**Date:** 2026-05-08
**Owner:** Marcelo Silva
**Status:** Draft (awaiting review)
**Related:** Client portal `/api-keys` page is currently broken ("Failed to fetch") and the underlying flow is non-functional for client-portal users.

---

## 1. Goal

Make the client portal's `/api-keys` page fully functional so that a client (project owner) can:

1. Generate an API key **scoped to a specific project**.
2. Choose granular permissions matching real product actions (generate wallets, flush forwarders, register withdrawal destinations, withdraw from hot wallet, etc.).
3. Restrict the key to one or more IPs/CIDRs, or leave it open to any IP.
4. Choose an expiration (date) or mark the key as indefinite.
5. See the raw key once at creation and never again (one-time reveal), then manage the masked entry afterward (revoke).

The redesign also fixes the broken architecture (admin-only POST endpoint, exact-match IP allowlist, missing `projectId` in the form, hard-coded coarse scopes) and standardizes on the same "portal → client-api → auth-service" path used everywhere else in the portal.

---

## 2. Current state and root cause analysis

| # | Issue | Source |
|---|---|---|
| 1 | "Failed to fetch" on the page | The page calls `${AUTH_API}/api-keys`, which resolves at build-time. If `NEXT_PUBLIC_AUTH_API_URL` is missing in the build env, the bundle ships with `http://localhost:8000/auth` and the browser hits a network error. Calling `auth-service` directly also adds an unnecessary cross-origin surface. |
| 2 | Client portal user **cannot create a key at all** | `POST /auth/api-keys` is decorated with `@AdminAuth('super_admin','admin','owner')` — that guard only accepts admin-panel users. Client-portal users hit `403`/`401` even with a valid JWT. |
| 3 | DTO requires `projectId`, form does not send it | Commit `db7ca5e` made `projectId` mandatory; the page has no project selector. Every create would 422. |
| 4 | IP allowlist is exact-match, UI says CIDR | `validateApiKey` does `allowlist.includes(requestIp)`. A user who types `203.0.113.0/24` is silently locked out of every request. |
| 5 | No expiration UX | Keys are eternal by default. There is no front-end nor back-end UX to set expiration. |
| 6 | Hard-coded coarse scopes (`read`/`write`/`withdraw`) | The form is checkboxes for these three; no per-resource granularity. A "write" key can do anything from registering a webhook to triggering a flush. |
| 7 | "Edit" button is a placeholder | Calls `window.alert(...)`. |
| 8 | Date fields rendered raw | `lastUsedAt` is shown as ISO string. |

Items 1–4 are the blockers; everything else is UX/security debt.

---

## 3. Architecture

```
┌──── client portal (apps/client) ────┐
│  /api-keys page                      │
│  → GET    /v1/api-keys     (proxy)   │
│  → POST   /v1/api-keys     (proxy)   │
│  → DELETE /v1/api-keys/:id (proxy)   │
└─────────────┬────────────────────────┘
              │  JWT cookie (same origin as client-api)
              ▼
┌──── client-api (NestJS) ─────────────┐
│  ApiKeyController (NEW)              │
│  - authenticates portal user via JWT │
│  - forces clientId = user.clientId   │
│  - validates dto.projectId belongs   │
│    to the authenticated client       │
│  - calls auth-service over internal  │
└─────────────┬────────────────────────┘
              │  X-Internal-Service-Key
              ▼
┌──── auth-service ────────────────────┐
│  ApiKeyService (kept; extended)      │
│  - createApiKey (already exists)     │
│  - listApiKeys                       │
│  - revokeApiKey                      │
│  - validateApiKey (CIDR-aware)       │
└──────────────────────────────────────┘
```

**Key decisions:**

- **All three browser calls go through `client-api`**, not directly to `auth-service`. Both services live behind `api.vaulthub.live`, but the portal already uses `client-api` for every other screen, so its CORS configuration is the well-tested path. Routing API-key management through it removes the only remaining direct browser → `auth-service` call (the most likely culprit of the current "Failed to fetch", which manifests when `NEXT_PUBLIC_AUTH_API_URL` is missing at build time and the bundle ships with the `localhost:8000/auth` fallback). Admin-only endpoints in `auth-service` stay reserved for the admin panel.
- **No new database fields.** The `ApiKey` table already supports `clientId`, `projectId`, `scopes` (string[]), `ipAllowlist` (JSON), `allowedChains`, `label`, `expiresAt`, `lastUsedAt`, `usageCount`, `revokedAt`, `isActive`. The redesign uses what's already there.
- **Backwards-compatible scope expansion:** existing keys with legacy scopes (`read`/`write`/`withdraw`) keep working. The guard expands legacy macros into the granular scopes at validation time. No data migration required.

---

## 4. Scope taxonomy

The system today recognizes three coarse scopes (`read`, `write`, `withdraw`). The redesign keeps those as **legacy macros** and introduces resource-action scopes for everything in `services/client-api/src/`.

### 4.1 Granular scopes (new)

Grouped by domain, with a one-line description suitable for the wizard's helper text.

| Domain | Scope | What it allows |
|---|---|---|
| Wallets | `wallets:read` | List wallets, balances, addresses. |
| Wallets | `wallets:create` | Generate / deploy new wallet contracts on chain. |
| Forwarders | `forwarders:read` | List deposit forwarders and their state. |
| Forwarders | `forwarders:create` | Generate / provision deposit forwarder addresses. |
| Forwarders | `forwarders:flush` | Execute flush of deposit forwarders to hot wallet. |
| Address Book | `address-book:read` | List whitelisted withdrawal destinations. |
| Address Book | `address-book:write` | Register / update / delete withdrawal destinations. |
| Address Groups | `address-groups:read` | List address groups. |
| Address Groups | `address-groups:write` | Create / provision address groups. |
| Withdrawals | `withdrawals:read` | List withdrawal history and details. |
| Withdrawals | `withdrawals:hot` | Initiate withdrawal from Hot Wallet (multisig). |
| Withdrawals | `withdrawals:gas-tank` | Initiate withdrawal from Gas Tank (EOA). |
| Webhooks | `webhooks:read` | List webhook subscriptions and deliveries. |
| Webhooks | `webhooks:write` | Create / update / delete webhook subscriptions. |
| Deposits | `deposits:read` | List inbound deposits. |
| Tokens | `tokens:read` | List supported tokens per chain. |
| Chains | `chains:read` | List supported chains. |
| Gas Tanks | `gas-tanks:read` | List gas tanks, balances, alert config. |
| Gas Tanks | `gas-tanks:write` | Update alert config; export keystore (sensitive). |
| Co-sign | `co-sign:read` | List pending co-sign operations. |
| Co-sign | `co-sign:write` | Submit a co-signature for a pending operation. |
| Projects | `projects:read` | Read project metadata. |
| Project Setup | `project-setup:read` | Read project setup state, custody mode, chains enabled. |
| Project Setup | `project-setup:write` | Modify project setup, enable/disable chains. |
| Notifications | `notifications:read` | Read notification rules. |
| Notifications | `notifications:write` | Create / update / delete notification rules. |
| Security | `security:read` | Read security settings (custody mode, 2FA status, Shamir shares metadata). |
| Security | `security:write` | Change custody mode, toggle safe mode. |
| Deploy Trace | `deploy-trace:read` | Read on-chain deploy traces. |
| Export | `export:read` | Generate exports (CSV/JSON). |

That is **30 granular scopes**. No others exist or are pending in the current codebase. Anything added later (e.g., `gas-tanks:topup` if a self-service top-up endpoint ships) is a one-line entry to this enum + a controller decoration.

### 4.2 Sensitivity classification

The wizard tags scopes with one of three sensitivity levels for visual treatment:

- **Standard** — read-only and routine writes (most scopes).
- **Sensitive** — money-moving or key-material writes: `withdrawals:hot`, `withdrawals:gas-tank`, `forwarders:flush`, `gas-tanks:write` (keystore export), `security:write` (custody mode), `address-book:write` (whitelist tampering).
- **Read-only convenience** — a single "Read-only" toggle in the wizard pre-checks every `*:read` scope at once.

### 4.3 Legacy macro expansion

When the guard authenticates a request, scopes on the key are expanded:

- `read` → all `*:read` scopes (every entry above ending in `:read`).
- `write` → `wallets:create`, `forwarders:create`, `forwarders:flush`, `address-book:write`, `address-groups:write`, `webhooks:write`, `gas-tanks:write`, `co-sign:write`, `project-setup:write`, `notifications:write`, `security:write`, `export:read`.
- `withdraw` → `withdrawals:hot`, `withdrawals:gas-tank`.

Guard pseudo-code:

```ts
function expandScopes(raw: string[]): string[] {
  const out = new Set<string>();
  for (const s of raw) {
    if (s === 'read') ALL_READ_SCOPES.forEach((x) => out.add(x));
    else if (s === 'write') LEGACY_WRITE_SCOPES.forEach((x) => out.add(x));
    else if (s === 'withdraw') LEGACY_WITHDRAW_SCOPES.forEach((x) => out.add(x));
    else out.add(s);
  }
  return [...out];
}
```

Existing keys in production keep working unchanged. New keys created via the redesigned UI store granular scopes only.

### 4.4 Re-decoration of controllers

Each controller in `client-api` is re-tagged with the most specific scope in scope 4.1. Examples:

- `wallet.controller.ts` → `@ClientAuth('wallets:read')` for GETs, `@ClientAuth('wallets:create')` for the deploy/create POST.
- `flush.controller.ts` → `@ClientAuth('forwarders:read')` and `@ClientAuth('forwarders:flush')`.
- `withdrawal.controller.ts` → `@ClientAuth('withdrawals:read')` for GETs; the create endpoint reads `dto.sourceWallet` and requires either `withdrawals:hot` or `withdrawals:gas-tank` accordingly.
- `address-book.controller.ts` → `@ClientAuth('address-book:read')` / `@ClientAuthWithProject('address-book:write')`.
- The full mapping is in the implementation plan; no controller adds new endpoints, only re-tags.

Backwards compatibility is preserved by 4.3.

---

## 5. UI design

The page is a single route at `/api-keys` (already exists; redesigned in place). The experience is a **list view + 4-step creation wizard + one-time reveal modal**.

### 5.1 Page layout

```
┌──────────────────────────────────────────────────────────────┐
│  API Keys              Portal / Integration / API Keys       │
│                                          [ + Create Key ]    │
│  Manage API keys for programmatic access to CryptoVaultHub.  │
├──────────────────────────────────────────────────────────────┤
│  Key prefix      Label        Project   Scopes (n)   IPs   Expires    Last used   Actions │
│  cvh_live_a1b2…  Production   BrPay     read+write+3 Any   Indefinite 2 min ago   [Revoke]│
│  cvh_live_x9y8…  Staging      BrPay     read         203.0 90 days    Never       [Revoke]│
│  cvh_live_d4e5…  Settlement   BrPay     withdrawals  10.0  Expired    1 day ago   [Revoke]│
└──────────────────────────────────────────────────────────────┘
                                                                Security note (collapsible)
```

Columns:

- **Key prefix** — `cvh_live_xxxxxxxx…` in mono font, never the full key.
- **Label** — user-given.
- **Project** — project name (resolved from `projectId`).
- **Scopes** — pill cluster: shows up to 3 distinct domain pills (e.g., `wallets`, `withdrawals`, `webhooks`) plus a "+N more" pill on hover-tooltip with the full list. Backwards-compat: legacy keys show their macros (`read`, `write`, `withdraw`).
- **IPs** — first IP/CIDR, "+N more" if multiple, or "Any" in muted text.
- **Expires** — relative ("in 87 days"), or "Indefinite" in muted, or "Expired" in error red. Within ≤7 days: orange "Expires in N days" badge.
- **Last used** — relative ("2 min ago"), or "Never" in muted.
- **Actions** — only `Revoke` (with confirm modal). The `Edit` button is removed; documenting that scopes are immutable post-creation.

Empty state: centered "No API keys yet" with a single CTA "Create your first key".

### 5.2 Create-key wizard (4 steps)

A modal/drawer with a left rail showing progress (1 → 2 → 3 → 4) and a right pane with the active step's content. Forward navigation requires the step to be valid.

#### Step 1 — Identification

- **Label** (text, required). Placeholder: "e.g. Production API, Settlement bot".
- **Project** (select, required). Options come from `GET /v1/projects` (limited to projects of the authenticated client). If the client has only one project, it's preselected and the field shows it as a read-only chip.

#### Step 2 — Permissions

- **Quick pick:** "Read-only" toggle at the top — checking it pre-checks every `*:read` scope and locks the writes (uncheckable while toggle is on). Switching off restores manual control with all checkboxes unchecked.
- **Grouped checkboxes** by domain. Each checkbox shows: `<scope name>` in mono + a one-line helper. Sensitive scopes have a small red shield icon.
  - Wallets — `wallets:read`, `wallets:create`
  - Forwarders — `forwarders:read`, `forwarders:flush` 🛡
  - Address Book — `address-book:read`, `address-book:write` 🛡
  - Address Groups — `address-groups:read`, `address-groups:write`
  - Withdrawals — `withdrawals:read`, `withdrawals:hot` 🛡, `withdrawals:gas-tank` 🛡
  - Deposits — `deposits:read`
  - Webhooks — `webhooks:read`, `webhooks:write`
  - Gas Tanks — `gas-tanks:read`, `gas-tanks:write` 🛡
  - Co-sign — `co-sign:read`, `co-sign:write`
  - Tokens / Chains — `tokens:read`, `chains:read`
  - Projects — `projects:read`, `project-setup:read`, `project-setup:write`
  - Notifications — `notifications:read`, `notifications:write`
  - Security — `security:read`, `security:write` 🛡
  - Deploy Trace — `deploy-trace:read`
  - Export — `export:read`
- **Validation:** at least one scope must be selected. The "Continue" button is disabled until that's true.
- **Inline warning** when any sensitive scope is selected: a single yellow banner "This key can move funds — combine with an IP allowlist on the next step."

#### Step 3 — Restrictions

- **IP allowlist** — chip input. User types an IP (`203.0.113.42`) or CIDR (`203.0.113.0/24`) and presses Enter; entry is validated client-side and added as a chip. Invalid input shows a red error under the input until corrected. Empty list = "Any IP allowed" (muted text + warning icon if the previous step selected any sensitive scope).
- **Expiration** — radio with three options:
  - **In X days** (default 90), with a numeric input (1–3650) next to it.
  - **On a specific date** — calendar picker.
  - **Indefinite** — explicit option, with a small caption "Not recommended for production keys."
- **Allowed chains** (optional, collapsible "Advanced"). Multiselect of chain IDs the key may operate on; empty = all enabled chains for the project. (Schema already supports this.)

#### Step 4 — Review and confirm

A summary card showing:

- Label, Project
- Scopes (chip cluster, sensitive ones highlighted)
- IPs (chip cluster or "Any IP")
- Expiration ("In 90 days, on 2026-08-06" / "On 2027-01-01" / "Indefinite")
- Allowed chains (or "All enabled")

Buttons: `Back` and `Create Key`. The latter triggers `POST /v1/api-keys`.

### 5.3 One-time reveal modal

After a successful create, the wizard closes and a **separate, blocking modal** appears:

- Title: "Save your new API key"
- Subtitle in warning color: "This is the only time the full key will be displayed."
- Key in mono font, full width, with the prefix highlighted; `Copy` button.
- Checkbox "I have stored this key in a secure location" — must be checked to enable the close button.
- Close button label: "Done — close".

The modal cannot be dismissed by clicking outside or pressing Escape. Only the close button (after checkbox) closes it.

After close, the user lands on the list page with the new (masked) entry already at the top — no extra refresh.

### 5.4 Revoke flow

Clicking `Revoke` opens a confirmation modal: "Revoke key cvh_live_xxxxx…? This cannot be undone. Any integrations using this key will start failing immediately." Buttons: `Cancel` / `Revoke key`. On confirm, `DELETE /v1/api-keys/:id` is called and the row is removed from the table.

### 5.5 Component reuse

The redesign uses the existing design-system primitives (`Badge`, `DataTable`, `Modal`, `Button`, `Input`) and adds two new local components in `apps/client/components/api-keys/`:

- `IpChipInput.tsx` — chip-style IP/CIDR input with client-side validation.
- `ScopePicker.tsx` — the grouped-checkbox permission picker with the read-only toggle.

No new design tokens or color variables.

---

## 6. Backend changes

### 6.1 `services/auth-service`

- **`api-key.service.ts`**
  - Replace exact-match in `validateApiKey` with CIDR-aware matching. Accept both `1.2.3.4` (treated as `1.2.3.4/32`) and `1.2.3.0/24`. IPv4 only for v1 (matches what the platform already accepts elsewhere).
  - Validate `expiresAt` on create: if provided, must be a future date; no upper cap (per product decision — indefinite is allowed when omitted).
  - Validate every entry of `scopes` against the union of legacy + granular scope names; reject unknown scopes with 422.
- **`auth.controller.ts`**
  - Add `POST /auth/internal/api-keys` (guarded by `InternalServiceGuard`). The handler accepts the same DTO as the admin route plus `clientId` and `projectId` from the calling service. Used by `client-api` to create on behalf of a client.
  - Add `DELETE /auth/internal/api-keys/:id` (`InternalServiceGuard`) with optional `clientId` body for ownership check.
  - **Existing admin routes (`POST /auth/api-keys`, `DELETE /auth/api-keys/:id`, `GET /auth/api-keys`) are unchanged.** They continue to serve the admin panel.

### 6.2 `services/client-api`

- **New module: `api-key/`** — controller + service.
  - `GET /v1/api-keys` — calls `auth-service` `GET /auth/internal/api-keys/by-client/:clientId` (already exists), returns the masked list. Resolves project name for each key using a `Map<projectId, projectName>` fetched in one round trip.
  - `POST /v1/api-keys` — DTO: `{ label, projectId, scopes[], ipAllowlist?[], expiresAt?, allowedChains?[] }`. Handler: enforces `clientId = user.clientId`, verifies `projectId` belongs to that client, forwards to `auth-service` `POST /auth/internal/api-keys`, returns the one-time `{ id, key, prefix, scopes, label, expiresAt }` payload.
  - `DELETE /v1/api-keys/:id` — verifies the key belongs to `user.clientId` (by reading it first), then calls `auth-service` `DELETE /auth/internal/api-keys/:id`.
  - All three endpoints authenticate the **portal user via JWT cookie**, not via API key. The existing `ApiKeyAuthGuard` accepts both API keys and JWTs; the new endpoints get a small `@PortalAuth` decorator that requires the JWT path specifically.
- **`common/guards/api-key-auth.guard.ts`**
  - Add `expandLegacyScopes()` helper (per §4.3). Apply it inside `checkScopes` before comparing required vs. provided.
- **Controller re-decorations** — every existing `@ClientAuth('read'|'write')` is replaced with the most specific granular scope. This is mechanical (per §4.4) and is covered by the legacy-macro layer for existing keys.

### 6.3 `services/admin-api`

No changes. The admin panel keeps using `POST /auth/api-keys` directly.

---

## 7. Data model

No DB migration required. The existing `ApiKey` table already has every field used:

```
id            BigInt PK
clientId      BigInt
projectId     BigInt (already required since db7ca5e)
keyPrefix     String
keyHash       String (sha256, unique)
scopes        String[]   ← granular strings + legacy macros both valid
ipAllowlist   Json?      ← string[] of IPs and/or CIDRs
allowedChains Json?      ← number[] of chain IDs
label         String?
expiresAt     DateTime?  ← null = indefinite
lastUsedAt    DateTime?
lastUsedIp    String?
usageCount    BigInt
isActive      Boolean
revokedAt     DateTime?
createdAt     DateTime
updatedAt     DateTime
```

---

## 8. Error handling and edge cases

| Scenario | Expected behavior |
|---|---|
| Form submitted with `projectId` that does not belong to the client | 422 from `client-api` with message `Project <id> does not belong to client <id>`. |
| Form submitted with no scopes selected | 422 with `At least one scope is required`. |
| Form submitted with an unknown scope | 422 with `Unknown scope: <name>`. |
| Form submitted with `expiresAt` in the past | 422 with `expiresAt must be a future date`. |
| Form submitted with an invalid IP/CIDR | Front-end blocks entry; if it slips through, back-end 422 `Invalid IP or CIDR: <value>`. |
| Authenticated request from an IP not in allowlist | `validateApiKey` returns `{ valid: false }` with reason logged; gateway responds 401. |
| Key whose `expiresAt < now` | `validateApiKey` returns `{ valid: false }`; the list view shows the row with a red "Expired" badge until the user revokes it. |
| Revoking a key that was already revoked | 200 (idempotent), no-op. |
| User clicks "Revoke" on a key that is currently authenticating an in-flight request | Race is acceptable: the in-flight request completes, subsequent ones see `isActive=false` and 401. |
| Browser-side: JWT cookie expires while wizard is open | `POST /v1/api-keys` returns 401, page redirects to login (existing global handler). |

---

## 9. Documentation sync (per the standing doc-sync rule)

Every public-contract change is mirrored in three places in the same PR:

- **Knowledge Base** (`apps/client/app/support/kb/data/`):
  - Update `integrations.ts` with a new article "API Keys — escopo granular e melhores práticas" covering: how to create, scope taxonomy, IP allowlist (CIDR), expiration, rotation pattern (revoke-and-replace), troubleshooting "Failed to fetch".
- **Swagger** (`services/client-api/src/main.ts` and DTOs):
  - The Swagger doc already declares `X-API-Key` (line 114). Add scope descriptions per the new taxonomy on every controller route's `@ApiOperation`/`@ApiBearerAuth` block.
  - DTO for `POST /v1/api-keys` is fully `@ApiProperty`-annotated.
- **Postman** (`docs/integration/CryptoVaultHub.postman_collection.json` and the public mirror at `apps/client/public/postman/`):
  - Add a "Self-service API key management" folder with three requests (list, create, revoke) using the JWT cookie auth (Postman captures cookies on login).

---

## 10. Testing plan

### 10.1 Unit (Jest)

- `expandLegacyScopes` — covers all three macros, mixed inputs, no duplicates.
- `validateApiKey` CIDR matching — `1.2.3.4` matches `1.2.3.0/24`; `5.6.7.8` does not; an exact `1.2.3.4` entry continues to match `1.2.3.4`; IPv4 with leading zeros rejected.
- `client-api` `ApiKeyController` — JWT user without `clientId` rejected; `projectId` of a different client rejected; happy path returns the raw key once.

### 10.2 Integration (existing homologation suite)

Add three phases to `docs/superpowers/automation/suites/api.ts`:

- "List API keys" (asserts the list endpoint responds 200).
- "Create API key (granular scopes, IP allowlist, 90-day expiry)" — create, capture key, exercise it against `GET /v1/wallets`, expect 200; against `POST /v1/withdrawals` without `withdrawals:hot`, expect 403.
- "Revoke API key" — revoke, then re-attempt the same `GET /v1/wallets`, expect 401.

### 10.3 Manual UAT

- Step through all four wizard steps in the portal; verify the one-time reveal modal cannot be dismissed without the checkbox.
- Verify "Read-only" toggle behavior in step 2.
- Verify "Indefinite" expiration in step 3 — list view should show "Indefinite" muted, no expired badge.
- Revoke a key and confirm immediate failure of subsequent requests using that key.

---

## 11. Out of scope (explicit non-goals)

- **Self-service rotation flow** ("rotate this key" with overlap window). v1 is revoke-and-replace; rotation can be added later as a one-click that creates a new key with the same scopes/restrictions and shows a banner with both old and new active for 24h.
- **Key usage analytics dashboard** (charts of requests/24h, error rate). The redesign keeps the `requestCount24h` column simple; richer analytics ship later in the BI/Analytics area inside the Admin Panel.
- **Per-key webhook for security events** (e.g., "key used from new IP"). Future work.
- **Service accounts / multi-user keys.** All keys remain per-project, owned by the client.
- **Hardware-bound or sealed keys (HSM passthrough).** Not part of v1.

---

## 12. Acceptance criteria

A client-portal user can complete this end-to-end without touching the admin panel:

1. Open `/api-keys`, see existing keys load successfully (no "Failed to fetch").
2. Click "+ Create Key", choose a project, give it a label.
3. Pick exactly the granular scopes needed (e.g., `wallets:create`, `forwarders:flush`, `withdrawals:hot`).
4. Restrict to one or more IPs/CIDRs (or skip → "Any").
5. Choose 30/90/365/custom expiry **or** "Indefinite".
6. Confirm; see the raw key once in the one-time reveal modal; copy it; check the box; close.
7. See the new (masked) key at the top of the list with the correct project, scopes, IPs, and expiration.
8. Use the raw key against `client-api` and have the request succeed only for the granted scopes; receive 403 for everything else, with a message naming the missing scope.
9. Revoke the key; subsequent requests with it return 401 immediately.
10. Existing keys (with legacy `read`/`write`/`withdraw` scopes) continue to work without any user action.
