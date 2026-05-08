/**
 * Single source of truth for granular API key scopes used across client-api
 * controllers, plus runtime expansion of the legacy macros (`read`, `write`,
 * `withdraw`) so existing keys keep working without data migration.
 */

export const GRANULAR_SCOPES = [
  'wallets:read',
  'wallets:create',
  'forwarders:read',
  'forwarders:flush',
  'address-book:read',
  'address-book:write',
  'address-groups:read',
  'address-groups:write',
  'withdrawals:read',
  'withdrawals:hot',
  'withdrawals:gas-tank',
  'webhooks:read',
  'webhooks:write',
  'deposits:read',
  'tokens:read',
  'chains:read',
  'gas-tanks:read',
  'gas-tanks:write',
  'co-sign:read',
  'co-sign:write',
  'projects:read',
  'project-setup:read',
  'project-setup:write',
  'notifications:read',
  'notifications:write',
  'security:read',
  'security:write',
  'deploy-trace:read',
  'export:read',
] as const;

export type GranularScope = (typeof GRANULAR_SCOPES)[number];

export const ALL_READ_SCOPES: string[] = GRANULAR_SCOPES.filter((s) =>
  s.endsWith(':read'),
);

export const LEGACY_WRITE_SCOPES: string[] = [
  'wallets:create',
  'forwarders:flush',
  'address-book:write',
  'address-groups:write',
  'webhooks:write',
  'gas-tanks:write',
  'co-sign:write',
  'project-setup:write',
  'notifications:write',
  'security:write',
  'export:read',
];

export const LEGACY_WITHDRAW_SCOPES: string[] = [
  'withdrawals:hot',
  'withdrawals:gas-tank',
];

const LEGACY_ALIASES: Record<string, string[]> = {
  read: ALL_READ_SCOPES,
  write: LEGACY_WRITE_SCOPES,
  withdraw: LEGACY_WITHDRAW_SCOPES,
};

export function expandLegacyScopes(scopes: string[] | undefined): string[] {
  if (!scopes || scopes.length === 0) return [];
  const out = new Set<string>();
  for (const s of scopes) {
    const expansion = LEGACY_ALIASES[s];
    if (expansion) {
      for (const x of expansion) out.add(x);
    } else {
      out.add(s);
    }
  }
  return [...out];
}

export function isKnownScope(s: string): boolean {
  return (
    (GRANULAR_SCOPES as readonly string[]).includes(s) ||
    s in LEGACY_ALIASES
  );
}

/**
 * Stricter than isKnownScope — accepts ONLY granular scope strings, rejecting
 * the legacy macros (`read`/`write`/`withdraw`). Use this for self-service
 * key creation so portal users cannot mint over-broad keys via the macro
 * aliases.
 */
export function isGranularScope(s: string): boolean {
  return (GRANULAR_SCOPES as readonly string[]).includes(s);
}
