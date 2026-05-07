# CryptoVaultHub Client API — Canonical Reference
Generated from a successful homologation run on 2026-05-07.

## How to use

Each operation below shows:
- The **request** as a copy-pasteable `curl` (secrets redacted as `<X_API_KEY>` etc.).
- A **sample response** with the actual status code we observed during homologation.
- **Notes** for any quirks we hit and how we adapted the call.

Replace placeholders before running:
- `<X_API_KEY>` — your client API key (Sidebar → API Keys)
- IDs (e.g. `:chainId`, `:projectId`) — values for your account

---

## Resolve project "BrPay"

**Endpoint:** `GET /projects`

### Request
```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

### Sample response (HTTP 200 OK)
```json
{
  "success": true,
  "projects": [
    {
      "id": "6998",
      "name": "BrPay",
      "slug": "brpay",
      "description": "Um gateway de pagamentos com conversão de Crypto para Fiat. ",
      "isDefault": false,
      "status": "active",
      "settings": {
        "custodyMode": "full_custody"
      },
      "createdAt": "2026-05-05T19:15:15.088Z",
      "updatedAt": "2026-05-05T19:15:15.088Z",
      "chainsCount": 1,
      "walletsCount": 2,
      "deletionRequestedAt": null,
      "de
```

---

## List wallets (gas_tank + hot)

**Endpoint:** `GET /wallets`

### Request
```bash
curl -X GET 'https://api.vaulthub.live/client/v1/wallets' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

### Sample response (HTTP 200 OK)
```json
{
  "success": true,
  "wallets": [
    {
      "id": 9,
      "projectId": 6998,
      "chainId": 56,
      "address": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "walletType": "gas_tank",
      "isActive": true,
      "createdAt": "2026-05-05T19:15:26.000Z"
    },
    {
      "id": 10,
      "projectId": 6998,
      "chainId": 56,
      "address": "0x17193A58d73825485393E00ecE33051Fa2536415",
      "walletType": "hot",
      "isActive": true,
      "createdAt": "2026-05-07T23:51:50.000
```

---

## Confirm gas tank status = ok

**Endpoint:** `GET /gas-tanks`

### Request
```bash
curl -X GET 'https://api.vaulthub.live/client/v1/gas-tanks' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

### Sample response (HTTP 200 OK)
```json
{
  "success": true,
  "gasTanks": [
    {
      "chainId": 56,
      "chainName": "BNB Smart Chain",
      "nativeSymbol": "BNB",
      "address": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "derivationPath": "m/44'/60'/1000'/56/0",
      "balanceWei": "9519569650000000",
      "gasPriceWei": "50000000",
      "thresholdWei": "1000000000000000",
      "estimatedOpsRemaining": 9066,
      "status": "ok",
      "alertConfig": {
        "emailEnabled": false,
        "webhookEnabled": true
```

---

## Register webhook receiver

**Endpoint:** `POST /webhooks`

### Request
```bash
curl -X POST 'https://api.vaulthub.live/client/v1/webhooks' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/642ece7a-3f51-4d64-b80c-38335edb7825","events":["deposit.detected","deposit.confirmed","deposit.swept","forwarder.deployed","gas_tank.low_balance","withdrawal.submitted","withdrawal.confirmed","withdrawal.failed"]}'
```

### Sample response (HTTP 201 OK)
```json
{
  "success": true,
  "webhook": {
    "id": 12,
    "clientId": 8,
    "url": "https://webhook.site/642ece7a-3f51-4d64-b80c-38335edb7825",
    "secret": "3c50420c8c4e3b25c21b0ba69fc11f898ada99d206c96e3204625c76c7bed284e8c1aa00a1cff2effc1deb4678c928f4",
    "events": [
      "deposit.detected",
      "deposit.confirmed",
      "deposit.swept",
      "forwarder.deployed",
      "gas_tank.low_balance",
      "withdrawal.submitted",
      "withdrawal.confirmed",
      "withdrawal.failed"
    ],
  
```

### Notes
- Eventos válidos: deposit.detected, deposit.confirmed, deposit.swept, forwarder.deployed, gas_tank.low_balance, withdrawal.submitted, withdrawal.confirmed, withdrawal.failed. Endpoint NÃO aceita campo `description`. Resposta vem como { success, webhook: { id, url, events, secret } }. O `secret` aparece UMA ÚNICA VEZ — guardar para validar HMAC nos eventos recebidos.

---

## Send webhook test ping

**Endpoint:** `POST /webhooks/12/test`

### Request
```bash
curl -X POST 'https://api.vaulthub.live/client/v1/webhooks/12/test' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

### Sample response (HTTP 404 — see notes)
```json
{
  "statusCode": 404,
  "message": "Cannot POST /webhooks/12/test"
}
```

### Notes
- TODO: implementar POST /webhooks/:id/test em notification-service. Atualmente retorna 404 — eventos reais (deposit.detected etc.) ainda funcionam.

---

## Generate deposit address (forwarder)

**Endpoint:** `POST /wallets/56/deposit-address`

### Request
```bash
curl -X POST 'https://api.vaulthub.live/client/v1/wallets/56/deposit-address' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"externalId":"homolog-1778197975754","label":"Homologation test address"}'
```

### Sample response (HTTP 500 — see notes)
```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

### Notes

---
