#!/usr/bin/env tsx
/**
 * CryptoVaultHub Homologation Runner
 *
 * Executa duas suítes de homologação em sequência:
 *   1. UI (Playwright) — cobre fluxo do painel do cliente via browser
 *   2. API (axios) — cobre fluxo end-to-end do integrador (gera endereço,
 *      detecta depósito, sweep, withdrawal)
 *
 * Apenas DUAS interações com o usuário acontecem na suíte de API:
 *   - Após gerar endereço de depósito: aguarda ENTER quando o usuário
 *     fizer o depósito de uma carteira externa.
 *   - Antes do withdrawal: pede o endereço EVM de destino.
 *
 * Uso:
 *   pnpm install
 *   pnpm install-browsers   # uma vez
 *   cp .env.example .env && vi .env
 *   pnpm homolog            # roda tudo
 *   pnpm ui-only            # só UI
 *   pnpm api-only           # só API (precisa CVH_API_KEY no .env)
 */

import { runUiSuite } from './suites/ui.js';
import { runApiSuite } from './suites/api.js';
import { reporter } from './lib/reporter.js';
import { loadConfig } from './lib/config.js';

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith('--suite='));
  const suite = onlyArg ? onlyArg.split('=')[1] : 'all';

  let config = loadConfig();

  reporter.banner('CryptoVaultHub Homologation — projeto BrPay');
  reporter.info(`Portal:  ${config.portalUrl}`);
  reporter.info(`API:     ${config.apiBaseUrl}`);
  reporter.info(`User:    ${config.email}`);
  reporter.info(`Project: ${config.projectName}`);
  reporter.info(`Chain:   ${config.chainId}`);

  // ── Phase A — UI ─────────────────────────────────────────────────
  if (suite === 'all' || suite === 'ui') {
    const uiResult = await runUiSuite(config);
    if (uiResult.apiKey && !config.apiKey) {
      config = { ...config, apiKey: uiResult.apiKey };
      reporter.info(`API key auto-gerada via UI: ${uiResult.apiKey.slice(0, 12)}…`);
    }
  }

  // ── Phase B — API ────────────────────────────────────────────────
  if (suite === 'all' || suite === 'api') {
    if (!config.apiKey) {
      reporter.warn('api', 'CVH_API_KEY não setada e UI não conseguiu gerar — pulando suíte de API');
    } else {
      await runApiSuite(config);
    }
  }

  reporter.summary();
  process.exit(reporter.hasFailures() ? 1 : 0);
}

main().catch((err) => {
  reporter.fatal(err);
  reporter.summary();
  process.exit(1);
});
