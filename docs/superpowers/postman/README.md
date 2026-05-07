# Postman Collection — CryptoVaultHub Client API

Coleção pronta pra importar no Postman, cobrindo todos os endpoints do dia-a-dia de um cliente operando sobre a infra do CryptoVaultHub.

## Arquivos

- `cvh-client-api.postman_collection.json` — a coleção (todas as 14 pastas)
- `cvh-production.postman_environment.json` — environment template com variáveis vazias

## Como importar

1. Abrir Postman → **Import**
2. Arrastar (ou selecionar) os 2 arquivos JSON acima
3. No canto superior direito, ativar o environment `CryptoVaultHub Production`

## Configuração inicial

### 1. Gerar uma API Key

Antes de qualquer request, você precisa de uma API Key. Pelo portal:

1. Logar em `https://portal.vaulthub.live`
2. Sidebar → **API Keys** → **Create new**
3. Nome: `homologacao-postman`
4. Scopes: marcar `read` e `write`
5. **Copiar a key uma vez** (não é exibida novamente)

### 2. Preencher o environment

No Postman, abrir o environment e preencher:

| Variável | Valor |
|---|---|
| `apiKey` | a key copiada no passo 1 |
| `baseUrl` | `https://api.vaulthub.live/client/v1` (já preenchido) |
| `chainId` | `56` (BSC) — ou outra chain disponível |
| `webhookUrl` | URL do `webhook.site` (gerada em <https://webhook.site>) |
| `withdrawalTarget` | endereço externo pra receber saques de teste (sua carteira) |

As outras variáveis (`projectId`, `depositAddress`, `webhookId`, etc.) são preenchidas **automaticamente** pelos scripts pós-request.

## Sequência de homologação recomendada

Execute as pastas nesta ordem na primeira passada:

| Pasta | Conteúdo | Pré-requisito |
|---|---|---|
| **00 Sanity** | Verificar API key + listar chains | apiKey preenchida |
| **01 Projects** | Listar projetos + traces de deploy | — |
| **02 Wallets** | Listar wallets + balances | — |
| **03 Deposit Addresses** | Gerar 3 forwarders | — |
| **10 Webhooks** | Registrar webhook receiver + test ping | webhookUrl preenchida |
| *(off-band)* | **Mandar 0.005 BNB pra cada forwarder via carteira externa** | — |
| **04 Deposits** | Listar depósitos detectados | aguardar 60-90s pós-tx |
| **09 Gas Tanks** | Verificar histórico de sweep, alert config | aguardar 5min do cron |
| **05 Withdrawals** | Adicionar whitelist + criar withdrawal | passos 7 → 5 |
| **07 Address Book** | Whitelist do destino | — |
| **06 Flush** | Sweep manual de todos forwarders | — |
| **08 Address Groups** | Criar grupo + provisionar | — |
| **11 Notification Rules** | CRUD de filtros de eventos | — |
| **13 Exports** | Reconciliação contábil | — |
| **14 Security** | Settings read-only | — |
| **12 Co-Sign** | Pular se modo `full_custody` | só pra co-sign |

## Endpoints mais usados no dia-a-dia (pós-homologação)

Em produção real, estes são os "quentes":

1. **`POST /deposit-addresses`** — gera novo endereço por cliente final (uma vez por nova relação comercial / fatura)
2. **Webhooks** — você recebe eventos `deposit.detected` automaticamente; **NÃO precisa polar**
3. **`GET /deposits?status=confirmed&fromDate=...`** — reconciliação periódica caso webhook falhe
4. **`POST /withdrawals`** — cada saque requisitado pelo seu sistema
5. **`GET /withdrawals/:id`** — polling de status (ou usar webhook `withdrawal.confirmed`)
6. **`GET /gas-tanks`** — monitoramento — alertar antes de ficar low

## Verificação de assinatura HMAC dos webhooks

Quando seu endpoint receber um webhook, valide o header `x-webhook-signature`:

```javascript
const crypto = require('crypto');
const expected = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');
const received = req.headers['x-webhook-signature'];
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  return res.status(401).end();
}
```

O `WEBHOOK_SECRET` é mostrado **uma única vez** no momento da criação do webhook (Postman → 10 Webhooks → Create webhook → checar `console.log` do test script).

## Status codes esperados

| Status | Significado |
|---|---|
| 200/201 | Sucesso |
| 400 | Body inválido |
| 401 | API key ausente ou inválida |
| 403 | API key sem scope necessário (ex: `write` em endpoint que requer admin) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: address já no whitelist) |
| 422 | Validação semântica falhou (ex: amount > saldo) |
| 429 | Rate limit excedido — header `Retry-After` indica quando |
| 500 | Erro do servidor — retry com backoff |

## Rate limits

Por padrão (Standard tier):
- **Global:** 60 req/seg
- **Endpoint-específico** (sliding window 1 min):
  - `POST /withdrawals`: 5/min
  - `POST /deposit-addresses`: 30/min
  - `POST /webhooks`: 10/min

Headers de resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

## Observações sobre custódia

A coleção assume **full_custody mode** (BrPay). Em **co_sign mode**, withdrawals criadas via `POST /withdrawals` ficam em status `pending_cosign` e exigem que o cliente assine off-chain e submeta via `POST /co-sign/:id/sign` (pasta 12).

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Todas requests retornam 401 | apiKey inválida ou expirada | Gerar nova key no portal |
| `POST /addresses` retorna 403 | 2FA habilitado no usuário | Adicionar `X-2FA-Code: 123456` (TOTP) no header |
| `GET /deposits` vazio mesmo após mandar BNB | Indexer atrasado ou tx não confirmou | Esperar 90s; checar tx no BSCscan |
| Webhook não chega | URL inválida / endpoint retorna 5xx | Ver `Webhooks → Deliveries` pra ver attempts |
| `429 Too Many Requests` | Rate limit | Esperar `Retry-After` segundos |

## Suporte

Issues / dúvidas: anotar:
- request ID (header `x-trace-id` ou `traceparent` na resposta)
- timestamp UTC
- endpoint + body enviado
- response completa
