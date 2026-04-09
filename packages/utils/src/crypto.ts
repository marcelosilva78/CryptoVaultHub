import { ethers } from 'ethers';

export function keccak256(data: string): string {
  return ethers.keccak256(data);
}

export function hashMessage(message: string): string {
  return ethers.hashMessage(message);
}

export function generateRandomBytes32(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export function recoverAddress(digest: string, signature: string): string {
  return ethers.recoverAddress(digest, signature);
}
