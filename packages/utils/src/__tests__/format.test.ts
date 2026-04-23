import { weiToHuman, humanToWei, shortenAddress, shortenTxHash } from '../format';

describe('weiToHuman', () => {
  it('converts 1 ETH (18 decimals)', () => {
    expect(weiToHuman('1000000000000000000', 18)).toBe('1.0');
  });

  it('converts 0 wei', () => {
    expect(weiToHuman('0', 18)).toBe('0.0');
  });

  it('converts fractional amounts', () => {
    expect(weiToHuman('500000000000000000', 18)).toBe('0.5');
  });

  it('converts with 6 decimals (USDC-like)', () => {
    expect(weiToHuman('1000000', 6)).toBe('1.0');
  });

  it('handles very large numbers', () => {
    // 1 billion tokens with 18 decimals
    expect(weiToHuman('1000000000000000000000000000', 18)).toBe('1000000000.0');
  });

  it('handles small fractional wei', () => {
    expect(weiToHuman('1', 18)).toBe('0.000000000000000001');
  });
});

describe('humanToWei', () => {
  it('converts 1.0 to wei (18 decimals)', () => {
    expect(humanToWei('1.0', 18)).toBe('1000000000000000000');
  });

  it('converts 0 to 0 wei', () => {
    expect(humanToWei('0', 18)).toBe('0');
  });

  it('converts fractional amount', () => {
    expect(humanToWei('0.5', 18)).toBe('500000000000000000');
  });

  it('converts with 6 decimals (USDC-like)', () => {
    expect(humanToWei('1.0', 6)).toBe('1000000');
  });

  it('handles very large numbers', () => {
    expect(humanToWei('1000000000', 18)).toBe('1000000000000000000000000000');
  });

  it('round-trips with weiToHuman', () => {
    const original = '123456789012345678';
    const human = weiToHuman(original, 18);
    expect(humanToWei(human, 18)).toBe(original);
  });
});

describe('shortenAddress', () => {
  const fullAddress = '0x1234567890abcdef1234567890abcdef12345678';

  it('shortens with default chars=4', () => {
    expect(shortenAddress(fullAddress)).toBe('0x1234...5678');
  });

  it('shortens with custom chars', () => {
    expect(shortenAddress(fullAddress, 6)).toBe('0x123456...345678');
  });

  it('handles short strings gracefully', () => {
    // No crash expected even for short input
    const result = shortenAddress('0xAB', 2);
    expect(typeof result).toBe('string');
  });

  it('handles empty string', () => {
    const result = shortenAddress('', 4);
    expect(typeof result).toBe('string');
  });
});

describe('shortenTxHash', () => {
  const fullHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('shortens with default chars=6', () => {
    expect(shortenTxHash(fullHash)).toBe('0xabcdef...567890');
  });

  it('shortens with custom chars', () => {
    expect(shortenTxHash(fullHash, 4)).toBe('0xabcd...7890');
  });
});
