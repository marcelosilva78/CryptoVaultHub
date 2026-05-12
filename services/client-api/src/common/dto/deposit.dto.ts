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
  @ApiProperty({
    description: `Idempotency / external reference. Unique string from your side that ties this deposit address to one of your business entities (customer ID, invoice ID, order ID). Required because the address is derived deterministically from this value via CREATE2.`,
    example: 'order-12345',
    maxLength: 64,
    type: String,
  })
  @IsString()
  @MaxLength(64)
  externalId!: string;

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

**Lifecycle (in order):** \`pending\` → \`detected\` → \`confirming\` → \`confirmed\` → \`swept\`. Terminal failure state: \`failed\`.

**Available statuses:**
- \`pending\` — Deposit row created by the indexer, waiting for the next confirmation cycle
- \`detected\` — Transfer event observed on-chain, awaiting block confirmations
- \`confirming\` — At least one but fewer than the required number of confirmations
- \`confirmed\` — Required confirmation threshold reached; sweep cron is now eligible to pick it up
- \`swept\` — Sweep tx confirmed on-chain; funds are in the parent hot wallet (this is the typical terminal state for completed deposits — the sweep cron usually executes within ~30s of confirmation, so most production rows are \`swept\` rather than \`confirmed\`)
- \`failed\` — Sweep transaction failed (e.g., insufficient gas in the gas tank, contract revert)`,
    example: 'swept',
    enum: ['pending', 'detected', 'confirming', 'confirmed', 'swept', 'failed'],
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
    description: `Filter deposits detected on or after this instant. Inclusive.

Accepts either a full ISO-8601 timestamp (\`2026-05-12T14:30:00Z\`) used verbatim, or a bare \`YYYY-MM-DD\` which is widened to start-of-day UTC (\`2026-05-12T00:00:00.000Z\`). Use with \`toDate\` to define a window.`,
    example: '2026-05-01',
    type: String,
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: `Filter deposits detected on or before this instant. Inclusive.

Accepts either a full ISO-8601 timestamp used verbatim, or a bare \`YYYY-MM-DD\` which is widened to end-of-day UTC (\`2026-05-12T23:59:59.999Z\`) so the example below returns every deposit on May 12, not just rows stamped at midnight.`,
    example: '2026-05-12',
    type: String,
  })
  @IsOptional()
  @IsString()
  toDate?: string;
}
