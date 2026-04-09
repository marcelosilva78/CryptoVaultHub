export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  traceId?: string;
}

export interface GenerateAddressRequest {
  externalId: string;
  label?: string;
}

export interface GenerateAddressResponse {
  address: string;
  chainId: number;
  externalId: string;
  label: string | null;
  status: 'active';
  supportedTokens: string[];
}

export interface WithdrawRequest {
  chainId: number;
  tokenSymbol: string;
  toAddressId: number;
  amount: string;
  idempotencyKey: string;
}

export interface WithdrawResponse {
  withdrawalId: number;
  status: string;
  estimatedGas: string;
}
