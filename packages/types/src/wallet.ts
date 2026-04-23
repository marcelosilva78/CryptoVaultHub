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

export type CustodyMode = 'full_custody' | 'co_sign' | 'client_initiated' | 'self_managed';
export type MonitoringMode = 'realtime' | 'polling' | 'hybrid';
export type KytLevel = 'off' | 'basic' | 'full';

export interface ProjectChain {
  id: number;
  projectId: number;
  chainId: number;
  walletFactoryAddress: string | null;
  forwarderFactoryAddress: string | null;
  walletImplAddress: string | null;
  forwarderImplAddress: string | null;
  hotWalletAddress: string | null;
  hotWalletSequenceId: number;
  deployStatus: 'pending' | 'deploying' | 'ready' | 'failed';
  deployStartedAt: string | null;
  deployCompletedAt: string | null;
  deployError: string | null;
  createdAt: string;
}

export interface DeployTrace {
  id: number;
  projectId: number;
  chainId: number;
  projectChainId: number;
  contractType: 'wallet_impl' | 'forwarder_impl' | 'wallet_factory' | 'forwarder_factory' | 'hot_wallet' | 'forwarder';
  contractAddress: string | null;
  txHash: string | null;
  blockNumber: number | null;
  blockHash: string | null;
  gasUsed: string | null;
  gasPrice: string | null;
  gasCostWei: string | null;
  deployerAddress: string;
  calldataHex: string | null;
  constructorArgsJson: Record<string, any> | null;
  signedTxHex: string | null;
  rpcRequestJson: Record<string, any> | null;
  rpcResponseJson: Record<string, any> | null;
  abiJson: any[] | null;
  bytecodeHash: string | null;
  verificationProofJson: {
    expectedBytecodeHash: string;
    actualBytecodeHash: string;
    match: boolean;
    verifiedAt: string;
  } | null;
  explorerUrl: string | null;
  status: 'pending' | 'broadcasting' | 'confirmed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface GasCheckResult {
  chainId: number;
  chainName: string;
  gasTankAddress: string;
  balanceWei: string;
  balanceFormatted: string;
  requiredWei: string;
  requiredFormatted: string;
  sufficient: boolean;
}

export interface ProjectSetupResult {
  projectId: number;
  name: string;
  chains: ProjectChain[];
  custodyMode: CustodyMode;
  status: 'created' | 'keys_generated' | 'deploying' | 'ready';
}

export interface CoSignOperationResponse {
  operationId: string;
  type: 'withdrawal';
  status: 'pending' | 'signed' | 'expired' | 'cancelled';
  chainId: number;
  chainName: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string;
  operationHash: string;
  hotWalletAddress: string;
  amountRaw: string;
  tokenContractAddress: string | null;
  expireTime: number;
  sequenceId: number;
  networkId: string;
  clientAddress: string;
  relatedWithdrawalId: string;
  expiresAt: string;
  createdAt: string;
}
