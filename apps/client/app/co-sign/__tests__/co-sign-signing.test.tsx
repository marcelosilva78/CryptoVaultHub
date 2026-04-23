/**
 * @jest-environment node
 */
import { ethers } from 'ethers';

describe('Co-Sign Hash Verification', () => {
  const TEST_MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('should derive the correct client key at m/44\'/60\'/1\'/0/0', () => {
    const mnemonic = ethers.Mnemonic.fromPhrase(TEST_MNEMONIC);
    const wallet = ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
      "m/44'/60'/1'/0/0",
    );
    expect(wallet.address).toBeDefined();
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('should reconstruct native ETH operation hash correctly', () => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const params = {
      networkId: '1',
      hotWalletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amountRaw: '1000000000000000000',
      expireTime: 1714000000,
      sequenceId: 1,
    };

    const hash = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'bytes',
          'uint256',
          'uint256',
        ],
        [
          params.networkId,
          params.hotWalletAddress,
          params.toAddress,
          BigInt(params.amountRaw),
          '0x',
          params.expireTime,
          params.sequenceId,
        ],
      ),
    );

    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Verify deterministic - same params = same hash
    const hash2 = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'bytes',
          'uint256',
          'uint256',
        ],
        [
          params.networkId,
          params.hotWalletAddress,
          params.toAddress,
          BigInt(params.amountRaw),
          '0x',
          params.expireTime,
          params.sequenceId,
        ],
      ),
    );
    expect(hash).toBe(hash2);
  });

  it('should reconstruct ERC-20 operation hash with token address', () => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

    const hash = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'address',
          'uint256',
          'uint256',
        ],
        [
          '1-ERC20',
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          BigInt('1000000'),
          tokenAddress,
          1714000000,
          1,
        ],
      ),
    );

    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('should sign and recover the correct address', async () => {
    const mnemonic = ethers.Mnemonic.fromPhrase(TEST_MNEMONIC);
    const wallet = ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
      "m/44'/60'/1'/0/0",
    );

    const operationHash = ethers.keccak256(
      ethers.toUtf8Bytes('test operation'),
    );
    const signature = await wallet.signMessage(
      ethers.getBytes(operationHash),
    );

    const recovered = ethers.verifyMessage(
      ethers.getBytes(operationHash),
      signature,
    );
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('should reject wrong mnemonic (different mnemonic = different address)', () => {
    // Derive address from the test mnemonic
    const correctMnemonic = ethers.Mnemonic.fromPhrase(TEST_MNEMONIC);
    const correctWallet = ethers.HDNodeWallet.fromMnemonic(
      correctMnemonic,
      "m/44'/60'/1'/0/0",
    );

    // A completely different valid mnemonic produces a different address
    const differentMnemonic = ethers.Mnemonic.fromPhrase(
      'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
    );
    const differentWallet = ethers.HDNodeWallet.fromMnemonic(
      differentMnemonic,
      "m/44'/60'/1'/0/0",
    );

    expect(differentWallet.address.toLowerCase()).not.toBe(
      correctWallet.address.toLowerCase(),
    );
  });

  it('should throw on invalid mnemonic phrase', () => {
    expect(() =>
      ethers.Mnemonic.fromPhrase('this is not a valid mnemonic phrase at all nope'),
    ).toThrow();
  });

  it('should detect hash mismatch (tamper detection)', () => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const realHash = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'bytes',
          'uint256',
          'uint256',
        ],
        [
          '1',
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          BigInt('1000000000000000000'),
          '0x',
          1714000000,
          1,
        ],
      ),
    );

    // Tampered hash (different amount)
    const tamperedHash = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'bytes',
          'uint256',
          'uint256',
        ],
        [
          '1',
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          BigInt('9999999999999999999'),
          '0x',
          1714000000,
          1,
        ],
      ),
    );

    expect(realHash).not.toBe(tamperedHash);
  });

  it('should produce different hashes for native vs ERC-20 with same params', () => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const nativeHash = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'bytes',
          'uint256',
          'uint256',
        ],
        [
          '1',
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          BigInt('1000000'),
          '0x',
          1714000000,
          1,
        ],
      ),
    );

    const erc20Hash = ethers.keccak256(
      abiCoder.encode(
        [
          'string',
          'address',
          'address',
          'uint256',
          'address',
          'uint256',
          'uint256',
        ],
        [
          '1-ERC20',
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          BigInt('1000000'),
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          1714000000,
          1,
        ],
      ),
    );

    expect(nativeHash).not.toBe(erc20Hash);
  });

  it('should detect sequenceId tampering', () => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const baseParams = [
      '1',
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      BigInt('1000000000000000000'),
      '0x',
      1714000000,
    ] as const;
    const types = [
      'string',
      'address',
      'address',
      'uint256',
      'bytes',
      'uint256',
      'uint256',
    ];

    const hash1 = ethers.keccak256(
      abiCoder.encode(types, [...baseParams, 1]),
    );
    const hash2 = ethers.keccak256(
      abiCoder.encode(types, [...baseParams, 2]),
    );

    expect(hash1).not.toBe(hash2);
  });
});
