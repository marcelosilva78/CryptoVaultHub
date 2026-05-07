#!/usr/bin/env bash
# Auto-generated from a CryptoVaultHub homologation run.
# Fill in your API key + values, then run with `bash <this-file>`.
set -euo pipefail

: "${CVH_API_KEY:?Set CVH_API_KEY before running}"
: "${BASE_URL:=https://api.vaulthub.live/client/v1}"


# ─── Resolve project "BrPay" ───
echo ">>> Resolve project "BrPay" :: GET /projects"
curl -sS -X GET "$BASE_URL/projects" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── List wallets (gas_tank + hot) ───
echo ">>> List wallets (gas_tank + hot) :: GET /wallets"
curl -sS -X GET "$BASE_URL/wallets" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── Confirm gas tank status = ok ───
echo ">>> Confirm gas tank status = ok :: GET /gas-tanks"
curl -sS -X GET "$BASE_URL/gas-tanks" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── Register webhook receiver ───
echo ">>> Register webhook receiver :: POST /webhooks"
curl -sS -X POST "$BASE_URL/webhooks" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/642ece7a-3f51-4d64-b80c-38335edb7825","events":["deposit.detected","deposit.confirmed","deposit.swept","forwarder.deployed","gas_tank.low_balance","withdrawal.submitted","withdrawal.confirmed","withdrawal.failed"]}'
echo

# ─── Send webhook test ping ───
echo ">>> Send webhook test ping :: POST /webhooks/12/test"
curl -sS -X POST "$BASE_URL/webhooks/12/test" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── Generate deposit address (forwarder) ───
echo ">>> Generate deposit address (forwarder) :: POST /wallets/56/deposit-address"
curl -sS -X POST "$BASE_URL/wallets/56/deposit-address" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"externalId":"homolog-1778197975754","label":"Homologation test address"}'
echo