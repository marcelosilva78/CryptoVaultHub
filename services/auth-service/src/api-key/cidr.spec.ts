import { matchesAllowlist } from './cidr';

describe('matchesAllowlist', () => {
  it('returns true when allowlist is empty (no restriction)', () => {
    expect(matchesAllowlist('1.2.3.4', [])).toBe(true);
    expect(matchesAllowlist('1.2.3.4', null)).toBe(true);
    expect(matchesAllowlist('1.2.3.4', undefined)).toBe(true);
  });

  it('matches an exact IP entry', () => {
    expect(matchesAllowlist('203.0.113.4', ['203.0.113.4'])).toBe(true);
    expect(matchesAllowlist('203.0.113.5', ['203.0.113.4'])).toBe(false);
  });

  it('matches an IP inside a CIDR block', () => {
    expect(matchesAllowlist('203.0.113.42', ['203.0.113.0/24'])).toBe(true);
    expect(matchesAllowlist('203.0.114.1', ['203.0.113.0/24'])).toBe(false);
  });

  it('treats a single IP as /32', () => {
    expect(matchesAllowlist('10.0.0.1', ['10.0.0.1/32'])).toBe(true);
    expect(matchesAllowlist('10.0.0.2', ['10.0.0.1/32'])).toBe(false);
  });

  it('matches when any one entry of a multi-entry allowlist matches', () => {
    expect(
      matchesAllowlist('192.168.1.5', ['10.0.0.0/8', '192.168.0.0/16']),
    ).toBe(true);
  });

  it('returns false for malformed entries instead of throwing', () => {
    expect(matchesAllowlist('1.2.3.4', ['not-an-ip'])).toBe(false);
    expect(matchesAllowlist('1.2.3.4', ['1.2.3.0/33'])).toBe(false);
  });

  it('returns false when requestIp is missing', () => {
    expect(matchesAllowlist(undefined, ['1.2.3.0/24'])).toBe(false);
    expect(matchesAllowlist('', ['1.2.3.0/24'])).toBe(false);
  });

  it('strips IPv6-mapped IPv4 prefix from requestIp', () => {
    expect(matchesAllowlist('::ffff:203.0.113.4', ['203.0.113.0/24'])).toBe(
      true,
    );
  });
});
