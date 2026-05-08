import {
  GRANULAR_SCOPES,
  expandLegacyScopes,
  isKnownScope,
  isGranularScope,
  ALL_READ_SCOPES,
  LEGACY_WRITE_SCOPES,
  LEGACY_WITHDRAW_SCOPES,
} from './scope-catalog';

describe('scope-catalog', () => {
  it('GRANULAR_SCOPES has 30 entries and no duplicates', () => {
    expect(GRANULAR_SCOPES.length).toBe(30);
    expect(new Set(GRANULAR_SCOPES).size).toBe(30);
  });

  it('does not include the legacy "admin" pseudo-scope (set only by JWT auth path)', () => {
    expect((GRANULAR_SCOPES as readonly string[]).includes('admin')).toBe(false);
    expect(isKnownScope('admin')).toBe(false);
  });

  it('every ALL_READ_SCOPES entry ends with :read', () => {
    for (const s of ALL_READ_SCOPES) {
      expect(s.endsWith(':read')).toBe(true);
    }
  });

  it('expands "read" to all *:read scopes', () => {
    const out = expandLegacyScopes(['read']);
    for (const s of ALL_READ_SCOPES) expect(out).toContain(s);
  });

  it('expands "write" to legacy-write scopes', () => {
    const out = expandLegacyScopes(['write']);
    for (const s of LEGACY_WRITE_SCOPES) expect(out).toContain(s);
  });

  it('expands "withdraw" to both withdrawal scopes', () => {
    const out = expandLegacyScopes(['withdraw']);
    expect(out).toContain('withdrawals:hot');
    expect(out).toContain('withdrawals:gas-tank');
  });

  it('passes through granular scopes unchanged', () => {
    expect(expandLegacyScopes(['wallets:create', 'webhooks:read'])).toEqual(
      expect.arrayContaining(['wallets:create', 'webhooks:read']),
    );
  });

  it('deduplicates the result', () => {
    const out = expandLegacyScopes(['read', 'wallets:read', 'read']);
    const occurrences = out.filter((s) => s === 'wallets:read').length;
    expect(occurrences).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(expandLegacyScopes([])).toEqual([]);
  });

  it('handles undefined input gracefully', () => {
    expect(expandLegacyScopes(undefined)).toEqual([]);
  });

  it('isGranularScope accepts granular scopes and rejects legacy aliases', () => {
    expect(isGranularScope('wallets:create')).toBe(true);
    expect(isGranularScope('forwarders:flush')).toBe(true);
    expect(isGranularScope('read')).toBe(false);
    expect(isGranularScope('write')).toBe(false);
    expect(isGranularScope('withdraw')).toBe(false);
    expect(isGranularScope('totally:bogus')).toBe(false);
  });

  it('LEGACY_WRITE_SCOPES includes forwarders:create', () => {
    expect(LEGACY_WRITE_SCOPES).toContain('forwarders:create');
  });
});
