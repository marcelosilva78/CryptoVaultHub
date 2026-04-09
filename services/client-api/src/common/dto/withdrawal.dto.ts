import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsUrl,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWithdrawalDto {
  @ApiProperty({
    description: `The chain ID of the blockchain network to execute the withdrawal on. The withdrawal will be sent from the client's hot wallet on this specific chain. Ensure sufficient native token balance exists on this chain to cover gas fees.

**Supported chain IDs:**
| Chain | Chain ID | Native Token | Avg Confirmation Time |
|-------|----------|-------------|----------------------|
| Ethereum | 1 | ETH | ~12 seconds |
| BSC | 56 | BNB | ~3 seconds |
| Polygon | 137 | MATIC | ~2 seconds |
| Arbitrum | 42161 | ETH | ~1 second |
| Optimism | 10 | ETH | ~2 seconds |
| Avalanche | 43114 | AVAX | ~2 seconds |
| Base | 8453 | ETH | ~2 seconds |`,
    example: 1,
    type: Number,
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description: `Symbol of the token to withdraw. For native currency, use the chain's native token symbol (ETH, BNB, MATIC, AVAX). For ERC-20 tokens, use the standard token symbol (USDT, USDC, WBTC, DAI, etc.). The token must be supported on the specified chain. Use the \`GET /client/v1/tokens\` endpoint to retrieve the full list of supported tokens per chain.`,
    example: 'ETH',
    type: String,
  })
  @IsString()
  tokenSymbol!: string;

  @ApiProperty({
    description: `The destination address for the withdrawal. Must be a valid EVM address (0x-prefixed, 40 hex characters). **This address must be whitelisted in the client's address book** — withdrawals to non-whitelisted addresses will be rejected with a 422 error. Newly whitelisted addresses are subject to a 24-hour cooldown period before they can receive withdrawals.`,
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
    pattern: '^0x[0-9a-fA-F]{40}$',
    type: String,
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'toAddress must be a valid Ethereum address',
  })
  toAddress!: string;

  @ApiProperty({
    description: `The amount to withdraw, expressed as a decimal string in the token's standard unit (not wei/smallest unit). The system automatically converts to the correct on-chain representation based on the token's decimals.

**Examples by token:**
- ETH (18 decimals): \`"1.5"\` = 1.5 ETH = 1500000000000000000 wei
- USDT (6 decimals): \`"100.50"\` = 100.50 USDT = 100500000 smallest unit
- WBTC (8 decimals): \`"0.001"\` = 0.001 WBTC = 100000 satoshis

**Constraints:**
- Must be a positive numeric string
- Maximum precision is determined by the token's decimal places
- Must not exceed the wallet's available balance
- Must not exceed the client's daily withdrawal limit for this chain`,
    example: '1.5',
    pattern: '^\\d+(\\.\\d+)?$',
    type: String,
  })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'amount must be a valid numeric string',
  })
  amount!: string;

  @ApiPropertyOptional({
    description: 'Optional memo or note to attach to this withdrawal. Stored internally for record-keeping and audit purposes. Visible in the Client Portal and included in webhook notifications. Does not appear on-chain.',
    example: 'Monthly settlement #42',
    maxLength: 255,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;

  @ApiPropertyOptional({
    description: `A unique idempotency key to prevent duplicate withdrawal submissions. If a withdrawal with the same idempotency key already exists for this client, the existing withdrawal is returned instead of creating a new one (HTTP 200, not 201). This is essential for safely retrying failed requests without risking double-spending.

**Best practices:**
- Use a deterministic key derived from your business logic (e.g., \`"settlement-2026-04-09-001"\`)
- Keys are scoped per client — different clients can use the same key
- Keys are valid for 30 days after creation
- Maximum length: 100 characters`,
    example: 'withdrawal-2026-04-09-001',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: `URL that will receive a POST notification when this specific withdrawal changes status. This is in addition to any global webhooks configured for the client. The callback receives the full withdrawal object including the updated status, transaction hash (once broadcasted), and confirmation count. HTTPS required in production. Retried up to 5 times with exponential backoff.`,
    example: 'https://myapp.com/webhooks/withdrawal',
    type: String,
  })
  @IsOptional()
  @IsUrl({}, { message: 'callbackUrl must be a valid URL' })
  callbackUrl?: string;
}

export class ListWithdrawalsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination (1-indexed). Defaults to 1 if not specified.',
    example: 1,
    minimum: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum number of withdrawals to return per page. Must be between 1 and 100. Defaults to 20.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: `Filter withdrawals by status.

**Withdrawal status lifecycle:**
- \`pending_approval\` — Request created, pending internal approval or KYT screening
- \`pending_kyt\` — Sanctions/KYT screening in progress via Chainalysis or equivalent
- \`pending_signing\` — Approved, awaiting cryptographic signature from the Key Vault Service
- \`pending_cosign\` — Awaiting co-signature from the client (co-sign custody mode only)
- \`pending_broadcast\` — Signed, queued for broadcast to the blockchain network
- \`broadcasted\` — Transaction submitted to the network, awaiting inclusion in a block
- \`confirming\` — Included in a block, waiting for the required number of confirmations
- \`confirmed\` — Transaction confirmed on-chain with sufficient confirmations. Terminal success state.
- \`failed\` — Transaction failed on-chain (reverted, out of gas, etc.). Terminal failure state.
- \`rejected\` — Rejected by KYT screening, compliance rules, or manual review. Terminal failure state.`,
    example: 'confirmed',
    enum: [
      'pending_approval',
      'pending_kyt',
      'pending_signing',
      'pending_cosign',
      'pending_broadcast',
      'broadcasted',
      'confirming',
      'confirmed',
      'failed',
      'rejected',
    ],
    type: String,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: `Filter withdrawals by chain ID. See \`chainId\` on CreateWithdrawalDto for supported values.`,
    example: '1',
    type: String,
  })
  @IsOptional()
  @IsString()
  chainId?: string;

  @ApiPropertyOptional({
    description: 'Filter withdrawals created on or after this date. ISO 8601 format.',
    example: '2026-01-01T00:00:00Z',
    type: String,
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter withdrawals created on or before this date. ISO 8601 format.',
    example: '2026-12-31T23:59:59Z',
    type: String,
  })
  @IsOptional()
  @IsString()
  toDate?: string;
}
