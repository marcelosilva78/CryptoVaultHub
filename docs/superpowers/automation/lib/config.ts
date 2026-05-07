import 'dotenv/config';

export interface Config {
  email: string;
  password: string;
  projectName: string;
  chainId: number;
  portalUrl: string;
  apiBaseUrl: string;
  webhookUrl: string;
  apiKey: string;
  headless: boolean;
  depositTimeoutMs: number;
  sweepTimeoutMs: number;
  withdrawalTimeoutMs: number;
  slowMoMs: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return v;
}

function optional(name: string, dflt = ''): string {
  return process.env[name] ?? dflt;
}

export function loadConfig(): Config {
  return {
    email: optional('CVH_EMAIL', 'wallet@grupogreen.org'),
    password: required('CVH_PASSWORD'),
    projectName: optional('CVH_PROJECT_NAME', 'BrPay'),
    chainId: Number(optional('CVH_CHAIN_ID', '56')),
    portalUrl: optional('CVH_PORTAL_URL', 'https://portal.vaulthub.live'),
    apiBaseUrl: optional('CVH_API_BASE_URL', 'https://api.vaulthub.live/client/v1'),
    webhookUrl: optional('CVH_WEBHOOK_URL', ''),
    apiKey: optional('CVH_API_KEY', ''),
    headless: optional('CVH_HEADLESS', 'false') === 'true',
    depositTimeoutMs: Number(optional('CVH_DEPOSIT_TIMEOUT_SEC', '300')) * 1000,
    sweepTimeoutMs: Number(optional('CVH_SWEEP_TIMEOUT_SEC', '420')) * 1000,
    withdrawalTimeoutMs: Number(optional('CVH_WITHDRAWAL_TIMEOUT_SEC', '300')) * 1000,
    slowMoMs: Number(optional('CVH_SLOWMO_MS', '0')),
  };
}
