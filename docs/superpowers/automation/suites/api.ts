import { CvhApiClient } from '../lib/api-client.js';
import { Config } from '../lib/config.js';
import { reporter } from '../lib/reporter.js';
import { pressEnter, askText, isEvmAddress } from '../lib/prompts.js';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

const STATE_FILE = path.join(process.cwd(), 'evidence', 'state.json');

interface SuiteState {
  depositAddress?: string;
  webhookId?: string;
  webhookUrl?: string;
}

function loadState(): SuiteState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveState(s: SuiteState) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

interface Project { id: string; name: string; slug: string; status: string; isDefault?: boolean; }
interface Wallet { id: number | string; chainId: number; address: string; walletType: string; }
interface DepositAddress { id?: string | number; address: string; chainId: number; label?: string; status?: string; }
interface Deposit {
  id?: string | number; address: string; amount?: string; tokenSymbol?: string;
  txHash?: string; status: string; chainId?: number;
}
interface Withdrawal {
  withdrawalId?: string; id?: string | number; status: string; toAddress: string;
  amount?: string; txHash?: string;
}
interface Webhook { id: string | number; url: string; events: string[]; secret?: string; }
interface GasTank {
  chainId: number; address: string; balanceWei: string; status: 'ok' | 'low' | 'critical'; nativeSymbol: string;
}

export async function runApiSuite(config: Config) {
  reporter.phase('B — API Integration Suite (e2e)');

  if (!config.apiKey) {
    throw new Error('No API key available. Provide CVH_API_KEY via .env or run UI suite first to auto-generate.');
  }

  // Phase control: pre = stop after generating deposit address; post = resume from existing state
  const phaseLimit = process.env.CVH_PHASE_LIMIT;       // "address" → exit after generate
  const phaseResume = process.env.CVH_PHASE_RESUME;     // "true" → reuse depositAddress from state.json

  const state: SuiteState = phaseResume === 'true' ? loadState() : {};
  if (phaseResume === 'true') {
    reporter.info(`Resumindo de state anterior — depositAddress=${state.depositAddress ?? '<n/a>'} webhookId=${state.webhookId ?? '<n/a>'}`);
  }

  const api = new CvhApiClient(config.apiBaseUrl, config.apiKey);

  // ─── B.1 Sanity ────────────────────────────────────────────────────
  const project = await reporter.step(`Resolve project "${config.projectName}"`, async () => {
    const r = await api.get<{ projects: Project[] }>('/projects');
    const proj = r.projects.find((p) => p.name === config.projectName);
    if (!proj) throw new Error(`Project "${config.projectName}" not found among ${r.projects.length} projects`);
    reporter.highlight('projectId', proj.id);
    return proj;
  });
  if (!project) throw new Error('aborted: project not resolved');

  await reporter.step('List wallets (gas_tank + hot)', async () => {
    const r = await api.get<{ wallets: Wallet[] }>('/wallets');
    const gt = r.wallets.find((w) => w.walletType === 'gas_tank' && w.chainId === config.chainId);
    if (!gt) throw new Error(`No gas_tank wallet for chain ${config.chainId}`);
    reporter.highlight('gasTank', gt.address);
  });

  await reporter.step('Confirm gas tank status = ok', async () => {
    const r = await api.get<{ gasTanks: GasTank[] }>('/gas-tanks');
    const tank = r.gasTanks.find((t) => t.chainId === config.chainId);
    if (!tank) throw new Error(`No gas tank entry for chain ${config.chainId}`);
    if (tank.status === 'critical') throw new Error(`Gas tank critical (balance=${tank.balanceWei}). Top up before testing.`);
    if (tank.status === 'low') reporter.warn('gas-tank', `Status low — may run out during tests`);
    reporter.highlight('balanceWei', tank.balanceWei);
  });

  // ─── B.2 Webhook receiver ──────────────────────────────────────────
  let webhook: Webhook | undefined;
  let webhookSecret: string | undefined;

  if (phaseResume === 'true' && state.webhookUrl) {
    config.webhookUrl = state.webhookUrl;
    webhook = { id: state.webhookId!, url: state.webhookUrl, events: [] };
    reporter.info(`Reutilizando webhook ${state.webhookId} → ${state.webhookUrl}`);
  } else {
    if (!config.webhookUrl) {
      reporter.warn('webhook', 'CVH_WEBHOOK_URL not set — generating disposable receiver via webhook.site');
      config.webhookUrl = await generateWebhookSiteUrl();
      reporter.highlight('webhookUrl', config.webhookUrl);
    }

    webhook = await reporter.step('Register webhook receiver', async () => {
      const r = await api.post<{ success?: boolean; webhook?: Webhook & { secret?: string }; id?: string | number; secret?: string; events?: string[] }>('/webhooks', {
        url: config.webhookUrl,
        events: [
          'deposit.detected', 'deposit.confirmed', 'deposit.swept',
          'forwarder.deployed',
          'gas_tank.low_balance',
          'withdrawal.submitted', 'withdrawal.confirmed', 'withdrawal.failed',
        ],
      });
      api.noteLastRequest('Eventos válidos: deposit.detected, deposit.confirmed, deposit.swept, forwarder.deployed, gas_tank.low_balance, withdrawal.submitted, withdrawal.confirmed, withdrawal.failed. Endpoint NÃO aceita campo `description`. Resposta vem como { success, webhook: { id, url, events, secret } }. O `secret` aparece UMA ÚNICA VEZ — guardar para validar HMAC nos eventos recebidos.');
      // Normalize: response can be either flat or { webhook: {...} }
      const wh = (r.webhook ?? r) as Webhook & { secret?: string };
      webhookSecret = wh.secret;
      if (webhookSecret) reporter.highlight('webhook secret', webhookSecret.slice(0, 12) + '…');
      return wh;
    });

    await reporter.step('Send webhook test ping', async () => {
      if (!webhook) throw new Error('webhook not created');
      try {
        await api.post(`/webhooks/${webhook.id}/test`);
      } catch (e: any) {
        // Test-ping endpoint may not be implemented yet in notification-service.
        // Treat 404 as warn (skip), not fail — não é bloqueante.
        if (e?.response?.status === 404) {
          api.noteLastRequest('TODO: implementar POST /webhooks/:id/test em notification-service. Atualmente retorna 404 — eventos reais (deposit.detected etc.) ainda funcionam.');
          reporter.warn('webhook-test', 'POST /webhooks/:id/test ainda não implementado downstream — pulando');
          return;
        }
        throw e;
      }
    }, { skipOnFail: true });
    state.webhookId = String(webhook!.id);
    state.webhookUrl = config.webhookUrl;
  }

  // ─── B.3 Generate deposit address (INTERACTION 1) ──────────────────
  let depositAddress: string | undefined;
  if (phaseResume === 'true' && state.depositAddress) {
    depositAddress = state.depositAddress;
    reporter.info(`Reutilizando depositAddress do state: ${depositAddress}`);
  } else {
    depositAddress = await reporter.step('Generate deposit address (forwarder)', async () => {
      const r = await api.post<DepositAddress | { depositAddress?: DepositAddress; address?: string; data?: any }>(
        `/wallets/${config.chainId}/deposit-address`,
        {
          externalId: `homolog-${Date.now()}`,
          label: 'Homologation test address',
        },
      );
      api.noteLastRequest('Endpoint correto é POST /wallets/:chainId/deposit-address (NÃO /deposit-addresses). Body OBRIGA `externalId` (string única, sua chave de idempotência — ex: customerId, invoiceId). `label` é opcional. O endereço retornado é determinístico (CREATE2); o contrato forwarder é deployado on-the-fly na primeira tx de entrada.');
      const addr = (r as any).address
        ?? (r as any).depositAddress?.address
        ?? (r as any).data?.address;
      if (!addr) throw new Error('Generated payload missing address: ' + JSON.stringify(r).slice(0, 200));
      return addr as string;
    });
    if (!depositAddress) throw new Error('aborted: address not generated');
    state.depositAddress = depositAddress;
  }
  saveState(state);

  // Phase limit: stop here if user wants to do the deposit out-of-band
  if (phaseLimit === 'address') {
    console.log('\n' + chalk.bold.green('━'.repeat(80)));
    console.log(chalk.bold.green('  PHASE-LIMIT=address — Aguardando depósito off-band'));
    console.log(chalk.bold.green('━'.repeat(80)));
    console.log(chalk.bold.white('  Chain:    ') + chalk.cyan(`${config.chainId} (BSC)`));
    console.log(chalk.bold.white('  Address:  ') + chalk.cyan.bold(depositAddress));
    console.log(chalk.bold.white('  State:    ') + chalk.dim(STATE_FILE));
    console.log('');
    console.log(chalk.bold.white('  Próxima etapa após o depósito:'));
    console.log(chalk.cyan('    CVH_PHASE_RESUME=true CVH_AUTO_CONTINUE=true CVH_PROMPT_ANSWER=<seu-endereco-saque> npm run api-only'));
    console.log(chalk.bold.green('━'.repeat(80)));
    return;
  }

  // === USER INTERACTION 1 ===
  console.log('\n');
  console.log(chalk.bold.green('━'.repeat(80)));
  console.log(chalk.bold.green('  ENDEREÇO DE DEPÓSITO GERADO'));
  console.log(chalk.bold.green('━'.repeat(80)));
  console.log(chalk.bold.white('  Chain:    ') + chalk.cyan(`${config.chainId} (BSC)`));
  console.log(chalk.bold.white('  Address:  ') + chalk.cyan.bold(depositAddress));
  console.log(chalk.bold.white('  Sugestão: ') + chalk.dim('envie 0.005 BNB pra esse endereço'));
  console.log(chalk.bold.green('━'.repeat(80)));
  await pressEnter(
    `Envie ~0.005 BNB de uma carteira externa (Trust Wallet/Metamask)\n` +
    `para o endereço acima na BSC mainnet.\n\n` +
    `Quando o envio estiver feito (tx broadcasted), pressione ENTER\n` +
    `para a suíte continuar com a detecção e o sweep.`,
  );
  // === END INTERACTION 1 ===

  // ─── B.4 Wait for deposit detection ────────────────────────────────
  const detectedDeposit = await reporter.step(
    `Aguardar deposit.detected (timeout ${config.depositTimeoutMs / 1000}s)`,
    async () => {
      return await api.pollUntil<Deposit>(
        async () => {
          const r = await api.get<{ deposits: Deposit[] }>(
            '/deposits',
            { limit: 20, page: 1 },
          );
          return r.deposits.find(
            (d) => d.address.toLowerCase() === depositAddress.toLowerCase(),
          ) ?? null;
        },
        { timeoutMs: config.depositTimeoutMs, intervalMs: 8_000, label: 'deposit.detected' },
      );
    },
  );
  if (detectedDeposit) {
    reporter.highlight('deposit txHash', detectedDeposit.txHash ?? 'n/a');
    reporter.highlight('deposit amount', detectedDeposit.amount ?? 'n/a');
    reporter.highlight('deposit status', detectedDeposit.status);
  }

  // ─── B.5 Wait for deposit.confirmed ────────────────────────────────
  // Accept any post-pending status as "confirmed" — swept/sweep_pending imply confirmed already happened.
  const POST_PENDING = new Set(['confirmed', 'sweep_pending', 'swept']);
  await reporter.step('Aguardar deposit.confirmed (até 3 min)', async () => {
    if (!detectedDeposit) throw new Error('no deposit to wait on');
    if (POST_PENDING.has(detectedDeposit.status)) return;
    return await api.pollUntil(
      async () => {
        const r = await api.get<{ deposits: Deposit[] }>(
          '/deposits',
          { limit: 20, page: 1 },
        );
        const d = r.deposits.find((x) => x.txHash === detectedDeposit.txHash);
        return d && POST_PENDING.has(d.status) ? d : null;
      },
      { timeoutMs: 180_000, intervalMs: 6_000, label: 'deposit.confirmed' },
    );
  });

  // ─── B.6 Wait for sweep automatic OR trigger flush ─────────────────
  // Strategy: wait up to sweepTimeoutMs/2 for the cron to sweep.
  // If still not swept, trigger a manual flush.

  const swept = await reporter.step(
    `Aguardar sweep automático (até ${config.sweepTimeoutMs / 2000}s)`,
    async () => {
      try {
        return await api.pollUntil(
          async () => {
            const r = await api.get<{ deposits: Deposit[] }>(
              '/deposits',
              { limit: 20, page: 1 },
            );
            const d = r.deposits.find((x) => x.txHash === detectedDeposit?.txHash);
            return d?.status === 'swept' ? d : null;
          },
          { timeoutMs: config.sweepTimeoutMs / 2, intervalMs: 12_000, label: 'sweep' },
        );
      } catch (e) {
        return null;
      }
    },
    { skipOnFail: true },
  );

  if (!swept) {
    await reporter.step('Trigger manual flush (sweep automático demorou)', async () => {
      await api.post('/flush', {
        chainId: config.chainId,
        addressIds: [],
      });
    });

    await reporter.step(`Aguardar flush.completed (até ${config.sweepTimeoutMs / 2000}s)`, async () => {
      return await api.pollUntil(
        async () => {
          const r = await api.get<{ deposits: Deposit[] }>(
            '/deposits',
            { limit: 20, page: 1 },
          );
          const d = r.deposits.find((x) => x.txHash === detectedDeposit?.txHash);
          return d?.status === 'swept' ? d : null;
        },
        { timeoutMs: config.sweepTimeoutMs / 2, intervalMs: 8_000, label: 'flush.completed' },
      );
    });
  }

  // ─── B.7 Verify hot wallet has the funds ───────────────────────────
  await reporter.step('Hot wallet deve ter saldo > 0', async () => {
    const r = await api.get<{ balances: { balance?: string; balanceFormatted?: string }[] }>(
      `/wallets/${config.chainId}/balances`,
    );
    if (!r.balances || r.balances.length === 0) {
      reporter.warn('balances', 'API retornou lista vazia — pode ser indexer atrasado; saldo on-chain está OK se o sweep deu sucesso');
      return;
    }
    const native = r.balances[0];
    reporter.highlight('hot wallet balance', native.balanceFormatted ?? native.balance ?? 'n/a');
  });

  // ─── B.8 Gas tank history populated ─────────────────────────────────
  await reporter.step('Gas tank history populado pós-sweep', async () => {
    const r = await api.get<{ rows: any[]; total: number }>(
      `/gas-tanks/${config.chainId}/history`,
      { limit: 10, offset: 0 },
    );
    if (r.total === 0) reporter.warn('gas-tank-history', 'history vazia — pode ser que o reconciler ainda não registrou');
    else reporter.highlight('history rows', String(r.total));
  });

  // Phase limit: stop here if user wants to ask the withdrawal target out-of-band
  if (phaseLimit === 'before-withdrawal') {
    console.log('\n' + chalk.bold.green('━'.repeat(80)));
    console.log(chalk.bold.green('  PHASE-LIMIT=before-withdrawal — Pronto para Interação 2'));
    console.log(chalk.bold.green('━'.repeat(80)));
    console.log(chalk.bold.white('  Próxima etapa: peça ao usuário o endereço de saque.'));
    console.log(chalk.cyan('    CVH_PHASE_RESUME=true CVH_AUTO_CONTINUE=true CVH_PROMPT_ANSWER=<endereço-saque> npm run api-only'));
    console.log(chalk.bold.green('━'.repeat(80)));
    return;
  }

  // ─── B.9 Withdrawal (INTERACTION 2) ────────────────────────────────
  // === USER INTERACTION 2 ===
  const withdrawalTarget = await askText(
    `Forneça um endereço EVM para receber o saque de teste (BSC mainnet).\n` +
    `Recomendo a sua própria carteira externa (a que enviou o depósito).\n\n` +
    `Formato: 0x seguido de 40 hex chars.`,
    isEvmAddress,
  );
  reporter.highlight('withdrawal target', withdrawalTarget);
  // === END INTERACTION 2 ===

  await reporter.step('Adicionar withdrawal target ao whitelist', async () => {
    try {
      await api.post('/addresses', {
        address: withdrawalTarget,
        chainId: config.chainId,
        label: `homolog-target-${Date.now()}`,
        notes: 'Auto-added by homologation suite',
      });
    } catch (e: any) {
      const status = e?.response?.status;
      // 409 = already whitelisted; treat as success
      if (status === 409) {
        api.noteLastRequest('Server returned 409 Conflict — address já no whitelist; treat as success.');
        return;
      }
      if (status === 403) {
        api.noteLastRequest('Server returned 403 — exige header X-2FA-Code (TOTP) quando 2FA está ativo. Adicionar `-H "X-2FA-Code: <6-digit-code>"` no curl.');
      }
      throw e;
    }
  });

  const withdrawalAmount = '0.003';
  const withdrawalId = await reporter.step('Criar withdrawal de 0.003 BNB', async () => {
    const r = await api.post<Withdrawal>('/withdrawals', {
      chainId: config.chainId,
      toAddress: withdrawalTarget,
      amount: withdrawalAmount,
      tokenSymbol: 'BNB',
    });
    api.noteLastRequest('Use `tokenSymbol` (BNB/ETH/MATIC/USDT/USDC). For ERC-20 the token must be in `GET /client/v1/tokens?chainId=…`.');
    const id = r.withdrawalId ?? r.id;
    if (!id) throw new Error('Withdrawal response missing id: ' + JSON.stringify(r).slice(0, 200));
    reporter.highlight('withdrawalId', String(id));
    return String(id);
  });
  if (!withdrawalId) throw new Error('aborted: withdrawal not created');

  await reporter.step(
    `Aguardar withdrawal.broadcast (até ${config.withdrawalTimeoutMs / 1000}s)`,
    async () => {
      return await api.pollUntil(
        async () => {
          const r = await api.get<Withdrawal>(`/withdrawals/${withdrawalId}`);
          if (['broadcast', 'confirmed', 'failed', 'rejected'].includes(r.status)) return r;
          return null;
        },
        { timeoutMs: config.withdrawalTimeoutMs, intervalMs: 6_000, label: 'withdrawal.broadcast' },
      );
    },
  );

  const finalWd = await reporter.step('Aguardar withdrawal.confirmed (até 5 min)', async () => {
    return await api.pollUntil<Withdrawal>(
      async () => {
        const r = await api.get<Withdrawal>(`/withdrawals/${withdrawalId}`);
        if (['confirmed', 'failed', 'rejected'].includes(r.status)) return r;
        return null;
      },
      { timeoutMs: 300_000, intervalMs: 8_000, label: 'withdrawal.confirmed' },
    );
  });
  if (finalWd?.txHash) {
    reporter.highlight('withdrawal txHash', finalWd.txHash);
    reporter.info(`Conferir no BSCscan: https://bscscan.com/tx/${finalWd.txHash}`);
  }

  // ─── B.10 Cleanup webhook ──────────────────────────────────────────
  if (webhook) {
    await reporter.step('Cleanup: remover webhook de teste', async () => {
      await api.delete(`/webhooks/${webhook!.id}`);
    }, { skipOnFail: true });
  }
}

async function generateWebhookSiteUrl(): Promise<string> {
  // webhook.site allows creating a fresh URL via their token API (no auth)
  const r = await fetch('https://webhook.site/token', { method: 'POST' });
  if (!r.ok) throw new Error('Failed to create webhook.site URL: ' + r.status);
  const data = (await r.json()) as { uuid: string };
  return `https://webhook.site/${data.uuid}`;
}
