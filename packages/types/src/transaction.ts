export type DepositStatus = 'pending' | 'confirming' | 'confirmed' | 'swept' | 'reverted';
export type WithdrawalStatus =
  | 'pending_approval'
  | 'kyt_screening'
  | 'signing'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'rejected';

export interface Deposit {
  id: number;
  clientId: number;
  chainId: number;
  forwarderAddress: string;
  externalId: string;
  tokenId: number;
  amount: string;
  amountRaw: string;
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  status: DepositStatus;
  confirmations: number;
  confirmationsRequired: number;
  sweepTxHash: string | null;
  kytResult: 'clear' | 'hit' | 'possible_match' | null;
  detectedAt: Date;
  confirmedAt: Date | null;
  sweptAt: Date | null;
}

export interface Withdrawal {
  id: number;
  clientId: number;
  chainId: number;
  tokenId: number;
  fromWallet: string;
  toAddressId: number;
  toAddress: string;
  toLabel: string;
  amount: string;
  amountRaw: string;
  txHash: string | null;
  status: WithdrawalStatus;
  sequenceId: number | null;
  gasCost: string | null;
  kytResult: 'clear' | 'hit' | 'possible_match' | null;
  idempotencyKey: string;
  createdAt: Date;
  submittedAt: Date | null;
  confirmedAt: Date | null;
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
}
