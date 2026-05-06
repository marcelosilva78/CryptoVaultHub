import { HDNodeWallet, Mnemonic, Wallet } from 'ethers';

const derivationPath = (chainId: number) => `m/44'/60'/1000'/${chainId}/0`;

export async function deriveGasTankKeystore(
  mnemonic: string,
  chainId: number,
  password: string,
): Promise<string> {
  const hd = HDNodeWallet.fromMnemonic(
    Mnemonic.fromPhrase(mnemonic.trim()),
    derivationPath(chainId),
  );
  const wallet = new Wallet(hd.privateKey);
  const json = await wallet.encrypt(password);
  return json;
}
