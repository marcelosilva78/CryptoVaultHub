import {
  isValidEvmAddress,
  normalizeAddress,
  toLowerAddress,
  computeCreate2Address,
  computeForwarderSalt,
  computeWalletSalt,
} from '../address';
import { ethers } from 'ethers';

describe('isValidEvmAddress', () => {
  it('returns true for a valid checksummed address', () => {
    expect(isValidEvmAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true);
  });

  it('returns true for a valid lowercase address', () => {
    expect(isValidEvmAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(true);
  });

  it('returns false for an invalid address', () => {
    expect(isValidEvmAddress('0xinvalid')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidEvmAddress('')).toBe(false);
  });

  it('returns false for a short hex string', () => {
    expect(isValidEvmAddress('0x1234')).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('returns checksummed address from lowercase', () => {
    const lower = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
    const result = normalizeAddress(lower);
    // ethers.getAddress returns EIP-55 checksum
    expect(result).toBe(ethers.getAddress(lower));
  });

  it('throws for an invalid address', () => {
    expect(() => normalizeAddress('0xinvalid')).toThrow();
  });
});

describe('toLowerAddress', () => {
  it('lowercases a checksummed address', () => {
    expect(toLowerAddress('0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045')).toBe(
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    );
  });

  it('keeps already lowercase address unchanged', () => {
    const addr = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
    expect(toLowerAddress(addr)).toBe(addr);
  });
});

describe('computeCreate2Address', () => {
  it('produces a valid 42-char hex address', () => {
    const factory = '0x0000000000000000000000000000000000000001';
    const salt = ethers.zeroPadValue('0x01', 32);
    const initCodeHash = ethers.keccak256('0x00');

    const result = computeCreate2Address(factory, salt, initCodeHash);
    expect(result).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('is deterministic (same inputs => same output)', () => {
    const factory = '0x0000000000000000000000000000000000000001';
    const salt = ethers.zeroPadValue('0x02', 32);
    const initCodeHash = ethers.keccak256('0xff');

    const a = computeCreate2Address(factory, salt, initCodeHash);
    const b = computeCreate2Address(factory, salt, initCodeHash);
    expect(a).toBe(b);
  });
});

describe('computeForwarderSalt', () => {
  const deployer = '0x0000000000000000000000000000000000000001';
  const parentAddress = '0x0000000000000000000000000000000000000002';
  const feeAddress = '0x0000000000000000000000000000000000000003';
  const userSalt = ethers.zeroPadValue('0x01', 32);

  it('returns a bytes32 hex string', () => {
    const result = computeForwarderSalt(deployer, parentAddress, feeAddress, userSalt);
    expect(result).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('is deterministic', () => {
    const a = computeForwarderSalt(deployer, parentAddress, feeAddress, userSalt);
    const b = computeForwarderSalt(deployer, parentAddress, feeAddress, userSalt);
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    const salt1 = computeForwarderSalt(deployer, parentAddress, feeAddress, userSalt);
    const salt2 = computeForwarderSalt(
      deployer,
      parentAddress,
      feeAddress,
      ethers.zeroPadValue('0x02', 32),
    );
    expect(salt1).not.toBe(salt2);
  });
});

describe('computeWalletSalt', () => {
  const deployer = '0x0000000000000000000000000000000000000001';
  const signers = [
    '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000003',
  ];
  const userSalt = ethers.zeroPadValue('0x01', 32);

  it('returns a bytes32 hex string', () => {
    const result = computeWalletSalt(deployer, signers, userSalt);
    expect(result).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('is deterministic', () => {
    const a = computeWalletSalt(deployer, signers, userSalt);
    const b = computeWalletSalt(deployer, signers, userSalt);
    expect(a).toBe(b);
  });

  it('produces different output for different signers', () => {
    const salt1 = computeWalletSalt(deployer, signers, userSalt);
    const salt2 = computeWalletSalt(
      deployer,
      ['0x0000000000000000000000000000000000000004'],
      userSalt,
    );
    expect(salt1).not.toBe(salt2);
  });
});
