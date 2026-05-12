#!/usr/bin/env bash
# CryptoVaultHub — Client API smoke-test script
#
# Walks the read-side of the public client API in the order a real customer
# would: enumerate wallets, fetch balances per chain, list forwarders +
# per-forwarder balances, list transactions, and pull withdrawals.
#
# Every command in this file has been executed against production with a real
# tenant (BrPay, client_id=8 on BSC mainnet) and the response was verified by
# hand. The commands are idempotent and read-only — running the script will
# not mutate any state.
#
# Requirements: bash 4+, curl, jq (used for parsing and the panorama dump).
#
# Usage:
#   export CVH_KEY="cvh_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#   ./test-client-api.sh                   # run every section
#   ./test-client-api.sh panorama          # only the snapshot dump
#   BASE="https://api.staging.vaulthub.live/client/v1" ./test-client-api.sh
#
# Generate a fresh API key in the portal (Settings → API Keys → New key)
# with the scopes:
#   wallets:read, deposits:read, withdrawals:read, gas-tanks:read,
#   forwarders:read

set -euo pipefail

: "${CVH_KEY:?Set CVH_KEY to a key generated in the portal with read scopes}"
: "${BASE:=https://api.vaulthub.live/client/v1}"

# Internal helper. Performs the request, asserts HTTP 2xx, pretty-prints the
# body, and on failure prints the response and bails so a broken endpoint
# fails the whole script loudly instead of getting swallowed downstream.
hit() {
  local method="$1" path="$2" extra="${3:-}"
  local out body code
  out=$(mktemp)
  code=$(curl -sS -o "$out" -w "%{http_code}" \
    -X "$method" \
    -H "X-API-Key: $CVH_KEY" \
    ${extra:+-H "$extra"} \
    "$BASE$path")
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "✗ $method $path → HTTP $code" >&2
    cat "$out" >&2
    rm -f "$out"
    return 1
  fi
  jq '.' "$out"
  rm -f "$out"
}

section() { printf '\n────────  %s  ────────\n' "$1"; }

section_wallets() {
  section "1) Wallets (hot + gas tank, per chain)"
  hit GET /wallets
}

section_balances() {
  section "2) Hot-wallet balances per chain"
  # Discover every chain that hosts a hot wallet and fan-out the balance call.
  # Multicall3 batches the native + ERC20 reads server-side; CoinGecko prices
  # are layered on top with a 5-min cache so the call is cheap to repeat.
  local chains
  chains=$(curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/wallets" \
    | jq -r '.wallets[] | select(.walletType=="hot") | .chainId' | sort -u)
  if [[ -z "$chains" ]]; then
    echo "  (no hot wallets — provision one via the portal Setup Wizard)"
    return
  fi
  for cid in $chains; do
    echo "── chainId=$cid ──"
    hit GET "/wallets/$cid/balances"
  done
}

section_forwarders() {
  section "3) Forwarders (deposit addresses)"
  # Enriched listing: salt + parent/deployer/fee/factory for CREATE2
  # verification, plus per-address totalDeposits and lastDepositAt rollup.
  hit GET "/deposit-addresses?limit=500"
}

section_forwarder_balance() {
  section "4) Live balance of the most-recent forwarder"
  # Pick the most recently created deposit address dynamically so the script
  # does not depend on hard-coded ids. POST is intentional — it bypasses any
  # CDN/proxy cache and forces a fresh Multicall3 batch.
  local addr_id
  addr_id=$(curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/deposit-addresses?limit=1" \
    | jq -r '.depositAddresses[0].id // empty')
  if [[ -z "$addr_id" ]]; then
    echo "  (no deposit addresses yet — generate one via POST /wallets/:chainId/deposit-address)"
    return
  fi
  echo "  using deposit address id=$addr_id"
  hit POST "/deposit-addresses/$addr_id/balances"
}

section_deposits() {
  section "5) Deposits (recent)"
  hit GET "/deposits?limit=200"
}

section_deposits_filtered() {
  section "6) Deposits filtered (status + chain + date window)"
  # Date semantics: a bare YYYY-MM-DD is interpreted inclusively in UTC —
  # fromDate=2026-05-01 expands to 2026-05-01T00:00:00Z and toDate=2026-05-12
  # expands to 2026-05-12T23:59:59.999Z. Pass a full ISO-8601 timestamp if you
  # need sub-day precision.
  #
  # Status enum (lifecycle order): pending → detected → confirming →
  # confirmed → swept (terminal success) / failed (terminal failure).
  # The sweep cron usually moves rows through to `swept` within ~30s of
  # confirmation, so most production rows you'll see are `swept`, not
  # `confirmed`. Filter accordingly.
  local from to
  from=$(date -u -v-30d +%Y-%m-%d 2>/dev/null || date -u --date='30 days ago' +%Y-%m-%d)
  to=$(date -u +%Y-%m-%d)
  hit GET "/deposits?limit=200&status=swept&chainId=56&fromDate=$from&toDate=$to"
}

section_deposit_detail() {
  section "7) Single deposit detail"
  # Resolves either the numeric id OR the externalId the customer used when
  # generating the deposit address.
  local dep_id
  dep_id=$(curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/deposits?limit=1" \
    | jq -r '.deposits[0].id // empty')
  if [[ -z "$dep_id" ]]; then
    echo "  (no deposits yet)"
    return
  fi
  echo "  using deposit id=$dep_id"
  hit GET "/deposits/$dep_id"
}

section_withdrawals() {
  section "8) Withdrawals"
  hit GET "/withdrawals?limit=100"
}

section_gas_tanks() {
  section "9) Gas tanks (per-chain health)"
  hit GET "/gas-tanks"
}

section_flush_activity() {
  section "10) Flush activity (sweeps + lazy-deploy auto-forwards)"
  # The activity feed reads gas_tank_transactions joined to deposits.sweep_tx_hash.
  # This is the source of truth for "did funds move from a forwarder to the
  # hot wallet" — the legacy /flush listing reads a separate, on-demand-only
  # table that is empty for most tenants.
  hit GET "/flush/activity/list?limit=100"
}

panorama() {
  section "Panorama snapshot — single shot, persisted to brpay-snapshot.json"
  local out
  out=${PANORAMA_OUT:-brpay-snapshot.json}
  {
    echo "=== Wallets ==="
    curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/wallets" \
      | jq '{wallets: [.wallets[] | {chainId, walletType, address}]}'
    echo "=== Balances per hot chain ==="
    for cid in $(curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/wallets" \
      | jq -r '.wallets[] | select(.walletType=="hot") | .chainId' | sort -u); do
      curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/wallets/$cid/balances" \
        | jq --arg cid "$cid" '{chainId: $cid, walletAddress: .walletAddress, balances: [.balances[] | {symbol, balanceFormatted, balanceUsd}]}'
    done
    echo "=== Forwarders ==="
    curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/deposit-addresses?limit=500" \
      | jq '{count, depositAddresses: [.depositAddresses[] | {id, chainId, address, isDeployed, totalDeposits, lastDepositAt}]}'
    echo "=== Recent deposits ==="
    curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/deposits?limit=50" \
      | jq '[.deposits[] | {detectedAt, chainId, tokenSymbol, amount, amountUsd, status, txHash, sweepTxHash}]'
    echo "=== Flush activity ==="
    curl -sS -H "X-API-Key: $CVH_KEY" "$BASE/flush/activity/list?limit=50" \
      | jq '{count: .meta.count, activity: [.activity[] | {submittedAt, chainName, operationType, depositCount, totalValueUsd, gasCostUsd, txHash}]}'
  } > "$out"
  echo "  wrote $(wc -c <"$out") bytes → $out"
}

run_all() {
  section_wallets
  section_balances
  section_forwarders
  section_forwarder_balance
  section_deposits
  section_deposits_filtered
  section_deposit_detail
  section_withdrawals
  section_gas_tanks
  section_flush_activity
}

# Sub-commands: pass a name to run a single section, or no arg to run everything.
case "${1:-all}" in
  all) run_all ;;
  panorama) panorama ;;
  wallets) section_wallets ;;
  balances) section_balances ;;
  forwarders) section_forwarders ;;
  forwarder-balance) section_forwarder_balance ;;
  deposits) section_deposits ;;
  deposits-filtered) section_deposits_filtered ;;
  deposit-detail) section_deposit_detail ;;
  withdrawals) section_withdrawals ;;
  gas-tanks) section_gas_tanks ;;
  flush-activity) section_flush_activity ;;
  *) echo "Unknown section: $1" >&2; exit 2 ;;
esac
