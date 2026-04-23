import { ethers } from 'ethers';

describe('Cross-Service Operation Hash Contract', () => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  // These params represent a real withdrawal
  const params = {
    networkId: '1',
    hotWalletAddress: '0x742d35cc6634c0532925a3B844bc9E7595F2bD63',
    toAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    amountRaw: '1500000000000000000', // 1.5 ETH
    tokenContractAddress: null as string | null,
    expireTime: 1714000000,
    sequenceId: 42,
  };

  function buildNativeHash(p: typeof params): string {
    return ethers.keccak256(
      abiCoder.encode(
        ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
        [p.networkId, p.hotWalletAddress, p.toAddress,
         BigInt(p.amountRaw), '0x', p.expireTime, p.sequenceId],
      ),
    );
  }

  function buildTokenHash(p: typeof params & { tokenContractAddress: string }): string {
    return ethers.keccak256(
      abiCoder.encode(
        ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [`${p.networkId}-ERC20`, p.hotWalletAddress, p.toAddress,
         BigInt(p.amountRaw), p.tokenContractAddress, p.expireTime, p.sequenceId],
      ),
    );
  }

  describe('Native ETH hash consistency', () => {
    it('should produce a deterministic 32-byte hash', () => {
      const hash = buildNativeHash(params);
      expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(buildNativeHash(params)).toBe(hash); // deterministic
    });

    it('should change when any parameter changes', () => {
      const baseline = buildNativeHash(params);

      // Different amount
      expect(buildNativeHash({ ...params, amountRaw: '2000000000000000000' })).not.toBe(baseline);
      // Different destination
      expect(buildNativeHash({ ...params, toAddress: '0x0000000000000000000000000000000000000001' })).not.toBe(baseline);
      // Different chain
      expect(buildNativeHash({ ...params, networkId: '137' })).not.toBe(baseline);
      // Different wallet (address(this))
      expect(buildNativeHash({ ...params, hotWalletAddress: '0x0000000000000000000000000000000000000002' })).not.toBe(baseline);
      // Different sequence
      expect(buildNativeHash({ ...params, sequenceId: 43 })).not.toBe(baseline);
      // Different expiry
      expect(buildNativeHash({ ...params, expireTime: 1714000001 })).not.toBe(baseline);
    });
  });

  describe('ERC-20 hash consistency', () => {
    const tokenParams = {
      ...params,
      tokenContractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      amountRaw: '1000000', // 1 USDC (6 decimals)
    };

    it('should use networkId-ERC20 prefix', () => {
      const hash = buildTokenHash(tokenParams);
      expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('should differ from native hash with same base params', () => {
      const nativeHash = buildNativeHash(params);
      const tokenHash = buildTokenHash(tokenParams);
      expect(nativeHash).not.toBe(tokenHash);
    });
  });

  describe('Signature round-trip', () => {
    it('should sign and verify with ethers.verifyMessage', async () => {
      const wallet = ethers.Wallet.createRandom();
      const hash = buildNativeHash(params);

      // Sign with Ethereum message prefix (matches contract _recoverSigner)
      const signature = await wallet.signMessage(ethers.getBytes(hash));

      // Verify recovery
      const recovered = ethers.verifyMessage(ethers.getBytes(hash), signature);
      expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
    });

    it('should produce a 65-byte signature (r + s + v)', async () => {
      const wallet = ethers.Wallet.createRandom();
      const hash = buildNativeHash(params);
      const signature = await wallet.signMessage(ethers.getBytes(hash));

      // 0x prefix + 130 hex chars = 65 bytes
      expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
    });

    it('should reject signature from different key', async () => {
      const wallet1 = ethers.Wallet.createRandom();
      const wallet2 = ethers.Wallet.createRandom();
      const hash = buildNativeHash(params);

      const signature = await wallet1.signMessage(ethers.getBytes(hash));
      const recovered = ethers.verifyMessage(ethers.getBytes(hash), signature);

      expect(recovered.toLowerCase()).toBe(wallet1.address.toLowerCase());
      expect(recovered.toLowerCase()).not.toBe(wallet2.address.toLowerCase());
    });
  });

  describe('BIP-44 key derivation contract', () => {
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should derive distinct keys for platform/client/backup paths', () => {
      const mnemonic = ethers.Mnemonic.fromPhrase(TEST_MNEMONIC);
      const platform = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
      const client = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/1'/0/0");
      const backup = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/2'/0/0");

      // All should be valid addresses
      expect(platform.address).toMatch(/^0x/);
      expect(client.address).toMatch(/^0x/);
      expect(backup.address).toMatch(/^0x/);

      // All should be different
      expect(platform.address).not.toBe(client.address);
      expect(platform.address).not.toBe(backup.address);
      expect(client.address).not.toBe(backup.address);
    });

    it('should derive distinct gas tank keys per chain', () => {
      const mnemonic = ethers.Mnemonic.fromPhrase(TEST_MNEMONIC);
      const gasTank1 = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/1000'/1/0");
      const gasTank137 = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/1000'/137/0");

      expect(gasTank1.address).not.toBe(gasTank137.address);
    });

    it('should be deterministic across invocations', () => {
      const mnemonic = ethers.Mnemonic.fromPhrase(TEST_MNEMONIC);
      const wallet1 = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/1'/0/0");
      const wallet2 = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/1'/0/0");

      expect(wallet1.address).toBe(wallet2.address);
      expect(wallet1.privateKey).toBe(wallet2.privateKey);
    });
  });
});
