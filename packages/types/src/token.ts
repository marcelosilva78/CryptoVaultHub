export interface Token {
  id: number;
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  isNative: boolean;
  isDefault: boolean;
  isActive: boolean;
  coingeckoId: string | null;
}

export interface ClientToken {
  clientId: number;
  tokenId: number;
  isDepositEnabled: boolean;
  isWithdrawalEnabled: boolean;
  minDepositAmount: string;
  minWithdrawalAmount: string;
  withdrawalFee: string;
}
