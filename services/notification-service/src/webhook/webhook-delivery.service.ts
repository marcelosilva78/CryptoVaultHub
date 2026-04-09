import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';

/**
 * Exponential backoff delays (in milliseconds) for retry attempts.
 * Attempt 1: 1s, 2: 5s, 3: 30s, 4: 2m, 5: 10m, 6: 1h
 */
export const RETRY_DELAYS_MS = [
  1_000,      // 1 second
  5_000,      // 5 seconds
  30_000,     // 30 seconds
  120_000,    // 2 minutes
  600_000,    // 10 minutes
  3_600_000,  // 1 hour
];

const MAX_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookService: WebhookService,
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

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          deliveryCode,
          webhookId: webhook.id,
          clientId,
          eventType,
          payload: payload as any,
          status: 'queued',
          maxAttempts: MAX_ATTEMPTS,
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
   * Returns the updated delivery record.
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
          lastAttemptAt: new Date(),
        },
      });
      return null;
    }

    const payloadStr = JSON.stringify(delivery.payload);
    const signature = this.computeSignature(payloadStr, webhook.secret);
    const startTime = Date.now();

    try {
      const response = await axios.post(webhook.url, payloadStr, {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': `sha256=${signature}`,
          'X-Event-Type': delivery.eventType,
          'X-Delivery-Id': delivery.deliveryCode,
        },
        timeout: DELIVERY_TIMEOUT_MS,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      const responseTimeMs = Date.now() - startTime;
      const isSuccess = response.status >= 200 && response.status < 300;
      const responseBody =
        typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data).slice(0, 2000);

      if (isSuccess) {
        const updated = await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'sent',
            httpStatus: response.status,
            responseBody,
            responseTimeMs,
            attempts: delivery.attempts + 1,
            lastAttemptAt: new Date(),
            nextRetryAt: null,
          },
        });
        this.logger.log(
          `Delivery ${delivery.deliveryCode} sent (HTTP ${response.status}, ${responseTimeMs}ms)`,
        );
        return updated;
      }

      // Non-success HTTP status — schedule retry or dead-letter
      return this.handleFailure(
        delivery,
        `HTTP ${response.status}`,
        response.status,
        responseBody,
        responseTimeMs,
      );
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';

      return this.handleFailure(
        delivery,
        errorMessage,
        null,
        null,
        responseTimeMs,
      );
    }
  }

  /**
   * Handle a delivery failure: schedule retry with backoff or dead-letter.
   */
  private async handleFailure(
    delivery: any,
    errorMessage: string,
    httpStatus: number | null,
    responseBody: string | null,
    responseTimeMs: number,
  ) {
    const nextAttempt = delivery.attempts + 1;

    if (nextAttempt >= delivery.maxAttempts) {
      // Dead letter — max attempts reached
      const updated = await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          httpStatus,
          responseBody,
          responseTimeMs,
          attempts: nextAttempt,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          error: errorMessage,
        },
      });

      this.logger.warn(
        `Delivery ${delivery.deliveryCode} dead-lettered after ${nextAttempt} attempts: ${errorMessage}`,
      );
      return updated;
    }

    // Schedule retry with exponential backoff
    const delayMs =
      RETRY_DELAYS_MS[nextAttempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    const nextRetryAt = new Date(Date.now() + delayMs);

    const updated = await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'queued',
        httpStatus,
        responseBody,
        responseTimeMs,
        attempts: nextAttempt,
        lastAttemptAt: new Date(),
        nextRetryAt,
        error: errorMessage,
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
      `Delivery ${delivery.deliveryCode} retry ${nextAttempt}/${delivery.maxAttempts} in ${delayMs}ms`,
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
      createdAt: d.createdAt,
    };
  }
}
