# Admin API Reference

Base URL: `/admin/`
Authentication: JWT Bearer token (admin users only)
Authorization: Role-based -- `super_admin`, `admin`, `viewer`

All responses follow the envelope format:
```json
{
  "success": true,
  "...": "response data"
}
```

---

## Client Management

### Create Client

Creates a new client organization on the platform.

- **Method**: `POST`
- **Path**: `/admin/clients`
- **Auth**: `super_admin`, `admin`

**Request Body**:
```json
{
  "name": "Acme Exchange",
  "slug": "acme-exchange",
  "tierId": 1,
  "custodyMode": "full_custody",
  "kytEnabled": true,
  "kytLevel": "basic"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Client display name (2-200 chars) |
| `slug` | string | Yes | URL-safe identifier (lowercase alphanumeric + hyphens, 2-100 chars) |
| `tierId` | integer | No | Tier ID to assign |
| `custodyMode` | enum | No | `full_custody` or `co_sign` |
| `kytEnabled` | boolean | No | Enable KYT screening |
| `kytLevel` | enum | No | `basic`, `enhanced`, or `full` |

**Response** (201):
```json
{
  "success": true,
  "client": {
    "id": 1,
    "name": "Acme Exchange",
    "slug": "acme-exchange",
    "status": "onboarding",
    "tierId": 1,
    "custodyMode": "full_custody",
    "kytEnabled": true,
    "kytLevel": "basic",
    "createdAt": "2026-04-08T12:00:00.000Z"
  }
}
```

**Status Codes**:
- `201` -- Client created
- `400` -- Validation error (invalid slug format, missing required fields)
- `401` -- Unauthorized (invalid/missing JWT)
- `403` -- Forbidden (insufficient role)
- `409` -- Conflict (slug already exists)

---

### List Clients

Returns a paginated list of all client organizations.

- **Method**: `GET`
- **Path**: `/admin/clients`
- **Auth**: Any admin role

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `status` | string | -- | Filter by status (`active`, `suspended`, `onboarding`) |
| `search` | string | -- | Search by name or slug |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Acme Exchange",
      "slug": "acme-exchange",
      "status": "active",
      "tierId": 1,
      "custodyMode": "full_custody",
      "createdAt": "2026-04-08T12:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### Get Client

Returns detailed information about a specific client.

- **Method**: `GET`
- **Path**: `/admin/clients/:id`
- **Auth**: Any admin role

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Client ID |

**Response** (200):
```json
{
  "success": true,
  "client": {
    "id": 1,
    "name": "Acme Exchange",
    "slug": "acme-exchange",
    "status": "active",
    "tierId": 1,
    "custodyMode": "full_custody",
    "kytEnabled": true,
    "kytLevel": "basic",
    "createdAt": "2026-04-08T12:00:00.000Z",
    "updatedAt": "2026-04-08T14:30:00.000Z"
  }
}
```

**Status Codes**:
- `200` -- Success
- `404` -- Client not found

---

### Update Client

Updates a client organization's configuration.

- **Method**: `PATCH`
- **Path**: `/admin/clients/:id`
- **Auth**: `super_admin`, `admin`

**Request Body** (all fields optional):
```json
{
  "name": "Acme Exchange Pro",
  "status": "active",
  "tierId": 2,
  "custodyMode": "co_sign",
  "kytEnabled": true,
  "kytLevel": "full"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Updated display name (2-200 chars) |
| `status` | enum | `active`, `suspended`, or `onboarding` |
| `tierId` | integer | New tier assignment |
| `custodyMode` | enum | `full_custody` or `co_sign` |
| `kytEnabled` | boolean | Toggle KYT screening |
| `kytLevel` | enum | `basic`, `enhanced`, or `full` |

**Response** (200):
```json
{
  "success": true,
  "client": { "...": "updated client object" }
}
```

---

### Generate Keys

Generates HD wallet keys (platform, client, backup) for a client via the Key Vault service.

- **Method**: `POST`
- **Path**: `/admin/clients/:id/generate-keys`
- **Auth**: `super_admin`, `admin`

**Request Body**: None

**Response** (200):
```json
{
  "success": true,
  "platformAddress": "0x1234...abcd",
  "clientAddress": "0x5678...efgh",
  "backupAddress": "0x9abc...ijkl"
}
```

**Status Codes**:
- `200` -- Keys generated successfully
- `404` -- Client not found
- `409` -- Keys already generated for this client

---

## Tier Management

### Create Tier

Creates a new rate-limit and resource tier.

- **Method**: `POST`
- **Path**: `/admin/tiers`
- **Auth**: `super_admin`, `admin`

**Request Body**:
```json
{
  "name": "Business",
  "baseTierId": 1,
  "isPreset": false,
  "isCustom": true,
  "globalRateLimit": 200,
  "endpointRateLimits": {
    "POST /client/v1/withdrawals": 10,
    "POST /client/v1/wallets/:chainId/deposit-address": 50
  },
  "maxForwardersPerChain": 10000,
  "maxChains": 5,
  "maxWebhooks": 10,
  "dailyWithdrawalLimitUsd": 100000,
  "monitoringMode": "hybrid",
  "kytLevel": "full"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Tier name (2-100 chars) |
| `baseTierId` | integer | No | Clone settings from an existing tier |
| `isPreset` | boolean | No | Mark as a preset tier |
| `isCustom` | boolean | No | Mark as custom (client-specific) |
| `globalRateLimit` | integer | No | Requests per second (global) |
| `endpointRateLimits` | object | No | Per-endpoint rate limits |
| `maxForwardersPerChain` | integer | No | Max deposit addresses per chain |
| `maxChains` | integer | No | Max chains the client can use |
| `maxWebhooks` | integer | No | Max webhook endpoints |
| `dailyWithdrawalLimitUsd` | number | No | Daily withdrawal limit in USD |
| `monitoringMode` | string | No | `realtime`, `polling`, or `hybrid` |
| `kytLevel` | enum | No | `basic`, `enhanced`, or `full` |

**Response** (201):
```json
{
  "success": true,
  "tier": {
    "id": 4,
    "name": "Business",
    "globalRateLimit": 200,
    "maxForwardersPerChain": 10000,
    "...": "..."
  }
}
```

---

### List Tiers

- **Method**: `GET`
- **Path**: `/admin/tiers`
- **Auth**: Any admin role

**Response** (200):
```json
{
  "success": true,
  "tiers": [
    {
      "id": 1,
      "name": "Starter",
      "isPreset": true,
      "globalRateLimit": 50,
      "maxForwardersPerChain": 1000,
      "maxChains": 2,
      "...": "..."
    }
  ]
}
```

---

### Update Tier

- **Method**: `PATCH`
- **Path**: `/admin/tiers/:id`
- **Auth**: `super_admin`, `admin`

**Request Body**: Same fields as Create Tier (all optional).

---

### Clone Tier

Creates a copy of an existing tier for customization.

- **Method**: `POST`
- **Path**: `/admin/tiers/:id/clone`
- **Auth**: `super_admin`, `admin`

**Response** (200):
```json
{
  "success": true,
  "tier": {
    "id": 5,
    "name": "Business (copy)",
    "isCustom": true,
    "...": "..."
  }
}
```

---

## Chain Management

### Add Chain

Registers a new EVM chain in the platform.

- **Method**: `POST`
- **Path**: `/admin/chains`
- **Auth**: `super_admin`, `admin`

**Request Body**:
```json
{
  "name": "Ethereum",
  "symbol": "ETH",
  "chainId": 1,
  "rpcUrl": "https://eth-mainnet.gateway.tatum.io/",
  "explorerUrl": "https://etherscan.io",
  "confirmationsRequired": 12,
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Chain display name (1-50 chars) |
| `symbol` | string | Yes | Native currency symbol (1-20 chars) |
| `chainId` | integer | Yes | EVM chain ID |
| `rpcUrl` | string | Yes | Primary RPC endpoint URL |
| `explorerUrl` | string | No | Block explorer URL |
| `confirmationsRequired` | integer | No | Blocks to wait before confirming (min 1) |
| `isActive` | boolean | No | Whether the chain is active |

**Response** (201):
```json
{
  "success": true,
  "chain": {
    "id": 1,
    "name": "Ethereum",
    "symbol": "ETH",
    "chainId": 1,
    "rpcUrl": "https://eth-mainnet.gateway.tatum.io/",
    "confirmationsRequired": 12,
    "isActive": true
  }
}
```

---

### List Chains

- **Method**: `GET`
- **Path**: `/admin/chains`
- **Auth**: Any admin role

**Response** (200):
```json
{
  "success": true,
  "chains": [
    {
      "name": "Ethereum",
      "symbol": "ETH",
      "chainId": 1,
      "isActive": true
    },
    {
      "name": "BSC",
      "symbol": "BNB",
      "chainId": 56,
      "isActive": true
    }
  ]
}
```

---

## Token Management

### Add Token

Registers a new ERC-20 token in the global registry.

- **Method**: `POST`
- **Path**: `/admin/tokens`
- **Auth**: `super_admin`, `admin`

**Request Body**:
```json
{
  "name": "USD Coin",
  "symbol": "USDC",
  "chainId": 1,
  "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "decimals": 6,
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Token name (1-50 chars) |
| `symbol` | string | Yes | Token symbol (1-20 chars) |
| `chainId` | integer | Yes | Chain ID where the token is deployed |
| `contractAddress` | string | Yes | ERC-20 contract address |
| `decimals` | integer | Yes | Token decimals (>= 0) |
| `isActive` | boolean | No | Whether the token is active |

**Response** (201):
```json
{
  "success": true,
  "token": {
    "id": 1,
    "name": "USD Coin",
    "symbol": "USDC",
    "chainId": 1,
    "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "decimals": 6,
    "isActive": true
  }
}
```

---

### List Tokens

- **Method**: `GET`
- **Path**: `/admin/tokens`
- **Auth**: Any admin role

**Response** (200):
```json
{
  "success": true,
  "tokens": [
    {
      "id": 1,
      "name": "USD Coin",
      "symbol": "USDC",
      "chainId": 1,
      "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "decimals": 6,
      "isActive": true
    }
  ]
}
```

---

## Compliance Management

### List Alerts

Returns a paginated list of KYT/compliance alerts.

- **Method**: `GET`
- **Path**: `/admin/compliance/alerts`
- **Auth**: Any admin role

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `status` | string | -- | Filter by status (`pending`, `acknowledged`, `dismissed`, `escalated`, `resolved`) |
| `clientId` | string | -- | Filter by client ID |
| `severity` | string | -- | Filter by severity (`low`, `medium`, `high`, `critical`) |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "alert-uuid-1",
      "clientId": 1,
      "type": "sanctions_hit",
      "severity": "critical",
      "status": "pending",
      "address": "0xSanctionedAddress...",
      "listSource": "OFAC_SDN",
      "details": { "matchType": "exact", "listEntry": "..." },
      "createdAt": "2026-04-08T10:00:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### Update Alert

Updates the status or assignment of a compliance alert.

- **Method**: `PATCH`
- **Path**: `/admin/compliance/alerts/:id`
- **Auth**: `super_admin`, `admin`

**Request Body**:
```json
{
  "status": "acknowledged",
  "notes": "Reviewed - confirmed false positive",
  "assignedTo": "analyst@company.com"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum | `acknowledged`, `dismissed`, `escalated`, `resolved` |
| `notes` | string | Free-text notes for the audit trail |
| `assignedTo` | string | Assign to a specific user/team |

**Response** (200):
```json
{
  "success": true,
  "alert": { "...": "updated alert object" }
}
```

---

## Monitoring

### Get Service Health

Returns health status of all platform services.

- **Method**: `GET`
- **Path**: `/admin/monitoring/health`
- **Auth**: Any admin role

**Response** (200):
```json
{
  "success": true,
  "services": {
    "admin-api": { "status": "healthy", "latencyMs": 2 },
    "core-wallet": { "status": "healthy", "latencyMs": 5 },
    "key-vault": { "status": "healthy", "latencyMs": 3 },
    "chain-indexer": { "status": "healthy", "latencyMs": 4 },
    "notification": { "status": "healthy", "latencyMs": 2 }
  },
  "redis": { "status": "connected" },
  "database": { "status": "connected" }
}
```

---

### Get Queue Status

Returns the status of all BullMQ queues.

- **Method**: `GET`
- **Path**: `/admin/monitoring/queues`
- **Auth**: Any admin role

**Response** (200):
```json
{
  "success": true,
  "queues": [
    {
      "name": "webhooks",
      "waiting": 12,
      "active": 3,
      "completed": 45892,
      "failed": 7,
      "delayed": 0
    },
    {
      "name": "sweeps",
      "waiting": 0,
      "active": 1,
      "completed": 2341,
      "failed": 0,
      "delayed": 5
    }
  ]
}
```

---

### Get Gas Tanks

Returns the balance and status of all gas tanks across clients and chains.

- **Method**: `GET`
- **Path**: `/admin/gas-tanks`
- **Auth**: Any admin role

**Response** (200):
```json
{
  "success": true,
  "gasTanks": [
    {
      "clientId": 1,
      "clientName": "Acme Exchange",
      "chainId": 1,
      "chainName": "Ethereum",
      "address": "0xGasTankAddress...",
      "balanceWei": "500000000000000000",
      "balanceFormatted": "0.5 ETH",
      "estimatedDaysRemaining": 15,
      "status": "healthy"
    }
  ]
}
```

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "statusCode": 400
}
```

Common status codes:
- `400` -- Bad Request (validation error)
- `401` -- Unauthorized (missing or invalid JWT)
- `403` -- Forbidden (insufficient role)
- `404` -- Not Found
- `409` -- Conflict (duplicate resource)
- `429` -- Too Many Requests (rate limited)
- `500` -- Internal Server Error
