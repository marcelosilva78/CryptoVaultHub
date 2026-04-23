import { shortenAddress, formatUSD, formatNumber } from '../utils';

describe('shortenAddress', () => {
  it('should shorten a standard Ethereum address', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(shortenAddress(addr)).toBe('0x1234...5678');
  });

  it('should shorten with custom start and end', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(shortenAddress(addr, 10, 6)).toBe('0x12345678...345678');
  });

  it('should return short strings unmodified', () => {
    const short = '0x1234';
    expect(shortenAddress(short)).toBe('0x1234');
  });

  it('should handle an address that is exactly at the boundary', () => {
    // start=6, end=4, boundary = 6+4+3 = 13
    const addr = '0x1234567890abc'; // 15 chars, > 13
    expect(shortenAddress(addr)).toBe('0x1234...0abc');
  });
});

describe('formatUSD', () => {
  it('should format millions with M suffix', () => {
    expect(formatUSD(1_000_000)).toBe('$1.0M');
    expect(formatUSD(2_500_000)).toBe('$2.5M');
    expect(formatUSD(10_000_000)).toBe('$10.0M');
  });

  it('should format thousands with locale separator', () => {
    expect(formatUSD(1_000)).toBe('$1,000');
    expect(formatUSD(50_000)).toBe('$50,000');
    expect(formatUSD(999_999)).toBe('$999,999');
  });

  it('should format small amounts with 2 decimal places', () => {
    expect(formatUSD(0)).toBe('$0.00');
    expect(formatUSD(0.5)).toBe('$0.50');
    expect(formatUSD(99.99)).toBe('$99.99');
    expect(formatUSD(999.99)).toBe('$999.99');
  });

  it('should handle edge case at exactly 1000', () => {
    expect(formatUSD(1000)).toBe('$1,000');
  });

  it('should handle edge case just below 1000', () => {
    expect(formatUSD(999)).toBe('$999.00');
  });
});

describe('formatNumber', () => {
  it('should format with locale separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle small numbers', () => {
    expect(formatNumber(42)).toBe('42');
  });
});
