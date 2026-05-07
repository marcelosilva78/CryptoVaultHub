# End-to-End Homologation Plan — CryptoVaultHub Client Portal

**Date:** 2026-05-07
**Target environment:** `https://portal.vaulthub.live` (production) + `https://api.vaulthub.live` (auth)
**Test account:** `wallet@grupogreen.org` (clientId=8, project BrPay id=6998)
**Active chain for tests:** BNB Smart Chain (chainId 56)

---

## Status Geral do Projeto

### O que está pronto e funcional

| Camada | Componente | Status |
|---|---|---|
| **Database** | 43 migrations aplicadas (incluindo gas_tank tables) | ✅ |
| **Smart contracts (BSC chain 56)** | hot_wallet, forwarder_factory, wallet_factory, forwarder_impl, wallet_impl deployados | ✅ |
| **Backend services (6)** | client-api, core-wallet, auth, key-vault, cron-worker, notification — todos healthy | ✅ |
| **Frontend** | Next.js client em produção, 5 commits recentes pós-audit | ✅ |
| **Gas Tank (BrPay)** | 0.0095 BNB no wallet `0x54f55b...C37A1` (gas tank), suficiente para ~9k operações de transfer simples | ✅ |
| **Auditoria de contratos API** | 24+ bugs corrigidos (ver `docs/superpowers/audits/2026-05-06-client-portal-audit-summary.md`) | ✅ |
| **Endpoints críticos** | Todos respondendo 200 (projects, gas-tanks, addresses, co-sign/pending, withdrawals, exports, security) | ✅ |
| **Project selector dropdown** | Funcionando (3 mecanismos de mitigação para race de cookie) | ✅ |
| **Gas Tank UX** | Page, history, alerts, keystore export, dashboard widget, sidebar entry | ✅ |

### Pendências conhecidas (não bloqueiam homologação)

| Item | Severidade | Mitigação atual |
|---|---|---|
| Email channel para `gas_tank.low_balance` | Low | Webhook + banner cobrem; email só loga `[email-stub]` |
| Histórico de gas tank pré-2026-05-06 | Low | UI banner explica; backfill de `deploy_traces`/`flush_operations` é follow-up |
| CORS no `api.vaulthub.live/auth/validate` | Low | Não impede uso (catch silencioso, redirect via middleware funciona) — issue de infra |

### O que ainda precisa ser validado em produção (este plano)

A maioria das fixes foi confirmada via curl probes + Playwright UI. Mas o fluxo end-to-end de **custódia full** (gerar endereço → receber BNB → indexer detectar → webhook disparar → sweep automático → withdrawal) **ainda não foi exercido pós-fixes** porque:

- Não há endereços de depósito provisionados ainda (wallet count = 1, só o gas tank)
- Não há webhook registrado pra capturar os eventos
- Não há depósitos/sacks históricos pra comparar

**Veredicto:** **PRONTO PARA HOMOLOGAÇÃO** — todas as superfícies estáticas estão verificadas; falta exercer o golden path em runtime. Este plano cobre exatamente isso.

---

## Pré-requisitos para homologar

### Ambiente
- Conta cliente: `wallet@grupogreen.org` (já existe)
- Projeto: BrPay (id=6998) com smart contracts já deployados em BSC mainnet (chain 56)
- BNB para testes: ~0.05-0.1 BNB em uma carteira externa controlada por você (Trust Wallet / Metamask), suficiente para fazer 5-10 depósitos pequenos + cobrir gas dos saques de volta
- Acesso SSH ao servidor (já configurado via `green@vaulthub.live`)

### Ferramentas necessárias
- Browser (Firefox ou Chrome) com console aberto
- `curl` no terminal local
- Acesso ao MySQL via `docker exec cryptovaulthub-mysql-1` (já temos)
- **Endpoint de teste de webhook:** recomendo `https://webhook.site` (cria URL única instantaneamente, mostra payload em tempo real). Alternativa: pequeno servidor local com ngrok.
- Explorador BSC: `https://bscscan.com` para confirmar txs

### Cuidados de produção
- Estamos em **mainnet BSC**, fundos reais. Use valores pequenos (0.005-0.01 BNB por teste).
- O botão "Discard Project" tem efeito real — não clicar.
- 2FA está OFF para este usuário (verificado). A relaxação de `verify2fa` permite add/remove de address book sem código TOTP.

---

## Roadmap de Homologação — 12 Fases

A ordem é importante: cada fase pressupõe que a anterior passou. Cada teste tem **Setup**, **Steps**, **Expected**, **Evidence**, **Pass/Fail**.

### Fase 0 — Smoke pre-flight (5 min)

**Objetivo:** Confirmar que todos os serviços estão saudáveis e endpoints básicos respondem.

#### T0.1 — Health check (API)

**Setup:** terminal com `curl` instalado.

**Steps:**
```bash
ssh green@vaulthub.live "cd /docker/CryptoVaultHub && docker compose ps client client-api auth-service core-wallet-service cron-worker-service key-vault-service notification-service chain-indexer-service mysql redis --format 'table {{.Name}}\t{{.Status}}'"
```

**Expected:** Todos os containers `Up ... (healthy)`.

**Evidence:** screenshot da tabela ou copy-paste do output.

**Pass/Fail:** PASS se todos healthy. FAIL se qualquer um for `unhealthy`/`Restarting`/`Exited`.

---

#### T0.2 — Login UI + dropdown de projeto

**Setup:** browser limpo (sessão privada / incógnito).

**Steps:**
1. Acessar `https://portal.vaulthub.live/login`
2. Email: `wallet@grupogreen.org`, senha: a fornecida
3. Clicar "Sign in"
4. Aguardar 5s
5. Clicar no dropdown "Select Project" / "BrPay" (canto superior direito)

**Expected:**
- Login redireciona para `/`
- Dashboard renderiza
- Dropdown lista "BrPay" (não vazio)
- Trigger button mostra "BrPay" após carregar

**Evidence:** screenshot do dashboard com dropdown aberto.

**Pass/Fail:** PASS se BrPay aparece na lista; FAIL se "Create New Project" for o único item após 5s + clique no dropdown.

---

### Fase 1 — Auth & Sessão (10 min)

**Objetivo:** Validar login, refresh de token, logout e proteção de rotas.

#### T1.1 — Login com credencial inválida

**Steps:** Tentar login com senha errada.
**Expected:** Mensagem de erro visível no UI; sem cookies setados.
**Pass/Fail:** PASS se erro user-friendly.

#### T1.2 — Refresh automático de token

**Steps:**
1. Login normal
2. No browser dev console: `document.cookie` (verifica se `cvh_client_token` existe como HttpOnly — não deve aparecer no JS)
3. Aguardar 1h ou simular expiração mudando o `expires` do cookie via dev tools / hammering refresh
4. Recarregar dashboard

**Expected:** Sessão se mantém via refresh silencioso; usuário não é deslogado.

**Pass/Fail:** PASS se a página recarrega sem redirect para `/login`.

#### T1.3 — Logout limpa sessão

**Steps:** Clicar em "Logout" (canto inferior esquerdo do sidebar). Tentar acessar `/` direto.

**Expected:** Redirect para `/login`. Cookies limpos.

**Pass/Fail:** PASS se redirect funciona.

---

### Fase 2 — Smart Contracts & Provisionamento (15 min)

**Objetivo:** Confirmar que os contratos do projeto BrPay estão deployados e operacionais on-chain.

#### T2.1 — Listar deploy traces (API)

**Steps:**
```bash
COOKIE=/tmp/cvh_cookies.txt
curl -s -c $COOKIE -X POST https://portal.vaulthub.live/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"wallet@grupogreen.org","password":"<senha>"}' > /dev/null

curl -s -b $COOKIE "https://portal.vaulthub.live/api/proxy/v1/projects/6998/deploy/traces" \
  | python3 -c "import sys, json; [print(t['contractType'], t['chainId'], t.get('contractAddress', 'N/A')) for t in json.load(sys.stdin).get('traces', [])]"
```

**Expected:** Lista contendo (mínimo) `hot_wallet`, `forwarder_factory`, `wallet_factory`, `forwarder_impl`, `wallet_impl` em chain 56.

**Evidence:** Captura do output. Validar cada `contractAddress` no BSCscan (deve ter código deployado).

**Pass/Fail:** PASS se todos 5 estão presentes com endereços ON-CHAIN reais.

#### T2.2 — Verificar `forwarder_factory` on-chain

**Steps:** Abrir `https://bscscan.com/address/0x16fE538d48E739031EA840eC91D1EdC384299A2d` (forwarder_factory).

**Expected:** Contract verified ou pelo menos `Contract Creation` tx visível, code ≠ `0x`.

**Pass/Fail:** PASS se código existe.

#### T2.3 — Hot wallet existe e tem dono correto

**Steps:** Abrir `0x17193A58d73825485393E00ecE33051Fa2536415` no BSCscan.

**Expected:** EOA (não contrato) ou Smart Wallet com owner = key managed pelo CryptoVaultHub.

**Pass/Fail:** PASS se address ativo.

---

### Fase 3 — Geração de Endereços de Depósito (Forwarders) (15 min)

**Objetivo:** Cliente gera N forwarders via UI/API; sistema computa endereço CREATE2 + (em algum momento) deploya o forwarder.

#### T3.1 — Gerar 3 endereços de depósito (UI)

**Setup:** logado, projeto BrPay ativo.

**Steps:**
1. Sidebar → **Wallets** ou **Address Groups** (verificar qual fluxo está ativo no UI atual)
2. Clicar "Generate Deposit Address" (ou "+ New Address")
3. Selecionar chain BSC (56)
4. Label: `homolog-deposit-1`
5. Repetir 2x mais com labels `homolog-deposit-2`, `homolog-deposit-3`

**Expected:**
- 3 addresses retornados, cada um único, todos começando com `0x`
- Status inicial: `pending_deployment` (forwarder ainda não deployado on-chain)
- API GET `/v1/deposit-addresses` retorna 3 rows

**Evidence:** screenshot da listagem + outputs da API.

**Pass/Fail:** PASS se 3 endereços únicos foram gerados.

#### T3.2 — Confirmar via API

**Steps:**
```bash
curl -s -b $COOKIE "https://portal.vaulthub.live/api/proxy/v1/deposit-addresses?limit=10" | python3 -m json.tool
```

**Expected:** JSON com 3 addresses + `meta.total: 3`.

#### T3.3 — Deploy automático do forwarder na primeira tx (não testar agora)

**Note:** os forwarders são deployados sob demanda na primeira tx que recebem. Não há deploy explícito agora — deixar para Fase 4.

---

### Fase 4 — Depósito + Detecção (Indexer) (25 min)

**Objetivo:** Mandar BNB para um forwarder, ver o sistema detectar.

#### T4.1 — Registrar webhook receiver

**Setup:** abrir `https://webhook.site` em outra aba — copia a URL única gerada.

**Steps (UI):**
1. Sidebar → **Webhooks** → "+ Create Webhook"
2. URL: a do webhook.site
3. Events: marcar TODOS (`deposit.detected`, `deposit.confirmed`, `withdrawal.broadcast`, `withdrawal.confirmed`, `forwarder.deployed`, `gas_tank.low_balance`, etc.)
4. Salvar
5. Clicar "Test webhook" → confirmar `test.ping` chega no webhook.site

**Expected:**
- Webhook listado em GET `/v1/webhooks`
- Test ping arrived no webhook.site com header `x-webhook-signature` válido (HMAC-SHA256 do body com o secret)

**Pass/Fail:** PASS se test.ping chega.

#### T4.2 — Mandar 0.005 BNB para `homolog-deposit-1`

**Setup:** carteira externa (Trust Wallet / Metamask) conectada à BSC mainnet com saldo.

**Steps:** Send 0.005 BNB para o endereço `homolog-deposit-1`. Anotar o tx hash.

**Expected na blockchain:** tx incluída em <30s no BSC.

**Evidence:** tx hash + link no BSCscan.

#### T4.3 — Sistema detecta e dispara webhook

**Steps após a tx confirmar (3 confirmações ~9s):**
1. Aguardar até 60s
2. Refresh `webhook.site` — espera-se receber `deposit.detected` (e depois `deposit.confirmed` quando atingir confirmações configuradas)
3. UI: Sidebar → **Deposits** — espera-se ver row novo com status `pending` ou `confirmed`
4. UI: **Wallets / Address** — saldo do `homolog-deposit-1` mostra 0.005 BNB

**Expected:**
- Webhook `deposit.detected` recebido com:
  ```json
  { "eventType": "deposit.detected", "data": { "address": "0x...", "amount": "0.005", "tokenSymbol": "BNB", "txHash": "0x...", "chainId": 56 } }
  ```
- HMAC signature válida (verificar com o secret do webhook)
- Deposits page lista o depósito
- API: `GET /v1/deposits` retorna 1 row

**Evidence:**
- Screenshot do webhook.site mostrando o payload completo + headers
- Screenshot da page Deposits
- Output da API

**Pass/Fail:**
- PASS se webhook chega < 90s e payload tem todos os campos
- FAIL se webhook não chega ou Deposits page fica vazia
- WARNING se chega mas com delay > 90s (possível indexer atrasado)

#### T4.4 — Verificar event no indexer (DB)

**Steps:**
```bash
ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" cvh_indexer -e "SELECT * FROM indexed_events ORDER BY created_at DESC LIMIT 3 \\G" 2>&1 | grep -v "Using a password"'
```

**Expected:** Pelo menos 1 row recente com `chain_id=56` e `from_address` da carteira de origem.

---

### Fase 5 — Sweep Automático (Forwarder → Hot Wallet) (15 min)

**Objetivo:** Cron-worker detecta saldo no forwarder, deploya o forwarder (se ainda não estava) e sweepa para hot wallet.

#### T5.1 — Aguardar sweep automático

**Steps:**
1. Manter o BNB no `homolog-deposit-1` (não mover manualmente)
2. Aguardar até 5 min (cron-worker roda em ciclos)
3. Atualizar a tela / chamar API

**Expected:**
- BSCscan: tx do gas_tank (`0x54f55b4e...C37A1`) deployando o forwarder
- BSCscan: tx do forwarder mandando BNB para hot_wallet (`0x17193A58...6415`)
- Webhook `forwarder.deployed` chega
- Saldo do `homolog-deposit-1` no UI: 0
- Saldo do hot_wallet (em Wallets page): aumenta em ~0.005 BNB (menos gas)

**Evidence:**
- Screenshot do BSCscan do hot_wallet com saldo
- Screenshots dos webhooks `forwarder.deployed` e (talvez) `deposit.confirmed`

**Pass/Fail:**
- PASS se sweep aconteceu < 5min e saldo apareceu no hot wallet
- FAIL se forwarder não foi deployado ou saldo não foi movido

#### T5.2 — Verificar entrada em `gas_tank_transactions`

**Steps:** Após o sweep,
```bash
ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" cvh_wallets -e "SELECT operation_type, status, gas_used, gas_cost_wei, submitted_at FROM gas_tank_transactions ORDER BY submitted_at DESC LIMIT 5 \\G" 2>&1 | grep -v "Using a password"'
```

**Expected:** Pelo menos 2 rows: `deploy_forwarder` (status confirmed) e `sweep` (status confirmed) com `gas_cost_wei` populado.

**Pass/Fail:** PASS se ambas operações aparecem.

#### T5.3 — Confirmar via Gas Tanks UI

**Steps:** Sidebar → **Gas Tanks** → clicar "History" no card BNB.

**Expected:** Modal mostra as 2 operações recém-feitas (sweep + forwarder deploy) com tipo e custo.

**Pass/Fail:** PASS se aparecem.

---

### Fase 6 — Múltiplos Depósitos + Flush Manual (20 min)

**Objetivo:** Validar a operação de **flush** — cliente força sweep de TODOS os forwarders com saldo de uma vez.

#### T6.1 — Mandar BNB para `homolog-deposit-2` e `-3`

**Steps:** Send 0.005 BNB para cada um dos 2 forwarders restantes.

**Expected:** Detecção via webhook (Fase 4). Aguardar webhooks `deposit.detected`.

#### T6.2 — INTERROMPER o sweep automático antes de testar flush

**Important:** se você esperar 5 min, o sweep automático vai mover tudo. Para testar flush, há que ser ágil OU desligar o cron-worker temporariamente:

```bash
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose stop cron-worker-service'
```

Mande os depósitos. Confirme que ficaram parados nos forwarders (Wallets page mostra saldo).

#### T6.3 — Flush via UI

**Steps:**
1. Sidebar → **Flush**
2. Selecionar BSC (chain 56)
3. Selecionar todos os 2 forwarders com saldo (ou "Select all")
4. Confirmar — exigirá 2FA se ativo, mas como está OFF, deve passar
5. Aguardar completar (UI mostra spinner / status)

**Expected:**
- API call `POST /v1/flush` retorna `flushOperationId` e status `pending`
- BSCscan: txs sweep dos forwarders selecionados → hot_wallet
- UI Flush page atualiza para `completed`
- Webhooks `flush.completed` chegam

**Evidence:** screenshot da Flush page completa + webhook.site.

**Pass/Fail:** PASS se todos selecionados foram movidos para hot_wallet.

#### T6.4 — Religar cron-worker

```bash
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose start cron-worker-service'
```

---

### Fase 7 — Withdrawal (Hot Wallet → External) (15 min)

**Objetivo:** Validar saída de BNB do hot_wallet para um endereço externo.

#### T7.1 — Whitelist do address de destino

**Pré-condição (em projeto custódia full):** o address de destino precisa estar na whitelist (via Address Book).

**Steps:**
1. Sidebar → **Address Book** → "+ Add Address"
2. Address: a sua carteira externa (não o forwarder!)
3. Label: `homolog-withdraw-target`
4. Chain: BSC (56)
5. Salvar

**Expected:** address aparece na lista, status `active` (após cooldown se houver).

**Pass/Fail:** PASS se address foi adicionado sem 403 (era o bug original — agora corrigido com 2FA permissivo).

#### T7.2 — Criar withdrawal

**Steps:**
1. Sidebar → **Withdrawals** → "+ New Withdrawal"
2. From: hot_wallet BSC
3. To: `homolog-withdraw-target` (do whitelist)
4. Amount: 0.003 BNB
5. Submit

**Expected:**
- Withdrawal criado com status `pending` ou `pending_kyt`
- KYT screening passa (se ativo) — pode levar segundos
- Webhook `withdrawal.created`
- Eventualmente: `withdrawal.broadcast` quando broadcast no BSC
- Eventualmente: `withdrawal.confirmed` após N confirmações

**Pass/Fail:** PASS se a tx final aparece na carteira de destino.

#### T7.3 — Confirmar saldo na carteira externa

**Steps:** verificar a carteira externa.

**Expected:** ~0.003 BNB recebido.

---

### Fase 8 — Co-Sign (Skip se mode=full_custody) (15 min)

**Cenário:** o projeto BrPay está em `full_custody` (verificado via `/v1/security/settings`). Não há co-sign para esta conta.

**Recomendação:** criar projeto separado em modo `co_sign` para testar este fluxo. Não é blocker para homologação do BrPay.

**Se for testar:**
- T8.1 — Criar withdrawal em projeto co-sign → status `pending_cosign`
- T8.2 — `GET /v1/co-sign/pending` retorna 1 op
- T8.3 — Cliente assina off-chain com sua chave privada (Shamir share)
- T8.4 — `POST /v1/co-sign/{id}/sign` com `signature` hex
- T8.5 — Plataforma combina e broadcasts

---

### Fase 9 — Gas Tank Operacional (10 min)

**Objetivo:** Validar UX do gas tank pós-operações.

#### T9.1 — History populado

**Steps:** Sidebar → **Gas Tanks** → "View full history".

**Expected:** Tabela tem rows recentes (deploy_forwarder, sweep, flush) com status, tipo e custo.

**Pass/Fail:** PASS se as ops das fases 5 e 6 aparecem.

#### T9.2 — Forçar low-balance alert

**Steps:**
1. Gas Tanks page → card BNB → "Alerts"
2. Mudar threshold para `0.05` BNB (acima do balance atual)
3. Salvar
4. Aguardar até 5 min (próximo ciclo do cron)

**Expected:**
- Webhook `gas_tank.low_balance` chega no webhook.site
- Banner vermelho aparece no dashboard avisando "1 gas tank below threshold"
- API: `GET /v1/gas-tanks` retorna a chain com `status: 'critical'`

**Evidence:** screenshot do dashboard com banner vermelho + webhook payload.

**Pass/Fail:** PASS se webhook chega + banner aparece.

#### T9.3 — Top-up flow

**Steps:**
1. Click "Top Up" no card BNB
2. QR aparece (EIP-681)
3. Mandar 0.01 BNB para o endereço do gas tank de uma carteira externa
4. Aguardar 15-30s

**Expected:**
- Modal mostra "✓ Funded! Closing automatically" após detectar saldo aumentar
- Status volta a `ok` no card

**Pass/Fail:** PASS se o auto-poll detecta.

#### T9.4 — Reset threshold

**Steps:** voltar para `0.001` BNB para não ficar pingando.

#### T9.5 — Export keystore

**Steps:**
1. Click "Keystore" no card BNB
2. Aceitar o aviso de segurança
3. Inserir mnemonic do projeto (Step 4 do wizard original)
4. Senha mínima 8 chars
5. Click "Download keystore"

**Expected:** Download de arquivo `.json` v3.

**Validação:** decryptar localmente:
```bash
node -e "
const { Wallet } = require('ethers');
const fs = require('fs');
const json = fs.readFileSync('gas-tank-56-0x54f55b4e74.json', 'utf8');
Wallet.fromEncryptedJson(json, 'sua-senha').then(w => console.log('Address:', w.address));
"
```

**Expected:** Address recuperado bate com `0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1`.

**Pass/Fail:** PASS se decryptar e endereço bate.

---

### Fase 10 — Webhooks Resiliência (15 min)

**Objetivo:** Validar retry/dead-letter quando o endpoint do webhook falha.

#### T10.1 — Endpoint que retorna 500

**Setup:** `https://webhook.site` permite configurar respostas custom (status code 500). Ou usar um servidor local que sempre retorna 500.

**Steps:**
1. Configurar webhook URL para retornar 500
2. Trigger qualquer event (ex: novo depósito)

**Expected:**
- Sistema tenta entregar
- Recebe 500
- Retry com backoff (3-5 tentativas conforme config)
- Eventualmente entra em dead-letter
- UI: Webhooks page → click no webhook → "Deliveries" mostra entries com status `failed` e `attempt_count` > 1

**Pass/Fail:** PASS se retries acontecem e dead-letter visível.

#### T10.2 — Manual retry

**Steps:** UI → Webhook deliveries → "Retry" em uma falha.

**Expected:** novo attempt iniciado; se endpoint agora retorna 200, fica `delivered`.

**Pass/Fail:** PASS se retry manual funciona.

#### T10.3 — Validar HMAC

**Steps:** No endpoint receiver, calcular HMAC-SHA256 do body com o webhook secret. Comparar com header `x-webhook-signature`.

**Expected:** match exato.

**Pass/Fail:** PASS se assinaturas batem.

---

### Fase 11 — Notificações & Address Groups (10 min)

#### T11.1 — Criar notification rule

**Steps:** Sidebar → **Notifications** → "+ New Rule"
- Event: `deposit.detected`
- Channel: webhook (mesmo URL do webhook.site)
- Filter: amount > 0.001
- Toggle enabled = true
- Save

**Expected:** rule criada; após próximo deposit > 0.001, webhook recebe notification adicional (além do webhook canônico).

**Pass/Fail:** PASS se rule funciona como filtro.

#### T11.2 — Toggle rule (PATCH/PUT fix)

**Steps:** Toggle a rule off via UI.

**Expected:** API call não retorna 404 (era o bug); rule fica desabilitada.

**Pass/Fail:** PASS se toggle funciona — sem 404 silencioso.

#### T11.3 — Address Groups: criar + provisionar

**Steps:**
1. Sidebar → **Address Groups** → "+ Create Group"
2. Nome: `homolog-group-1`
3. Após criação, click "Provision Chain" / selecionar BSC

**Expected:**
- Grupo criado
- Provision endpoint retorna 200 (era 404)
- Dentro de 30s, endereços do grupo deployados via factory

**Pass/Fail:** PASS se provision não dá 404.

---

### Fase 12 — Exports (5 min)

#### T12.1 — Criar export de transactions

**Steps:**
1. Sidebar → **Exports**
2. Tipo: transactions
3. Filtros: Chain BSC, últimos 7 dias
4. Submit

**Expected:**
- API retorna `requestUid`, status `queued`
- Após alguns segundos: status `completed`
- Botão Download fica clicável

#### T12.2 — Download

**Steps:** click Download.

**Expected:** arquivo `.csv` com headers + rows.

**Pass/Fail:** PASS se CSV abre e tem dados.

---

## Matriz de Cobertura UI vs API

| Funcionalidade | UI | API direta | Webhook |
|---|---|---|---|
| Login + JWT cookie | T0.2 | T1.* | — |
| Listar projetos | T0.2 dropdown | `GET /v1/projects` | — |
| Listar deploy traces | indireto via Deploy History | T2.1 | — |
| Gerar deposit address | T3.1 | `GET/POST /v1/deposit-addresses` | `forwarder.deployed` |
| Detecção de depósito | T4.* Deposits page | `GET /v1/deposits` | `deposit.detected/confirmed` |
| Sweep automático | T5.* via balance change | DB `gas_tank_transactions` | `deposit.confirmed` |
| Flush manual | T6.3 | `POST /v1/flush` | `flush.completed` |
| Withdrawal | T7.* | `POST /v1/withdrawals` | `withdrawal.broadcast/confirmed` |
| Co-sign | T8.* | `GET /v1/co-sign/pending`, `POST /v1/co-sign/:id/sign` | — |
| Gas tank low alert | T9.2 | DB `gas_tank_alert_config` | `gas_tank.low_balance` |
| Gas tank top-up | T9.3 | balance polling | — |
| Keystore export | T9.5 | `POST /v1/gas-tanks/:chainId/export-keystore` | — |
| Webhook retries | T10.1 | `GET /v1/webhooks/:id/deliveries` | — |
| Notification rules | T11.* | `PUT /v1/notifications/rules/:id` | — |
| Address groups | T11.3 | `POST /v1/address-groups/:groupUid/provision` | — |
| Exports | T12.* | `POST /v1/exports`, `GET /v1/exports/:id/download` | — |

---

## Critérios de aceite para promoção a produção

**A homologação é considerada APROVADA quando:**

1. ✅ Fases 0–7 inteiramente PASS (golden path: login → endereço → depósito → sweep → withdrawal)
2. ✅ Fase 9 (Gas Tank) PASS — operações criticas dependem desse fluxo
3. ✅ Fase 10.1 + 10.3 PASS — webhooks são contrato com integradores
4. ⚠️ Fase 11 PASS — funcional para todos os endpoints recém-corrigidos
5. ⚠️ Fase 12 PASS — exports usados pra reconciliação contábil

Itens marcados ⚠️ são desejáveis mas não bloqueantes se ainda houver follow-ups planejados.

**Falhas aceitáveis (com plano de ação documentado):**
- Email channel (Fase 9.2) chegando como log apenas — já é stub aceito
- Histórico de gas pré-2026-05-06 vazio — já tem banner explicativo

---

## Próximos passos sugeridos pós-homologação

1. **Backfill de gas_tank_transactions** para mostrar histórico completo desde a deployment do projeto.
2. **Implementar email delivery** para `gas_tank.low_balance` (atualmente stub).
3. **Resolver CORS no `auth/validate`** — adicionar header `Access-Control-Allow-Origin: https://portal.vaulthub.live` na auth-service para evitar erros no console.
4. **Adicionar integração com testnet** (BSC Testnet 97) para testes de regressão sem fundos reais.
5. **Suite automatizada** desses testes (Playwright + curl scripts) rodando no CI antes de cada deploy.

---

## Apêndice — Comandos úteis durante os testes

### Login e cookies
```bash
COOKIE=/tmp/cvh_cookies.txt
curl -s -c $COOKIE -X POST https://portal.vaulthub.live/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"wallet@grupogreen.org","password":"<senha>"}'
```

### Probe de qualquer endpoint
```bash
curl -s -b $COOKIE "https://portal.vaulthub.live/api/proxy/v1/<path>" | python3 -m json.tool
```

### Logs ao vivo de um serviço
```bash
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose logs -f --tail 30 client-api'
```

### Restart pontual
```bash
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose restart cron-worker-service'
```

### Querar DB pra debug
```bash
ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" -e "USE cvh_wallets; SELECT * FROM wallets WHERE project_id=6998;"'
```
