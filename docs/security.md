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
- Communicates ONLY with the Core Wallet Service via `InternalServiceGuard` (shared secret in `X-Internal-Service-Key` header) + Docker network isolation
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
                 | (from environment)  |
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

1. Generate a random 256-bit DEK (Data Encryption Key)
2. Generate a random 32-byte salt
3. Derive KEK from master password via PBKDF2 (600,000 iterations, SHA-512, per OWASP 2024 recommendation)
4. Encrypt private key with DEK using AES-256-GCM (produces ciphertext + IV + authTag)
5. Wrap DEK with KEK using AES-256-GCM (produces encryptedDek)
6. Zero DEK and KEK from memory immediately
7. Store: ciphertext, IV, authTag, salt, encryptedDek in database

### Decryption Process

1. Derive KEK from master password + stored salt via PBKDF2
2. Unwrap DEK from encryptedDek using KEK + AES-256-GCM
3. Decrypt ciphertext using DEK + IV + authTag via AES-256-GCM
4. Zero KEK and DEK from memory immediately
5. Return plaintext (zeroed after use by caller)

### Implementation

The encryption is implemented in `services/key-vault-service/src/encryption/encryption.service.ts` using Node.js native `crypto` module:
- `createCipheriv('aes-256-gcm', ...)` for encryption
- `createDecipheriv('aes-256-gcm', ...)` for decryption
- `pbkdf2Sync(masterPassword, salt, iterations, 32, 'sha512')` for KEK derivation
- `randomBytes(32)` for DEK and salt generation

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
[public-net] -- Kong, Admin Panel, Client Portal, Grafana
    |
    v (Kong routes to internal services)
[internal-net] -- All NestJS services, Redis
    |
    | (Core Wallet bridges to vault-net)
    v
[vault-net] -- Key Vault Service ONLY
    |
    X (no route to internet, no route to public-net)

[monitoring-net] -- PostHog, Prometheus, Loki, Jaeger, ClickHouse, Kafka
```

### Key Security Properties

1. **Key Vault has ZERO internet access**: `vault-net` is an internal Docker bridge network. The Key Vault container has no route to the internet.
2. **internal-net is internal**: Marked `internal: true` in docker-compose, meaning no external access is possible.
3. **Core Wallet is the sole bridge**: Only the Core Wallet Service exists on both `internal-net` and `vault-net`.
4. **Monitoring is separated**: Observability stack runs on its own network, with select bridges to `internal-net` for metric scraping.

### Inter-Service Authentication (INTERNAL_SERVICE_KEY)

Communication between Core Wallet Service and Key Vault Service (and other internal services such as Notification Service) is authenticated using a shared secret (`INTERNAL_SERVICE_KEY`):

- The calling service includes the secret in the `X-Internal-Service-Key` HTTP header
- The receiving service validates the header using `InternalServiceGuard`, which performs a timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks
- If the key is missing or invalid, the request is rejected with `401 Unauthorized`
- Docker network isolation (`vault-net`) ensures only the Core Wallet Service can reach the Key Vault

This approach relies on two layers of defense:
1. **Network isolation**: `vault-net` is an internal Docker bridge with no external access
2. **Shared secret validation**: Prevents unauthorized requests even within the Docker network

### Planned: mTLS Configuration

> **Note**: mTLS between Core Wallet Service and Key Vault Service is planned but not yet implemented. The current implementation uses `InternalServiceGuard` with shared secret + Docker network isolation (see above).

When implemented, mTLS will add certificate-based mutual authentication:

```bash
# Generate CA
openssl genrsa -out ca-key.pem 4096
openssl req -x509 -new -key ca-key.pem -days 3650 -out ca-cert.pem \
  -subj "/CN=CVH Internal CA"

# Generate Key Vault server cert
openssl genrsa -out vault-key.pem 2048
openssl req -new -key vault-key.pem -out vault.csr \
  -subj "/CN=key-vault-service"
openssl x509 -req -in vault.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out vault-cert.pem -days 365

# Generate Core Wallet client cert
openssl genrsa -out wallet-key.pem 2048
openssl req -new -key wallet-key.pem -out wallet.csr \
  -subj "/CN=core-wallet-service"
openssl x509 -req -in wallet.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out wallet-cert.pem -days 365
```

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
- On success, receive access token (short-lived, default 15m) and refresh token (default 7d)
- Access tokens are signed JWTs containing: userId, email, role, clientId
- Refresh tokens are hashed (SHA-256) and stored in `cvh_auth.sessions`
- Sessions track: IP address, user agent, expiry
- 2FA (TOTP) is mandatory for admin users, configurable for client users

### API Key Authentication (Client API)

- API keys are created via `POST /auth/api-keys` with configurable:
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
- Setup: `POST /auth/2fa/setup` returns a `secret` and `otpauth://` URI for QR code
- Verification: `POST /auth/2fa/verify` with a code to enable 2FA
- Login: If 2FA enabled, `POST /auth/login` returns `requires2fa: true` -- client submits TOTP code
- Disable: `POST /auth/2fa/disable` with a valid code

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

## On-Chain Transaction Security

### 2-of-3 Multisig (CvhWalletSimple)

- 3 signers initialized at wallet creation: platformKey, clientKey, backupKey
- Every withdrawal requires 2 of 3 signer signatures
- Signer 1: `msg.sender` (the transaction sender)
- Signer 2: Verified via `ecrecover` from the provided ECDSA signature
- Signers must be different (cannot self-sign)

### Replay Protection

- **Sequence ID Window**: 10 slots, max increase of 10,000 per operation
- Each operation consumes a unique sequence ID from the window
- Duplicate sequence IDs are rejected by the contract
- **Network ID**: `block.chainid` is included in the operation hash
- Different network ID suffixes: base for ETH, `-ERC20` for tokens, `-Batch` for batches
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

## Rate Limiting

Multi-level rate limiting is applied via Kong API Gateway:

| Level | Mechanism | Configuration |
|-------|-----------|---------------|
| Global per service | Kong rate-limiting plugin | Admin API: 50/s, Client API: 100/s |
| Per-Tenant | Tier-based limits | Synced from `cvh_admin.tiers` |
| Per-Endpoint | Tier endpoint rate limits | Custom limits per API endpoint |
| Request size | Kong request-size-limiting | 1 MB maximum payload |

Rate limiting is backed by Redis for distributed consistency across multiple Kong instances.

## Webhook Security

- All webhook payloads are signed with HMAC-SHA256
- Signing secret is generated per webhook endpoint at creation time
- Signature sent in `X-CVH-Signature` header
- Clients must verify the signature before processing the payload
- Retry policy: exponential backoff with jitter, up to Dead Letter Queue (DLQ)
- Delivery log tracks: HTTP status, response time, retry count

## Audit Trail

Every action in the platform is captured via PostHog:

- **API Requests**: Full request/response with headers and timing (via NestJS interceptor in each service)
- **Webhook Deliveries**: Payload, response, HTTP status, latency
- **Blockchain Events**: Deposits, sweeps, withdrawals, failures
- **Compliance Actions**: Screenings, alert resolution, status changes
- **Admin Actions**: Client management, tier changes, key generation
- **Key Vault Operations**: Key generation, signing, Shamir operations (append-only `key_vault_audit` table)

All events are correlated via `trace_id` shared with Loki logs and Jaeger distributed traces, enabling complete end-to-end debugging for any support case.
