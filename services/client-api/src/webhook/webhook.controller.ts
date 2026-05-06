import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ClientAuth, CurrentClientId } from '../common/decorators';
import { WebhookService } from './webhook.service';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  ListWebhooksQueryDto,
  ListDeliveriesQueryDto,
} from '../common/dto/webhook.dto';

@ApiTags('Webhooks')
@ApiSecurity('ApiKey')
@Controller('client/v1/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Create a webhook endpoint',
    description: `Registers a new webhook endpoint to receive real-time event notifications. When events occur (deposits, withdrawals, forwarder deployments, gas tank low-balance alerts), the system sends signed HTTP POST requests to the configured URL.

**Webhook Security:**
Each webhook is assigned a unique secret upon creation. This secret is used to generate an HMAC-SHA256 signature included in the \`X-CVH-Signature\` header of every delivery. Always verify this signature before processing webhook payloads.

**Signature verification example:**
\`\`\`javascript
const crypto = require('crypto');
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
if (expectedSignature !== req.headers['x-cvh-signature']) {
  throw new Error('Invalid webhook signature');
}
\`\`\`

**Delivery guarantee:**
- At-least-once delivery — events may be delivered more than once in rare cases
- Your endpoint should be idempotent (use the \`eventId\` field to deduplicate)
- Deliveries are retried up to 5 times with exponential backoff: 1s, 4s, 16s, 64s, 256s
- After all retries are exhausted, the delivery is marked as \`failed\` and is accessible via the deliveries endpoint
- Failed deliveries can be manually retried via the retry endpoint

**Limits:**
- Maximum 10 webhook endpoints per client
- Each endpoint can subscribe to any combination of event types

**Required scope:** \`write\``,
  })
  @ApiBody({
    type: CreateWebhookDto,
    examples: {
      all_deposits: {
        summary: 'Subscribe to all deposit events',
        description: 'Receive notifications for all deposit lifecycle events',
        value: {
          url: 'https://myapp.com/webhooks/deposits',
          events: ['deposit.detected', 'deposit.confirmed', 'deposit.swept'],
          label: 'Deposit notifications',
        },
      },
      all_events: {
        summary: 'Subscribe to all events',
        description: 'Receive all event types at a single endpoint',
        value: {
          url: 'https://myapp.com/webhooks/all',
          events: [
            'deposit.detected',
            'deposit.confirmed',
            'deposit.swept',
            'forwarder.deployed',
            'gas_tank.low_balance',
            'withdrawal.submitted',
            'withdrawal.confirmed',
            'withdrawal.failed',
          ],
          label: 'All events',
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Webhook endpoint created successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        webhook: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'wh_01HX4N8B2K3M5P7Q9R1S', description: 'Unique webhook identifier' },
            url: { type: 'string', example: 'https://myapp.com/webhooks/deposits' },
            events: { type: 'array', items: { type: 'string' }, example: ['deposit.detected', 'deposit.confirmed'] },
            label: { type: 'string', example: 'Deposit notifications', nullable: true },
            secret: { type: 'string', example: 'whsec_abc123def456...', description: 'Webhook signing secret. Store this securely — it is only shown once at creation time.' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body or unsupported event type.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 422, description: 'Maximum webhook limit (10) reached for this client.' })
  async createWebhook(@Body() dto: CreateWebhookDto, @CurrentClientId() clientId: number) {
    const result = await this.webhookService.createWebhook(clientId, dto);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List webhook endpoints',
    description: `Returns a paginated list of all webhook endpoints configured for the authenticated client. The webhook secret is NOT included in list responses for security — it is only returned once at creation time.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhooks retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        webhooks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'wh_01HX4N8B2K3M5P7Q9R1S' },
              url: { type: 'string', example: 'https://myapp.com/webhooks/deposits' },
              events: { type: 'array', items: { type: 'string' }, example: ['deposit.detected', 'deposit.confirmed'] },
              label: { type: 'string', example: 'Deposit notifications', nullable: true },
              isActive: { type: 'boolean', example: true },
              lastDeliveryAt: { type: 'string', format: 'date-time', example: '2026-04-09T09:55:00Z', nullable: true },
              lastDeliveryStatus: { type: 'string', example: 'success', enum: ['success', 'failed'], nullable: true },
              createdAt: { type: 'string', format: 'date-time', example: '2026-04-01T10:00:00Z' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 3 },
            totalPages: { type: 'integer', example: 1 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listWebhooks(
    @Query() query: ListWebhooksQueryDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.webhookService.listWebhooks(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { success: true, ...result };
  }

  @Patch(':id')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Update a webhook endpoint',
    description: `Updates an existing webhook endpoint's configuration. All fields are optional — only the provided fields are updated. Omitted fields retain their current values.

**Important:**
- Changing the URL does not affect deliveries already in the retry queue — they will still be sent to the original URL
- Changing the event list takes effect immediately for new events
- Setting \`isActive\` to \`false\` pauses all new deliveries but does not cancel pending retries
- The webhook secret cannot be changed — delete and recreate the webhook if you need a new secret

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique webhook identifier',
    example: 'wh_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiBody({
    type: UpdateWebhookDto,
    examples: {
      update_url: {
        summary: 'Update webhook URL',
        value: { url: 'https://myapp.com/webhooks/v2/deposits' },
      },
      pause_webhook: {
        summary: 'Pause webhook',
        value: { isActive: false },
      },
      add_events: {
        summary: 'Update subscribed events',
        value: { events: ['deposit.detected', 'deposit.confirmed', 'deposit.swept', 'withdrawal.confirmed'] },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook updated successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        webhook: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'wh_01HX4N8B2K3M5P7Q9R1S' },
            url: { type: 'string', example: 'https://myapp.com/webhooks/v2/deposits' },
            events: { type: 'array', items: { type: 'string' } },
            label: { type: 'string', nullable: true },
            isActive: { type: 'boolean', example: true },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Webhook not found or does not belong to the authenticated client.' })
  async updateWebhook(
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.webhookService.updateWebhook(clientId, id, dto);
    return { success: true, ...result };
  }

  @Delete(':id')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Delete a webhook endpoint',
    description: `Permanently deletes a webhook endpoint. All pending deliveries for this webhook are cancelled. This action cannot be undone.

**After deletion:**
- No new events will be delivered to this endpoint
- Pending retry attempts are cancelled
- Delivery history is retained for 30 days and accessible via audit logs
- The webhook secret is invalidated immediately

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique webhook identifier to delete',
    example: 'wh_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook deleted successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Webhook deleted' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Webhook not found or does not belong to the authenticated client.' })
  async deleteWebhook(@Param('id') id: string, @CurrentClientId() clientId: number) {
    await this.webhookService.deleteWebhook(clientId, id);
    return { success: true, message: 'Webhook deleted' };
  }

  @Post(':id/test')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a test webhook',
    description: `Sends a test event payload to the specified webhook endpoint to verify connectivity and signature validation. The test event has a unique \`eventType\` of \`test.ping\` and contains dummy data.

**Test payload structure:**
\`\`\`json
{
  "eventId": "evt_test_...",
  "eventType": "test.ping",
  "timestamp": "2026-04-09T10:00:00Z",
  "data": {
    "message": "This is a test webhook delivery"
  }
}
\`\`\`

The response includes the HTTP status code and response time from your endpoint. Use this to:
- Verify your endpoint is reachable from the CryptoVaultHub infrastructure
- Test your HMAC signature verification implementation
- Validate your event parsing logic

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique webhook identifier to test',
    example: 'wh_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Test webhook sent successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        delivery: {
          type: 'object',
          properties: {
            deliveryId: { type: 'string', example: 'dlv_01HX...' },
            statusCode: { type: 'integer', example: 200, description: 'HTTP status code returned by your endpoint' },
            responseTimeMs: { type: 'integer', example: 145, description: 'Response time in milliseconds' },
            status: { type: 'string', example: 'success', enum: ['success', 'failed'] },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Webhook not found or does not belong to the authenticated client.' })
  async testWebhook(@Param('id') id: string, @CurrentClientId() clientId: number) {
    const result = await this.webhookService.testWebhook(clientId, id);
    return { success: true, ...result };
  }

  @Get(':id/deliveries')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List webhook deliveries',
    description: `Returns a paginated list of delivery attempts for a specific webhook endpoint. Each delivery record includes the event payload, HTTP response status code, response time, number of attempts, and current status.

**Delivery statuses:**
- \`pending\` — Queued for delivery, not yet attempted
- \`success\` — Delivered successfully (endpoint returned a 2xx status code)
- \`retrying\` — Previous attempt failed, queued for automatic retry
- \`failed\` — All retry attempts exhausted without a successful delivery

**Retention:** Delivery records are retained for 30 days.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique webhook identifier',
    example: 'wh_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook deliveries retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deliveries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'dlv_01HX...' },
              eventType: { type: 'string', example: 'deposit.confirmed' },
              eventId: { type: 'string', example: 'evt_01HX...' },
              status: { type: 'string', example: 'success', enum: ['pending', 'success', 'retrying', 'failed'] },
              statusCode: { type: 'integer', example: 200, nullable: true },
              responseTimeMs: { type: 'integer', example: 145, nullable: true },
              attempts: { type: 'integer', example: 1, description: 'Number of delivery attempts made' },
              maxAttempts: { type: 'integer', example: 5 },
              nextRetryAt: { type: 'string', format: 'date-time', nullable: true, description: 'Next scheduled retry time (null if not retrying)' },
              payload: { type: 'object', description: 'The event payload that was delivered' },
              createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
              deliveredAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:01Z', nullable: true },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 45 },
            totalPages: { type: 'integer', example: 3 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'Webhook not found or does not belong to the authenticated client.' })
  async listDeliveries(
    @Param('id') id: string,
    @Query() query: ListDeliveriesQueryDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.webhookService.listDeliveries(clientId, id, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
    return { success: true, ...result };
  }

  @Post('deliveries/:id/retry')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry a failed delivery',
    description: `Manually retries a failed webhook delivery. This immediately re-sends the original event payload to the webhook endpoint, regardless of the delivery's current retry count. Useful for retrying deliveries after fixing issues with your endpoint.

**Constraints:**
- Only deliveries with status \`failed\` can be retried
- The original event payload is re-sent as-is (not regenerated)
- A new \`X-CVH-Signature\` is generated for the retry attempt
- The retry is attempted immediately and the result is returned synchronously
- Manual retries do not count against the automatic retry limit

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique delivery identifier to retry',
    example: 'dlv_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery retried successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        delivery: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'dlv_01HX...' },
            status: { type: 'string', example: 'success', enum: ['success', 'failed'] },
            statusCode: { type: 'integer', example: 200 },
            responseTimeMs: { type: 'integer', example: 95 },
            attempts: { type: 'integer', example: 6, description: 'Updated total attempt count' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Delivery not found or does not belong to the authenticated client.' })
  @ApiResponse({ status: 422, description: 'Delivery is not in `failed` status and cannot be retried.' })
  async retryDelivery(@Param('id') id: string, @CurrentClientId() clientId: number) {
    const result = await this.webhookService.retryDelivery(clientId, id);
    return { success: true, ...result };
  }

  @Get('deliveries/:deliveryId')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get delivery detail with attempts',
    description: `Returns the full detail of a specific webhook delivery, including every HTTP attempt made with full request/response data. Use this to debug delivery failures.

**Attempt statuses:**
- \`success\` — HTTP 2xx response received
- \`failed\` — Non-2xx HTTP response received
- \`timeout\` — Request timed out before receiving a response
- \`error\` — Network error prevented the request from completing

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'deliveryId',
    type: String,
    description: 'Unique delivery identifier',
    example: 'dlv_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery detail with attempt history.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        delivery: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            deliveryCode: { type: 'string', example: 'dlv_01HX...' },
            eventType: { type: 'string', example: 'deposit.confirmed' },
            status: { type: 'string', example: 'sent' },
            attempts: { type: 'integer', example: 1 },
            correlationId: { type: 'string', nullable: true },
            idempotencyKey: { type: 'string', nullable: true },
            isManualResend: { type: 'boolean', example: false },
            attempts_log: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  attemptNumber: { type: 'integer', example: 1 },
                  status: { type: 'string', example: 'success' },
                  responseStatus: { type: 'integer', example: 200 },
                  responseTimeMs: { type: 'integer', example: 145 },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'Delivery not found or does not belong to the authenticated client.' })
  async getDeliveryDetail(
    @Param('deliveryId') deliveryId: string,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.webhookService.getDeliveryDetail(
      clientId,
      deliveryId,
    );
    return { success: true, ...result };
  }

  @Post('deliveries/:deliveryId/resend')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manual resend of a delivery',
    description: `Creates a new delivery with a fresh idempotency key linked to the original delivery. The new delivery is enqueued for immediate processing with the full retry lifecycle.

Unlike retry (which re-attempts the same delivery), resend creates a brand new delivery record. This is useful when:
- The original delivery was dead-lettered and you want to start fresh
- You want a new idempotency key for the delivery
- The original endpoint URL has changed

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'deliveryId',
    type: String,
    description: 'Unique delivery identifier to resend',
    example: 'dlv_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery resent successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        delivery: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 42 },
            deliveryCode: { type: 'string', example: 'dlv_new...' },
            originalDeliveryId: { type: 'integer', example: 1 },
            status: { type: 'string', example: 'queued' },
            isManualResend: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Delivery not found or does not belong to the authenticated client.' })
  async resendDelivery(
    @Param('deliveryId') deliveryId: string,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.webhookService.resendDelivery(
      clientId,
      deliveryId,
    );
    return { success: true, ...result };
  }

  @Get('dead-letters')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List dead-lettered deliveries',
    description: `Returns a paginated list of webhook deliveries that exhausted all retry attempts and were moved to the dead letter queue (DLQ). Dead-lettered deliveries can be resent manually.

**Dead letter statuses:**
- \`pending_review\` — Awaiting action (can be resent or discarded)
- \`resent\` — A new delivery was created from this dead letter
- \`discarded\` — Marked as not requiring further action

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Dead-lettered deliveries retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deadLetters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              deliveryId: { type: 'integer', example: 10 },
              webhookId: { type: 'integer', example: 5 },
              eventType: { type: 'string', example: 'deposit.confirmed' },
              lastError: { type: 'string', example: 'HTTP 503' },
              totalAttempts: { type: 'integer', example: 5 },
              deadLetteredAt: { type: 'string', format: 'date-time' },
              status: { type: 'string', example: 'pending_review' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 5 },
            totalPages: { type: 'integer', example: 1 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listDeadLetters(
    @Query() query: ListDeliveriesQueryDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.webhookService.listDeadLetters(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
    return { success: true, ...result };
  }
}
