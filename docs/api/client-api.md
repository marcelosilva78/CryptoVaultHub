# Client API Reference

Base URL: `/client/v1/`
Authentication: API Key via `X-API-Key` header
Authorization: API key scopes -- `read`, `write`, `withdraw`

All responses follow the envelope format:
```json
{
  "success": true,
  "...": "response data"
}
```

---

## Health

### Health Check

- **Method**: `GET`
- **Path**: `/client/v1/health`
- **Auth**: None

**Response** (200):
```json
{
  "success": true,
  "status": "ok",
  "service": "client-api",
  "timestamp": "2026-04-08T12:00:00.000Z"
}
```

---

### List Supported Tokens

Returns all tokens available on the platform.

- **Method**: `GET`
- **Path**: `/client/v1/tokens`
- **Auth**: None

**Response** (200):
```json
{
  "success": true,
  "tokens": [
    {
      "symbol": "USDC",
      "name": "USD Coin",
      "chainId": 1,
      "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "decimals": 6
    }
  ]
}
```

---

## Wallets

### List Wallets

Returns the hot wallets configured for the authenticated client across all chains.

- **Method**: `GET`
- **Path**: `/client/v1/wallets`
- **Auth**: `read` scope

**Response** (200):
```json
{
  "success": true,
  "wallets": [
    {
      "chainId": 1,
      "chainName": "Ethereum",
      "address": "0xHotWalletAddress...",
      "contractType": "CvhWalletSimple",
      "status": "active"
    },
    {
      "chainId": 56,
      "chainName": "BSC",
      "address": "0xHotWalletAddress...",
      "contractType": "CvhWalletSimple",
      "status": "active"
    }
  ]
}
```

---

### Get Balances

Returns token and native currency balances for the hot wallet on a specific chain.

- **Method**: `GET`
- **Path**: `/client/v1/wallets/:chainId/balances`
- **Auth**: `read` scope

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | integer | EVM chain ID |

**Response** (200):
```json
{
  "success": true,
  "balances": {
    "native": {
      "symbol": "ETH",
      "balance": "1.500000000000000000",
      "balanceWei": "1500000000000000000"
    },
    "tokens": [
      {
        "symbol": "USDC",
        "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "balance": "50000.000000",
        "balanceRaw": "50000000000"
      }
    ]
  }
}
```

---

## Deposit Addresses

### Generate Deposit Address

Generates a new deterministic deposit address (CREATE2 forwarder) on a specific chain.

- **Method**: `POST`
- **Path**: `/client/v1/wallets/:chainId/deposit-address`
- **Auth**: `write` scope

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | integer | EVM chain ID |

**Request Body**:
```json
{
  "label": "user-12345",
  "callbackUrl": "https://myapp.com/webhooks/deposits"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | No | Human-readable label for this address (max 100 chars) |
| `callbackUrl` | string | No | Override webhook URL for this specific address (max 100 chars) |

**Response** (201):
```json
{
  "success": true,
  "address": "0xComputedForwarderAddress...",
  "chainId": 1,
  "label": "user-12345",
  "isDeployed": false,
  "salt": "0xSaltUsed...",
  "createdAt": "2026-04-08T12:00:00.000Z"
}
```

Note: The address is computed via CREATE2 and is deterministic. The forwarder contract is deployed lazily -- only when needed for ERC-20 token flushing. ETH sent to the address before deployment will be auto-forwarded once the forwarder is deployed.

---

### Batch Generate Deposit Addresses

Generates multiple deposit addresses in a single request.

- **Method**: `POST`
- **Path**: `/client/v1/wallets/:chainId/deposit-addresses/batch`
- **Auth**: `write` scope

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | integer | EVM chain ID |

**Request Body**:
```json
{
  "count": 50,
  "labelPrefix": "user-batch-"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `count` | integer | Yes | Number of addresses to generate (1-100) |
| `labelPrefix` | string | No | Prefix for auto-generated labels (max 100 chars) |

**Response** (201):
```json
{
  "success": true,
  "addresses": [
    {
      "address": "0xAddress1...",
      "label": "user-batch-0",
      "salt": "0xSalt1..."
    },
    {
      "address": "0xAddress2...",
      "label": "user-batch-1",
      "salt": "0xSalt2..."
    }
  ],
  "count": 50,
  "chainId": 1
}
```

---

### List Deposit Addresses

Returns all deposit addresses generated for the authenticated client.

- **Method**: `GET`
- **Path**: `/client/v1/deposit-addresses`
- **Auth**: `read` scope

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "address": "0xForwarderAddress...",
      "chainId": 1,
      "label": "user-12345",
      "isDeployed": true,
      "createdAt": "2026-04-08T12:00:00.000Z"
    }
  ],
  "total": 1500,
  "page": 1,
  "limit": 20
}
```

---

## Deposits

### List Deposits

Returns deposits for the authenticated client with optional filtering.

- **Method**: `GET`
- **Path**: `/client/v1/deposits`
- **Auth**: `read` scope

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `status` | string | -- | Filter: `pending`, `confirming`, `confirmed`, `swept`, `reverted` |
| `chainId` | string | -- | Filter by chain ID |
| `fromDate` | string | -- | Start date (ISO 8601) |
| `toDate` | string | -- | End date (ISO 8601) |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "dep-uuid-1",
      "chainId": 1,
      "txHash": "0xTxHash...",
      "fromAddress": "0xSender...",
      "toAddress": "0xForwarder...",
      "amount": "1.000000000000000000",
      "tokenSymbol": "ETH",
      "status": "confirmed",
      "confirmations": 12,
      "confirmationsRequired": 12,
      "detectedAt": "2026-04-08T12:00:00.000Z",
      "confirmedAt": "2026-04-08T12:03:00.000Z"
    }
  ],
  "total": 892,
  "page": 1,
  "limit": 20
}
```

---

### Get Deposit

Returns details of a specific deposit.

- **Method**: `GET`
- **Path**: `/client/v1/deposits/:id`
- **Auth**: `read` scope

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Deposit UUID |

**Response** (200):
```json
{
  "success": true,
  "deposit": {
    "id": "dep-uuid-1",
    "chainId": 1,
    "txHash": "0xTxHash...",
    "blockNumber": 19500000,
    "fromAddress": "0xSender...",
    "toAddress": "0xForwarder...",
    "amount": "1.000000000000000000",
    "tokenSymbol": "ETH",
    "tokenContractAddress": null,
    "status": "confirmed",
    "confirmations": 12,
    "confirmationsRequired": 12,
    "kytStatus": "clear",
    "sweepTxHash": "0xSweepTx...",
    "detectedAt": "2026-04-08T12:00:00.000Z",
    "confirmedAt": "2026-04-08T12:03:00.000Z",
    "sweptAt": "2026-04-08T12:10:00.000Z"
  }
}
```

**Status Codes**:
- `200` -- Success
- `404` -- Deposit not found

---

## Withdrawals

### Create Withdrawal

Initiates a withdrawal from the hot wallet. The destination address must be in the client's address book and past the 24-hour cooldown period.

- **Method**: `POST`
- **Path**: `/client/v1/withdrawals`
- **Auth**: `write` scope

**Request Body**:
```json
{
  "chainId": 1,
  "tokenSymbol": "USDC",
  "toAddress": "0xWhitelistedAddress...",
  "amount": "1000.00",
  "memo": "Payout batch #42",
  "idempotencyKey": "payout-42-usdc",
  "callbackUrl": "https://myapp.com/webhooks/withdrawals"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chainId` | integer | Yes | Target chain ID |
| `tokenSymbol` | string | Yes | Token symbol (e.g., `ETH`, `USDC`) |
| `toAddress` | string | Yes | Destination address (must be whitelisted) |
| `amount` | string | Yes | Amount in human-readable format |
| `memo` | string | No | Internal memo (max 255 chars) |
| `idempotencyKey` | string | No | Idempotency key to prevent duplicates (max 100 chars) |
| `callbackUrl` | string | No | Override webhook URL for this withdrawal |

**Response** (201):
```json
{
  "success": true,
  "withdrawal": {
    "id": "wdr-uuid-1",
    "chainId": 1,
    "tokenSymbol": "USDC",
    "toAddress": "0xWhitelistedAddress...",
    "amount": "1000.00",
    "status": "pending_kyt",
    "kytStatus": "screening",
    "createdAt": "2026-04-08T12:00:00.000Z"
  }
}
```

**Withdrawal Flow**:
1. `pending_approval` -- Withdrawal created, awaiting approval
2. `pending_kyt` -- KYT screening in progress
3. `rejected` -- Rejected by KYT screening (sanctions hit) or admin
4. `pending_signing` -- Awaiting multisig signature(s)
5. `pending_broadcast` -- Signed, awaiting broadcast
6. `broadcasted` -- Transaction submitted on-chain
7. `confirming` -- Waiting for confirmations
8. `confirmed` -- Final, confirmed on-chain
9. `failed` -- Transaction failed

**Status Codes**:
- `201` -- Withdrawal created
- `400` -- Validation error
- `403` -- Address not whitelisted or still in cooldown
- `409` -- Duplicate idempotency key
- `422` -- Insufficient balance or KYT rejection

---

### List Withdrawals

- **Method**: `GET`
- **Path**: `/client/v1/withdrawals`
- **Auth**: `read` scope

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `status` | string | -- | Filter by withdrawal status |
| `chainId` | string | -- | Filter by chain ID |
| `fromDate` | string | -- | Start date (ISO 8601) |
| `toDate` | string | -- | End date (ISO 8601) |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "wdr-uuid-1",
      "chainId": 1,
      "tokenSymbol": "USDC",
      "toAddress": "0xWhitelistedAddress...",
      "amount": "1000.00",
      "status": "confirmed",
      "txHash": "0xTxHash...",
      "createdAt": "2026-04-08T12:00:00.000Z",
      "confirmedAt": "2026-04-08T12:05:00.000Z"
    }
  ],
  "total": 234,
  "page": 1,
  "limit": 20
}
```

---

### Get Withdrawal

- **Method**: `GET`
- **Path**: `/client/v1/withdrawals/:id`
- **Auth**: `read` scope

**Response** (200):
```json
{
  "success": true,
  "withdrawal": {
    "id": "wdr-uuid-1",
    "chainId": 1,
    "tokenSymbol": "USDC",
    "toAddress": "0xWhitelistedAddress...",
    "amount": "1000.00",
    "status": "confirmed",
    "txHash": "0xTxHash...",
    "blockNumber": 19500100,
    "gasUsed": "65000",
    "kytStatus": "clear",
    "memo": "Payout batch #42",
    "createdAt": "2026-04-08T12:00:00.000Z",
    "broadcastedAt": "2026-04-08T12:01:00.000Z",
    "confirmedAt": "2026-04-08T12:05:00.000Z"
  }
}
```

---

## Address Book

### Add Address

Adds a new address to the client's whitelist. A 24-hour cooldown period begins after registration before the address can be used for withdrawals.

- **Method**: `POST`
- **Path**: `/client/v1/addresses`
- **Auth**: `write` scope

**Request Body**:
```json
{
  "address": "0xRecipientAddress...",
  "chainId": 1,
  "label": "Treasury Wallet",
  "notes": "Main treasury for Ethereum"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | EVM address to whitelist |
| `chainId` | integer | Yes | Chain ID for this address |
| `label` | string | Yes | Human-readable label (max 100 chars) |
| `notes` | string | No | Optional notes (max 255 chars) |

**Response** (201):
```json
{
  "success": true,
  "addressEntry": {
    "id": "addr-uuid-1",
    "address": "0xRecipientAddress...",
    "chainId": 1,
    "label": "Treasury Wallet",
    "notes": "Main treasury for Ethereum",
    "status": "cooldown",
    "availableAt": "2026-04-09T12:00:00.000Z",
    "createdAt": "2026-04-08T12:00:00.000Z"
  }
}
```

---

### List Addresses

- **Method**: `GET`
- **Path**: `/client/v1/addresses`
- **Auth**: `read` scope

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page |
| `chainId` | integer | -- | Filter by chain ID |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "addr-uuid-1",
      "address": "0xRecipientAddress...",
      "chainId": 1,
      "label": "Treasury Wallet",
      "status": "active",
      "availableAt": "2026-04-09T12:00:00.000Z",
      "createdAt": "2026-04-08T12:00:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 50
}
```

---

### Update Address

- **Method**: `PATCH`
- **Path**: `/client/v1/addresses/:id`
- **Auth**: `write` scope

**Request Body**:
```json
{
  "label": "Updated Label",
  "notes": "Updated notes"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | No | Updated label (max 100 chars) |
| `notes` | string | No | Updated notes (max 255 chars) |

---

### Disable Address

Soft-deletes an address from the whitelist. History is preserved.

- **Method**: `DELETE`
- **Path**: `/client/v1/addresses/:id`
- **Auth**: `write` scope

**Response** (200):
```json
{
  "success": true,
  "message": "Address disabled"
}
```

---

## Webhooks

### Create Webhook

Registers a webhook endpoint for receiving event notifications.

- **Method**: `POST`
- **Path**: `/client/v1/webhooks`
- **Auth**: `write` scope

**Request Body**:
```json
{
  "url": "https://myapp.com/webhooks/crypto",
  "events": [
    "deposit.pending",
    "deposit.confirmed",
    "withdrawal.confirmed",
    "withdrawal.failed"
  ],
  "label": "Production webhook",
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Webhook endpoint URL (must be HTTPS in production) |
| `events` | string[] | Yes | List of event types to subscribe to |
| `label` | string | No | Human-readable label (max 100 chars) |
| `isActive` | boolean | No | Whether the webhook is active (default: true) |

**Available Events**:
- `deposit.pending` -- New deposit detected
- `deposit.confirming` -- Deposit gaining confirmations
- `deposit.confirmed` -- Deposit fully confirmed
- `deposit.reverted` -- Deposit reverted (reorg detected)
- `deposit.swept` -- Deposit swept to hot wallet
- `withdrawal.pending` -- Withdrawal created
- `withdrawal.signed` -- Withdrawal signed
- `withdrawal.broadcasted` -- Withdrawal transaction submitted
- `withdrawal.confirmed` -- Withdrawal confirmed on-chain
- `withdrawal.failed` -- Withdrawal failed

**Response** (201):
```json
{
  "success": true,
  "webhook": {
    "id": "wh-uuid-1",
    "url": "https://myapp.com/webhooks/crypto",
    "events": ["deposit.pending", "deposit.confirmed", "withdrawal.confirmed", "withdrawal.failed"],
    "label": "Production webhook",
    "isActive": true,
    "signingSecret": "whsec_abc123...",
    "createdAt": "2026-04-08T12:00:00.000Z"
  }
}
```

The `signingSecret` is only returned once at creation time. Use it to verify webhook payloads via HMAC-SHA256.

---

### List Webhooks

- **Method**: `GET`
- **Path**: `/client/v1/webhooks`
- **Auth**: `read` scope

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |

---

### Update Webhook

- **Method**: `PATCH`
- **Path**: `/client/v1/webhooks/:id`
- **Auth**: `write` scope

**Request Body** (all fields optional):
```json
{
  "url": "https://myapp.com/webhooks/v2",
  "events": ["deposit.confirmed", "withdrawal.confirmed"],
  "label": "Updated webhook",
  "isActive": false
}
```

---

### Delete Webhook

- **Method**: `DELETE`
- **Path**: `/client/v1/webhooks/:id`
- **Auth**: `write` scope

**Response** (200):
```json
{
  "success": true,
  "message": "Webhook deleted"
}
```

---

### Test Webhook

Sends a test payload to the webhook endpoint.

- **Method**: `POST`
- **Path**: `/client/v1/webhooks/:id/test`
- **Auth**: `write` scope

**Response** (200):
```json
{
  "success": true,
  "delivery": {
    "id": "del-uuid-1",
    "statusCode": 200,
    "responseTime": 250,
    "status": "delivered"
  }
}
```

---

### List Deliveries

Returns the delivery log for a specific webhook endpoint.

- **Method**: `GET`
- **Path**: `/client/v1/webhooks/:id/deliveries`
- **Auth**: `read` scope

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `status` | string | -- | Filter: `delivered`, `failed`, `pending` |

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "del-uuid-1",
      "event": "deposit.confirmed",
      "status": "delivered",
      "statusCode": 200,
      "responseTime": 250,
      "attempts": 1,
      "payload": { "...": "event payload" },
      "createdAt": "2026-04-08T12:00:00.000Z"
    }
  ],
  "total": 500,
  "page": 1,
  "limit": 20
}
```

---

### Retry Delivery

Retries a failed webhook delivery.

- **Method**: `POST`
- **Path**: `/client/v1/webhooks/deliveries/:id/retry`
- **Auth**: `write` scope

**Response** (200):
```json
{
  "success": true,
  "delivery": {
    "id": "del-uuid-1",
    "status": "pending",
    "retryCount": 2
  }
}
```

---

## Co-Sign

For clients using `co_sign` custody mode.

### List Pending Operations

Returns operations awaiting the client's co-signature.

- **Method**: `POST`
- **Path**: `/client/v1/co-sign/pending`
- **Auth**: `read` scope

**Response** (200):
```json
{
  "success": true,
  "operations": [
    {
      "operationId": "op-uuid-1",
      "type": "withdrawal",
      "chainId": 1,
      "toAddress": "0xDestination...",
      "amount": "1000.00",
      "tokenSymbol": "USDC",
      "operationHash": "0xHashToSign...",
      "expiresAt": "2026-04-08T13:00:00.000Z",
      "createdAt": "2026-04-08T12:00:00.000Z"
    }
  ]
}
```

---

### Submit Signature

Submits the client's signature for a pending co-sign operation.

- **Method**: `POST`
- **Path**: `/client/v1/co-sign/:operationId/sign`
- **Auth**: `write` scope

**Request Body**:
```json
{
  "signature": "0x65ByteECDSASignature...",
  "publicKey": "0xOptionalPublicKey..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | Yes | 65-byte ECDSA signature (r, s, v) of the operation hash |
| `publicKey` | string | No | Public key for verification (optional) |

**Response** (200):
```json
{
  "success": true,
  "operationId": "op-uuid-1",
  "status": "signed",
  "txHash": "0xSubmittedTxHash..."
}
```

---

## Webhook Payload Format

All webhook payloads are signed with HMAC-SHA256 using the webhook's `signingSecret`. The signature is sent in the `X-CVH-Signature` header.

**Verification** (Node.js example):
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

**Example Webhook Payload**:
```json
{
  "event": "deposit.confirmed",
  "timestamp": "2026-04-08T12:03:00.000Z",
  "data": {
    "id": "dep-uuid-1",
    "chainId": 1,
    "txHash": "0xTxHash...",
    "fromAddress": "0xSender...",
    "toAddress": "0xForwarder...",
    "amount": "1.000000000000000000",
    "tokenSymbol": "ETH",
    "confirmations": 12,
    "status": "confirmed"
  }
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
- `401` -- Unauthorized (missing or invalid API key)
- `403` -- Forbidden (insufficient scope or resource access)
- `404` -- Not Found
- `409` -- Conflict (duplicate idempotency key)
- `422` -- Unprocessable Entity (business rule violation)
- `429` -- Too Many Requests (rate limited by tier)
- `500` -- Internal Server Error

---

## Rate Limiting

Rate limits are determined by the client's assigned tier. Limits are applied per API key at both global and per-endpoint levels.

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1712584800
```

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header.
