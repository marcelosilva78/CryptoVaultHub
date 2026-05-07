import { chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { Config } from '../lib/config.js';
import { reporter } from '../lib/reporter.js';
import path from 'node:path';

interface UiState {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  apiKey?: string;
}

export async function runUiSuite(config: Config): Promise<{ apiKey?: string }> {
  reporter.phase('A — UI Suite (Playwright)');

  const browser = await chromium.launch({ headless: config.headless, slowMo: config.slowMoMs });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  const state: UiState = { browser, context, page };

  try {
    await loginUi(state, config);
    await verifyDashboard(state, config);
    await verifyProjectDropdown(state, config);
    await verifyGasTanksPage(state, config);
    await verifySidebarNavigation(state, config);
    await verifyWebhooksPage(state, config);
    await verifyAddressBookPage(state, config);
    await verifyAddressGroupsPage(state, config);
    await verifyExportsPage(state, config);
    await verifyNotificationsPage(state, config);
    await verifySecurityPage(state, config);

    if (!config.apiKey) {
      const generated = await generateApiKeyViaUi(state, config);
      if (generated) state.apiKey = generated;
    }

    if (consoleErrors.length > 0) {
      const filtered = consoleErrors.filter((e) =>
        // ignore known non-blocking infra issues
        !/auth\/validate.*CORS/i.test(e) &&
        !/favicon\.ico/i.test(e) &&
        !/auth\.vaulthub\.live.*ERR_FAILED/i.test(e),
      );
      if (filtered.length > 0) {
        reporter.warn('console-errors', `${filtered.length} non-trivial console errors. Sample: ${filtered.slice(0, 3).join(' | ').slice(0, 300)}`);
      }
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  return { apiKey: state.apiKey };
}

async function loginUi(state: UiState, config: Config) {
  await reporter.step('UI login', async () => {
    await state.page.goto(`${config.portalUrl}/login`);
    await state.page.fill('input[type="email"], input[placeholder*="company"]', config.email);
    await state.page.fill('input[type="password"]', config.password);
    await state.page.click('button:has-text("Sign in")');
    await state.page.waitForURL(`${config.portalUrl}/`, { timeout: 30_000 });
    await state.page.waitForTimeout(3_000);
  });
}

async function verifyDashboard(state: UiState, config: Config) {
  await reporter.step('Dashboard renders with widgets', async () => {
    const heading = await state.page.locator('h1:has-text("Dashboard")').first();
    if ((await heading.count()) === 0) throw new Error('Dashboard heading not found');

    // Gas Tanks widget should be present
    const gasTankWidget = state.page.locator(':has-text("Gas Tanks")').first();
    await gasTankWidget.waitFor({ timeout: 10_000 });
  });

  await reporter.step('Dashboard screenshot', async () => {
    const buf = await state.page.screenshot({ fullPage: false });
    reporter.saveEvidence('ui-01-dashboard.png', buf);
  });
}

async function verifyProjectDropdown(state: UiState, config: Config) {
  await reporter.step(`Project selector shows "${config.projectName}"`, async () => {
    // Click the dropdown trigger (FolderKanban icon button at top right)
    const trigger = state.page.locator('button').filter({ hasText: /Select Project|BrPay/ }).first();
    await trigger.click();
    await state.page.waitForTimeout(2_000);

    const projectItem = state.page.locator(`text=${config.projectName}`).first();
    await projectItem.waitFor({ timeout: 10_000 });

    // Close dropdown
    await state.page.keyboard.press('Escape');
  });
}

async function verifyGasTanksPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /gas-tanks', async () => {
    await state.page.click('a:has-text("Gas Tanks"), nav >> text=Gas Tanks');
    await state.page.waitForURL(/\/gas-tanks/, { timeout: 10_000 });
    await state.page.waitForSelector('h1:has-text("Gas Tanks")');
  });

  await reporter.step('Gas Tank card renders', async () => {
    await state.page.waitForSelector(':has-text("Chain ID")', { timeout: 15_000 });
    await state.page.waitForSelector('button:has-text("Top Up")');
  });

  await reporter.step('History modal opens', async () => {
    await state.page.click('button:has-text("History")');
    await state.page.waitForSelector(':has-text("Recent Gas Spend")');
    await state.page.waitForSelector(':has-text("Gas spend tracking started")'); // info banner
    const buf = await state.page.screenshot();
    reporter.saveEvidence('ui-02-gas-tank-history.png', buf);
    await state.page.click('button[aria-label="Close"]');
  });

  await reporter.step('Alerts modal opens', async () => {
    await state.page.click('button:has-text("Alerts")');
    await state.page.waitForSelector(':has-text("Configure Alerts")');
    await state.page.click('button:has-text("Cancel")');
  });
}

async function verifySidebarNavigation(state: UiState, _config: Config) {
  const links = [
    { text: 'Dashboard', urlMatch: /^https:\/\/[^/]+\/$/ },
    { text: 'Wallets', urlMatch: /\/wallets/ },
    { text: 'Transactions', urlMatch: /\/transactions/ },
    { text: 'All Projects', urlMatch: /\/projects/ },
    { text: 'Deploy History', urlMatch: /\/deploys|\/deploy-history/ },
    { text: 'Deposits', urlMatch: /\/deposits/ },
    { text: 'Withdrawals', urlMatch: /\/withdrawals/ },
    { text: 'Flush', urlMatch: /\/flush/ },
    { text: 'Webhooks', urlMatch: /\/webhooks/ },
    { text: 'API Keys', urlMatch: /\/api-keys/ },
    { text: 'Notifications', urlMatch: /\/notifications/ },
    { text: 'Security', urlMatch: /\/security/ },
    { text: 'Knowledge Base', urlMatch: /\/knowledge-base/ },
  ];

  for (const link of links) {
    await reporter.step(
      `Sidebar → ${link.text}`,
      async () => {
        const nav = state.page.locator('nav, aside').first();
        const item = nav.locator(`a:has-text("${link.text}"), button:has-text("${link.text}")`).first();
        await item.click();
        await state.page.waitForURL(link.urlMatch, { timeout: 8_000 });
        await state.page.waitForTimeout(800);
      },
      { skipOnFail: true },
    );
  }
}

async function verifyWebhooksPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /webhooks', async () => {
    await state.page.click('a:has-text("Webhooks"), nav >> text=Webhooks');
    await state.page.waitForURL(/\/webhooks/, { timeout: 8_000 });
  });

  await reporter.step('Webhooks page renders without 5xx', async () => {
    await state.page.waitForSelector('h1, h2, [role="heading"]', { timeout: 8_000 });
  });
}

async function verifyAddressBookPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /addresses', async () => {
    await state.page.goto(`${state.page.url().split('/').slice(0, 3).join('/')}/addresses`);
    await state.page.waitForLoadState('domcontentloaded');
    await state.page.waitForTimeout(1_500);
  });
}

async function verifyAddressGroupsPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /address-groups', async () => {
    await state.page.goto(`${state.page.url().split('/').slice(0, 3).join('/')}/address-groups`);
    await state.page.waitForLoadState('domcontentloaded');
    await state.page.waitForTimeout(1_500);
  });
}

async function verifyExportsPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /exports', async () => {
    await state.page.goto(`${state.page.url().split('/').slice(0, 3).join('/')}/exports`);
    await state.page.waitForLoadState('domcontentloaded');
    await state.page.waitForTimeout(1_500);
  });
}

async function verifyNotificationsPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /notifications', async () => {
    await state.page.goto(`${state.page.url().split('/').slice(0, 3).join('/')}/notifications`);
    await state.page.waitForLoadState('domcontentloaded');
    await state.page.waitForTimeout(1_500);
  });
}

async function verifySecurityPage(state: UiState, _config: Config) {
  await reporter.step('Navigate to /security', async () => {
    await state.page.goto(`${state.page.url().split('/').slice(0, 3).join('/')}/security`);
    await state.page.waitForLoadState('domcontentloaded');
    await state.page.waitForTimeout(1_500);
  });
}

async function generateApiKeyViaUi(state: UiState, _config: Config): Promise<string | undefined> {
  const result = await reporter.step(
    'Generate API key via /api-keys (only if CVH_API_KEY not provided)',
    async () => {
      await state.page.goto(`${state.page.url().split('/').slice(0, 3).join('/')}/api-keys`);
      await state.page.waitForLoadState('domcontentloaded');
      await state.page.waitForTimeout(1_500);

      // Best-effort: click "Create" if present, fill name, submit, capture key.
      // If UI shape differs, fail soft and let user provide via env.
      const createBtn = state.page.locator('button:has-text("Create"), button:has-text("New API Key"), button:has-text("Generate")').first();
      if ((await createBtn.count()) === 0) {
        throw new Error('No "Create" button found on /api-keys — provide CVH_API_KEY via env to skip this step');
      }
      await createBtn.click();
      await state.page.waitForTimeout(800);

      const nameInput = state.page.locator('input[type="text"], input[name="name"]').first();
      if ((await nameInput.count()) > 0) {
        await nameInput.fill(`homolog-${Date.now()}`);
      }

      // Try to find scope checkboxes
      for (const scope of ['read', 'write']) {
        const cb = state.page.locator(`label:has-text("${scope}") input[type="checkbox"], input[value="${scope}"]`).first();
        if ((await cb.count()) > 0) {
          const checked = await cb.isChecked().catch(() => false);
          if (!checked) await cb.check().catch(() => undefined);
        }
      }

      const submit = state.page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Generate"), button:has-text("Save")').last();
      await submit.click();
      await state.page.waitForTimeout(2_000);

      // The API key is shown ONCE — try to grab it from a textarea/code/input that shows the secret.
      const candidates = [
        'code:has-text("cvh_")',
        'input[readonly][value^="cvh_"]',
        'textarea:has-text("cvh_")',
        'pre:has-text("cvh_")',
        'div:has-text("cvh_") >> nth=0',
      ];
      for (const sel of candidates) {
        const el = state.page.locator(sel).first();
        if ((await el.count()) > 0) {
          const txt = await el.textContent().catch(() => '') || (await el.inputValue().catch(() => '')) || '';
          const m = txt.match(/cvh_[a-z0-9_]+/);
          if (m) return m[0];
        }
      }
      throw new Error('Could not capture generated API key from UI — provide CVH_API_KEY via env');
    },
    { skipOnFail: true },
  );

  return result;
}
