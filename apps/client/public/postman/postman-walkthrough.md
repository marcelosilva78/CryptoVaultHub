# CryptoVaultHub Client API — Roteiro de Integração

Sequência de chamadas validada end-to-end na homologação **2026-05-08** (13/13 PASS, BSC mainnet, projeto BrPay). Cada passo aqui é exatamente uma request que a suite de homologação faz, na ordem em que ela faz.

Companion artifact: `CryptoVaultHub.postman_collection.json` neste mesmo diretório — importe no Postman/Insomnia para rodar a sequência inteira pelo Runner.

---

## Pré-requisitos

| Variável | Valor padrão | Onde obter |
|---|---|---|
| `baseUrl` | `https://api.vaulthub.live/client/v1` | fixo (produção) |
| `apiKey` | `cvh_live_…` | Portal → Sidebar → API Keys |
| `chainId` | `56` (BSC) | escolha sua chain |
| `tokenSymbol` | `BNB` | depende da chain |
| `withdrawalTarget` | EVM address | endereço externo já whitelisted; se não for, o passo 9 cria |

A API key é **escopada por projeto**: o servidor resolve `projectId` automaticamente a partir do header `X-API-Key`, então você não precisa passar `projectId` no body em quase nenhuma chamada.

---

## 1. Resolve project (smoke test de auth)

**Por que:** confirma que a API key está válida, retorna o projeto que ela está escopando, e expõe o `custodyMode` (relevante para o fluxo de aprovação de saque).

```http
GET {{baseUrl}}/projects
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200, payload `{ success: true, projects: [{ id, name, slug, status, settings: { custodyMode } }] }`. Capture `projects[0].id` em `projectId`.

---

## 2. List wallets

**Por que:** confirma que o wizard de provisionamento já rodou e que existem `gas_tank` + `hot` wallets para a chain alvo. Sem isso, todos os passos seguintes falham.

```http
GET {{baseUrl}}/wallets
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200 com pelo menos duas wallets: uma `walletType: "gas_tank"` e uma `walletType: "hot"` para o `chainId` escolhido. Capture o endereço da gas_tank em `gasTankAddress` (você usará para auditoria, não para chamar a API).

---

## 3. Confirm gas tank status

**Por que:** o saque exige o gas tank operacional (mantém o platform-key EOA com saldo). Se está em estado degradado, **pare** — vá ao Portal e refunde a gas tank antes de continuar.

```http
GET {{baseUrl}}/gas-tanks/{{chainId}}
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200, `status: "ok"` (ou `warning`). Se vier `critical`, abort.

---

## 4. Register webhook (opcional mas recomendado)

**Por que:** a única forma confiável de saber o estado em tempo real de depósitos/saques sem polling agressivo. O webhook recebe payloads assinados HMAC-SHA256 com header `X-CVH-Signature`.

```http
POST {{baseUrl}}/webhooks
X-API-Key: {{apiKey}}
Content-Type: application/json

{
  "url": "https://seu.dominio.com/webhooks/cvh",
  "events": ["deposit.detected", "deposit.confirmed", "deposit.swept",
             "withdrawal.submitted", "withdrawal.confirmed", "withdrawal.failed"]
}
```

**Esperado:** HTTP 201, `{ success: true, id, secret }`. **Guarde o `secret`** — é o que você usa para verificar HMAC nos payloads recebidos. Capture `id` em `webhookId`.

---

## 5. Generate deposit address (forwarder)

**Por que:** cada cliente final do seu app deve ter seu próprio endereço de depósito (idempotente por `externalId`). O endereço é determinístico (CREATE2) — é seguro mostrar antes do contrato estar deployado on-chain (deploy lazy no primeiro depósito).

```http
POST {{baseUrl}}/wallets/{{chainId}}/deposit-address
X-API-Key: {{apiKey}}
Content-Type: application/json

{
  "externalId": "customer-12345",
  "label": "Pedido #12345"
}
```

**Esperado:** HTTP 201, `{ depositAddress: { address, externalId, label, salt, isDeployed: false } }`. Capture `depositAddress.address` em `depositAddress`.

**Idempotência:** chamar de novo com o mesmo `externalId` retorna o mesmo `address` (HTTP 200 ou 409 — o cliente trata ambos como "já existe").

---

## 6. (User action) Enviar fundos para `{{depositAddress}}`

Não é uma chamada de API. Sua aplicação mostra `{{depositAddress}}` ao usuário final. Ele envia (do app dele, exchange, etc.) para esse endereço na chain `{{chainId}}`.

A partir daqui, os passos 7–8 podem ser substituídos por **escutar webhooks** — esta lista é a versão polling para integração inicial / debugging.

---

## 7. Wait deposit.detected → confirmed → swept

**Por que:** o ciclo de vida do depósito é `pending → confirmed → swept`. O cliente espera (via webhook ou polling) até `swept` antes de creditar a conta interna do usuário final, porque só nesse momento os fundos estão na hot wallet (e podem ser usados para saques).

Polling:

```http
GET {{baseUrl}}/deposits?limit=20&page=1
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200, `{ deposits: [...] }`. Procure pelo elemento com `address == {{depositAddress}}`. Estados:
- `pending` — tx detectada, esperando confirmações
- `confirmed` — N confirmações atingidas (varia por chain — BSC = 12)
- `sweep_pending` — sweep tx broadcasted
- `swept` — sweep confirmado, fundos na hot wallet

A homologação observou o depósito ir direto a `swept` em < 60s (BSC + auto-flush via construtor do CvhForwarder).

---

## 8. Verify hot wallet has the funds

**Por que:** double-check de saldo antes de tentar saque. Saldo zero = sweep ainda não chegou (ou já foi gasto por outro saque).

```http
GET {{baseUrl}}/wallets/{{chainId}}/balances
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200, `{ balances: [{ symbol, balance, balanceFormatted }] }`. Confirme que `BNB` (ou seu token) tem saldo ≥ ao próximo saque.

---

## 9. Add withdrawal target to whitelist

**Por que:** segurança. Só endereços whitelisted podem receber saques. Cada novo endereço entra com 24h de cooldown — durante esse período rejeita o saque com 422.

```http
POST {{baseUrl}}/addresses
X-API-Key: {{apiKey}}
Content-Type: application/json

{
  "address": "{{withdrawalTarget}}",
  "chainId": {{chainId}},
  "label": "Carteira do cliente Marcelo",
  "notes": "Onboarded em 2026-05-08"
}
```

**Esperado:** HTTP 201, `{ address: { id, status: "cooldown", cooldownExpiresAt } }`. Trate HTTP 409 ("already exists") como sucesso — significa que já está cadastrado.

---

## 10. Create withdrawal

**Por que:** o saque do hot wallet para o destino. Em modo full-custody, ele entra como `pending_approval` e aguarda você chamar o approve (passo 11). Em cosign-mode, espera o cliente assinar.

```http
POST {{baseUrl}}/withdrawals
X-API-Key: {{apiKey}}
Content-Type: application/json

{
  "chainId": {{chainId}},
  "tokenSymbol": "{{tokenSymbol}}",
  "toAddress": "{{withdrawalTarget}}",
  "amount": "0.001",
  "memo": "Saque pedido #12345",
  "idempotencyKey": "wd-pedido-12345-attempt-1"
}
```

**Esperado:** HTTP 201, `{ withdrawal: { id, status: "pending_approval", … } }`. Capture `withdrawal.id` em `withdrawalId`.

**Notas:**
- `idempotencyKey` é fortemente recomendado. Mesmo key + body = mesma withdrawal retornada (HTTP 200, `isIdempotent: true`).
- `tokenSymbol` deve estar em `GET /tokens?chainId={{chainId}}`.
- `toAddress` deve estar com `status: "active"` no whitelist (ou seja, fora do cooldown). Se estiver em cooldown → HTTP 422.
- Se `project_chains.deploy_status != "ready"` → HTTP 422 (defesa em profundidade).

---

## 11. Self-approve (full-custody only)

**Por que:** em modo full-custody a API key já representa autoridade total do cliente sobre os fundos, então a aprovação separada é redundante. Esta chamada existe pra manter o fluxo `pending_approval → approved` explícito (auditoria) sem exigir um passo manual no Portal.

```http
POST {{baseUrl}}/withdrawals/{{withdrawalId}}/approve
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 201, `{ withdrawal: { status: "approved" } }`. O cron worker pega no próximo tick (≤ 30s) e broadcasta.

---

## 12. Wait withdrawal.broadcast → confirmed

**Por que:** mesmo padrão do depósito. Use webhook em produção; polling pra debug.

```http
GET {{baseUrl}}/withdrawals/{{withdrawalId}}
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200, `{ withdrawal: { status, txHash, … } }`. Estados:
- `pending_approval` — aguardando approve
- `approved` — fila do worker
- `broadcasting` — tx submetida (txHash já preenchido)
- `confirmed` — confirmada on-chain (terminal sucesso)
- `failed` — revert (terminal falha — checar `failure_reason`)
- `rejected` — rejeitada por compliance (terminal falha)

Na homologação 2026-05-08, broadcast em ~15s + confirm em ~18s = 33s end-to-end.

---

## 13. Cleanup webhook (opcional, em testes)

```http
DELETE {{baseUrl}}/webhooks/{{webhookId}}
X-API-Key: {{apiKey}}
```

**Esperado:** HTTP 200/204.

---

## Resumo do fluxo de produção

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FLUXO BÁSICO DE INTEGRAÇÃO                        │
└────────────────────────────────────────────────────────────────────────┘

  ① Cadastrar webhook      ──► POST /webhooks
                                  ↓ guardar `secret` para HMAC

  ② Para cada cliente:     ──► POST /wallets/:chainId/deposit-address
                                  com `externalId` único do cliente
                                  ↓ retorna address determinístico

  ③ Mostrar address ao usuário; ele envia fundos

  ④ Receber webhooks:
       • deposit.detected   → tx vista
       • deposit.confirmed  → N confirmações
       • deposit.swept      → fundos na hot wallet  ← creditar conta interna

  ⑤ Quando o cliente pedir saque:
       • POST /addresses           (uma vez por destino)  ← 24h cooldown
       • POST /withdrawals         com idempotencyKey
       • POST /withdrawals/:id/approve   (full-custody)
       • Receber webhook withdrawal.confirmed  ← marcar saque concluído
```

---

## Erros comuns

| HTTP | Causa | Como evitar |
|---|---|---|
| 401 | API key inválida ou faltando | header `X-API-Key` |
| 403 | API key não tem o scope necessário | `read` para GETs, `write` para POSTs/DELETEs |
| 422 `address still in cooldown` | Endereço whitelist < 24h | esperar ou whitelistar antes |
| 422 `project deployment not ready` | `project_chains.deploy_status != "ready"` | rodar o wizard no Portal |
| 422 `Token symbol 'X' not found on chain` | `tokenSymbol` errado/desconhecido | `GET /tokens?chainId=...` |
| 409 `idempotency key already used` | Mesma idempotencyKey, body diferente | reuse a mesma key apenas para retries idênticos |
| 502 `Bad Gateway` | Kong reciclou worker — transitório | retry em 1-2s |

---

## Webhook payload (referência)

Todos os webhooks têm o mesmo envelope:

```json
{
  "id": "evt_01HX…",
  "event": "deposit.swept",
  "timestamp": "2026-05-08T04:58:55.000Z",
  "data": {
    "depositId": "1",
    "chainId": 56,
    "amount": "0.005",
    "tokenSymbol": "BNB",
    "address": "0xF834…",
    "txHash": "0x…",
    "sweepTxHash": "0x…",
    "blockNumber": "97027070"
  }
}
```

**Verificação de assinatura (Node.js):**

```javascript
const crypto = require('crypto');
function verifyWebhook(rawBody, signatureHeader, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```
