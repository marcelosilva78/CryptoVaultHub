import { ethers } from 'ethers';

export function weiToHuman(weiAmount: string, decimals: number): string {
  return ethers.formatUnits(weiAmount, decimals);
}

export function humanToWei(humanAmount: string, decimals: number): string {
  return ethers.parseUnits(humanAmount, decimals).toString();
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function shortenTxHash(hash: string, chars = 6): string {
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}
