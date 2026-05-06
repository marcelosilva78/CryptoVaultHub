import { deriveGasTankKeystore } from './keystore.helper';
import { Wallet, HDNodeWallet, Mnemonic } from 'ethers';

describe('deriveGasTankKeystore', () => {
  const mnemonic = 'test test test test test test test test test test test junk';

  it('produces a Web3 Secret Storage v3 JSON', async () => {
    const json = await deriveGasTankKeystore(mnemonic, 137, 'pw1234567');
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
    // ethers v6 uses capital "Crypto" key (Web3 Secret Storage v3 spec allows both cases)
    const cryptoBlock = parsed.crypto ?? parsed.Crypto;
    expect(cryptoBlock.cipher).toBe('aes-128-ctr');
  });

  it('round-trips: keystore decrypts back to the gas-tank private key', async () => {
    const json = await deriveGasTankKeystore(mnemonic, 137, 'pw1234567');
    const restored = await Wallet.fromEncryptedJson(json, 'pw1234567');
    const expected = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `m/44'/60'/1000'/137/0`);
    expect(restored.address).toBe(expected.address);
  });
});
