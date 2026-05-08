/**
 * Validates an IPv4 address or CIDR block string for use in the API key
 * IP allowlist UI. Rejects multi-slash entries, invalid prefixes (>32 or
 * negative), and out-of-range octets.
 */
export function isValidIpOrCidr(value: string): boolean {
  if (!value) return false;
  const parts = value.split('/');
  if (parts.length > 2) return false;
  const [addr, prefixStr] = parts.length === 2 ? parts : [value, '32'];
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const octets = addr.split('.');
  if (octets.length !== 4) return false;
  for (const o of octets) {
    if (!/^\d+$/.test(o)) return false;
    const v = Number(o);
    if (v < 0 || v > 255) return false;
  }
  return true;
}
