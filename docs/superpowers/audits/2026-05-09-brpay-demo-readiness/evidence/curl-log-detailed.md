# Curl Log — Detailed
Run started 2026-05-09T11:03:38.395Z.

Total requests: 42.

## GET /chains

### GET /chains

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/chains' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1276ms)

```json
{
  "success": true,
  "chains": [
    {
      "chainId": 1,
      "name": "Ethereum Mainnet",
      "shortName": "eth",
      "nativeCurrencySymbol": "ETH",
      "nativeCurrencyDecimals": 18,
      "explorerUrl": "https://etherscan.io",
      "isActive": true,
      "rpcConfigured": false,
      "activeNodeCount": 0
    },
    {
      "chainId": 10,
      "name": "OP Mainnet",
      "shortName": "oeth",
      "nativeCurrencySymbol": "ETH",
      "nativeCurrencyDecimals": 18,
      "explorerUrl
```

---

## GET /tokens (authenticated, post-fix #1)

### GET /tokens

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/tokens' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1301ms)

```json
{
  "success": true,
  "tokens": [
    {
      "id": 4,
      "chainId": 1,
      "contractAddress": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "symbol": "DAI",
      "name": "Dai Stablecoin",
      "decimals": 18,
      "isNative": false,
      "isDefault": true,
      "isActive": true,
      "coingeckoId": "dai",
      "createdAt": "2026-04-11T05:36:50.000Z"
    },
    {
      "id": 1,
      "chainId": 1,
      "contractAddress": "0x0000000000000000000000000000000000000000",
      "sy
```

---

## GET /tokens/56

### GET /tokens/56

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/tokens/56' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1350ms)

```json
{
  "success": true,
  "tokens": [
    {
      "id": 8,
      "chainId": 56,
      "contractAddress": "0x0000000000000000000000000000000000000000",
      "symbol": "BNB",
      "name": "BNB",
      "decimals": 18,
      "isNative": true,
      "isDefault": true,
      "isActive": true,
      "coingeckoId": "binancecoin",
      "createdAt": "2026-04-11T05:36:50.000Z"
    },
    {
      "id": 12,
      "chainId": 56,
      "contractAddress": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      "sym
```

---

## Resolve project "BrPay"

### GET /projects

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1425ms)

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

## GET /projects/current (auto-select single project)

### GET /projects/current

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/current' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1183ms)

```json
{
  "success": true,
  "project": {
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
    "chainsCount": 0,
    "walletsCount": 0,
    "deletionRequestedAt": null,
    "deletionScheduledFor": null
  }
}
```

---

## GET /projects/6998

### GET /projects/6998

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1261ms)

```json
{
  "success": true,
  "project": {
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
    "chainsCount": 0,
    "walletsCount": 0,
    "deletionRequestedAt": null,
    "deletionScheduledFor": null
  }
}
```

---

## GET /projects/6998/gas-check

### GET /projects/6998/gas-check

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998/gas-check' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (2470ms)

```json
{
  "success": true,
  "chains": [
    {
      "chainId": 56,
      "chainName": "BNB Smart Chain",
      "gasTankAddress": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "balanceWei": "9491472950001000",
      "balanceFormatted": "0.009491472950001",
      "requiredWei": "565000000000000",
      "requiredFormatted": "0.000565",
      "sufficient": true
    }
  ],
  "allSufficient": true
}
```

---

## GET /projects/6998/deploy/status

### GET /projects/6998/deploy/status

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998/deploy/status' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1276ms)

```json
{
  "success": true,
  "projectId": 6998,
  "chains": [
    {
      "chainId": 56,
      "status": "ready",
      "deployStartedAt": "2026-05-05T20:28:30.000Z",
      "deployCompletedAt": "2026-05-05T20:30:05.000Z",
      "deployError": "\nInvalid `prisma.projectContract.upsert()` invocation:\n\n\nThe table `project_contracts` does not exist in the current database.",
      "contracts": {
        "walletFactory": "0x5819fF9612Af78b832926E1e0E954e0510d0B524",
        "forwarderFactory": "0x16fE53
```

---

## GET /projects/6998/deploy/traces

### GET /projects/6998/deploy/traces

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998/deploy/traces' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1544ms)

```json
{
  "success": true,
  "projectId": 6998,
  "chainId": null,
  "traces": [
    {
      "id": 14,
      "projectId": 6998,
      "chainId": 56,
      "projectChainId": 17,
      "contractType": "hot_wallet",
      "contractAddress": "0x17193A58d73825485393E00ecE33051Fa2536415",
      "txHash": "0x7db831fe1439ead52e3e8a04f572d3faa5835ae10e6bec995e565080d2a53121",
      "blockNumber": 96576853,
      "blockHash": "0x8577cf8154900cdf8f00880f8b7e1b3014dcb765443cac5c6e3d44ac1be1f8d2",
      "gasUsed":
```

---

## GET /projects/6998/deploy/traces/56

### GET /projects/6998/deploy/traces/56

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998/deploy/traces/56' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1716ms)

```json
{
  "success": true,
  "projectId": 6998,
  "chainId": 56,
  "traces": [
    {
      "id": 14,
      "projectId": 6998,
      "chainId": 56,
      "projectChainId": 17,
      "contractType": "hot_wallet",
      "contractAddress": "0x17193A58d73825485393E00ecE33051Fa2536415",
      "txHash": "0x7db831fe1439ead52e3e8a04f572d3faa5835ae10e6bec995e565080d2a53121",
      "blockNumber": 96576853,
      "blockHash": "0x8577cf8154900cdf8f00880f8b7e1b3014dcb765443cac5c6e3d44ac1be1f8d2",
      "gasUsed": "
```

---

## GET /projects/6998/deletion-impact

### GET /projects/6998/deletion-impact

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998/deletion-impact' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1862ms)

```json
{
  "success": true,
  "projectId": 6998,
  "projectName": "BrPay",
  "status": "active",
  "walletCount": 2,
  "depositCount": 2,
  "withdrawalCount": 5,
  "transactionCount": 7,
  "webhookCount": 14,
  "apiKeyCount": 0,
  "hasNonZeroBalance": false,
  "balances": [
    {
      "chainId": 56,
      "address": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "balanceFormatted": "0"
    },
    {
      "chainId": 56,
      "address": "0x17193A58d73825485393E00ecE33051Fa2536415",
      "balanceF
```

---

## GET /projects/6998/export

### GET /projects/6998/export

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/projects/6998/export' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1340ms)

```json
{
  "success": true,
  "export": {
    "exportVersion": "1.0",
    "exportedAt": "2026-05-09T11:03:56.392Z",
    "project": {
      "name": "BrPay",
      "slug": "brpay",
      "custodyMode": "full_custody",
      "chains": [
        56
      ]
    },
    "publicKeys": {
      "platform": {
        "address": "0x04a093d209F5320d6b20F96550649523bc7903Ac",
        "publicKey": "0x023e026da38aeec01b8a9332da66a4768d934aa2058ed3856dda5b0d8fa289b5c8",
        "derivationPath": "m/44'/60'/0'/0/0"
    
```

---

## GET /wallets

### GET /wallets

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/wallets' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1530ms)

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

## GET /wallets/56/balances

### GET /wallets/56/balances

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/wallets/56/balances' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1777ms)

```json
{
  "success": true,
  "balances": [
    {
      "tokenId": 8,
      "symbol": "BNB",
      "name": "BNB",
      "contractAddress": "0x0000000000000000000000000000000000000000",
      "decimals": 18,
      "isNative": true,
      "balanceRaw": "0",
      "balanceFormatted": "0.0"
    },
    {
      "tokenId": 9,
      "symbol": "USDT",
      "name": "Tether USD",
      "contractAddress": "0x55d398326f99059fF775485246999027B3197955",
      "decimals": 18,
      "isNative": false,
      "balanceRa
```

---

## GET /gas-tanks

### GET /gas-tanks

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/gas-tanks' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1710ms)

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
      "balanceWei": "9491472950001000",
      "gasPriceWei": "50000000",
      "thresholdWei": "1000000000000000",
      "estimatedOpsRemaining": 9039,
      "status": "ok",
      "alertConfig": {
        "emailEnabled": false,
        "webhookEnabled": true
```

---

## GET /gas-tanks/56/history

### GET /gas-tanks/56/history?limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/gas-tanks/56/history?limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1215ms)

```json
{
  "success": true,
  "total": 3,
  "rows": [
    {
      "id": 3,
      "walletId": 9,
      "projectId": 6998,
      "chainId": 56,
      "txHash": "0xb40a890ae3abd9db132ccca6dd4eba52b21d4bdff35cf5960de1e2f408dbd7dc",
      "operationType": "deploy_forwarder",
      "toAddress": "0x16fE538d48E739031EA840eC91D1EdC384299A2d",
      "gasUsed": 130251,
      "gasPriceWei": "0",
      "gasCostWei": "6512550000000",
      "status": "confirmed",
      "blockNumber": 97027265,
      "submittedAt": "2
```

---

## GET /gas-tanks/56/topup-uri

### GET /gas-tanks/56/topup-uri

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/gas-tanks/56/topup-uri' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1203ms)

```json
{
  "success": true,
  "chainId": 56,
  "address": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
  "eip681Uri": "ethereum:0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1@56"
}
```

---

## GET /gas-tanks/56/alert-config

### GET /gas-tanks/56/alert-config

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/gas-tanks/56/alert-config' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1224ms)

```json
{
  "success": true,
  "config": {
    "thresholdWei": "1000000000000000",
    "emailEnabled": false,
    "webhookEnabled": true
  }
}
```

---

## GET /deposit-addresses

### GET /deposit-addresses?page=1&limit=5

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/deposit-addresses?page=1&limit=5' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1180ms)

```json
{
  "success": true,
  "clientId": 8,
  "count": 7,
  "depositAddresses": [
    {
      "id": 7,
      "chainId": 56,
      "address": "0x780adf51d6b2D5e5A709667512017Af64F7AE03C",
      "externalId": "brpay-validation-1778324542129-387134",
      "label": "BrPay validation suite",
      "isDeployed": false,
      "createdAt": "2026-05-09T11:02:24.000Z"
    },
    {
      "id": 6,
      "chainId": 56,
      "address": "0xBc45a15E837921F224daB8D5C7386222CcBE8DB8",
      "externalId": "brpay-valid
```

---

## POST /wallets/:chainId/deposit-address (unique externalId per run)

### POST /wallets/56/deposit-address

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/wallets/56/deposit-address' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"externalId":"brpay-validation-1778324646248-964579","label":"BrPay validation suite"}'
```

**Notes:**
- externalId is required and recommended to be your stable customer/invoice id. The API treats externalId as a write-once key — duplicate calls return 409 (NOT 200/existing as documented).

**Attempts:** 1

#### Attempt 1 → 201 (1652ms)

```json
{
  "success": true,
  "clientId": 8,
  "chainId": 56,
  "depositAddress": {
    "address": "0x9b9322958c44BC6a88de08E7458A49C87B8F47ff",
    "externalId": "brpay-validation-1778324646248-964579",
    "label": "BrPay validation suite",
    "salt": "0xc63b0a0afe048a8c983487577fc34bff3e48427ededea78f2b0f9f4bfb674e18",
    "isDeployed": false
  }
}
```

---

## GET /deposits (list)

### GET /deposits?page=1&limit=5

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/deposits?page=1&limit=5' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 2

#### Attempt 1 → 502 (1361ms)

```json
Bad Gateway
```

#### Attempt 2 → 200 (1255ms)

```json
{
  "success": true,
  "deposits": [
    {
      "id": "2",
      "depositAddress": "0xF834c595a58AfCFA6E22e2E13647acC9976F27a1",
      "address": "0xF834c595a58AfCFA6E22e2E13647acC9976F27a1",
      "chainId": 56,
      "tokenId": 8,
      "tokenSymbol": "BNB",
      "tokenAddress": "0x0000000000000000000000000000000000000000",
      "tokenDecimals": 18,
      "amount": "0.005",
      "amountRaw": "5000000000000000",
      "status": "swept",
      "txHash": "manual:1778215820",
      "blockNumbe
```

---

## GET /withdrawals (list)

### GET /withdrawals?page=1&limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/withdrawals?page=1&limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1205ms)

```json
{
  "success": true,
  "clientId": 8,
  "count": 5,
  "withdrawals": [
    {
      "id": 12,
      "clientId": 8,
      "chainId": 56,
      "tokenId": 8,
      "sourceWallet": "gas_tank",
      "fromWallet": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "toAddressId": 2,
      "toAddress": "0x95DEda8f5FCB60bf02656b226950329e67c605a4",
      "toLabel": "recovery",
      "amount": "0.0005",
      "amountRaw": "500000000000000",
      "txHash": "0x08feda920369d584e954ed9f45c82c7408d4f308304a
```

---

## GET /withdrawals/12

### GET /withdrawals/12

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/withdrawals/12' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1356ms)

```json
{
  "success": true,
  "withdrawal": {
    "success": true,
    "withdrawal": {
      "id": 12,
      "clientId": 8,
      "chainId": 56,
      "tokenId": 8,
      "sourceWallet": "gas_tank",
      "fromWallet": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "toAddressId": 2,
      "toAddress": "0x95DEda8f5FCB60bf02656b226950329e67c605a4",
      "toLabel": "recovery",
      "amount": "0.0005",
      "amountRaw": "500000000000000",
      "txHash": "0x08feda920369d584e954ed9f45c82c7408d4f3083
```

---

## GET /addresses

### GET /addresses?page=1&limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/addresses?page=1&limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (222ms)

```json
{
  "success": true,
  "addresses": [
    {
      "id": "1",
      "clientId": 8,
      "address": "0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1",
      "label": "homolog-target-1778205594531",
      "chainId": 56,
      "status": "active",
      "cooldownExpiresAt": null,
      "createdAt": "2026-05-08T01:59:55.000Z"
    },
    {
      "id": "2",
      "clientId": 8,
      "address": "0x95DEda8f5FCB60bf02656b226950329e67c605a4",
      "label": "recovery",
      "chainId": 56,
      "status": "act
```

---

## GET /address-groups

### GET /address-groups?page=1&limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/address-groups?page=1&limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1196ms)

```json
{
  "success": true,
  "groups": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 100
  }
}
```

---

## GET /webhooks

### GET /webhooks?page=1&limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/webhooks?page=1&limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1352ms)

```json
{
  "success": true,
  "count": 14,
  "webhooks": [
    {
      "id": 15,
      "clientId": 8,
      "url": "https://webhook.site/04ed2450-024f-45ce-b364-a4e89ab8a1df",
      "events": [
        "deposit.detected",
        "deposit.confirmed",
        "deposit.swept",
        "withdrawal.confirmed",
        "withdrawal.failed"
      ],
      "isActive": true,
      "createdAt": "2026-05-09T10:59:45.000Z"
    },
    {
      "id": 13,
      "clientId": 8,
      "url": "https://webhook.site/cd1546b
```

---

## POST /webhooks (create)

### POST /webhooks

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/webhooks' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/dc660ffa-897a-4dbf-b6d6-3e6d8fce872b","events":["deposit.detected","deposit.confirmed","deposit.swept","withdrawal.confirmed","withdrawal.failed"]}'
```

**Notes:**
- Webhook secret is returned ONCE on create — used to verify HMAC-SHA256 signatures on incoming events.

**Attempts:** 1

#### Attempt 1 → 201 (1442ms)

```json
{
  "success": true,
  "webhook": {
    "id": 17,
    "clientId": 8,
    "url": "https://webhook.site/dc660ffa-897a-4dbf-b6d6-3e6d8fce872b",
    "secret": "41a0498f1b77794f7490333a04a1434be255a2d3b8299918f99665c1ec6238f90b87e9db914cf71a7b3b2018a2decb4f",
    "events": [
      "deposit.detected",
      "deposit.confirmed",
      "deposit.swept",
      "withdrawal.confirmed",
      "withdrawal.failed"
    ],
    "isActive": true,
    "createdAt": "2026-05-09T11:04:19.000Z"
  }
}
```

---

## POST /webhooks/17/test (ping)

### POST /webhooks/17/test

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/webhooks/17/test' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Notes:**
- Test-ping returns 404 — endpoint not implemented downstream. Real events still flow.

**Attempts:** 1

#### Attempt 1 → 404 (1197ms)

```json
{
  "statusCode": 404,
  "message": "Cannot POST /webhooks/17/test"
}
```

---

## GET /webhooks/17/deliveries

### GET /webhooks/17/deliveries?page=1&limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/webhooks/17/deliveries?page=1&limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1267ms)

```json
{
  "success": true,
  "count": 0,
  "deliveries": []
}
```

---

## GET /webhooks/dead-letters

### GET /webhooks/dead-letters?page=1&limit=10

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/webhooks/dead-letters?page=1&limit=10' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1205ms)

```json
{
  "success": true,
  "data": [],
  "total": 0,
  "page": 1,
  "limit": 10
}
```

---

## PATCH /webhooks/17 (deactivate)

### PATCH /webhooks/17

```bash
curl -X PATCH 'https://api.vaulthub.live/client/v1/webhooks/17' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"isActive":false}'
```

**Notes:**
- FINDING: client-api/webhook.service.ts updateWebhook() proxies { clientId, ...data } to notification-service, which rejects clientId in body. Pre-existing bug.

**Attempts:** 1

#### Attempt 1 → 400 (1267ms)

```json
[
  "property clientId should not exist"
]
```

---

## DELETE /webhooks/17 (cleanup)

### DELETE /webhooks/17

```bash
curl -X DELETE 'https://api.vaulthub.live/client/v1/webhooks/17' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1905ms)

```json
{
  "success": true,
  "message": "Webhook deleted"
}
```

---

## GET /co-sign/pending

### GET /co-sign/pending

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/co-sign/pending' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1209ms)

```json
{
  "success": true,
  "operations": []
}
```

---

## GET /security/settings

### GET /security/settings

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/security/settings' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (261ms)

```json
{
  "success": true,
  "custodyMode": "full_custody",
  "safeModeActive": false,
  "twoFactorEnabled": false,
  "clientStatus": "active"
}
```

---

## GET /security/2fa-status

### GET /security/2fa-status

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/security/2fa-status' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1216ms)

```json
{
  "success": true,
  "enabled": false,
  "method": null,
  "verifiedAt": null
}
```

---

## GET /security/shamir-shares

### GET /security/shamir-shares

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/security/shamir-shares' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1254ms)

```json
{
  "success": true,
  "totalShares": 15,
  "threshold": 0,
  "shares": [
    {
      "custodianName": null,
      "createdAt": "2026-04-30T18:31:35.000Z"
    },
    {
      "custodianName": null,
      "createdAt": "2026-04-30T18:35:53.000Z"
    },
    {
      "custodianName": null,
      "createdAt": "2026-05-05T19:15:21.000Z"
    },
    {
      "custodianName": null,
      "createdAt": "2026-04-30T18:31:36.000Z"
    },
    {
      "custodianName": null,
      "createdAt": "2026-04-30T18:35:54
```

---

## GET /notifications/rules

### GET /notifications/rules

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/notifications/rules' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1208ms)

```json
{
  "success": true,
  "rules": []
}
```

---

## GET /knowledge-base/categories

### GET /knowledge-base/categories

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/knowledge-base/categories' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (1327ms)

```json
{
  "success": true,
  "categories": []
}
```

---

## GET /knowledge-base

### GET /knowledge-base?page=1&limit=5

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/knowledge-base?page=1&limit=5' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 1

#### Attempt 1 → 200 (215ms)

```json
{
  "success": true,
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

---

## GET /deploy-traces

### GET /deploy-traces?page=1&limit=5

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/deploy-traces?page=1&limit=5' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Notes:**
- FINDING: GET /deploy-traces returns 500 from downstream proxy. Not a code change in this session — pre-existing.

**Attempts:** 1

#### Attempt 1 → 500 (1232ms)

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## POST /exports (small JSON withdrawals export)

### POST /exports

```bash
curl -X POST 'https://api.vaulthub.live/client/v1/exports' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0' \
  -H 'Content-Type: application/json' \
  -d '{"exportType":"withdrawals","format":"json"}'
```

**Attempts:** 2

#### Attempt 1 → 502 (8775ms)

```json
Bad Gateway
```

#### Attempt 2 → 500 (10707ms)

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## GET /exports (list)

### GET /exports?page=1&limit=5

```bash
curl -X GET 'https://api.vaulthub.live/client/v1/exports?page=1&limit=5' \
  -H 'X-API-Key: <X_API_KEY>' \
  -H 'Accept: */*' \
  -H 'User-Agent: cvh-homologation/1.0'
```

**Attempts:** 3

#### Attempt 1 → 502 (5021ms)

```json
Bad Gateway
```

#### Attempt 2 → 502 (7244ms)

```json
Bad Gateway
```

#### Attempt 3 → 200 (8671ms)

```json
{
  "success": true,
  "exports": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 5
  }
}
```

---
