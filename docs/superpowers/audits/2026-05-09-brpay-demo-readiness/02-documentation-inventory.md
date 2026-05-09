# Documentation Inventory — BrPay Demo Readiness

> Audit date: 2026-05-09. Scope: Swagger spec served at `/client/api/docs`, two Postman collections in `docs/`, KB articles, integration walkthrough.

## 1. Swagger / OpenAPI

- **Source:** decorator-driven (`@nestjs/swagger`) in `services/client-api/src/main.ts:31-147`. No static `openapi.json` checked in.
- **Title:** "CryptoVaultHub Client API" v1.0.0
- **Servers declared:** `http://localhost:3002` (dev), `https://api.cryptovaulthub.com` (prod) ⚠ **wrong** — production is `api.vaulthub.live`
- **Auth scheme exposed:** only `X-API-Key` header. JWT cookie path for `/api-keys` not documented.
- **Scope description** (lines 40-43): only legacy macros `read`/`write`/`withdraw`. **31 granular scopes are NOT documented in the spec metadata** — they appear only on individual `@ApiOperation` blocks via decorator names.
- **14 tags declared:** Wallets, Deposits, Withdrawals, Webhooks, Address Book, Co-Sign, Flush, Address Groups, Exports, Project Setup, Deploy Traces, Tokens, Health, API Keys.

### Gaps
1. Server URL still `cryptovaulthub.com`, real prod is `vaulthub.live`
2. Scope description text doesn't reflect the redesign (no granular scopes, no expansion rules)
3. JWT cookie auth path for `/api-keys` not declared as a security scheme
4. CIDR allowlist + expiration features absent from any spec metadata

## 2. Postman Collections

### 2a. Internal homologation: `docs/superpowers/postman/cvh-client-api.postman_collection.json` (2026-05-07)

14 folders × N requests covering: Sanity, Projects, Wallets, Deposit Addresses, Deposits, Withdrawals, Flush, Address Book, Address Groups, Gas Tanks, Webhooks, Notification Rules, Co-Sign, Exports, Security.

- Auth: API Key (`X-API-Key` header) at collection level
- Test scripts: minimal asserts + variable capture
- **Missing:** self-service API key management folder (JWT-only)

### 2b. Public integration walkthrough: `docs/integration/CryptoVaultHub.postman_collection.json` (2026-05-08)

13 sequential phases (pt-BR), already validated in 2026-05-08 BSC mainnet homologation against BrPay project. Auth: API Key.

- Phases: Setup → Webhook (opcional) → Deposit Addresses → Deposits (polling) → Balances Check → Address Book → Withdrawals → Exports
- **Possibly contains** the self-service folder added in commit `b2309c8` ("docs(postman): self-service API key management folder") — needs verification by reading the JSON post-commit

### 2c. Environment file: `cvh-production.postman_environment.json`

`baseUrl = https://api.vaulthub.live/client/v1` ✅ correct. Includes 17 variables (apiKey secret, projectId, chainId=56, depositAddress, withdrawalId, etc).

### Postman gaps
- Internal collection missing self-service API key folder
- No requests demonstrating CIDR allowlist or expiration features
- No JWT-authenticated requests in either collection (legitimate, since these are for API consumers)

## 3. Knowledge Base & Markdown Docs

### 3a. `docs/api/client-api.md` (970 lines, last touched 2026-04-09) ⚠ **STALE**

Pre-redesign reference. Documents legacy `read`/`write`/`withdraw` macros only.

**Missing entirely:**
1. 31 granular scopes
2. Self-service `POST /v1/api-keys` (JWT-only)
3. CIDR/IP allowlist
4. Expiration on API keys
5. `GET /v1/projects` endpoint (referenced from Postman but not documented here)
6. `POST /v1/withdrawals/:id/approve` endpoint
7. `sourceWallet` field on withdrawals (`hot` vs `gas_tank`)

### 3b. `docs/integration/postman-walkthrough.md` (339 lines, pt-BR, 2026-05-08) ✅

Operational walkthrough matching public Postman collection. Production flow ASCII diagram, common errors table, 13-step sequence. Doesn't cover scopes (operational focus).

### 3c. `apps/client/app/support/kb/data/integrations.ts` (commit `86d695f`, 2026-05-08)

KB article inside the client portal — **canonical reference for granular scopes** post-redesign. Covers: scope taxonomy, IP allowlist, expiration, rotation pattern, troubleshooting.

## 4. Coverage Matrix

| Artifact | Last touch | Granular scopes | JWT self-service | CIDR | Expiry | Server URL correct |
|---|---|---|---|---|---|---|
| Swagger metadata (`main.ts`) | 2026-05-08 | ⚠ legacy only | ⚠ no | ⚠ no | ⚠ no | ⚠ `.com` instead of `.live` |
| Swagger per-route decorators | 2026-05-08 | ✅ via `@ClientAuth(...)` | partial | no | no | n/a |
| Postman internal | 2026-05-07 | n/a | ⚠ missing folder | n/a | n/a | n/a |
| Postman public | 2026-05-08 | n/a | 🔄 likely added (b2309c8) | n/a | n/a | ✅ |
| `docs/api/client-api.md` | 2026-04-09 | ⚠ legacy only | ⚠ no | ⚠ no | ⚠ no | n/a |
| `postman-walkthrough.md` | 2026-05-08 | n/a (operational) | ⚠ no | ⚠ no | ⚠ no | n/a |
| Portal KB (`integrations.ts`) | 2026-05-08 | ✅ | ✅ | ✅ | ✅ | n/a |

## 5. Required doc fixes (pre-demo)

1. **`main.ts:31-147`** — update Swagger description to reference granular scopes; fix server URL to `https://api.vaulthub.live`; declare JWT cookie security scheme for `/api-keys`
2. **`docs/api/client-api.md`** — full rewrite or supersede with auto-generated reference. Add: granular scopes section, JWT self-service, CIDR, expiry, `/projects`, `/approve`, `sourceWallet`
3. **Postman internal (`cvh-client-api.postman_collection.json`)** — add self-service API key folder mirroring the public collection
4. **Postman public** — verify `b2309c8` self-service folder is intact; add CIDR + expiry example requests
5. **`postman-walkthrough.md`** — add appendix "Criando uma chave restrita por IP" + "Rotacionando chaves"
6. **Cross-link KB article** prominently from Swagger and `client-api.md`
