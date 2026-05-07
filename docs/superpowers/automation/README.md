# CryptoVaultHub — Suíte Automatizada de Homologação

Executa **duas suítes** de homologação em sequência, com **apenas duas interações** do usuário:

1. **UI Suite (Playwright)** — fluxo do painel do cliente (`portal.vaulthub.live`)
2. **API Suite (axios)** — fluxo end-to-end do integrador (gera endereço → detecta depósito → sweep → withdrawal)

As duas interações estão na suíte API:
- Após gerar endereço de depósito: aguarda você confirmar com `ENTER` que enviou BNB
- Antes do withdrawal: pede o endereço EVM de destino

Tudo o mais é automático: detecção via API, polling, webhooks, sweep, withdrawal.

## Pré-requisitos

- Node.js 20+ e pnpm (ou npm)
- Conta `wallet@grupogreen.org` com projeto **BrPay** já provisionado em BSC mainnet
- Carteira externa com ~0.05 BNB para os depósitos de teste
- Acesso à internet (BSC mainnet)

## Instalação (uma vez)

```bash
cd docs/superpowers/automation
pnpm install
pnpm install-browsers      # baixa Chromium (~150 MB)
cp .env.example .env
```

Edite o `.env`:

```env
CVH_EMAIL=wallet@grupogreen.org
CVH_PASSWORD=<sua-senha>

# Opcional — se preencher, pula a etapa de criar API key via UI
CVH_API_KEY=

# Opcional — se preencher, usa essa URL pra webhook receiver. Senão a suíte
# cria uma URL nova em webhook.site automaticamente.
CVH_WEBHOOK_URL=

# Default: BSC mainnet
CVH_CHAIN_ID=56

# UI: false abre browser visível, true headless
CVH_HEADLESS=false
CVH_SLOWMO_MS=0
```

## Executando

```bash
# Roda as duas suítes na sequência
pnpm homolog

# Apenas UI
pnpm ui-only

# Apenas API (precisa CVH_API_KEY no .env)
pnpm api-only
```

## Fluxo de execução

```
┌──────────────────────────────────────────────────────────────────┐
│ Phase A — UI Suite (Playwright)                                  │
│   • Login                                                         │
│   • Verifica dashboard, dropdown de projeto, gas tank widget     │
│   • Navega por todos os itens da sidebar (Wallets, Transactions, │
│     Deposits, Withdrawals, Flush, Gas Tanks, Address Groups,     │
│     Webhooks, API Keys, Notifications, Security, Knowledge Base) │
│   • Abre modais (gas tank history, alert config)                  │
│   • Tenta gerar uma API key se CVH_API_KEY estiver vazia         │
│   • Captura screenshots em evidence/                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase B — API Suite (axios + 2 prompts)                           │
│   • Resolve projeto BrPay via GET /projects                       │
│   • Lista wallets + valida gas tank status                        │
│   • Cria webhook receiver (se CVH_WEBHOOK_URL vazio, cria em     │
│     webhook.site automaticamente) + envia test ping               │
│   • Gera endereço de depósito (POST /deposit-addresses)           │
│                                                                    │
│   ─── INTERAÇÃO 1 ────────────────────────────────────────        │
│   Mostra o endereço, pede ENTER após você enviar 0.005 BNB.      │
│   ───────────────────────────────────────────────────              │
│                                                                    │
│   • Aguarda deposit.detected (polling até 5min)                  │
│   • Aguarda deposit.confirmed (polling até 3min)                  │
│   • Aguarda sweep automático (até 3.5min) ou trigger flush manual│
│   • Verifica saldo do hot wallet                                  │
│   • Confirma history de gas tank populado                         │
│                                                                    │
│   ─── INTERAÇÃO 2 ────────────────────────────────────────        │
│   Pede endereço EVM de destino para o saque.                      │
│   ───────────────────────────────────────────────────              │
│                                                                    │
│   • Adiciona endereço ao whitelist (Address Book)                 │
│   • Cria withdrawal de 0.003 BNB                                  │
│   • Aguarda withdrawal.broadcast (até 5min)                       │
│   • Aguarda withdrawal.confirmed (até 5min)                       │
│   • Cleanup: remove webhook de teste                              │
└──────────────────────────────────────────────────────────────────┘
```

## Saída

Cada execução cria uma pasta em `evidence/<timestamp>/` com:

- `report.md` — relatório PASS/FAIL por fase + tempo de cada step
- `ui-01-dashboard.png`, `ui-02-gas-tank-history.png` — screenshots
- (em caso de falha) screenshots adicionais para debug

Exemplo de output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CryptoVaultHub Homologation — projeto BrPay
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▌ A — UI Suite (Playwright)
   ▸ UI login ... PASS (2843ms)
   ▸ Dashboard renders with widgets ... PASS (1247ms)
   ▸ Project selector shows "BrPay" ... PASS (3122ms)
   ...

▌ B — API Integration Suite (e2e)
   ▸ Resolve project "BrPay" ... PASS (218ms)
     ➤ projectId: 6998
   ▸ Generate deposit address (forwarder) ... PASS (487ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENDEREÇO DE DEPÓSITO GERADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Chain:    56 (BSC)
  Address:  0xfa7b8c9d…
  Sugestão: envie 0.005 BNB pra esse endereço
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pressione ENTER para continuar...
```

## Códigos de saída

- `0` — todos os steps PASS (homologação aprovada)
- `1` — algum step FAIL (verificar `report.md` na pasta de evidence)

## Customização

### Mudar o projeto/conta de teste

Edite o `.env`:
```env
CVH_EMAIL=outro@cliente.com
CVH_PROJECT_NAME=OutroProjeto
```

### Mudar de chain

```env
CVH_CHAIN_ID=137  # Polygon, por exemplo
```

(Lembre que o projeto precisa ter contratos deployados nessa chain.)

### Headless / debug visual

```env
CVH_HEADLESS=true     # roda sem janela
CVH_SLOWMO_MS=500     # 500ms entre cada ação Playwright (pra ver acontecendo)
```

### Aumentar timeouts

Se sua chain for lenta ou indexer atrasado:
```env
CVH_DEPOSIT_TIMEOUT_SEC=600    # 10 min
CVH_SWEEP_TIMEOUT_SEC=900      # 15 min
CVH_WITHDRAWAL_TIMEOUT_SEC=600
```

## Troubleshooting

### "Missing required env var: CVH_PASSWORD"
Você não preencheu o `.env`. Veja `.env.example`.

### "Project 'BrPay' not found"
A API key/conta não tem acesso ao projeto. Confirme login no portal.

### "Gas tank critical"
O gas tank ficou sem BNB. Top up via portal antes de rodar.

### "deposit.detected timed out"
O depósito não foi detectado em 5 min. Cheque:
- A tx confirmou no BSCscan?
- O endereço que você usou foi exatamente o exibido?
- `docker compose logs --tail 50 chain-indexer-service` no servidor

### "Could not capture generated API key from UI"
A UI mudou e o seletor não casa. Solução: gerar a key manualmente no portal e colar no `.env`:
```env
CVH_API_KEY=cvh_live_abc123...
```

### Playwright errors em CI
Use modo headless: `CVH_HEADLESS=true`.

## Estrutura

```
automation/
├── homolog.ts              # entry point
├── package.json
├── tsconfig.json
├── .env.example
├── README.md (este arquivo)
├── lib/
│   ├── config.ts           # carrega .env
│   ├── reporter.ts         # PASS/FAIL + saída colorida + report.md
│   ├── prompts.ts          # readline (as 2 interações)
│   └── api-client.ts       # axios wrapper + polling helper
├── suites/
│   ├── ui.ts               # Playwright (Phase A)
│   └── api.ts              # axios e2e (Phase B)
└── evidence/               # gerado em runtime, gitignored
    └── <timestamp>/
        ├── report.md
        └── *.png
```
