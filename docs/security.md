# Security Documentation

## Overview

CryptoVaultHub implements defense-in-depth security across all layers: key management, network isolation, transaction authorization, API authentication, compliance screening, and audit logging.

## Key Management Architecture

### Key Model (Per Client)

Each client has 3 keys derived from the platform's HD wallet:

| Key | Controller | Purpose |
|-----|-----------|---------|
| **Platform Key** | CryptoVaultHub | Signs as signer 1 of the on-chain 2-of-3 multisig. Never leaves Key Vault. |
| **Client Key** | Client or CVH (mode-dependent) | Signs as signer 2. In full-custody mode, CVH controls it. In co-sign mode, the client controls it. |
| **Backup Key** | Shared via Shamir | Emergency recovery. Split into 5 shares using Shamir's Secret Sharing (3-of-5 threshold). |

### HD Wallet Derivation (BIP-32/39/44)

All keys are derived from a single master seed using hierarchical deterministic derivation:

```
Master Seed (256 bits, BIP-39 24 words)
  |
  +-> PBKDF2-HMAC-SHA512
  |
  +-> Master Key (BIP-32 root)
       |
       +-> m/44'/60'/(clientIndex*3+0)'/0/0  --> Platform Key
       +-> m/44'/60'/(clientIndex*3+1)'/0/0  --> Client Key
       +-> m/44'/60'/(clientIndex*3+2)'/0/0  --> Backup Key
       +-> m/44'/60'/1000'/chainId/clientIndex --> Gas Tank Key
```

The same derived key works on ALL EVM chains (identical address on Ethereum, BSC, Polygon, etc.) because EVM address derivation is chain-agnostic.

### Key Vault Service

The Key Vault Service is the sole custodian of private key material:

- Runs in an isolated Docker network (`vault-net`) with ZERO internet access
- Communicates ONLY with the Core Wallet Service via `InternalServiceGuard` (shared secret in `X-Internal-Service-Key` header with timing-safe comparison) + Docker network isolation
- Stateless between requests -- no intermediate state stored
- All key operations are recorded in an append-only `key_vault_audit` table

**Exposed Endpoints** (internal only, vault-net):

| Endpoint | Purpose |
|----------|---------|
| `POST /keys/generate` | Generate HD keys for a new client |
| `POST /keys/derive-gas-tank` | Derive a Gas Tank key for a client+chain |
| `GET /keys/:clientId/public` | Retrieve public keys (no private key exposure) |
| `POST /keys/:clientId/sign` | Sign a single hash |
| `POST /keys/:clientId/sign-batch` | Sign multiple hashes |
| `GET /shamir/:clientId/status` | Get Shamir share status |
| `POST /shamir/:clientId/split` | Split backup key into shares |
| `POST /shamir/:clientId/reconstruct` | Reconstruct backup key from shares |

## Envelope Encryption

All private keys are encrypted at rest using a two-layer envelope encryption scheme:

```
                 +---------------------+
                 | Master Password     |
                 | (VAULT_MASTER_      |
                 |  PASSWORD env var)  |
                 +----------+----------+
                            |
                     PBKDF2-HMAC-SHA512
                     600,000 iterations
                     32-byte random salt
                            |
                            v
                 +----------+----------+
                 | KEK (Key Encryption |
                 |      Key)           |
                 | 256-bit             |
                 +----------+----------+
                            |
                    AES-256-GCM wrap
                            |
                            v
                 +----------+----------+
                 | DEK (Data Encryption|
                 |      Key)           |
                 | 256-bit random      |
                 +----------+----------+
                            |
                    AES-256-GCM encrypt
                            |
                            v
                 +----------+----------+
                 | Encrypted Private   |
                 | Key (ciphertext)    |
                 +---------------------+
```

### Encryption Process

1. Generate a random 256-bit DEK (Data Encryption Key) via `crypto.randomBytes(32)`
2. Generate a random 32-byte salt via `crypto.randomBytes(32)`
3. Derive KEK from master password via `pbkdf2Sync(masterPassword, salt, 600000, 32, 'sha512')` (per OWASP 2024 recommendation for PBKDF2-SHA512)
4. Encrypt private key with DEK using `createCipheriv('aes-256-gcm', dek, iv)` (produces ciphertext + authTag)
5. Wrap DEK with KEK using `createCipheriv('aes-256-gcm', kek, dekIv)` (produces encryptedDek = dekIv + ciphertext + authTag)
6. Zero DEK and KEK from memory immediately via `.fill(0)`
7. Store in database: ciphertext, IV, authTag, salt, encryptedDek

### Decryption Process

1. Derive KEK from master password + stored salt via `pbkdf2Sync`
2. Extract dekIv (first 16 bytes), dekCiphertext, and dekAuthTag (last 16 bytes) from encryptedDek
3. Unwrap DEK from encryptedDek using KEK + `createDecipheriv('aes-256-gcm', kek, dekIv)`
4. Decrypt ciphertext using DEK + IV + authTag via `createDecipheriv('aes-256-gcm', dek, iv)`
5. Zero KEK and DEK from memory immediately via `.fill(0)`
6. Return plaintext (zeroed after use by caller)

### Implementation

The encryption is implemented in `services/key-vault-service/src/encryption/encryption.service.ts` using Node.js native `crypto` module:

- `createCipheriv('aes-256-gcm', ...)` for encryption
- `createDecipheriv('aes-256-gcm', ...)` for decryption
- `pbkdf2Sync(masterPassword, salt, iterations, 32, 'sha512')` for KEK derivation
- `randomBytes(32)` for DEK and salt generation
- Iteration count configurable via `KDF_ITERATIONS` env var (default: 600000)

### Memory Safety

All sensitive buffers are explicitly zeroed after use:
- DEK is `.fill(0)` after wrapping
- KEK is `.fill(0)` after use
- Plaintext buffer is `.fill(0)` after conversion to string (in `decryptToString`)

## Shamir's Secret Sharing

The backup key for each client is split using Shamir's Secret Sharing:

### Parameters

- **Total Shares**: 5
- **Threshold**: 3 (any 3 of 5 shares can reconstruct the key)
- **Each share**: Individually encrypted with different passwords

### Share Distribution

| Share Index | Custodian | Storage |
|------------|-----------|---------|
| 1 | Client (primary contact) | Secure password manager |
| 2 | CVH Platform Admin | Hardware security module or secure vault |
| 3 | Cold Storage | Offline, encrypted USB in physical vault |
| 4 | Client (secondary contact) | Separate secure storage |
| 5 | Physical Vault | Bank safety deposit box or equivalent |

### Key Ceremony

1. Admin triggers `POST /shamir/:clientId/split` via Key Vault Service
2. Key Vault retrieves and decrypts the backup key
3. Backup key is split into 5 shares
4. Each share is encrypted with its custodian's password
5. Encrypted shares are stored in `cvh_keyvault.shamir_shares`
6. Original backup key is zeroed from memory
7. Share status is auditable via `GET /shamir/:clientId/status`

### Recovery

1. Collect at least 3 shares from custodians
2. Admin triggers `POST /shamir/:clientId/reconstruct`
3. Key Vault decrypts the provided shares
4. Shamir reconstruction produces the original backup key
5. Backup key is re-encrypted with envelope encryption
6. Recovery is logged in `key_vault_audit`

## Custody Modes

Each client is configured with a custody mode. The database currently supports `full_custody` and `co_sign`. A third mode, `client_initiated`, is planned for a future release.

### Full Custody

```
Withdrawal Request
      |
      v
Core Wallet --> Key Vault: sign with platformKey (signer 1)
      |
      v
Core Wallet --> Key Vault: sign with clientKey (signer 2)
      |
      v
Submit sendMultiSig() with both signatures
```

- CVH controls both platformKey and clientKey
- Fully automated signing -- no client intervention required
- Best for: Payment gateways wanting full automation

### Co-Sign

```
Withdrawal Request
      |
      v
Core Wallet --> Key Vault: sign with platformKey (signer 1)
      |
      v
Waiting for client signature (status: pending_co_sign)
      |
Client --> POST /client/v1/co-sign/:operationId/sign
      |
      v
Submit sendMultiSig() with both signatures
```

- CVH controls platformKey, client controls clientKey
- Both parties must sign every withdrawal
- Best for: Large exchanges wanting co-custody control

### Client-Initiated (Planned)

> **Note**: This mode is not yet implemented. The database ENUM currently supports `full_custody` and `co_sign` only. This section describes the planned behavior for a future release.

```
Client signs first with clientKey
      |
Client --> POST /client/v1/co-sign/:operationId/sign
      |
      v
Core Wallet validates client signature
      |
      v
Core Wallet --> Key Vault: sign with platformKey (auto-sign)
      |
      v
Submit sendMultiSig() with both signatures
```

- Client initiates and signs first
- CVH auto-signs with platformKey after validation
- Best for: Exchanges wanting to initiate from their own backend

## Network Isolation

### Docker Network Architecture

```
Internet
    |
    v
[public-net] -- Kong, Admin Panel, Client Portal
    |
    v (Kong routes to internal services)
[internal-net] (internal: true) -- All NestJS services, Redis
    |
    | (Core Wallet bridges to vault-net)
    v
[vault-net] (internal: true) -- Key Vault Service ONLY
    |
    X (no route to internet, no route to public-net, no route to monitoring-net)

[monitoring-net] -- PostHog, Prometheus, Loki, Jaeger, ClickHouse, Kafka
```

### Key Security Properties

1. **Key Vault has ZERO internet access**: `vault-net` is an internal Docker bridge network. The Key Vault container has no route to the internet, no route to Redis, no route to any service other than Core Wallet Service.
2. **internal-net is internal**: Marked `internal: true` in docker-compose, meaning no external access is possible.
3. **Core Wallet is the sole bridge**: Only the Core Wallet Service exists on both `internal-net` and `vault-net`.
4. **Monitoring is separated**: Observability stack runs on its own network, with select bridges to `internal-net` for metric scraping.

### Inter-Service Authentication (InternalServiceGuard)

Communication between Core Wallet Service and Key Vault Service (and other internal services such as Notification Service) is authenticated using a shared secret (`INTERNAL_SERVICE_KEY`):

- The calling service includes the secret in the `X-Internal-Service-Key` HTTP header
- The receiving service validates the header using `InternalServiceGuard`, which:
  1. Checks that `INTERNAL_SERVICE_KEY` is configured (throws `UnauthorizedException` if not)
  2. Verifies the header is present and has the same length as the expected key
  3. Performs `crypto.timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey))` to prevent timing attacks
- If the key is missing, has different length, or does not match: request is rejected with `401 Unauthorized`
- Docker network isolation (`vault-net`) ensures only the Core Wallet Service can reach the Key Vault

This approach relies on two layers of defense:
1. **Network isolation**: `vault-net` is an internal Docker bridge with no external access
2. **Shared secret validation**: Prevents unauthorized requests even within the Docker network

**Implementation**: `services/key-vault-service/src/common/guards/internal-service.guard.ts`

```typescript
@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-internal-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException('INTERNAL_SERVICE_KEY is not configured');
    }

    if (
      !serviceKey ||
      serviceKey.length !== expectedKey.length ||
      !timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey))
    ) {
      throw new UnauthorizedException('Invalid or missing internal service key');
    }

    return true;
  }
}
```

Identical guard implementations exist in:
- `services/core-wallet-service/src/common/guards/internal-service.guard.ts`
- `services/notification-service/src/common/guards/internal-service.guard.ts`

### Planned: mTLS Configuration

> **Note**: mTLS between Core Wallet Service and Key Vault Service is planned but not yet implemented. The current implementation uses `InternalServiceGuard` with shared secret + Docker network isolation (see above).

When implemented, mTLS will add certificate-based mutual authentication as a third layer of defense.

### Verification

To verify Key Vault network isolation from inside the container:

```bash
docker exec key-vault-service ping -c 1 google.com          # Should FAIL
docker exec key-vault-service ping -c 1 admin-api           # Should FAIL
docker exec key-vault-service ping -c 1 redis               # Should FAIL
docker exec key-vault-service ping -c 1 core-wallet-service # Should SUCCEED
```

## API Authentication

### JWT Authentication (Admin Panel, Client Portal)

- Users authenticate via `POST /auth/login` with email + password
- On success (without 2FA): receive access token (short-lived, default 15m) and refresh token (default 7d)
- Access tokens are signed JWTs containing: userId, email, role, clientId
- Refresh tokens are hashed (SHA-256) and stored in `cvh_auth.sessions`
- Sessions track: IP address, user agent, expiry
- 2FA (TOTP) is mandatory for admin users, configurable for client users
- Login attempts are tracked per IP and email with lockout after excessive failures

### API Key Authentication (Client API)

- API keys are created via `POST /auth/api-keys` (requires super_admin, admin, or owner role) with configurable:
  - **Scopes**: `read`, `write`, `withdraw`
  - **IP Allowlist**: Restrict key usage to specific IPs (JSON array)
  - **Allowed Chains**: Restrict key to specific chain IDs (JSON array)
  - **Expiration**: Optional expiry date
  - **Label**: Human-readable name
- Keys are SHA-256 hashed before storage -- the plaintext key is shown only once at creation
- Each API request includes the key in the `X-API-Key` header
- Validation: hash the provided key, look up in database, check scope/IP/chain/expiry
- Usage tracking: `last_used_at`, `last_used_ip`, `usage_count` updated on each use
- Revocation: `DELETE /auth/api-keys/:id` sets `revoked_at`

### Two-Factor Authentication (TOTP)

- Based on TOTP (Time-based One-Time Password, RFC 6238)
- TOTP library: `otplib` with `authenticator` module
- Configuration: 30-second step, 1-step window tolerance
- Setup: `POST /auth/2fa/setup` generates a secret, returns `otpauth://` URI for QR code scanning
- Verification: `POST /auth/2fa/verify` with a code from the authenticator app enables 2FA
- Login with 2FA: `POST /auth/login` returns `requires2fa: true` with an opaque challenge token (JWT, 2m TTL, purpose: `2fa_challenge`)
- Challenge verification: `POST /auth/2fa/challenge` with challenge token and TOTP code
- Disable: `POST /auth/2fa/disable` requires both a valid TOTP code AND the user's password (verified via bcrypt)

**TOTP Secret Encryption**:
- Secrets are encrypted at rest using AES-256-GCM
- Per-operation random salt: each encryption generates a fresh 16-byte salt
- Key derivation: `scryptSync(rawEncryptionKey, salt, 32)` derives a unique 32-byte key per operation
- Storage format: `salt:iv:authTag:ciphertext` (all hex-encoded, 4-part format)
- Legacy support: 3-part format (without salt) is supported for backward compatibility using a static-derived key

**Login Security**:
- Login attempts tracked per IP and email via `checkAndTrackLoginAttempt()`
- Successful login resets attempt counters via `resetLoginAttempts()`
- TOTP attempt rate limiting via `checkTotpAttempt()`
- Challenge tokens are opaque JWTs (contain userId but are signed and short-lived), preventing user ID enumeration

**Implementation**: `services/auth-service/src/totp/totp.service.ts`

### RBAC (Role-Based Access Control)

**Admin Roles**:
| Role | Permissions |
|------|-------------|
| `super_admin` | Full access to all admin operations |
| `admin` | CRUD on clients, tiers, chains, tokens, compliance |
| `viewer` | Read-only access to all admin data |

**Client Roles**:
| Role | Permissions |
|------|-------------|
| `owner` | Full access including API key management and security settings |
| `admin` | CRUD on wallets, addresses, webhooks |
| `viewer` | Read-only access to client data |

**Implementation**: `@AdminAuth()` decorator in `services/auth-service/src/rbac/admin-auth.decorator.ts` combines `AuthGuard('jwt')` with role checking. Used as `@AdminAuth('super_admin', 'admin')` to restrict endpoints to specific roles.

## On-Chain Transaction Security

### 2-of-3 Multisig (CvhWalletSimple)

- 3 signers initialized at wallet creation (immutable after init)
- Every withdrawal requires 2 of 3 signer signatures
- Signer 1: `msg.sender` (the transaction sender)
- Signer 2: Verified via `ecrecover` from the provided ECDSA signature
- Signers must be different (cannot self-sign)
- Contract uses OpenZeppelin `ReentrancyGuard` for reentrancy protection

### Replay Protection

- **Sequence ID Window**: 10 slots, max increase of 10,000 per operation
- Each operation consumes a unique sequence ID from the window
- Duplicate sequence IDs are rejected by the contract
- **Network ID**: `block.chainid` is included in the operation hash
- Different network ID suffixes: base chain ID for ETH, `<chainId>-ERC20` for tokens, `<chainId>-Batch` for batches
- Prevents cross-chain and cross-type replay attacks

### Signature Malleability Protection

- The `s` value of ECDSA signatures is checked: `uint256(s) <= MAX_S_VALUE`
- Where `MAX_S_VALUE = secp256k1n / 2`
- Signatures with high `s` values are rejected
- Prevents signature malleability attacks per EIP-2

### Safe Mode

- Irrevocable mode activated by any signer via `activateSafeMode()`
- Once active, `sendMultiSig()` can only send to signer addresses
- `sendMultiSigBatch()` is completely disabled in safe mode
- Emergency measure to lock down the wallet

### Operation Expiry

- Every multisig operation includes an `expireTime` parameter
- Transactions with `expireTime < block.timestamp` are rejected
- Prevents stale or delayed operations from being executed

### Contract Access Control

- **CvhBatcher**: Uses OpenZeppelin `Ownable2Step` for two-step ownership transfer (prevents accidental ownership loss). Admin functions (setTransferGasLimit, setBatchTransferLimit, recover) are owner-only.
- **CvhForwarder**: `onlyAllowedAddress` modifier restricts flush operations to parent wallet or feeAddress. `onlyParent` modifier restricts `callFromParent` to the parent wallet only.
- **Factories**: No access control on create/compute (anyone can deploy, but initialization parameters are validated).

## Rate Limiting

Multi-level rate limiting is applied via Kong API Gateway:

| Level | Mechanism | Configuration |
|-------|-----------|---------------|
| Per-service (Admin API) | Kong rate-limiting plugin | 50 requests/second |
| Per-service (Client API) | Kong rate-limiting plugin | 100 requests/second |
| Per-service (Auth Service) | Kong rate-limiting plugin | 10 requests/second |
| Request size | Kong request-size-limiting plugin | 1 MB maximum payload |
| Per-tenant | Tier-based limits | Synced from `cvh_admin.tiers` |
| Per-endpoint | Tier endpoint rate limits | Custom limits per API endpoint |
| Login attempts | In-app (Auth Service) | Per IP + email tracking with lockout |
| TOTP attempts | In-app (Auth Service) | Per user rate limiting |

Rate limiting is backed by Redis (`policy: redis`) for distributed consistency across multiple Kong instances.

**Configuration**: `infra/kong/kong.yml`

## Redis Authentication

Redis is configured with password authentication via the `requirepass` directive:

```
redis-server --requirepass ${REDIS_PASSWORD}
```

All services connect to Redis with the password provided via the `REDIS_PASSWORD` environment variable. This prevents unauthorized access to:
- BullMQ job queues (confirmation tracking, webhook delivery)
- Redis Streams (deposit event publishing)
- Rate limiting state
- Any cached data

## CORS Restrictions

Kong enforces CORS restrictions via a global plugin:

```yaml
plugins:
  - name: cors
    config:
      origins:
        - "http://localhost:3010"
        - "http://localhost:3011"
        - "https://admin.cryptovaulthub.com"
        - "https://portal.cryptovaulthub.com"
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
      headers: ["Content-Type", "Authorization", "X-API-Key"]
```

Only requests from the listed origins are allowed. In production, replace localhost origins with actual production domain names.

## Input Validation

All API inputs are validated using NestJS DTOs with `class-validator` decorators:

- Every endpoint has a corresponding DTO class with validation rules
- Ethereum address format validation for blockchain-related inputs
- Request size limited to 1 MB at the Kong gateway level
- Prisma ORM parameterizes all database queries (SQL injection prevention)

**Example DTO patterns**:
- `LoginDto`: email (IsEmail), password (IsString, MinLength)
- `CreateApiKeyDto`: clientId (IsInt), scopes (IsArray, IsEnum), ipAllowlist (IsOptional, IsArray)
- `Verify2faChallengeDto`: challengeToken (IsString), code (IsString, Length(6))

## Webhook Security

- All webhook payloads are signed with HMAC-SHA256
- Signing secret is generated per webhook endpoint at creation time
- Signature sent in `X-CVH-Signature` header
- Clients must verify the signature before processing the payload
- Retry policy: exponential backoff with jitter, up to Dead Letter Queue (DLQ)
- Delivery log tracks: HTTP status, response body, response time, retry count

## Audit Trail

Every action in the platform is captured via multiple mechanisms:

| Source | What Is Captured | Storage |
|--------|------------------|---------|
| PostHog interceptor (all services) | API requests/responses, headers, timing | PostHog (ClickHouse) |
| Key Vault audit | Key generation, signing, Shamir operations | `cvh_keyvault.key_vault_audit` (append-only) |
| Admin audit log | Client management, tier changes, compliance actions | `cvh_admin.audit_logs` |
| Webhook delivery log | Payload, HTTP status, response, latency, retry count | `cvh_notifications.webhook_deliveries` |
| Structured logs (Loki) | All service logs with trace IDs | Loki |
| Distributed traces (Jaeger) | Cross-service operation traces | Jaeger |

All events are correlated via `trace_id` shared with Loki logs and Jaeger distributed traces, enabling complete end-to-end debugging for any support case.

## Security Summary Table

| Layer | Mechanism | Details |
|-------|-----------|---------|
| Key Storage | AES-256-GCM envelope encryption | PBKDF2-derived KEK (600k iterations, SHA-512), per-key random salt |
| Key Isolation | vault-net Docker network | Zero internet access, InternalServiceGuard + timing-safe comparison |
| Transaction Auth | 2-of-3 on-chain multisig | ReentrancyGuard, replay protection, signature malleability prevention |
| API Auth (Web) | JWT + bcryptjs | SHA-256 hashed refresh tokens, session tracking, login lockout |
| API Auth (Client) | SHA-256 hashed API keys | Scoped (read/write/withdraw), IP-restricted, chain-restricted, expirable |
| 2FA | TOTP (RFC 6238) | AES-256-GCM encrypted secrets, per-operation random salt via scrypt |
| Rate Limiting | Kong + Redis | Per-service (10-100/s), per-tenant, per-endpoint, 1MB request size |
| CORS | Kong global plugin | Restricted to known origins only |
| Redis | requirepass | Password authentication on all Redis connections |
| Input Validation | class-validator + Prisma | DTO decorators, parameterized queries |
| Contract Security | Ownable2Step, ReentrancyGuard | Two-step ownership, reentrancy protection, custom error types |
| Webhook Integrity | HMAC-SHA256 | Per-endpoint signing secret, X-CVH-Signature header |
| Key Backup | Shamir's Secret Sharing | 3-of-5 threshold, individually encrypted shares |
| Memory Safety | Explicit buffer zeroing | .fill(0) on all DEK, KEK, and plaintext buffers |
| Audit | PostHog + key_vault_audit + Loki + Jaeger | Full event capture, trace ID correlation |
