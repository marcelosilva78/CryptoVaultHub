# Homologação End-to-End — Projeto BrPay (existente)

**Data:** 2026-05-07
**Ambiente:** `https://portal.vaulthub.live` + `https://api.vaulthub.live`
**Conta:** `wallet@grupogreen.org` (clientId=8)
**Projeto sob teste:** **BrPay** (id 6998), modo `full_custody`, BSC mainnet (chainId 56)

---

## Estado do projeto BrPay (ponto de partida)

✅ Smart contracts deployados em BSC mainnet (chain 56):

| Contrato | Endereço |
|---|---|
| `hot_wallet` | `0x17193A58d73825485393E00ecE33051Fa2536415` |
| `forwarder_factory` | `0x16fE538d48E739031EA840eC91D1EdC384299A2d` |
| `wallet_factory` | `0x5819fF9612Af78b832926E1e0E954e0510d0B524` |
| `forwarder_impl` | `0x31de8569c09a04C308d794577F451D9ae7a11e41` |
| `wallet_impl` | `0x9D781965c813B12f5be0450a119Dd9A34Ebce149` |
| `gas_tank` (EOA) | `0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1` |

✅ Gas tank com `0.00952 BNB` (status `ok`, suficiente para ~9k operações de transfer simples).
✅ 2FA desabilitado (verificado).
✅ Custódia: `full_custody` (sem co-sign).
❌ Nenhum endereço de depósito provisionado ainda.
❌ Nenhum webhook registrado.
❌ Sem histórico de depósitos / saques.

**Premissa:** o roteiro abaixo NÃO cria o projeto, NÃO deploya contratos. Apenas exercita as funcionalidades operacionais sobre o BrPay já configurado.

---

## Pré-requisitos para começar

1. **Carteira externa** (Trust Wallet / Metamask / Rabby) com **0.05 BNB** na BSC mainnet.
2. **Aba aberta em `https://webhook.site`** — copiar a URL única gerada (será o `WEBHOOK_URL` em todos os testes).
3. **Browser** (incógnito recomendado) + **terminal** com `curl`.
4. **Acesso SSH** já configurado: `ssh green@vaulthub.live`.
5. **BSCscan** aberto (`https://bscscan.com`) para confirmar txs.

> ⚠️ Estamos em **mainnet com fundos reais.** Usar valores entre 0.003 e 0.01 BNB por teste. **Não clicar "Discard Project".**

---

## Cheatsheet de variáveis usadas no roteiro

```bash
# No terminal, exporte uma vez no início:
export COOKIE=/tmp/cvh_cookies.txt
export PORTAL=https://portal.vaulthub.live
export PROJECT_ID=6998
export CHAIN_ID=56
export GAS_TANK=0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1
export HOT_WALLET=0x17193A58d73825485393E00ecE33051Fa2536415
export FWD_FACTORY=0x16fE538d48E739031EA840eC91D1EdC384299A2d
export WEBHOOK_URL=<cole-a-url-do-webhook.site>
```

---

## Fase 1 — Smoke pre-flight (5 min)

### T1.1 — Saúde dos serviços

```bash
ssh green@vaulthub.live "cd /docker/CryptoVaultHub && docker compose ps client client-api auth-service core-wallet-service cron-worker-service key-vault-service notification-service chain-indexer-service mysql redis --format 'table {{.Name}}\t{{.Status}}'"
```

- [ ] Todos os 10 containers `Up ... (healthy)`.

### T1.2 — Login e sessão

```bash
curl -s -c $COOKIE -X POST $PORTAL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"wallet@grupogreen.org","password":"<senha>"}' | python3 -m json.tool
```

- [ ] Resposta `{ "user": { "id": "6", "clientId": "8", ... } }` em <2s.

### T1.3 — Login no UI + dropdown

1. Abrir incógnito → `$PORTAL/login` → login → aguardar redirect.
2. Aguardar 5s, clicar no dropdown "BrPay" no canto superior direito.

- [ ] Trigger button mostra **BrPay** (não "Select Project").
- [ ] Dropdown lista BrPay com badge `Active`.

### T1.4 — Confirmar estado do projeto BrPay via API

```bash
curl -s -b $COOKIE "$PORTAL/api/proxy/v1/projects/$PROJECT_ID/deploy/traces" \
  | python3 -c "import sys,json; [print(t['contractType'].ljust(20), t['contractAddress']) for t in json.load(sys.stdin).get('traces',[]) if t.get('contractAddress')]"
```

- [ ] Lista contém os 5 contratos esperados (hot_wallet, forwarder_factory, wallet_factory, forwarder_impl, wallet_impl).

```bash
curl -s -b $COOKIE "$PORTAL/api/proxy/v1/wallets" | python3 -m json.tool
curl -s -b $COOKIE "$PORTAL/api/proxy/v1/gas-tanks" | python3 -m json.tool
```

- [ ] `wallets` retorna 1 row tipo `gas_tank` no `$GAS_TANK`.
- [ ] `gas-tanks` retorna 1 entry para chain 56 com `balanceWei > 0` e `status: 'ok'`.

---

## Fase 2 — Registrar webhook receiver (5 min)

Pré-condição: nenhum webhook em BrPay (será criado agora).

### T2.1 — Criar webhook via UI

1. Sidebar → **Webhooks** → "+ Create Webhook".
2. URL: `$WEBHOOK_URL`.
3. Marcar **todos** os events disponíveis na lista.
4. Salvar — anotar o `secret` exibido (pode aparecer só uma vez).

- [ ] Webhook listado em `Webhooks` page com status `enabled`.

### T2.2 — Test ping

1. Na linha do webhook, clicar **"Send test event"**.

- [ ] No `webhook.site` chega um POST com:
  - `eventType: "test.ping"`
  - Header `x-webhook-signature: sha256=...` (HMAC do body com o secret)
  - Header `x-webhook-event: test.ping`
- [ ] Validar HMAC — comando para conferir manualmente:
  ```bash
  echo -n '<body-recebido-no-webhook.site>' | openssl dgst -sha256 -hmac '<secret>'
  ```
  deve bater com a parte após `sha256=` no header.

### T2.3 — Confirmar via API

```bash
curl -s -b $COOKIE "$PORTAL/api/proxy/v1/webhooks" | python3 -m json.tool
```

- [ ] `count: 1`, webhook tem `events: [...]` com a lista marcada.

---

## Fase 3 — Gerar endereços de depósito (5 min)

### T3.1 — Gerar 3 forwarders (UI)

1. Sidebar → **Wallets** → "Generate Deposit Address" (ou Address Groups → criar grupo + provisionar).
2. Chain: BSC (56). Label: `homolog-1`.
3. Repetir 2x: `homolog-2`, `homolog-3`.

- [ ] 3 endereços únicos retornados, todos `0x...` (40 hex chars).
- [ ] Status: `pending_deployment` (forwarder será deployado on-the-fly na primeira tx).
- [ ] Anotar os 3 endereços para usar nas próximas fases.

```bash
# Exporta para reusar:
export FWD1=0x...
export FWD2=0x...
export FWD3=0x...
```

### T3.2 — Confirmar via API

```bash
curl -s -b $COOKIE "$PORTAL/api/proxy/v1/deposit-addresses?limit=10" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'total={d[\"meta\"][\"total\"]}'); [print(f'  {a[\"address\"]} {a.get(\"label\")} {a[\"status\"]}') for a in d.get('addresses',[])]"
```

- [ ] `total: 3` (ou ≥ 3 se já houvesse).
- [ ] Os 3 labels aparecem.

---

## Fase 4 — Depósito + Detecção pelo Indexer (25 min)

### T4.1 — Mandar 0.005 BNB para `homolog-1`

Da carteira externa, enviar **0.005 BNB → `$FWD1`**. Anotar o tx hash.

- [ ] Tx confirmada no BSCscan (3 confs ~9s).

### T4.2 — Aguardar webhook `deposit.detected`

Tempo máximo: **90s** após a tx confirmar.

- [ ] No `webhook.site`, chega payload `eventType: deposit.detected` com:
  ```json
  { "address": "<FWD1>", "amount": "0.005", "tokenSymbol": "BNB", "txHash": "0x...", "chainId": 56 }
  ```
- [ ] Header `x-webhook-signature` válido.

> Se não chegar em 2 min, conferir logs do indexer:
> ```bash
> ssh green@vaulthub.live "cd /docker/CryptoVaultHub && docker compose logs --tail 30 chain-indexer-service | grep -i '<FWD1>'"
> ```

### T4.3 — UI mostra o depósito

1. Sidebar → **Deposits**.

- [ ] Aparece row com address `$FWD1`, amount `0.005`, status `pending` ou `confirmed`.

### T4.4 — Confirmação após N blocks

Aguardar até 60s adicionais.

- [ ] Webhook `deposit.confirmed` chega.
- [ ] UI: status do depósito muda para `confirmed`.

### T4.5 — Indexer DB sanity check

```bash
ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" cvh_indexer -e "SELECT COUNT(*) AS events FROM indexed_events WHERE chain_id=56 AND created_at > NOW() - INTERVAL 10 MINUTE;" 2>&1 | grep -v Using'
```

- [ ] `events ≥ 1`.

---

## Fase 5 — Sweep automático (15 min)

O cron-worker faz sweep dos forwarders com saldo a cada N minutos. Vai usar gas do `$GAS_TANK`.

### T5.1 — Aguardar sweep

Tempo: até **5 min** após T4.4.

Esperado on-chain:
- TX 1: Gas tank deploya o forwarder no `$FWD1` (CREATE2).
- TX 2: Forwarder transfere o BNB para `$HOT_WALLET`.

Verificar via BSCscan: `https://bscscan.com/address/$FWD1` → "Internal Txns" ou "Erc20 Token Txns".

- [ ] BSCscan mostra o forwarder como contrato deployado (code != `0x`).
- [ ] Saldo do `$FWD1` agora 0.
- [ ] Saldo do `$HOT_WALLET` aumentou ~0.005 BNB.

### T5.2 — Eventos esperados

- [ ] Webhook `forwarder.deployed` chega em `webhook.site` com `address: $FWD1`.
- [ ] (Opcionalmente) `deposit.swept` ou `sweep.completed` se configurado.

### T5.3 — `gas_tank_transactions` populado

```bash
ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" cvh_wallets -e "SELECT operation_type, status, gas_used, gas_cost_wei, submitted_at FROM gas_tank_transactions WHERE project_id=6998 ORDER BY submitted_at DESC LIMIT 5;" 2>&1 | grep -v Using'
```

- [ ] Pelo menos 2 rows recentes: `deploy_forwarder` e `sweep`, ambas `status: confirmed` com `gas_cost_wei > 0`.

### T5.4 — UI Gas Tanks → History

1. Sidebar → **Gas Tanks** → click "History" no card BNB.

- [ ] Modal mostra as 2 operações recentes com status `confirmed`, custo formatado em BNB, link clicável para BSCscan.

### T5.5 — UI Wallets mostra hot_wallet com saldo

1. Sidebar → **Wallets**.

- [ ] `$HOT_WALLET` aparece com balance ~0.005 BNB (menos custo de sweep).

---

## Fase 6 — Múltiplos depósitos + Flush manual (20 min)

Para testar flush, precisamos de saldo parado em forwarders. Vamos pausar o sweep automático.

### T6.1 — Parar cron-worker

```bash
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose stop cron-worker-service'
```

- [ ] `docker compose ps cron-worker-service` mostra `Exited`.

### T6.2 — Mandar 0.005 BNB para `homolog-2` e `homolog-3`

Da carteira externa: dois sends, um para `$FWD2`, outro para `$FWD3`.

- [ ] Webhook `deposit.detected` chega para ambos.
- [ ] UI Deposits mostra 3 rows totais (1 da Fase 4 + 2 novos).
- [ ] Saldo dos 2 forwarders **NÃO** é movido (cron parado).

### T6.3 — Flush via UI

1. Sidebar → **Flush** → "+ Start Flush".
2. Chain: BSC.
3. Selecionar `$FWD2` e `$FWD3` (ou "Select all forwarders with balance").
4. Submit.

- [ ] API retorna 200 com `flushOperationId`.
- [ ] BSCscan: 2 sweep txs do gas tank → forwarders → hot wallet (algumas operações sequenciais).
- [ ] Webhook `flush.completed` chega.
- [ ] Saldo do hot_wallet aumenta para ~0.014 BNB total.
- [ ] UI Flush page mostra operação como `completed`.

### T6.4 — Religar cron-worker

```bash
ssh green@vaulthub.live 'cd /docker/CryptoVaultHub && docker compose start cron-worker-service && sleep 8 && docker compose ps cron-worker-service'
```

- [ ] Status: `Up ... (healthy)`.

---

## Fase 7 — Withdrawal (Hot Wallet → externo) (15 min)

### T7.1 — Adicionar address externo no whitelist

1. Sidebar → **Address Book** → "+ Add Address".
2. Address: a sua carteira externa (a que enviou os depósitos).
3. Label: `homolog-target`. Chain: BSC. Notes opcionais.
4. Submit.

- [ ] **Sem 403** (era o bug do `verify2fa`; agora deve passar com 2FA off).
- [ ] Address aparece em `Address Book` com status `active` (após cooldown de 24h se aplicável).

> Se o address tiver cooldown de 24h, veja o status — pode aparecer como `pending` ou `cooldown`. Para os testes, isso pode bloquear o saque.
> Se for blocker: ajustar via DB temporariamente:
> ```bash
> ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" cvh_wallets -e "UPDATE whitelisted_addresses SET status=\"active\", cooldown_until=NULL WHERE label=\"homolog-target\";"'
> ```

### T7.2 — Criar withdrawal

1. Sidebar → **Withdrawals** → "+ New Withdrawal".
2. From: hot_wallet BSC. To: `homolog-target`. Amount: `0.003`. Token: BNB.
3. Submit.

- [ ] Withdrawal criado com status `pending` ou `pending_kyt`.
- [ ] Webhook `withdrawal.created`.
- [ ] Após KYT (segundos a 1 min): webhook `withdrawal.broadcast`.
- [ ] Após confirmações: webhook `withdrawal.confirmed`.

### T7.3 — Conferir saldo na carteira externa

- [ ] Recebeu ~0.003 BNB.
- [ ] BSCscan mostra a tx FROM `$HOT_WALLET` TO sua carteira.

---

## Fase 8 — Gas Tank operacional (15 min)

### T8.1 — History mostra ops das fases anteriores

1. Sidebar → **Gas Tanks** → "View full history".

- [ ] Tabela tem rows recentes: `deploy_forwarder`, `sweep`, `flush` (vários), `deploy_wallet` (se houver), todos `confirmed`.
- [ ] Filtros funcionam: filter por type "sweep" → mostra só sweeps.

### T8.2 — Forçar low-balance alert

1. Card BNB → "Alerts" → mudar threshold para **0.05 BNB** (acima do balance atual ~0.0095).
2. Salvar.

- [ ] Card BNB no `Gas Tanks` page muda para status `critical` (vermelho) na próxima refresh (30s).
- [ ] Dashboard mostra **banner vermelho** "1 gas tank below threshold" no topo.

Aguardar até 5 min (cron de balance check):

- [ ] Webhook `gas_tank.low_balance` chega no `webhook.site`:
  ```json
  { "projectId": 6998, "chainId": 56, "address": "<GAS_TANK>", "balanceWei": "...", "thresholdWei": "50000000000000000" }
  ```

### T8.3 — Top-up flow

1. Card BNB → "Top Up" → modal abre com QR EIP-681.
2. Mandar 0.01 BNB da carteira externa para `$GAS_TANK` (ou escanear QR no celular).
3. Aguardar confirmação on-chain (15-30s).

- [ ] Modal mostra "✓ Funded! Closing automatically" em até 30s pós-confirmação.
- [ ] Card volta para status `ok` (verde) no próximo refresh.

### T8.4 — Reset do threshold

1. Alerts modal → threshold de volta para `0.001 BNB` (default).
2. Salvar.

- [ ] Status volta a `ok` imediatamente.

### T8.5 — Export keystore

1. Card BNB → "Keystore" → aceitar aviso de segurança → step 2.
2. Inserir mnemonic do projeto (a frase mostrada no Step 4 do wizard original).
3. Senha forte (≥ 8 chars). Click "Download keystore".

- [ ] Browser baixa `gas-tank-56-0x54f55b4e74.json`.
- [ ] Validação local:
  ```bash
  node -e "const{Wallet}=require('ethers');const fs=require('fs');\
  Wallet.fromEncryptedJson(fs.readFileSync('gas-tank-56-0x54f55b4e74.json','utf8'),'<senha>')\
    .then(w => console.log('Address:', w.address))"
  ```
- [ ] Output: `Address: 0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1` (bate com `$GAS_TANK`).

---

## Fase 9 — Resiliência de webhooks (15 min)

### T9.1 — Endpoint que retorna 500

No `webhook.site`, configurar **Edit response** → status code `500`, salvar.

Trigger qualquer event (recriar um forwarder, ou fazer outro depósito pequeno).

- [ ] Webhook é tentado.
- [ ] Sistema faz retries automáticos com backoff (esperado: 3-5 tentativas).
- [ ] UI: Webhooks → click no webhook → tab "Deliveries" → entrada com `attempt_count > 1` e status `failed`.

### T9.2 — Manual retry

Reverter o `webhook.site` para status `200`. UI Webhooks → Deliveries → botão "Retry" na delivery falhada.

- [ ] Novo attempt agora retorna 200, status muda para `delivered`.

### T9.3 — Validar HMAC explicitamente

Pegar 1 payload do `webhook.site` (botão "View raw") + secret do webhook:

```bash
SECRET='<secret-do-webhook>'
BODY='<paste-do-raw-body>'
echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}'
```

- [ ] Output bate com o valor após `sha256=` no header `x-webhook-signature` recebido.

---

## Fase 10 — Notifications + Address Groups (10 min)

### T10.1 — Criar notification rule

1. Sidebar → **Notifications** → "+ New Rule".
2. Event: `deposit.detected`. Channel: webhook (mesmo `$WEBHOOK_URL`). Filter: amount > 0.001. Enabled: ✓.
3. Salvar.

- [ ] Rule criada e habilitada.

### T10.2 — Toggle a rule (testar fix do PATCH/PUT)

1. Toggle a rule para off via UI.

- [ ] Sem 404 silencioso (era o bug original).
- [ ] Estado persistente após refresh.

### T10.3 — Address Groups: criar + provisionar

1. Sidebar → **Address Groups** → "+ Create Group". Nome: `homolog-group-bsc`.
2. Após criação, click no grupo → "Provision Chain" → selecionar BSC.

- [ ] Provision endpoint retorna 200 (era 404 antes do fix).
- [ ] Em até 60s, addresses do grupo deployadas via factory aparecem.

---

## Fase 11 — Exports (5 min)

### T11.1 — Criar export de transações

1. Sidebar → **Exports** → "+ New Export".
2. Tipo: `transactions`. Chain: BSC. Período: últimos 7 dias.
3. Submit.

- [ ] API retorna `requestUid` e `status: queued`.
- [ ] Em ~10-30s, status muda para `completed` (refresh da página ou polling).

### T11.2 — Download

1. Click "Download" na linha do export.

- [ ] Arquivo `.csv` baixa.
- [ ] Abrir → tem headers + rows com depósitos/saques recentes (ao menos os feitos nas Fases 4-7).

---

## Critérios de aceite — promover para produção?

A homologação é **APROVADA** quando:

- [ ] **Fases 1-7** todas PASS (golden path: login → endereço → depósito → sweep → flush → withdrawal).
- [ ] **Fase 8** (Gas Tank) PASS — operações críticas dependem disso.
- [ ] **Fase 9.1 e 9.3** PASS — webhooks com retry + HMAC válida são contrato com integradores.
- [ ] **Fases 10-11** PASS (validação dos fixes pós-audit).

**Falhas aceitáveis (não bloqueiam):**
- Email channel em `gas_tank.low_balance` ainda é stub — webhook + banner cobrem.
- Histórico de gas pré-2026-05-06 vazio — banner UI explica.
- CORS no `auth/validate` (issue de infra, não impede uso).

---

## Quando algo der FAIL

Procedimento padrão:

1. **Capturar evidência** — screenshot, output de curl, logs.
2. **Logs do serviço relevante:**
   ```bash
   ssh green@vaulthub.live "cd /docker/CryptoVaultHub && docker compose logs --tail 100 <serviço>"
   ```
3. **Me chamar** (ou registrar issue) com: fase + teste, evidência, logs.

Serviços por sintoma:
| Sintoma | Serviço a olhar |
|---|---|
| Login falha / refresh quebra | `auth-service` |
| API endpoint retorna 5xx | `client-api` (proxy) + serviço downstream |
| Depósito não detectado | `chain-indexer-service` |
| Sweep/flush não roda | `cron-worker-service` |
| Webhook não chega | `notification-service` |
| Operação on-chain falha | `core-wallet-service` + verificar saldo gas tank |

---

## Comandos úteis durante a execução

```bash
# Login + cookie
curl -s -c $COOKIE -X POST $PORTAL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"wallet@grupogreen.org","password":"<senha>"}' > /dev/null

# Probe genérico
curl -s -b $COOKIE "$PORTAL/api/proxy/v1/<path>" | python3 -m json.tool

# Logs ao vivo
ssh green@vaulthub.live "cd /docker/CryptoVaultHub && docker compose logs -f --tail 30 <service>"

# Restart pontual
ssh green@vaulthub.live "cd /docker/CryptoVaultHub && docker compose restart <service>"

# Query DB
ssh green@vaulthub.live 'docker exec cryptovaulthub-mysql-1 mysql -uroot -p"bwQiwepxfvq83nfFLcZh8Wtj" -e "<sql>"'
```
