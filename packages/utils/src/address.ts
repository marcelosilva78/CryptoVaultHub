import { ethers } from 'ethers';

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export function normalizeAddress(address: string): string {
  return ethers.getAddress(address);
}

export function toLowerAddress(address: string): string {
  return address.toLowerCase();
}

export function computeCreate2Address(
  factoryAddress: string,
  salt: string,
  initCodeHash: string,
): string {
  return ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
}

export function computeForwarderSalt(
  deployer: string,
  parentAddress: string,
  feeAddress: string,
  userSalt: string,
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'address', 'address', 'bytes32'],
      [deployer, parentAddress, feeAddress, userSalt],
    ),
  );
}

export function computeWalletSalt(deployer: string, signers: string[], userSalt: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'address[]', 'bytes32'],
      [deployer, signers, userSalt],
    ),
  );
}
