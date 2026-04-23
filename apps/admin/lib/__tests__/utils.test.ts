import {
  formatCurrency,
  formatCompactNumber,
  formatNumber,
  formatPercent,
  shortenAddress,
  CHART_COLORS,
} from '../utils';

describe('formatCurrency', () => {
  it('should format billions with B suffix', () => {
    expect(formatCurrency(1_000_000_000)).toBe('$1.00B');
    expect(formatCurrency(2_500_000_000)).toBe('$2.50B');
  });

  it('should format millions with M suffix', () => {
    expect(formatCurrency(1_000_000)).toBe('$1.0M');
    expect(formatCurrency(5_500_000)).toBe('$5.5M');
  });

  it('should format thousands with K suffix', () => {
    expect(formatCurrency(1_000)).toBe('$1.0K');
    expect(formatCurrency(50_000)).toBe('$50.0K');
    expect(formatCurrency(999_999)).toBe('$1000.0K');
  });

  it('should format small amounts with 2 decimal places', () => {
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(0.5)).toBe('$0.50');
    expect(formatCurrency(99.99)).toBe('$99.99');
    expect(formatCurrency(999)).toBe('$999.00');
  });

  it('should handle edge case at exactly 1000', () => {
    expect(formatCurrency(1000)).toBe('$1.0K');
  });

  it('should handle edge case at exactly 1_000_000', () => {
    expect(formatCurrency(1_000_000)).toBe('$1.0M');
  });

  it('should handle edge case at exactly 1_000_000_000', () => {
    expect(formatCurrency(1_000_000_000)).toBe('$1.00B');
  });
});

describe('formatCompactNumber', () => {
  it('should format millions with M suffix (no $)', () => {
    expect(formatCompactNumber(1_000_000)).toBe('1.0M');
    expect(formatCompactNumber(2_500_000)).toBe('2.5M');
  });

  it('should format thousands with K suffix (no $)', () => {
    expect(formatCompactNumber(1_000)).toBe('1.0K');
    expect(formatCompactNumber(50_000)).toBe('50.0K');
  });

  it('should format small numbers with locale string', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(999)).toBe('999');
  });
});

describe('formatNumber', () => {
  it('should format with locale separators (Intl)', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('should format positive values with + prefix', () => {
    expect(formatPercent(5)).toBe('+5.0%');
    expect(formatPercent(12.34)).toBe('+12.3%');
  });

  it('should format negative values with - prefix', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%');
    expect(formatPercent(-0.5)).toBe('-0.5%');
  });

  it('should format zero with + prefix', () => {
    expect(formatPercent(0)).toBe('+0.0%');
  });
});

describe('shortenAddress', () => {
  it('should shorten with default chars=4', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(shortenAddress(addr)).toBe('0x1234...5678');
  });

  it('should shorten with custom chars', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(shortenAddress(addr, 6)).toBe('0x123456...345678');
  });
});

describe('CHART_COLORS', () => {
  it('should have 8 colors', () => {
    expect(CHART_COLORS).toHaveLength(8);
  });

  it('should all be valid hex colors', () => {
    CHART_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
