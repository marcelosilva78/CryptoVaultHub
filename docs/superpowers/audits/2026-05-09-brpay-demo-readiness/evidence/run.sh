#!/usr/bin/env bash
# Auto-generated from a CryptoVaultHub homologation run.
# Fill in your API key + values, then run with `bash <this-file>`.
set -euo pipefail

: "${CVH_API_KEY:?Set CVH_API_KEY before running}"
: "${BASE_URL:=https://api.vaulthub.live/client/v1}"


# ─── GET /chains ───
echo ">>> GET /chains :: GET /chains"
curl -sS -X GET "$BASE_URL/chains" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /tokens (authenticated, post-fix #1) ───
echo ">>> GET /tokens (authenticated, post-fix #1) :: GET /tokens"
curl -sS -X GET "$BASE_URL/tokens" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /tokens/56 ───
echo ">>> GET /tokens/56 :: GET /tokens/56"
curl -sS -X GET "$BASE_URL/tokens/56" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── Resolve project "BrPay" ───
echo ">>> Resolve project "BrPay" :: GET /projects"
curl -sS -X GET "$BASE_URL/projects" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/current (auto-select single project) ───
echo ">>> GET /projects/current (auto-select single project) :: GET /projects/current"
curl -sS -X GET "$BASE_URL/projects/current" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998 ───
echo ">>> GET /projects/6998 :: GET /projects/6998"
curl -sS -X GET "$BASE_URL/projects/6998" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998/gas-check ───
echo ">>> GET /projects/6998/gas-check :: GET /projects/6998/gas-check"
curl -sS -X GET "$BASE_URL/projects/6998/gas-check" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998/deploy/status ───
echo ">>> GET /projects/6998/deploy/status :: GET /projects/6998/deploy/status"
curl -sS -X GET "$BASE_URL/projects/6998/deploy/status" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998/deploy/traces ───
echo ">>> GET /projects/6998/deploy/traces :: GET /projects/6998/deploy/traces"
curl -sS -X GET "$BASE_URL/projects/6998/deploy/traces" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998/deploy/traces/56 ───
echo ">>> GET /projects/6998/deploy/traces/56 :: GET /projects/6998/deploy/traces/56"
curl -sS -X GET "$BASE_URL/projects/6998/deploy/traces/56" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998/deletion-impact ───
echo ">>> GET /projects/6998/deletion-impact :: GET /projects/6998/deletion-impact"
curl -sS -X GET "$BASE_URL/projects/6998/deletion-impact" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /projects/6998/export ───
echo ">>> GET /projects/6998/export :: GET /projects/6998/export"
curl -sS -X GET "$BASE_URL/projects/6998/export" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /wallets ───
echo ">>> GET /wallets :: GET /wallets"
curl -sS -X GET "$BASE_URL/wallets" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /wallets/56/balances ───
echo ">>> GET /wallets/56/balances :: GET /wallets/56/balances"
curl -sS -X GET "$BASE_URL/wallets/56/balances" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /gas-tanks ───
echo ">>> GET /gas-tanks :: GET /gas-tanks"
curl -sS -X GET "$BASE_URL/gas-tanks" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /gas-tanks/56/history ───
echo ">>> GET /gas-tanks/56/history :: GET /gas-tanks/56/history?limit=10"
curl -sS -X GET "$BASE_URL/gas-tanks/56/history?limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /gas-tanks/56/topup-uri ───
echo ">>> GET /gas-tanks/56/topup-uri :: GET /gas-tanks/56/topup-uri"
curl -sS -X GET "$BASE_URL/gas-tanks/56/topup-uri" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /gas-tanks/56/alert-config ───
echo ">>> GET /gas-tanks/56/alert-config :: GET /gas-tanks/56/alert-config"
curl -sS -X GET "$BASE_URL/gas-tanks/56/alert-config" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /deposit-addresses ───
echo ">>> GET /deposit-addresses :: GET /deposit-addresses?page=1&limit=5"
curl -sS -X GET "$BASE_URL/deposit-addresses?page=1&limit=5" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── POST /wallets/:chainId/deposit-address (unique externalId per run) ───
echo ">>> POST /wallets/:chainId/deposit-address (unique externalId per run) :: POST /wallets/56/deposit-address"
curl -sS -X POST "$BASE_URL/wallets/56/deposit-address" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"externalId":"brpay-validation-1778324646248-964579","label":"BrPay validation suite"}'
echo

# ─── GET /deposits (list) ───
echo ">>> GET /deposits (list) :: GET /deposits?page=1&limit=5"
curl -sS -X GET "$BASE_URL/deposits?page=1&limit=5" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /withdrawals (list) ───
echo ">>> GET /withdrawals (list) :: GET /withdrawals?page=1&limit=10"
curl -sS -X GET "$BASE_URL/withdrawals?page=1&limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /withdrawals/12 ───
echo ">>> GET /withdrawals/12 :: GET /withdrawals/12"
curl -sS -X GET "$BASE_URL/withdrawals/12" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /addresses ───
echo ">>> GET /addresses :: GET /addresses?page=1&limit=10"
curl -sS -X GET "$BASE_URL/addresses?page=1&limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /address-groups ───
echo ">>> GET /address-groups :: GET /address-groups?page=1&limit=10"
curl -sS -X GET "$BASE_URL/address-groups?page=1&limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /webhooks ───
echo ">>> GET /webhooks :: GET /webhooks?page=1&limit=10"
curl -sS -X GET "$BASE_URL/webhooks?page=1&limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── POST /webhooks (create) ───
echo ">>> POST /webhooks (create) :: POST /webhooks"
curl -sS -X POST "$BASE_URL/webhooks" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/dc660ffa-897a-4dbf-b6d6-3e6d8fce872b","events":["deposit.detected","deposit.confirmed","deposit.swept","withdrawal.confirmed","withdrawal.failed"]}'
echo

# ─── POST /webhooks/17/test (ping) ───
echo ">>> POST /webhooks/17/test (ping) :: POST /webhooks/17/test"
curl -sS -X POST "$BASE_URL/webhooks/17/test" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /webhooks/17/deliveries ───
echo ">>> GET /webhooks/17/deliveries :: GET /webhooks/17/deliveries?page=1&limit=10"
curl -sS -X GET "$BASE_URL/webhooks/17/deliveries?page=1&limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /webhooks/dead-letters ───
echo ">>> GET /webhooks/dead-letters :: GET /webhooks/dead-letters?page=1&limit=10"
curl -sS -X GET "$BASE_URL/webhooks/dead-letters?page=1&limit=10" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── PATCH /webhooks/17 (deactivate) ───
echo ">>> PATCH /webhooks/17 (deactivate) :: PATCH /webhooks/17"
curl -sS -X PATCH "$BASE_URL/webhooks/17" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"isActive":false}'
echo

# ─── DELETE /webhooks/17 (cleanup) ───
echo ">>> DELETE /webhooks/17 (cleanup) :: DELETE /webhooks/17"
curl -sS -X DELETE "$BASE_URL/webhooks/17" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /co-sign/pending ───
echo ">>> GET /co-sign/pending :: GET /co-sign/pending"
curl -sS -X GET "$BASE_URL/co-sign/pending" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /security/settings ───
echo ">>> GET /security/settings :: GET /security/settings"
curl -sS -X GET "$BASE_URL/security/settings" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /security/2fa-status ───
echo ">>> GET /security/2fa-status :: GET /security/2fa-status"
curl -sS -X GET "$BASE_URL/security/2fa-status" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /security/shamir-shares ───
echo ">>> GET /security/shamir-shares :: GET /security/shamir-shares"
curl -sS -X GET "$BASE_URL/security/shamir-shares" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /notifications/rules ───
echo ">>> GET /notifications/rules :: GET /notifications/rules"
curl -sS -X GET "$BASE_URL/notifications/rules" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /knowledge-base/categories ───
echo ">>> GET /knowledge-base/categories :: GET /knowledge-base/categories"
curl -sS -X GET "$BASE_URL/knowledge-base/categories" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /knowledge-base ───
echo ">>> GET /knowledge-base :: GET /knowledge-base?page=1&limit=5"
curl -sS -X GET "$BASE_URL/knowledge-base?page=1&limit=5" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── GET /deploy-traces ───
echo ">>> GET /deploy-traces :: GET /deploy-traces?page=1&limit=5"
curl -sS -X GET "$BASE_URL/deploy-traces?page=1&limit=5" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo

# ─── POST /exports (small JSON withdrawals export) ───
echo ">>> POST /exports (small JSON withdrawals export) :: POST /exports"
curl -sS -X POST "$BASE_URL/exports" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"exportType":"withdrawals","format":"json"}'
echo

# ─── GET /exports (list) ───
echo ">>> GET /exports (list) :: GET /exports?page=1&limit=5"
curl -sS -X GET "$BASE_URL/exports?page=1&limit=5" \
  -H "X-API-Key: $CVH_API_KEY" \
  -H 'Accept: */*'
echo