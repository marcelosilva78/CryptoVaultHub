import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { ConfigurableRetryService } from './configurable-retry.service';
import { DeliveryAttemptRecorderService } from './delivery-attempt-recorder.service';
import { DeadLetterService } from './dead-letter.service';

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
  ) {}

  /**
   * Create delivery records for an event and enqueue them.
   */
  async createDeliveries(
    clientId: bigint,
    eventType: string,
    payload: Record<string, any>,
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

    for (const webhook of webhooks) {
      const deliveryCode = `dlv_${uuidv4().replace(/-/g, '')}`;
      const idempotencyKey = `idem_${uuidv4().replace(/-/g, '')}`;
      const correlationId = `cor_${uuidv4().replace(/-/g, '')}`;

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          deliveryCode,
          webhookId: webhook.id,
          clientId,
          eventType,
          payload: payload as any,
          status: 'queued',
          maxAttempts: (webhook as any).retryMaxAttempts ?? 5,
          idempotencyKey,
          correlationId,
          requestUrl: webhook.url,
        } as any,
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
        } as any,
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
        } as any,
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
          } as any,
        });
        this.logger.log(
          `Delivery ${delivery.deliveryCode} sent (HTTP ${response.status}, ${responseTimeMs}ms)`,
        );
        return updated;
      }

      // Non-success — determine retry or dead-letter
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
        } as any,
      });

      // Move to dead letter queue
      await this.deadLetterService.deadLetter(delivery.id, errorMessage);

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
      } as any,
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
   * Get a single delivery with all attempts.
   */
  async getDeliveryDetail(deliveryId: bigint) {
    const delivery: any = await (this.prisma.webhookDelivery as any).findUnique({
      where: { id: deliveryId },
      include: { attempts_log: { orderBy: { attemptNumber: 'asc' } } },
    });

    if (!delivery) return null;

    return {
      ...this.formatDelivery(delivery),
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
