/**
 * Pure helpers for matching a request IP against an allowlist that can mix
 * exact IPv4 addresses and CIDR blocks. IPv4 only.
 *
 * matchesAllowlist returns true when:
 *   - allowlist is empty / null / undefined (no restriction), OR
 *   - any entry of the allowlist matches the request IP.
 *
 * Entries that are syntactically invalid produce a `false` match for that
 * entry rather than throwing — the allowlist is best-effort and malformed
 * entries should never crash an authentication flow.
 */

const IPV4_MAPPED_PREFIX = '::ffff:';

function normalizeIp(ip: string): string {
  return ip.startsWith(IPV4_MAPPED_PREFIX)
    ? ip.slice(IPV4_MAPPED_PREFIX.length)
    : ip;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function entryMatches(ip: string, entry: string): boolean {
  const [addr, prefixStr] = entry.includes('/')
    ? entry.split('/')
    : [entry, '32'];
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const reqInt = ipToInt(ip);
  const entryInt = ipToInt(addr);
  if (reqInt === null || entryInt === null) return false;

  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (reqInt & mask) === (entryInt & mask);
}

export function matchesAllowlist(
  requestIp: string | undefined,
  allowlist: string[] | null | undefined,
): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  if (!requestIp) return false;
  const ip = normalizeIp(requestIp);
  return allowlist.some((entry) => entryMatches(ip, entry));
}

export function isValidIpOrCidr(value: string): boolean {
  if (!value) return false;
  const [addr, prefixStr] = value.includes('/') ? value.split('/') : [value, '32'];
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  return ipToInt(addr) !== null;
}
