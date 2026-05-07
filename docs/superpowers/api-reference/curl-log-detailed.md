# Curl Log — Detailed
Run started 2026-05-07T23:52:53.425Z.

Total requests: 6.

## Resolve project "BrPay"

### GET /projects

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (350ms)

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

### GET /wallets

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/wallets' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (224ms)

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

### GET /gas-tanks

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/gas-tanks' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (540ms)

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

### POST /webhooks

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/webhooks' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/642ece7a-3f51-4d64-b80c-38335edb7825","events":["deposit.detected","deposit.confirmed","deposit.swept","forwarder.deployed","gas_tank.low_balance","withdrawal.submitted","withdrawal.confirmed","withdrawal.failed"]}'
```

**Notes:**
- Eventos válidos: deposit.detected, deposit.confirmed, deposit.swept, forwarder.deployed, gas_tank.low_balance, withdrawal.submitted, withdrawal.confirmed, withdrawal.failed. Endpoint NÃO aceita campo `description`. Resposta vem como { success, webhook: { id, url, events, secret } }. O `secret` aparece UMA ÚNICA VEZ — guardar para validar HMAC nos eventos recebidos.

**Attempts:** 1

#### Attempt 1 → 201 (177ms)

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

---

## Send webhook test ping

### POST /webhooks/12/test

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/webhooks/12/test' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Notes:**
- TODO: implementar POST /webhooks/:id/test em notification-service. Atualmente retorna 404 — eventos reais (deposit.detected etc.) ainda funcionam.

**Attempts:** 1

#### Attempt 1 → 404 (138ms)

```json
{
  "statusCode": 404,
  "message": "Cannot POST /webhooks/12/test"
}
```

---

## Generate deposit address (forwarder)

### POST /wallets/56/deposit-address

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/wallets/56/deposit-address' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"externalId":"homolog-1778197975754","label":"Homologation test address"}'
```

**Attempts:** 1

#### Attempt 1 → 500 (314ms)

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---
