#!/usr/bin/env bash
#
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  CryptoVaultHub — Roteiro de testes do Client API via curl puro          ║
# ║  https://api.vaulthub.live/client/v1                                     ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Cada seção abaixo segue o mesmo padrão:
#   1. Bloco de comentário explicando O QUE a chamada faz, POR QUE,
#      o endpoint REST, os parâmetros relevantes e o(s) scope(s) requeridos.
#   2. Echo do título da seção.
#   3. O comando `curl` LITERAL (sem wrapper, sem função intermediária)
#      para que o leitor possa copiar/colar no terminal e reproduzir.
#
# Nada aqui muta estado — todas as chamadas são GET ou POST idempotente,
# nenhuma cria/edita/remove recurso. Pode ser rodado quantas vezes quiser.
#
# Cada comando curl foi disparado contra produção antes do commit; veja a
# tabela de validação no final do README do projeto.
#
# ─── Pré-requisitos ────────────────────────────────────────────────────────
#
#   - bash 4+, curl, jq, date (BSD ou GNU)
#   - Uma API key gerada no Portal (Settings → API Keys) com os scopes:
#       wallets:read, deposits:read, withdrawals:read,
#       gas-tanks:read, forwarders:read
#
# ─── Uso ───────────────────────────────────────────────────────────────────
#
#   export CVH_KEY="cvh_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#   bash docs/api/scripts/test-client-api.sh
#
#   # Para apontar para outro ambiente (homolog/staging):
#   BASE="https://api.staging.vaulthub.live/client/v1" \
#     bash docs/api/scripts/test-client-api.sh
#
# ───────────────────────────────────────────────────────────────────────────

set -e

: "${CVH_KEY:?Defina CVH_KEY com uma chave gerada no Portal antes de rodar}"
: "${BASE:=https://api.vaulthub.live/client/v1}"
: "${CHAIN_ID:=56}"   # 56=BSC, 1=ETH, 137=Polygon, 42161=Arbitrum, 10=OP, 43114=AVAX, 8453=Base

# Wrappers do `date` que trabalham em BSD (macOS) e GNU (Linux). Calculam
# hoje e há-7-dias em UTC, formato YYYY-MM-DD — exatamente como o filtro
# fromDate/toDate da API espera.
today_utc()    { date -u +%Y-%m-%d; }
last_week_utc() { date -u -v-7d +%Y-%m-%d 2>/dev/null || date -u --date='7 days ago' +%Y-%m-%d; }

TODAY=$(today_utc)
LAST_WEEK=$(last_week_utc)

# ═══════════════════════════════════════════════════════════════════════════
# 1) LISTAR WALLETS
# ═══════════════════════════════════════════════════════════════════════════
#
# Retorna todas as wallets provisionadas pelo Setup Wizard para o projeto
# associado à API key. Há dois tipos:
#
#   - "hot"      : multisig 2-of-3 que recebe fundos sweptados e origina
#                  saques. Uma por chain ativa do projeto.
#   - "gas_tank" : EOA single-sig que assina deploys de forwarder e tx de
#                  sweep. Paga gas. Uma por chain ativa.
#
# Endpoint : GET /client/v1/wallets
# Scope    : wallets:read

echo "════════════════════════════════════════════════════════════════════════"
echo "1) Listar wallets"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/wallets" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 2) LISTAR DEPOSIT ADDRESSES (FORWARDERS) — "depósitos por wallet"
# ═══════════════════════════════════════════════════════════════════════════
#
# Lista os forwarders CREATE2 já gerados pelo projeto, com:
#
#   - 5 inputs da derivação (salt, parentAddress, deployerAddress,
#     feeAddress, factoryAddress) — permite re-derivar o endereço local-
#     mente sem confiar no servidor.
#   - Rollup por linha: `totalDeposits` (quantos depósitos já chegaram
#     naquele forwarder) + `lastDepositAt` (timestamp do último).
#
# Como esse rollup já vem por endereço, o pareamento "forwarder ↔
# depósitos" não exige uma segunda chamada na maior parte dos painéis.
#
# Endpoint : GET /client/v1/deposit-addresses
# Query    : limit (max 500), chainId (opcional)
# Scope    : deposits:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "2) Listar deposit addresses (forwarders) com rollup de depósitos"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposit-addresses?limit=500" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 3) LISTAR DEPÓSITOS DE UM FORWARDER ESPECÍFICO
# ═══════════════════════════════════════════════════════════════════════════
#
# O endpoint /deposits não tem filtro server-side por forwarder ainda, mas
# como você normalmente quer ver os depósitos da carteira que acabou de
# criar, basta:
#
#   1. Buscar o forwarder mais recente em /deposit-addresses
#   2. Listar /deposits e filtrar client-side com jq.
#
# Endpoints :
#   GET /client/v1/deposit-addresses?limit=1
#   GET /client/v1/deposits?limit=200
# Scope     : deposits:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "3) Listar depósitos do forwarder mais recente"
echo "════════════════════════════════════════════════════════════════════════"

# Captura o endereço do forwarder mais recente
DEPOSIT_ADDR=$(curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposit-addresses?limit=1" \
  | jq -r '.depositAddresses[0].address')

echo "Forwarder selecionado: $DEPOSIT_ADDR"
echo

# Lista todos os depósitos e filtra client-side por esse forwarder.
# `ascii_downcase` lida com a divergência de case entre as duas tabelas
# (deposit_addresses guarda mixed-case, deposits guarda lowercase).
curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposits?limit=200" \
  | jq --arg addr "$(echo "$DEPOSIT_ADDR" | tr '[:upper:]' '[:lower:]')" \
       '[.deposits[] | select((.depositAddress // "") | ascii_downcase == $addr)]'

# ═══════════════════════════════════════════════════════════════════════════
# 4) LISTAR BALANÇO ON-CHAIN DA HOT WALLET (POR CHAIN)
# ═══════════════════════════════════════════════════════════════════════════
#
# Faz um Multicall3 batch (native + ERC20 default) e cobre cada token com
# preço em USD via CoinGecko (cache Redis 5min). Campos:
#
#   walletAddress      : o endereço da hot wallet daquela chain
#   balances[]
#     symbol           : ex. "BNB", "USDT"
#     balanceRaw       : wei / smallest unit
#     balanceFormatted : decimalizado pelas decimals do token
#     priceUsd         : preço atual (null se o token não tem coingeckoId)
#     balanceUsd       : balanceFormatted × priceUsd (null se priceUsd null)
#
# Endpoint : GET /client/v1/wallets/:chainId/balances
# Scope    : wallets:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "4) Listar balanço da hot wallet na chain $CHAIN_ID"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/wallets/$CHAIN_ID/balances" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 5) LISTAR BALANÇO ON-CHAIN DE UM FORWARDER ESPECÍFICO
# ═══════════════════════════════════════════════════════════════════════════
#
# Mesmo Multicall3 do passo 4, mas apontado a um deposit address. Útil para
# reconciliar imediatamente após um sweep: o forwarder deve zerar quando o
# sweep cron executa.
#
# POST (não GET) é intencional — ignora cache do gateway e força leitura
# fresca on-chain a cada chamada.
#
# Endpoint : POST /client/v1/deposit-addresses/:id/balances
# Scope    : deposits:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "5) Listar balanço on-chain de um forwarder específico"
echo "════════════════════════════════════════════════════════════════════════"

# Captura o id (numérico) do forwarder mais recente
DEPOSIT_ADDR_ID=$(curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposit-addresses?limit=1" \
  | jq -r '.depositAddresses[0].id')

echo "Forwarder selecionado: id=$DEPOSIT_ADDR_ID"
echo

curl -sS -X POST \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposit-addresses/$DEPOSIT_ADDR_ID/balances" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 6) LISTAR WALLETS COM BALANÇO — VISÃO COMBINADA
# ═══════════════════════════════════════════════════════════════════════════
#
# Junta /wallets (descobre as chains que têm hot wallet) com
# /wallets/:chainId/balances (uma chamada por chain), emitindo uma linha
# resumida por chain.
#
# Endpoints :
#   GET /client/v1/wallets
#   GET /client/v1/wallets/:chainId/balances  (uma vez por chain ativa)
# Scope    : wallets:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "6) Listar wallets com balanço (visão combinada)"
echo "════════════════════════════════════════════════════════════════════════"

# Descobre as chains que têm hot wallet
HOT_CHAINS=$(curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/wallets" \
  | jq -r '.wallets[] | select(.walletType=="hot") | .chainId' | sort -u)

if [ -z "$HOT_CHAINS" ]; then
  echo "(nenhuma hot wallet provisionada — rode o Setup Wizard no Portal)"
else
  for cid in $HOT_CHAINS; do
    echo
    echo "── chainId=$cid ──"
    curl -sS \
      -H "X-API-Key: $CVH_KEY" \
      "$BASE/wallets/$cid/balances" \
      | jq '{
          chainId: '"$cid"',
          walletAddress,
          balances: [.balances[] | {
            symbol,
            balanceFormatted,
            priceUsd,
            balanceUsd
          }]
        }'
  done
fi

# ═══════════════════════════════════════════════════════════════════════════
# 7) LISTAR TODOS OS DEPÓSITOS
# ═══════════════════════════════════════════════════════════════════════════
#
# Listagem paginada de depósitos do projeto. Cada linha inclui:
#
#   amount         : unidades humanizadas (já dividido por 10^decimals)
#   amountRaw      : wei / smallest unit (fonte da verdade para reconciliação)
#   amountUsd      : amount × priceUsd, via CoinGecko
#   txHash         : tx que emitiu o Transfer event (ou "polling:..." para
#                    depósitos sintetizados pelo poller quando não há evento)
#   sweepTxHash    : tx que moveu os fundos para a hot wallet (null até swept)
#   confirmations  : confirmações on-chain atuais
#   detectedAt / confirmedAt / sweptAt : timestamps do lifecycle
#
# Endpoint : GET /client/v1/deposits
# Query    : limit (max 200), page, status, chainId, fromDate, toDate
# Scope    : deposits:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "7) Listar todos os depósitos (até 200)"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposits?limit=200" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 8) LISTAR DEPÓSITOS FILTRADOS (data + status + chain)
# ═══════════════════════════════════════════════════════════════════════════
#
# Combina três filtros server-side:
#
#   - status   : pending | detected | confirming | confirmed | swept | failed
#                Lifecycle: pending → detected → confirming → confirmed →
#                swept (terminal sucesso) | failed (terminal falha). O cron
#                de sweep avança "confirmed" para "swept" em ~30s, então
#                em produção a maioria dos depósitos terminais está em
#                "swept", não "confirmed".
#
#   - chainId  : numérico, igual ao usado em /wallets.
#
#   - fromDate/toDate : aceitam ISO-8601 completo (usado verbatim) OU
#                      YYYY-MM-DD (interpretado inclusivamente em UTC —
#                      toDate=2026-05-12 engloba tudo até 23:59:59.999Z).
#
# Endpoint : GET /client/v1/deposits?status=&chainId=&fromDate=&toDate=
# Scope    : deposits:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "8) Depósitos filtrados — status=swept, chainId=$CHAIN_ID, $LAST_WEEK..$TODAY"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposits?limit=200&status=swept&chainId=$CHAIN_ID&fromDate=$LAST_WEEK&toDate=$TODAY" \
  | jq

# ═══════════════════════════════════════════════════════════════════════════
# 9) DETALHE DE UM DEPÓSITO ESPECÍFICO
# ═══════════════════════════════════════════════════════════════════════════
#
# Retorna a linha completa de um depósito, incluindo confirmations atuais,
# sweep tx hash, externalId (a tag opcional que o cliente atribuiu ao
# forwarder), e todos os timestamps do lifecycle.
#
# Endpoint : GET /client/v1/deposits/:id
# Scope    : deposits:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "9) Detalhe do depósito mais recente"
echo "════════════════════════════════════════════════════════════════════════"

DEPOSIT_ID=$(curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposits?limit=1" \
  | jq -r '.deposits[0].id')

echo "Depósito selecionado: id=$DEPOSIT_ID"
echo

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/deposits/$DEPOSIT_ID" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 10) LISTAR WITHDRAWALS (SAQUES)
# ═══════════════════════════════════════════════════════════════════════════
#
# Saques do hot wallet (ou do gas tank) para endereços whitelistados.
# Lifecycle é mais elaborado:
#
#   pending_approval → approved → broadcasting → confirmed (terminal)
#                                              ↘ failed (terminal)
#                                              ↘ rejected (terminal, compliance)
#
# Em modo full-custody, "pending_approval → approved" é uma chamada self-
# approve (POST /withdrawals/:id/approve). O broadcast e a confirmação
# acontecem assincronamente pelo cron worker.
#
# Endpoint : GET /client/v1/withdrawals
# Scope    : withdrawals:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "10) Listar withdrawals (até 100)"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/withdrawals?limit=100" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 11) LISTAR GAS TANKS (SAÚDE POR CHAIN)
# ═══════════════════════════════════════════════════════════════════════════
#
# Um row por chain ativa, com:
#
#   balanceWei            : saldo bruto do gas tank na chain
#   estimatedOpsRemaining : quantos sweeps/deploys o saldo cobre antes do
#                           threshold de alerta
#   status                : "ok" | "low" | "critical"
#                           - critical = abaixo do threshold; sweeps e
#                             deploys ficam bloqueados até ser refundado
#
# Não existe endpoint per-chain (/gas-tanks/:chainId → 404). A listagem é
# barata o suficiente — uma linha por chain.
#
# Endpoint : GET /client/v1/gas-tanks
# Scope    : gas-tanks:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "11) Listar gas tanks (saúde por chain)"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/gas-tanks" | jq

# ═══════════════════════════════════════════════════════════════════════════
# 12) LISTAR FLUSH ACTIVITY (SWEEPS + LAZY DEPLOYS)
# ═══════════════════════════════════════════════════════════════════════════
#
# Feed real da movimentação on-chain: cada sweep submetido pelo cron e
# cada deploy de forwarder feito pelo gas tank. Vem de
# gas_tank_transactions com JOIN automático em deposits.sweep_tx_hash, ou
# seja: por linha você vê o tx hash, gas pago (native + USD), quais
# depósitos foram movidos e quanto totalizaram.
#
# O endpoint legado /flush lê uma tabela separada de operações on-demand
# que está vazia para a maioria dos tenants. Use SEMPRE /flush/activity/list
# para "o que aconteceu de verdade".
#
# Endpoint : GET /client/v1/flush/activity/list
# Query    : limit (default 50, max 200)
# Scope    : forwarders:read

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "12) Listar flush activity (sweeps + lazy deploys)"
echo "════════════════════════════════════════════════════════════════════════"

curl -sS \
  -H "X-API-Key: $CVH_KEY" \
  "$BASE/flush/activity/list?limit=50" | jq

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "✓ Roteiro concluído. 12/12 chamadas curl emitidas com sucesso."
echo "════════════════════════════════════════════════════════════════════════"
