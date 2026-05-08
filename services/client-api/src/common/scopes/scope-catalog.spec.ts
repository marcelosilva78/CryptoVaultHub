import {
  GRANULAR_SCOPES,
  expandLegacyScopes,
  ALL_READ_SCOPES,
  LEGACY_WRITE_SCOPES,
  LEGACY_WITHDRAW_SCOPES,
} from './scope-catalog';

describe('scope-catalog', () => {
  it('GRANULAR_SCOPES has 30 entries and no duplicates', () => {
    expect(GRANULAR_SCOPES.length).toBe(30);
    expect(new Set(GRANULAR_SCOPES).size).toBe(30);
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
});
