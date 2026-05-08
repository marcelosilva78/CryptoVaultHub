import { explorerTxUrl } from './explorer';

describe('explorerTxUrl', () => {
  const tx = '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd';

  it('resolves BSC to bscscan.com', () => {
    expect(explorerTxUrl(56, tx)).toBe(`https://bscscan.com/tx/${tx}`);
  });

  it('resolves Ethereum to etherscan.io', () => {
    expect(explorerTxUrl(1, tx)).toBe(`https://etherscan.io/tx/${tx}`);
  });

  it('resolves Polygon to polygonscan.com', () => {
    expect(explorerTxUrl(137, tx)).toBe(`https://polygonscan.com/tx/${tx}`);
  });

  it('resolves Arbitrum to arbiscan.io', () => {
    expect(explorerTxUrl(42161, tx)).toBe(`https://arbiscan.io/tx/${tx}`);
  });

  it('uses the provided fallback for unknown chains', () => {
    expect(
      explorerTxUrl(999, tx, 'https://custom.example.com'),
    ).toBe(`https://custom.example.com/tx/${tx}`);
  });

  it('returns null for unknown chain without a fallback', () => {
    expect(explorerTxUrl(999, tx)).toBeNull();
  });
});
