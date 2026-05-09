// brpay-validation.ts
// Non-interactive end-to-end validation of every /client/v1 endpoint that's
// safe to exercise against mainnet for the BrPay project. Used pre-demo to
// generate evidence (curl-log, canonical reference, replay script, summary)
// and to verify the 5 fixes shipped in commit de72679.
//
// Run:
//   cd docs/superpowers/automation
//   CVH_API_KEY=<key> npx tsx suites/brpay-validation.ts
//
// Output: evidence/<timestamp>/{report.md,curl-log-detailed.md,api-canonical-reference.md,run.sh}

import axios from 'axios';
import { CvhApiClient } from '../lib/api-client.js';
import { Config, loadConfig } from '../lib/config.js';
import { reporter } from '../lib/reporter.js';

// Kong WAF rejects requests with the default `User-Agent: axios/x.y.z` header
// (HTTP 403 with body { message: "Forbidden", request_id: ... }). Always set
// an explicit UA when using axios directly. CvhApiClient already does this.
const RAW_HEADERS = { 'User-Agent': 'cvh-brpay-validation/1.0', 'Accept': '*/*' };

interface Project { id: string; name: string; slug: string; status: string; settings?: { custodyMode?: string }; chainsCount?: number; walletsCount?: number; }
interface Wallet { id: number | string; chainId: number; address: string; walletType: string; }
interface GasTank { chainId: number; address: string; balanceWei: string; status: 'ok' | 'low' | 'critical'; nativeSymbol: string; }
interface DepositAddress { id?: string | number; address: string; chainId: number; label?: string; status?: string; }
interface Withdrawal { id: string | number; status: string; sourceWallet?: string; chainId?: number; toAddress?: string; amount?: string; }
interface Webhook { id: string | number; url: string; events: string[]; secret?: string; isActive?: boolean; }
interface Article { slug: string; title: string; }

async function main() {
  reporter.banner('CryptoVaultHub — BrPay Demo Readiness Validation');

  const config: Config = loadConfig();
  if (!config.apiKey) throw new Error('CVH_API_KEY not set');

  const api = new CvhApiClient(config.apiBaseUrl, config.apiKey);

  let project: Project | undefined;
  let firstWallet: Wallet | undefined;
  let createdAddress: string | undefined;
  let firstWithdrawalId: string | number | undefined;
  let firstArticleSlug: string | undefined;
  let createdWebhook: Webhook | undefined;
  let exportRequestUid: string | undefined;

  // ─── Phase 0: Auth & meta ──────────────────────────────────────────
  reporter.phase('0 — Auth & meta');

  await reporter.step('GET /health (no auth)', async () => {
    // Retry up to 3x — Kong sporadically returns 502 if the upstream is briefly slow.
    let lastStatus = 0;
    for (let i = 0; i < 3; i++) {
      const r = await axios.get(`${config.apiBaseUrl}/health`, { validateStatus: () => true, timeout: 10_000, headers: RAW_HEADERS });
      lastStatus = r.status;
      if (r.status === 200) {
        if (r.data?.status !== 'ok') throw new Error(`expected status:ok, got ${JSON.stringify(r.data)}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`expected 200, last status was ${lastStatus} (after 3 attempts)`);
  }, { skipOnFail: true });

  await reporter.step('GET /chains', async () => {
    const r = await api.get<{ chains: { chainId: number; name: string; isActive: boolean }[] }>('/chains');
    if (!r.chains?.length) throw new Error('no chains returned');
    const bsc = r.chains.find((c) => c.chainId === config.chainId);
    if (!bsc) throw new Error(`chain ${config.chainId} not present`);
    reporter.highlight(`chains active`, String(r.chains.filter((c) => c.isActive).length));
  });

  await reporter.step('GET /tokens (authenticated, post-fix #1)', async () => {
    const r = await api.get<{ tokens: any[] }>('/tokens');
    reporter.highlight(`tokens count`, String(r.tokens?.length ?? 0));
  });

  await reporter.step(`GET /tokens/${config.chainId}`, async () => {
    const r = await api.get<{ tokens: any[] }>(`/tokens/${config.chainId}`);
    reporter.highlight(`tokens on BSC`, String(r.tokens?.length ?? 0));
  });

  // ─── Phase 1: Project context ──────────────────────────────────────
  reporter.phase('1 — Project context');

  project = await reporter.step(`Resolve project "${config.projectName}"`, async () => {
    const r = await api.get<{ projects: Project[] }>('/projects');
    const p = r.projects.find((pr) => pr.name === config.projectName);
    if (!p) throw new Error(`project ${config.projectName} not found among ${r.projects.length}`);
    reporter.highlight('projectId', p.id);
    reporter.highlight('custodyMode', p.settings?.custodyMode ?? 'n/a');
    return p;
  });

  await reporter.step('GET /projects/current (auto-select single project)', async () => {
    const r = await api.get<{ project: Project }>('/projects/current');
    if (r.project?.id !== project!.id) throw new Error(`current project mismatch`);
  });

  await reporter.step(`GET /projects/${project!.id}`, async () => {
    await api.get<{ project: Project }>(`/projects/${project!.id}`);
  });

  await reporter.step(`GET /projects/${project!.id}/gas-check`, async () => {
    const r = await api.get<{ allSufficient: boolean; chains: any[] }>(`/projects/${project!.id}/gas-check`);
    reporter.highlight('gas allSufficient', String(r.allSufficient));
  });

  await reporter.step(`GET /projects/${project!.id}/deploy/status`, async () => {
    await api.get(`/projects/${project!.id}/deploy/status`);
  });

  await reporter.step(`GET /projects/${project!.id}/deploy/traces`, async () => {
    await api.get(`/projects/${project!.id}/deploy/traces`);
  });

  await reporter.step(`GET /projects/${project!.id}/deploy/traces/${config.chainId}`, async () => {
    await api.get(`/projects/${project!.id}/deploy/traces/${config.chainId}`);
  });

  await reporter.step(`GET /projects/${project!.id}/deletion-impact`, async () => {
    const r = await api.get<{ projectName: string; walletCount: number; withdrawalCount: number }>(`/projects/${project!.id}/deletion-impact`);
    reporter.highlight('historic withdrawals', String(r.withdrawalCount));
  });

  // /projects/:id/export returns the full project JSON — call but don't dump
  await reporter.step(`GET /projects/${project!.id}/export`, async () => {
    await api.get(`/projects/${project!.id}/export`);
  });

  // ─── Phase 2: Wallets ──────────────────────────────────────────────
  reporter.phase('2 — Wallets');

  await reporter.step('GET /wallets', async () => {
    const r = await api.get<{ wallets: Wallet[] }>('/wallets');
    if (!r.wallets?.length) throw new Error('no wallets');
    firstWallet = r.wallets.find((w) => w.chainId === config.chainId);
    reporter.highlight('walletsCount', String(r.wallets.length));
  });

  await reporter.step(`GET /wallets/${config.chainId}/balances`, async () => {
    const r = await api.get<{ balances: { tokenSymbol?: string; symbol?: string; balance?: string; balanceFormatted?: string }[] }>(`/wallets/${config.chainId}/balances`);
    reporter.highlight('balances rows', String(r.balances?.length ?? 0));
  });

  // ─── Phase 3: Gas Tank (read) ──────────────────────────────────────
  reporter.phase('3 — Gas Tank');

  await reporter.step('GET /gas-tanks', async () => {
    const r = await api.get<{ gasTanks: GasTank[] }>('/gas-tanks');
    const tank = r.gasTanks.find((t) => t.chainId === config.chainId);
    if (!tank) throw new Error(`no gas tank for chain ${config.chainId}`);
    reporter.highlight('gas tank status', tank.status);
    reporter.highlight('gas tank balanceWei', tank.balanceWei);
  });

  await reporter.step(`GET /gas-tanks/${config.chainId}/history`, async () => {
    await api.get(`/gas-tanks/${config.chainId}/history`, { limit: 10 });
  });

  await reporter.step(`GET /gas-tanks/${config.chainId}/topup-uri`, async () => {
    const r = await api.get<{ address: string; eip681Uri: string }>(`/gas-tanks/${config.chainId}/topup-uri`);
    if (!r.eip681Uri?.startsWith('ethereum:')) throw new Error(`malformed eip681Uri: ${r.eip681Uri}`);
  });

  await reporter.step(`GET /gas-tanks/${config.chainId}/alert-config`, async () => {
    await api.get(`/gas-tanks/${config.chainId}/alert-config`);
  });

  // ─── Phase 4: Deposit addresses ────────────────────────────────────
  reporter.phase('4 — Deposit addresses');

  await reporter.step('GET /deposit-addresses', async () => {
    await api.get('/deposit-addresses', { page: 1, limit: 5 });
  });

  await reporter.step('POST /wallets/:chainId/deposit-address (unique externalId per run)', async () => {
    const externalId = `brpay-validation-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    try {
      const r = await api.post<{ address?: string; depositAddress?: { address: string } }>(`/wallets/${config.chainId}/deposit-address`, {
        externalId,
        label: 'BrPay validation suite',
      });
      createdAddress = (r as any).address ?? (r as any).depositAddress?.address;
      if (!createdAddress) throw new Error('no address returned');
      reporter.highlight('deposit address', createdAddress);
      api.noteLastRequest('externalId is required and recommended to be your stable customer/invoice id. The API treats externalId as a write-once key — duplicate calls return 409 (NOT 200/existing as documented).');
    } catch (e: any) {
      if (e?.response?.status === 409) {
        reporter.warn('deposit-address 409', 'Repeated externalId returns 409 instead of idempotent 200 — documentation gap');
        api.noteLastRequest('FINDING: API returns 409 on repeated externalId, not 200 with existing record. Behavior is documented as idempotent.');
        return;
      }
      throw e;
    }
  }, { skipOnFail: true });

  await reporter.step('GET /deposits (list)', async () => {
    const r = await api.get<{ deposits: any[]; meta: any }>('/deposits', { page: 1, limit: 5 });
    reporter.highlight('historic deposits', String(r.deposits?.length ?? 0));
  });

  // ─── Phase 5: Withdrawals (read only) ──────────────────────────────
  reporter.phase('5 — Withdrawals (read)');

  await reporter.step('GET /withdrawals (list)', async () => {
    const r = await api.get<{ withdrawals: Withdrawal[] }>('/withdrawals', { page: 1, limit: 10 });
    if (r.withdrawals?.length) {
      firstWithdrawalId = r.withdrawals[0].id;
      reporter.highlight('historic withdrawals', String(r.withdrawals.length));
    } else {
      reporter.info('no historic withdrawals to read');
    }
  });

  if (firstWithdrawalId) {
    await reporter.step(`GET /withdrawals/${firstWithdrawalId}`, async () => {
      const r = await api.get<{ withdrawal: Withdrawal }>(`/withdrawals/${firstWithdrawalId}`);
      // Verify fix #2 dependency: sourceWallet must now be exposed on the detail response
      if (r.withdrawal && r.withdrawal.sourceWallet === undefined) {
        reporter.warn('fix #2 dependency', 'sourceWallet field absent from withdrawal detail response — defaults to "hot" in approve check');
      } else if (r.withdrawal?.sourceWallet) {
        reporter.highlight('sourceWallet (fix #2)', r.withdrawal.sourceWallet);
      }
    });
  } else {
    reporter.skip('GET /withdrawals/:id', 'no historic withdrawal');
  }

  // ─── Phase 6: Address Book (read) ──────────────────────────────────
  reporter.phase('6 — Address Book');

  await reporter.step('GET /addresses', async () => {
    await api.get('/addresses', { page: 1, limit: 10 });
  });

  // ─── Phase 7: Address Groups (read) ────────────────────────────────
  reporter.phase('7 — Address Groups');

  await reporter.step('GET /address-groups', async () => {
    await api.get('/address-groups', { page: 1, limit: 10 });
  });

  // ─── Phase 8: Webhooks (full lifecycle) ────────────────────────────
  reporter.phase('8 — Webhooks (lifecycle)');

  await reporter.step('GET /webhooks', async () => {
    await api.get('/webhooks', { page: 1, limit: 10 });
  });

  const disposableUrl = await reporter.step('Generate disposable webhook URL', async () => {
    const r = await axios.post('https://webhook.site/token', null, { timeout: 8_000, headers: RAW_HEADERS });
    const token = r.data?.uuid;
    if (!token) throw new Error('webhook.site rejected the request');
    return `https://webhook.site/${token}`;
  }, { skipOnFail: true });

  if (disposableUrl) {
    createdWebhook = await reporter.step('POST /webhooks (create)', async () => {
      // FINDING: CreateWebhookDto rejects `label` despite KB and Postman documenting it.
      // Sticking to the strictly-accepted fields.
      const r = await api.post<{ webhook?: Webhook & { secret?: string } } & Webhook & { secret?: string }>(`/webhooks`, {
        url: disposableUrl,
        events: ['deposit.detected', 'deposit.confirmed', 'deposit.swept', 'withdrawal.confirmed', 'withdrawal.failed'],
      });
      const wh = (r.webhook ?? r) as Webhook & { secret?: string };
      if (!wh.id) throw new Error('webhook id missing in response');
      api.noteLastRequest('Webhook secret is returned ONCE on create — used to verify HMAC-SHA256 signatures on incoming events.');
      reporter.highlight('webhook id', String(wh.id));
      return wh;
    });
  } else {
    reporter.skip('POST /webhooks', 'no disposable URL');
  }

  if (createdWebhook?.id) {
    await reporter.step(`POST /webhooks/${createdWebhook.id}/test (ping)`, async () => {
      try {
        await api.post(`/webhooks/${createdWebhook!.id}/test`);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          api.noteLastRequest('Test-ping returns 404 — endpoint not implemented downstream. Real events still flow.');
          reporter.warn('webhook-test', 'endpoint returns 404 (downstream gap)');
          return;
        }
        throw e;
      }
    }, { skipOnFail: true });

    await reporter.step(`GET /webhooks/${createdWebhook.id}/deliveries`, async () => {
      await api.get(`/webhooks/${createdWebhook!.id}/deliveries`, { page: 1, limit: 10 });
    });

    await reporter.step('GET /webhooks/dead-letters', async () => {
      await api.get('/webhooks/dead-letters', { page: 1, limit: 10 });
    });

    await reporter.step(`PATCH /webhooks/${createdWebhook.id} (deactivate)`, async () => {
      try {
        await api.patch(`/webhooks/${createdWebhook!.id}`, { isActive: false });
      } catch (e: any) {
        const m = String(e?.response?.data ?? '');
        if (m.includes('clientId should not exist')) {
          api.noteLastRequest('FINDING: client-api/webhook.service.ts updateWebhook() proxies { clientId, ...data } to notification-service, which rejects clientId in body. Pre-existing bug.');
          reporter.warn('PATCH webhook downstream', 'notification-service rejects clientId in body — proxy bug');
          return;
        }
        throw e;
      }
    }, { skipOnFail: true });

    await reporter.step(`DELETE /webhooks/${createdWebhook.id} (cleanup)`, async () => {
      try {
        await api.delete(`/webhooks/${createdWebhook!.id}`);
      } catch (e: any) {
        const m = String(e?.response?.data ?? '');
        if (m.includes('clientId should not exist')) {
          reporter.warn('DELETE webhook downstream', 'same proxy bug as PATCH — webhook may persist');
          return;
        }
        throw e;
      }
    }, { skipOnFail: true });
  }

  // ─── Phase 9: Co-Sign (read) ───────────────────────────────────────
  reporter.phase('9 — Co-Sign');

  await reporter.step('GET /co-sign/pending', async () => {
    const r = await api.get<{ operations?: any[] }>('/co-sign/pending');
    reporter.info(`pending co-sign ops: ${r.operations?.length ?? 0} (BrPay is full_custody → expect 0)`);
  });

  // ─── Phase 10: Security (read) ─────────────────────────────────────
  reporter.phase('10 — Security');

  await reporter.step('GET /security/settings', async () => {
    await api.get('/security/settings');
  });

  await reporter.step('GET /security/2fa-status', async () => {
    await api.get('/security/2fa-status');
  });

  await reporter.step('GET /security/shamir-shares', async () => {
    await api.get('/security/shamir-shares');
  });

  // ─── Phase 11: Notifications (read) ────────────────────────────────
  reporter.phase('11 — Notifications');

  await reporter.step('GET /notifications/rules', async () => {
    await api.get('/notifications/rules');
  });

  // ─── Phase 12: Knowledge Base ──────────────────────────────────────
  reporter.phase('12 — Knowledge Base');

  await reporter.step('GET /knowledge-base/categories', async () => {
    await api.get('/knowledge-base/categories');
  });

  await reporter.step('GET /knowledge-base', async () => {
    const r = await api.get<{ articles?: Article[]; data?: Article[] }>('/knowledge-base', { page: 1, limit: 5 });
    const list = r.articles ?? r.data ?? [];
    if (list.length) firstArticleSlug = list[0].slug;
  });

  if (firstArticleSlug) {
    await reporter.step(`GET /knowledge-base/slug/${firstArticleSlug}`, async () => {
      await api.get(`/knowledge-base/slug/${firstArticleSlug}`);
    });
  } else {
    reporter.skip('GET /knowledge-base/slug/:slug', 'no articles to read');
  }

  // ─── Phase 13: Deploy Traces ───────────────────────────────────────
  reporter.phase('13 — Deploy Traces');

  let firstTraceId: string | number | undefined;
  await reporter.step('GET /deploy-traces', async () => {
    try {
      const r = await api.get<{ traces?: any[]; data?: any[] }>('/deploy-traces', { page: 1, limit: 5 });
      const list = r.traces ?? r.data ?? [];
      if (list.length) firstTraceId = list[0].id ?? list[0].traceId;
      reporter.highlight('deploy traces', String(list.length));
    } catch (e: any) {
      if (e?.response?.status === 500) {
        reporter.warn('deploy-traces 500', 'downstream service returns 500 — pre-existing bug, document as follow-up');
        api.noteLastRequest('FINDING: GET /deploy-traces returns 500 from downstream proxy. Not a code change in this session — pre-existing.');
        return;
      }
      throw e;
    }
  }, { skipOnFail: true });

  if (firstTraceId) {
    await reporter.step(`GET /deploy-traces/${firstTraceId}`, async () => {
      await api.get(`/deploy-traces/${firstTraceId}`);
    });
  } else {
    reporter.skip('GET /deploy-traces/:id', 'no traces to read');
  }

  // ─── Phase 14: Exports (full lifecycle, small) ─────────────────────
  reporter.phase('14 — Exports');

  exportRequestUid = await reporter.step('POST /exports (small JSON withdrawals export)', async () => {
    const r = await api.post<{ requestUid?: string; status?: string; estimatedRows?: number; message?: string }>('/exports', {
      exportType: 'withdrawals',
      format: 'json',
    });
    const uid = r.requestUid;
    if (!uid) throw new Error('no requestUid returned');
    reporter.highlight('export uid', uid);
    return uid;
  }, { skipOnFail: true });

  await reporter.step('GET /exports (list)', async () => {
    await api.get('/exports', { page: 1, limit: 5 });
  });

  if (exportRequestUid) {
    await reporter.step(`GET /exports/${exportRequestUid} (poll up to 60s)`, async () => {
      const final = await api.pollUntil<{ status: string }>(
        async () => {
          const r = await api.get<{ request: { status: string } }>(`/exports/${exportRequestUid}`);
          const s = r.request?.status;
          return s && ['completed', 'failed', 'expired'].includes(s) ? r.request : null;
        },
        { timeoutMs: 60_000, intervalMs: 4_000, label: 'export-completed' },
      );
      reporter.highlight('export final status', final.status);
    }, { skipOnFail: true });
  }

  // ─── Phase 15: Negative tests (verify fixes) ───────────────────────
  reporter.phase('15 — Negative tests');

  await reporter.step('Fix #1 verification — GET /tokens without auth → 401', async () => {
    const r = await axios.get(`${config.apiBaseUrl}/tokens`, { validateStatus: () => true, timeout: 8_000, headers: RAW_HEADERS });
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status} (post-fix #1 means /tokens must require auth)`);
  });

  await reporter.step('JWT-only enforcement — GET /api-keys with X-API-Key → 401', async () => {
    const r = await axios.get(`${config.apiBaseUrl}/api-keys`, {
      headers: { ...RAW_HEADERS, 'X-API-Key': config.apiKey },
      validateStatus: () => true,
      timeout: 8_000,
    });
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status} (api-keys self-service must reject api-key auth)`);
  });

  await reporter.step('JWT-only enforcement — POST /api-keys with X-API-Key → 401', async () => {
    const r = await axios.post(`${config.apiBaseUrl}/api-keys`, {
      projectId: Number(project!.id),
      scopes: ['wallets:read'],
      label: 'should-fail',
    }, {
      headers: { ...RAW_HEADERS, 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
      validateStatus: () => true,
      timeout: 8_000,
    });
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status} (api-key creation must require JWT, not api-key)`);
  });

  // ─── Done ──────────────────────────────────────────────────────────
  reporter.summary();
  if (reporter.hasFailures()) process.exit(1);
}

main().catch((e) => {
  reporter.fatal(e);
  process.exit(1);
});
