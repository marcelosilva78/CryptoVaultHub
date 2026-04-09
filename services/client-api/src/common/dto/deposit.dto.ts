import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateDepositAddressDto {
  @ApiPropertyOptional({
    description: `Human-readable label for identifying this deposit address. Useful for associating addresses with specific customers, orders, or purposes within your system. Labels are not unique — multiple addresses can share the same label.`,
    example: 'customer-12345',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: `URL that will receive a POST request when a deposit is detected at this address. The callback payload includes the deposit ID, amount, token, confirmations count, and current status. The callback URL must be HTTPS in production. Callbacks are retried up to 5 times with exponential backoff (1s, 4s, 16s, 64s, 256s) if your server returns a non-2xx status code.`,
    example: 'https://myapp.com/webhooks/deposits',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  callbackUrl?: string;
}

export class BatchDepositAddressDto {
  @ApiProperty({
    description: `Number of deposit addresses to generate in a single batch operation. Each address is deterministically derived using CREATE2 with a unique salt, ensuring no duplicates. The batch operation is atomic — either all addresses are generated successfully, or none are. Larger batches take proportionally longer to compute. Batch requests count as N individual requests against your rate limit.`,
    example: 10,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @ApiPropertyOptional({
    description: `Prefix for auto-generated labels on each address in the batch. Labels are generated in the format \`{labelPrefix}-{index}\` where index starts at 1. For example, a prefix of \`"user-deposit"\` with count=3 generates labels: \`"user-deposit-1"\`, \`"user-deposit-2"\`, \`"user-deposit-3"\`. If omitted, addresses are created without labels.`,
    example: 'user-deposit',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelPrefix?: string;
}

export class ListDepositsQueryDto {
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
    description: 'Maximum number of deposits to return per page. Must be between 1 and 100. Defaults to 20 if not specified. Larger page sizes may increase response time for clients with many deposits.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: `Filter deposits by status. Only deposits matching the specified status are returned.

**Available statuses:**
- \`pending\` — Deposit detected on-chain but has not yet reached the required number of confirmations
- \`confirmed\` — Deposit has reached the required confirmation threshold and is considered final
- \`swept\` — Confirmed deposit has been swept (forwarded) from the deposit address to the parent hot wallet
- \`failed\` — Sweep transaction failed (e.g., insufficient gas in gas tank)`,
    example: 'confirmed',
    enum: ['pending', 'confirmed', 'swept', 'failed'],
    type: String,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: `Filter deposits by chain ID. Only deposits on the specified blockchain network are returned.

**Supported chain IDs:**
- \`1\` — Ethereum Mainnet
- \`56\` — BNB Smart Chain
- \`137\` — Polygon
- \`42161\` — Arbitrum One
- \`10\` — Optimism
- \`43114\` — Avalanche C-Chain
- \`8453\` — Base`,
    example: '1',
    type: String,
  })
  @IsOptional()
  @IsString()
  chainId?: string;

  @ApiPropertyOptional({
    description: 'Filter deposits created on or after this date. ISO 8601 format. Inclusive. Use in combination with `toDate` to define a date range.',
    example: '2026-01-01T00:00:00Z',
    type: String,
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter deposits created on or before this date. ISO 8601 format. Inclusive. Use in combination with `fromDate` to define a date range.',
    example: '2026-12-31T23:59:59Z',
    type: String,
  })
  @IsOptional()
  @IsString()
  toDate?: string;
}
