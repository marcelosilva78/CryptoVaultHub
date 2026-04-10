import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  IsBoolean,
  IsInt,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * HIGH-4: Allowlist of valid webhook event types. Only these events
 * can be subscribed to. Prevents injection of arbitrary event names.
 */
export const VALID_WEBHOOK_EVENTS = [
  'deposit.detected',
  'deposit.confirmed',
  'deposit.swept',
  'withdrawal.submitted',
  'withdrawal.confirmed',
  'withdrawal.failed',
  'forwarder.deployed',
] as const;

export type WebhookEventType = (typeof VALID_WEBHOOK_EVENTS)[number];

export class CreateWebhookDto {
  @ApiProperty({
    description: `The HTTPS endpoint URL that will receive webhook event notifications via POST requests. The URL must be publicly accessible and respond with a 2xx status code within 10 seconds to be considered successful. HTTPS is required in production environments; HTTP is allowed only in development/staging.

**Requirements:**
- Must be a valid URL with HTTPS scheme (production)
- Must respond within 10 seconds
- Must return a 2xx status code to acknowledge receipt
- The endpoint should be idempotent — the same event may be delivered more than once in rare cases

**Retry policy:**
If your endpoint returns a non-2xx status code or times out, the delivery is retried up to 5 times with exponential backoff: 1s, 4s, 16s, 64s, 256s. After all retries are exhausted, the delivery is marked as \`failed\` and moved to the dead letter queue.`,
    example: 'https://myapp.com/webhooks/cryptovaulthub',
    type: String,
  })
  @IsUrl()
  url!: string;

  @ApiProperty({
    description: `Array of event types to subscribe to. Only events matching the specified types will be delivered to this webhook endpoint. Subscribe to \`*\` (wildcard) to receive all event types.

**Available event types:**
| Event | Description | Payload includes |
|-------|-------------|-----------------|
| \`deposit.detected\` | New deposit detected on-chain (unconfirmed) | deposit ID, address, amount, token, txHash |
| \`deposit.confirmed\` | Deposit reached required confirmations | deposit ID, confirmations, blockNumber |
| \`deposit.swept\` | Deposited funds swept to hot wallet | deposit ID, sweepTxHash, amount |
| \`withdrawal.submitted\` | Withdrawal transaction broadcasted | withdrawal ID, txHash, chain |
| \`withdrawal.confirmed\` | Withdrawal confirmed on-chain | withdrawal ID, confirmations, blockNumber |
| \`withdrawal.failed\` | Withdrawal failed on-chain | withdrawal ID, error reason |
| \`forwarder.deployed\` | New forwarder contract deployed | address, chain, deployTxHash |

**Example:** Subscribe to all deposit events: \`["deposit.detected", "deposit.confirmed", "deposit.swept"]\``,
    example: ['deposit.detected', 'deposit.confirmed', 'withdrawal.confirmed'],
    type: [String],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(VALID_WEBHOOK_EVENTS as unknown as string[], { each: true })
  events!: string[];

  @ApiPropertyOptional({
    description: 'Human-readable label for this webhook endpoint. Useful for distinguishing between multiple webhooks in the Client Portal dashboard. Labels do not need to be unique.',
    example: 'Production deposit notifications',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Whether this webhook endpoint is active and should receive events. Set to `false` to temporarily pause event delivery without deleting the webhook configuration. Defaults to `true` when creating a new webhook.',
    example: true,
    default: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWebhookDto {
  @ApiPropertyOptional({
    description: 'Updated HTTPS endpoint URL for webhook delivery. Changing the URL does not affect pending deliveries — they will still be sent to the original URL. Only new events will use the updated URL.',
    example: 'https://myapp.com/webhooks/v2/cryptovaulthub',
    type: String,
  })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({
    description: 'Updated list of event types to subscribe to. This replaces the entire event list — it is not additive. To add an event type, include all existing events plus the new one.',
    example: ['deposit.detected', 'deposit.confirmed', 'deposit.swept', 'withdrawal.confirmed'],
    type: [String],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(VALID_WEBHOOK_EVENTS as unknown as string[], { each: true })
  events?: string[];

  @ApiPropertyOptional({
    description: 'Updated human-readable label for this webhook endpoint.',
    example: 'Production all events',
    maxLength: 100,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Set to `false` to pause event delivery, or `true` to resume. Pausing does not affect pending retry attempts for previously queued deliveries.',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWebhooksQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination (1-indexed). Defaults to 1.',
    example: 1,
    minimum: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum number of webhooks to return per page. Defaults to 20.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  limit?: number = 20;
}

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination (1-indexed). Defaults to 1.',
    example: 1,
    minimum: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum number of delivery records to return per page. Defaults to 20.',
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
    description: `Filter deliveries by status.

**Delivery statuses:**
- \`pending\` — Queued for delivery, not yet attempted
- \`success\` — Delivered successfully (2xx response received)
- \`failed\` — All retry attempts exhausted without a successful delivery
- \`retrying\` — Previous attempt failed, queued for retry`,
    example: 'failed',
    enum: ['pending', 'success', 'failed', 'retrying'],
    type: String,
  })
  @IsOptional()
  @IsString()
  status?: string;
}
