export type Sensitivity = 'standard' | 'sensitive';

export interface ScopeDef {
  scope: string;
  group: string;
  label: string;
  helper: string;
  sensitivity: Sensitivity;
}

export const SCOPE_GROUPS = [
  'Wallets',
  'Forwarders',
  'Address Book',
  'Address Groups',
  'Withdrawals',
  'Deposits',
  'Webhooks',
  'Gas Tanks',
  'Co-sign',
  'Tokens & Chains',
  'Projects',
  'Notifications',
  'Security',
  'Deploy Trace',
  'Knowledge Base',
  'Export',
] as const;

export const SCOPE_CATALOG: ScopeDef[] = [
  { scope: 'wallets:read', group: 'Wallets', label: 'wallets:read', helper: 'List wallets, balances, addresses.', sensitivity: 'standard' },
  { scope: 'wallets:create', group: 'Wallets', label: 'wallets:create', helper: 'Generate / deploy new wallet contracts.', sensitivity: 'standard' },
  { scope: 'forwarders:read', group: 'Forwarders', label: 'forwarders:read', helper: 'List deposit forwarders and state.', sensitivity: 'standard' },
  { scope: 'forwarders:create', group: 'Forwarders', label: 'forwarders:create', helper: 'Generate / provision deposit forwarder addresses.', sensitivity: 'standard' },
  { scope: 'forwarders:flush', group: 'Forwarders', label: 'forwarders:flush', helper: 'Flush deposit forwarders to hot wallet.', sensitivity: 'sensitive' },
  { scope: 'address-book:read', group: 'Address Book', label: 'address-book:read', helper: 'List whitelisted withdrawal destinations.', sensitivity: 'standard' },
  { scope: 'address-book:write', group: 'Address Book', label: 'address-book:write', helper: 'Register/update/delete withdrawal destinations.', sensitivity: 'sensitive' },
  { scope: 'address-groups:read', group: 'Address Groups', label: 'address-groups:read', helper: 'List address groups.', sensitivity: 'standard' },
  { scope: 'address-groups:write', group: 'Address Groups', label: 'address-groups:write', helper: 'Create / provision address groups.', sensitivity: 'standard' },
  { scope: 'withdrawals:read', group: 'Withdrawals', label: 'withdrawals:read', helper: 'List withdrawal history and details.', sensitivity: 'standard' },
  { scope: 'withdrawals:hot', group: 'Withdrawals', label: 'withdrawals:hot', helper: 'Initiate withdrawal from Hot Wallet (multisig).', sensitivity: 'sensitive' },
  { scope: 'withdrawals:gas-tank', group: 'Withdrawals', label: 'withdrawals:gas-tank', helper: 'Initiate withdrawal from Gas Tank (EOA).', sensitivity: 'sensitive' },
  { scope: 'deposits:read', group: 'Deposits', label: 'deposits:read', helper: 'List inbound deposits.', sensitivity: 'standard' },
  { scope: 'webhooks:read', group: 'Webhooks', label: 'webhooks:read', helper: 'List webhook subscriptions and deliveries.', sensitivity: 'standard' },
  { scope: 'webhooks:write', group: 'Webhooks', label: 'webhooks:write', helper: 'Create/update/delete webhooks.', sensitivity: 'standard' },
  { scope: 'gas-tanks:read', group: 'Gas Tanks', label: 'gas-tanks:read', helper: 'List gas tanks, balances, alert config.', sensitivity: 'standard' },
  { scope: 'gas-tanks:write', group: 'Gas Tanks', label: 'gas-tanks:write', helper: 'Update alert config; export keystore.', sensitivity: 'sensitive' },
  { scope: 'co-sign:read', group: 'Co-sign', label: 'co-sign:read', helper: 'List pending co-sign operations.', sensitivity: 'standard' },
  { scope: 'co-sign:write', group: 'Co-sign', label: 'co-sign:write', helper: 'Submit a co-signature.', sensitivity: 'standard' },
  { scope: 'tokens:read', group: 'Tokens & Chains', label: 'tokens:read', helper: 'List supported tokens per chain.', sensitivity: 'standard' },
  { scope: 'chains:read', group: 'Tokens & Chains', label: 'chains:read', helper: 'List supported chains.', sensitivity: 'standard' },
  { scope: 'projects:read', group: 'Projects', label: 'projects:read', helper: 'Read project metadata.', sensitivity: 'standard' },
  { scope: 'project-setup:read', group: 'Projects', label: 'project-setup:read', helper: 'Read project setup state.', sensitivity: 'standard' },
  { scope: 'project-setup:write', group: 'Projects', label: 'project-setup:write', helper: 'Modify project setup, enable/disable chains.', sensitivity: 'standard' },
  { scope: 'notifications:read', group: 'Notifications', label: 'notifications:read', helper: 'Read notification rules.', sensitivity: 'standard' },
  { scope: 'notifications:write', group: 'Notifications', label: 'notifications:write', helper: 'Create/update/delete notification rules.', sensitivity: 'standard' },
  { scope: 'security:read', group: 'Security', label: 'security:read', helper: 'Read security settings.', sensitivity: 'standard' },
  { scope: 'security:write', group: 'Security', label: 'security:write', helper: 'Change custody mode; toggle safe mode.', sensitivity: 'sensitive' },
  { scope: 'deploy-trace:read', group: 'Deploy Trace', label: 'deploy-trace:read', helper: 'Read on-chain deploy traces.', sensitivity: 'standard' },
  { scope: 'kb:read', group: 'Knowledge Base', label: 'kb:read', helper: 'Read knowledge base articles.', sensitivity: 'standard' },
  { scope: 'export:read', group: 'Export', label: 'export:read', helper: 'Generate exports (CSV/JSON).', sensitivity: 'standard' },
];

export const ALL_READ_SCOPES = SCOPE_CATALOG
  .filter((s) => s.scope.endsWith(':read'))
  .map((s) => s.scope);
