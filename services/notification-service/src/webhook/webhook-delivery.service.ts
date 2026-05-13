import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as promClient from 'prom-client';
import { PostHogService, POSTHOG_SERVICE } from '@cvh/posthog';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { ConfigurableRetryService } from './configurable-retry.service';
import { DeliveryAttemptRecorderService } from './delivery-attempt-recorder.service';
import { DeadLetterService } from './dead-letter.service';

/* ── Prometheus metrics for webhook deliveries ─────────────────────── */
const webhookDeliveriesTotal = new promClient.Counter({
  name: 'webhook_deliveries_total',
  help: 'Total webhook deliveries attempted',
  labelNames: ['status'],
});

const webhookDeliveriesSuccess = new promClient.Counter({
  name: 'webhook_deliveries_success_total',
  help: 'Successful webhook deliveries',
});

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookService,
    private readonly retryService: ConfigurableRetryService,
    private readonly attemptRecorder: DeliveryAttemptRecorderService,
    private readonly deadLetterService: DeadLetterService,
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
    @Inject(POSTHOG_SERVICE)
    private readonly posthog: PostHogService | null,
  ) {}

  /**
   * Create delivery records for an event and enqueue them.
   */
  async createDeliveries(
    clientId: bigint,
    eventType: string,
    payload: Record<string, any>,
    projectId?: bigint,
  ) {
    const webhooks = await this.webhookService.findMatchingWebhooks(
      clientId,
      eventType,
    );

    if (webhooks.length === 0) {
      this.logger.debug(
        `No matching webhooks for client ${clientId} event ${eventType}`,
      );
      return [];
    }

    const deliveries = [];

    // Resolve projectId from payload if not explicitly provided
    const resolvedProjectId =
      projectId ??
      BigInt(
        payload?.data?.projectId ??
          payload?.data?.project_id ??
          payload?.projectId ??
          payload?.project_id ??
          0,
      );

    for (const webhook of webhooks) {
      const deliveryCode = `dlv_${uuidv4().replace(/-/g, '')}`;
      const idempotencyKey = `idem_${uuidv4().replace(/-/g, '')}`;
      const correlationId = `cor_${uuidv4().replace(/-/g, '')}`;

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          deliveryCode,
          webhookId: webhook.id,
          clientId,
          projectId: resolvedProjectId,
          eventType,
          payload: payload as any,
          status: 'queued',
          maxAttempts: (webhook as any).retryMaxAttempts ?? 5,
          idempotencyKey,
          correlationId,
          requestUrl: webhook.url,
        },
      });

      await this.deliveryQueue.add(
        'deliver',
        {
          deliveryId: Number(delivery.id),
          webhookId: Number(webhook.id),
        },
        {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      deliveries.push(delivery);
    }

    this.logger.log(
      `Created ${deliveries.length} deliveries for event ${eventType} (client ${clientId})`,
    );

    return deliveries;
  }

  /**
   * Compute HMAC-SHA256 signature for a payload.
   */
  computeSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Deliver a webhook by sending an HTTP POST with HMAC signature.
   * Records every attempt and uses configurable retry logic.
   */
  async deliverWebhook(deliveryId: bigint, webhookId: bigint) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) {
      this.logger.error(`Delivery ${deliveryId} not found`);
      return null;
    }

    const webhook = await this.webhookService.getWebhookById(webhookId);
    if (!webhook) {
      this.logger.error(`Webhook ${webhookId} not found for delivery ${deliveryId}`);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          error: `Webhook ${webhookId} not found`,
          errorMessage: `Webhook ${webhookId} not found`,
          lastAttemptAt: new Date(),
        },
      });
      return null;
    }

    if (!webhook.isActive) {
      this.logger.warn(
        `Webhook ${webhookId} is inactive, skipping delivery ${deliveryId}`,
      );
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          error: 'Webhook is inactive',
          errorMessage: 'Webhook is inactive',
          lastAttemptAt: new Date(),
        },
      });
      return null;
    }

    const retryConfig = this.retryService.extractConfig(webhook);
    const payloadStr = JSON.stringify(delivery.payload);
    const signature = this.computeSignature(payloadStr, webhook.secret);

    const deliveryAny = delivery as any;
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Signature': `sha256=${signature}`,
      'X-Event-Type': delivery.eventType,
      'X-Delivery-Id': delivery.deliveryCode,
      ...(deliveryAny.idempotencyKey
        ? { 'X-Idempotency-Key': deliveryAny.idempotencyKey }
        : {}),
      ...(deliveryAny.correlationId
        ? { 'X-Correlation-Id': deliveryAny.correlationId }
        : {}),
    };

    const attemptNumber = delivery.attempts + 1;
    const startTime = Date.now();

    try {
      const response = await axios.post(webhook.url, payloadStr, {
        headers: requestHeaders,
        timeout: retryConfig.retryTimeoutMs,
        validateStatus: () => true,
      });

      const responseTimeMs = Date.now() - startTime;
      const isSuccess = response.status >= 200 && response.status < 300;
      const responseBody =
        typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data).slice(0, 2000);

      const responseHeaders = response.headers
        ? Object.fromEntries(
            Object.entries(response.headers).map(([k, v]) => [
              k,
              String(v),
            ]),
          )
        : null;

      // Record the attempt
      await this.attemptRecorder.recordAttempt({
        deliveryId,
        attemptNumber,
        status: isSuccess ? 'success' : 'failed',
        requestUrl: webhook.url,
        requestHeaders,
        requestBody: delivery.payload,
        responseStatus: response.status,
        responseHeaders,
        responseBody,
        responseTimeMs,
      });

      if (isSuccess) {
        webhookDeliveriesTotal.inc({ status: 'success' });
        webhookDeliveriesSuccess.inc();

        const updated = await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'sent',
            httpStatus: response.status,
            responseBody,
            responseTimeMs,
            responseHeaders: responseHeaders as any,
            requestHeaders: requestHeaders as any,
            attempts: attemptNumber,
            lastAttemptAt: new Date(),
            nextRetryAt: null,
          },
        });
        this.logger.log(
          `Delivery ${delivery.deliveryCode} sent (HTTP ${response.status}, ${responseTimeMs}ms)`,
        );

        // Track successful webhook delivery in PostHog
        if (this.posthog) {
          try {
            this.posthog.trackWebhookSent({
              clientId: delivery.clientId.toString(),
              webhookId: webhookId.toString(),
              deliveryId: delivery.deliveryCode,
              eventType: delivery.eventType,
              httpStatus: response.status,
              responseTimeMs,
              result: 'success',
            });
          } catch {
            // PostHog tracking must never break delivery processing
          }
        }

        return updated;
      }

      // Non-success — determine retry or dead-letter
      webhookDeliveriesTotal.inc({ status: 'failure' });

      return this.handleFailure(
        delivery,
        webhook,
        retryConfig,
        `HTTP ${response.status}`,
        response.status,
        responseBody,
        responseTimeMs,
        responseHeaders,
        requestHeaders,
        attemptNumber,
      );
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';

      // Record the failed attempt
      await this.attemptRecorder.recordAttempt({
        deliveryId,
        attemptNumber,
        status: isTimeout ? 'timeout' : 'error',
        requestUrl: webhook.url,
        requestHeaders,
        requestBody: delivery.payload,
        responseTimeMs,
        errorMessage,
        errorCode: error.code ?? null,
      });

      webhookDeliveriesTotal.inc({ status: 'error' });

      return this.handleFailure(
        delivery,
        webhook,
        retryConfig,
        errorMessage,
        null,
        null,
        responseTimeMs,
        null,
        requestHeaders,
        attemptNumber,
        error.code,
      );
    }
  }

  /**
   * Send a synchronous test webhook (a "ping") to validate that a customer's
   * endpoint is reachable and accepts our signed payload format. Records the
   * delivery in the database (same shape as a real event) so it appears in
   * GET /webhooks/:id/deliveries. Does NOT enqueue retries — this is a
   * one-shot diagnostic call. Capped at 10s.
   *
   * If `clientId` is provided, the webhook ownership is verified.
   */
  async testWebhook(webhookId: bigint, clientId?: bigint) {
    const webhook = await this.webhookService.getWebhookById(webhookId);
    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    if (clientId !== undefined && webhook.clientId !== clientId) {
      throw new NotFoundException(
        `Webhook ${webhookId} not found for this client`,
      );
    }

    // Enforce HTTPS in production — must match the same security posture as
    // real events. WebhookService.createWebhook should normally prevent this,
    // but we guard here to never relax the contract for the test endpoint.
    if (
      process.env.NODE_ENV === 'production' &&
      !/^https:\/\//i.test(webhook.url)
    ) {
      throw new BadRequestException(
        'Webhook URL must use HTTPS in production',
      );
    }

    const eventType = 'webhook.test';
    const deliveryCode = `dlv_${uuidv4().replace(/-/g, '')}`;
    const idempotencyKey = `idem_${uuidv4().replace(/-/g, '')}`;
    const correlationId = `cor_${uuidv4().replace(/-/g, '')}`;

    const samplePayload = {
      event: eventType,
      data: {
        webhookId: Number(webhook.id),
        clientId: Number(webhook.clientId),
        message: 'This is a test ping from CryptoVaultHub. If you received this, your webhook endpoint is reachable and the HMAC signature can be verified using your webhook secret.',
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        deliveryCode,
        webhookId: webhook.id,
        clientId: webhook.clientId,
        projectId: webhook.projectId,
        eventType,
        payload: samplePayload as any,
        status: 'queued',
        maxAttempts: 1,
        idempotencyKey,
        correlationId,
        requestUrl: webhook.url,
      },
    });

    // Cap synchronous outbound call at 10s, regardless of webhook config.
    const TEST_TIMEOUT_MS = 10000;
    const payloadStr = JSON.stringify(samplePayload);
    const signature = this.computeSignature(payloadStr, webhook.secret);

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Signature': `sha256=${signature}`,
      'X-Event-Type': eventType,
      'X-Delivery-Id': deliveryCode,
      'X-Idempotency-Key': idempotencyKey,
      'X-Correlation-Id': correlationId,
      'X-CVH-Test': 'true',
    };

    const startTime = Date.now();

    try {
      const response = await axios.post(webhook.url, payloadStr, {
        headers: requestHeaders,
        timeout: TEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      const responseTimeMs = Date.now() - startTime;
      const isSuccess = response.status >= 200 && response.status < 300;
      const responseBody =
        typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data).slice(0, 2000);

      const responseHeaders = response.headers
        ? Object.fromEntries(
            Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
          )
        : null;

      await this.attemptRecorder.recordAttempt({
        deliveryId: delivery.id,
        attemptNumber: 1,
        status: isSuccess ? 'success' : 'failed',
        requestUrl: webhook.url,
        requestHeaders,
        requestBody: samplePayload,
        responseStatus: response.status,
        responseHeaders,
        responseBody,
        responseTimeMs,
      });

      const updated = await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isSuccess ? 'sent' : 'failed',
          httpStatus: response.status,
          responseBody,
          responseTimeMs,
          responseHeaders: responseHeaders as any,
          requestHeaders: requestHeaders as any,
          attempts: 1,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          ...(isSuccess
            ? {}
            : {
                error: `HTTP ${response.status}`,
                errorMessage: `HTTP ${response.status}`,
              }),
        },
      });

      webhookDeliveriesTotal.inc({ status: isSuccess ? 'success' : 'failure' });
      if (isSuccess) webhookDeliveriesSuccess.inc();

      this.logger.log(
        `Test webhook ${webhookId} -> ${webhook.url} (HTTP ${response.status}, ${responseTimeMs}ms)`,
      );

      return this.formatDelivery(updated);
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      const isTimeout =
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';

      await this.attemptRecorder.recordAttempt({
        deliveryId: delivery.id,
        attemptNumber: 1,
        status: isTimeout ? 'timeout' : 'error',
        requestUrl: webhook.url,
        requestHeaders,
        requestBody: samplePayload,
        responseTimeMs,
        errorMessage,
        errorCode: error.code ?? null,
      });

      const updated = await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          httpStatus: null,
          responseTimeMs,
          requestHeaders: requestHeaders as any,
          attempts: 1,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          error: errorMessage,
          errorMessage,
          errorCode: error.code ?? null,
        },
      });

      webhookDeliveriesTotal.inc({ status: 'error' });

      this.logger.warn(
        `Test webhook ${webhookId} -> ${webhook.url} failed: ${errorMessage}`,
      );

      return this.formatDelivery(updated);
    }
  }

  /**
   * Handle a delivery failure: schedule retry with configurable backoff or dead-letter.
   */
  private async handleFailure(
    delivery: any,
    webhook: any,
    retryConfig: any,
    errorMessage: string,
    httpStatus: number | null,
    responseBody: string | null,
    responseTimeMs: number,
    responseHeaders: any,
    requestHeaders: any,
    attemptNumber: number,
    errorCode?: string,
  ) {
    const shouldRetry = this.retryService.shouldRetry(
      retryConfig,
      httpStatus,
      attemptNumber,
    );

    if (!shouldRetry) {
      // Dead letter
      const updated = await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          httpStatus,
          responseBody,
          responseTimeMs,
          responseHeaders: responseHeaders as any,
          requestHeaders: requestHeaders as any,
          attempts: attemptNumber,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          error: errorMessage,
          errorMessage,
          errorCode: errorCode ?? null,
        },
      });

      // Move to dead letter queue
      await this.deadLetterService.deadLetter(delivery.id, errorMessage);

      // Track dead-lettered delivery in PostHog
      if (this.posthog) {
        try {
          this.posthog.trackWebhookSent({
            clientId: delivery.clientId.toString(),
            webhookId: webhook.id.toString(),
            deliveryId: delivery.deliveryCode,
            eventType: delivery.eventType,
            httpStatus: httpStatus ?? 0,
            responseTimeMs,
            result: 'dead_lettered',
          });
        } catch {
          // PostHog tracking must never break delivery processing
        }
      }

      this.logger.warn(
        `Delivery ${delivery.deliveryCode} dead-lettered after ${attemptNumber} attempts: ${errorMessage}`,
      );
      return updated;
    }

    // Schedule retry with configurable backoff
    const delayMs = this.retryService.computeDelay(
      retryConfig,
      attemptNumber,
    );
    const nextRetryAt = new Date(Date.now() + delayMs);

    const updated = await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'queued',
        httpStatus,
        responseBody,
        responseTimeMs,
        responseHeaders: responseHeaders as any,
        requestHeaders: requestHeaders as any,
        attempts: attemptNumber,
        lastAttemptAt: new Date(),
        nextRetryAt,
        error: errorMessage,
        errorMessage,
        errorCode: errorCode ?? null,
      },
    });

    // Enqueue retry
    await this.deliveryQueue.add(
      'deliver',
      {
        deliveryId: Number(delivery.id),
        webhookId: Number(delivery.webhookId),
      },
      {
        delay: delayMs,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Delivery ${delivery.deliveryCode} retry ${attemptNumber}/${retryConfig.retryMaxAttempts} in ${delayMs}ms`,
    );

    return updated;
  }

  /**
   * List deliveries for a webhook, optionally filtered by status.
   */
  async listDeliveries(webhookId: number, status?: string) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        webhookId: BigInt(webhookId),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return deliveries.map((d) => this.formatDelivery(d));
  }

  /**
   * Cross-webhook delivery listing for a client. Supports filtering by
   * webhookId, eventType, status, and a date window, plus paginated reads.
   * Joins webhooks for label/url so the UI can render the originating
   * endpoint without an extra round-trip per row.
   */
  async listDeliveriesForClient(params: {
    clientId: bigint;
    page: number;
    limit: number;
    status?: string;
    webhookId?: number;
    eventType?: string;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const { clientId, page, limit, status, webhookId, eventType, fromDate, toDate } = params;
    const where: Record<string, any> = { clientId };
    if (status) where.status = status;
    if (webhookId) where.webhookId = BigInt(webhookId);
    if (eventType) where.eventType = eventType;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safePage = Math.max(1, page);
    const [rows, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { webhook: { select: { id: true, description: true, url: true } } },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return {
      deliveries: rows.map((d: any) => ({
        ...this.formatDelivery(d),
        webhookLabel: d.webhook?.description ?? null,
        webhookUrl: d.webhook?.url ?? null,
      })),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  /**
   * Bulk retry. Accepts up to 100 delivery ids and retries each via the
   * normal deliverWebhook path. Returns per-id success/failure so the
   * caller can show a granular summary.
   */
  async retryDeliveriesBulk(
    clientId: bigint,
    ids: bigint[],
  ): Promise<{ ok: number; failed: number; results: Array<{ id: string; ok: boolean; error?: string }> }> {
    const capped = ids.slice(0, 100);
    const owned = await this.prisma.webhookDelivery.findMany({
      where: { id: { in: capped }, clientId },
      select: { id: true, webhookId: true },
    });
    const ownedById = new Map(owned.map((d) => [d.id.toString(), d.webhookId]));
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    let ok = 0;
    let failed = 0;
    for (const id of capped) {
      const webhookId = ownedById.get(id.toString());
      if (!webhookId) {
        failed++;
        results.push({ id: id.toString(), ok: false, error: 'Not found for client' });
        continue;
      }
      try {
        await this.deliverWebhook(id, webhookId);
        ok++;
        results.push({ id: id.toString(), ok: true });
      } catch (err) {
        failed++;
        results.push({
          id: id.toString(),
          ok: false,
          error: (err as Error).message,
        });
      }
    }
    return { ok, failed, results };
  }

  /**
   * Get a single delivery with all attempts.
   */
  async getDeliveryDetail(deliveryId: bigint) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        attempts_log: { orderBy: { attemptNumber: 'asc' } },
        webhook: { select: { id: true, description: true, url: true } },
      },
    });

    if (!delivery) return null;

    return {
      ...this.formatDelivery(delivery),
      webhookLabel: (delivery as any).webhook?.description ?? null,
      webhookUrl: (delivery as any).webhook?.url ?? null,
      requestUrl: (delivery as any).requestUrl ?? null,
      requestHeaders: (delivery as any).requestHeaders ?? null,
      responseBody: (delivery as any).responseBody ?? null,
      responseHeaders: (delivery as any).responseHeaders ?? null,
      errorMessage: (delivery as any).errorMessage ?? null,
      errorCode: (delivery as any).errorCode ?? null,
      deliveredAt: (delivery as any).deliveredAt ?? null,
      attempts_log: (delivery.attempts_log ?? []).map((a: any) => ({
        id: Number(a.id),
        attemptNumber: a.attemptNumber,
        status: a.status,
        requestUrl: a.requestUrl,
        responseStatus: a.responseStatus,
        responseTimeMs: a.responseTimeMs,
        errorMessage: a.errorMessage,
        timestamp: a.timestamp,
      })),
    };
  }

  private formatDelivery(d: any) {
    return {
      id: Number(d.id),
      deliveryCode: d.deliveryCode,
      webhookId: Number(d.webhookId),
      clientId: Number(d.clientId),
      eventType: d.eventType,
      payload: d.payload,
      status: d.status,
      httpStatus: d.httpStatus,
      responseTimeMs: d.responseTimeMs,
      attempts: d.attempts,
      maxAttempts: d.maxAttempts,
      lastAttemptAt: d.lastAttemptAt,
      nextRetryAt: d.nextRetryAt,
      error: d.error,
      correlationId: d.correlationId,
      idempotencyKey: d.idempotencyKey,
      isManualResend: d.isManualResend,
      originalDeliveryId: d.originalDeliveryId
        ? Number(d.originalDeliveryId)
        : null,
      createdAt: d.createdAt,
    };
  }
}
