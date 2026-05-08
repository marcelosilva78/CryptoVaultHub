const EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  43114: 'https://snowtrace.io',
};

export function explorerTxUrl(
  chainId: number,
  txHash: string,
  fallbackBase?: string,
): string | null {
  const base = EXPLORERS[chainId] ?? fallbackBase ?? null;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/tx/${txHash}`;
}
