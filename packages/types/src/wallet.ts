export interface Wallet {
  id: number;
  clientId: number;
  chainId: number;
  address: string;
  walletType: 'hot' | 'cold' | 'gas_tank';
  isActive: boolean;
  createdAt: Date;
}

export interface DepositAddress {
  id: number;
  clientId: number;
  chainId: number;
  walletId: number;
  address: string;
  externalId: string;
  label: string | null;
  isDeployed: boolean;
  salt: string;
  createdAt: Date;
}

export interface WhitelistedAddress {
  id: number;
  clientId: number;
  address: string;
  label: string;
  chainId: number;
  status: 'cooldown' | 'active' | 'disabled';
  cooldownEndsAt: Date | null;
  createdAt: Date;
}

export type CustodyMode = 'full_custody' | 'co_sign' | 'client_initiated';
export type MonitoringMode = 'realtime' | 'polling' | 'hybrid';
export type KytLevel = 'off' | 'basic' | 'full';
