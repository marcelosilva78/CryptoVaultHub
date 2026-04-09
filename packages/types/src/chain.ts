export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: { symbol: string; decimals: number };
  rpcEndpoints: RpcEndpoint[];
  blockTimeSeconds: number;
  confirmationsDefault: number;
  contracts: ChainContracts;
  explorerUrl: string | null;
  gasPriceStrategy: 'eip1559' | 'legacy';
  isActive: boolean;
  isTestnet: boolean;
}

export interface RpcEndpoint {
  url: string;
  apiKey?: string;
  type: 'http' | 'ws';
  priority: number;
}

export interface ChainContracts {
  walletFactoryAddress: string | null;
  forwarderFactoryAddress: string | null;
  walletImplementationAddress: string | null;
  forwarderImplementationAddress: string | null;
  multicall3Address: string;
}

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export enum ChainId {
  ETHEREUM = 1,
  BSC = 56,
  POLYGON = 137,
  ARBITRUM = 42161,
  OPTIMISM = 10,
  AVALANCHE = 43114,
  BASE = 8453,
}
