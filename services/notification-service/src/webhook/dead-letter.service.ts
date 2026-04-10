import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dead letter queue service for failed webhook deliveries.
 * Manages resending of permanently failed deliveries.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
  ) {}

  /**
   * List all dead-lettered deliveries for a webhook.
   */
  async listDeadLetters(webhookId: number) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        webhookId: BigInt(webhookId),
        status: 'failed',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return deliveries.map((d) => ({
      id: Number(d.id),
      deliveryCode: d.deliveryCode,
      webhookId: Number(d.webhookId),
      eventType: d.eventType,
      attempts: d.attempts,
      maxAttempts: d.maxAttempts,
      error: d.error,
      lastAttemptAt: d.lastAttemptAt,
      createdAt: d.createdAt,
    }));
  }

  /**
   * Resend a dead-lettered delivery.
   * Looks up the webhook config to get the correct retryMaxAttempts.
   */
  async resend(deliveryId: number): Promise<boolean> {
    const deadLetter = await this.prisma.webhookDelivery.findUnique({
      where: { id: BigInt(deliveryId) },
    });

    if (!deadLetter || deadLetter.status !== 'failed') {
      this.logger.warn(
        `Cannot resend delivery ${deliveryId}: not found or not in failed status`,
      );
      return false;
    }

    // Look up the webhook config to get the correct retryMaxAttempts
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: BigInt(deadLetter.webhookId) },
    });
    const maxAttempts = (webhook as any)?.retryMaxAttempts ?? 5;

    // Reset the delivery for retry
    await this.prisma.webhookDelivery.update({
      where: { id: BigInt(deliveryId) },
      data: {
        status: 'queued',
        attempts: 0,
        maxAttempts: maxAttempts,
        error: null,
        nextRetryAt: null,
      },
    });

    // Enqueue for delivery
    await this.deliveryQueue.add(
      'deliver',
      {
        deliveryId: Number(deadLetter.id),
        webhookId: Number(deadLetter.webhookId),
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Dead letter ${deliveryId} resent (maxAttempts: ${maxAttempts})`,
    );

    return true;
  }

  /**
   * Resend all dead-lettered deliveries for a webhook.
   */
  async resendAll(webhookId: number): Promise<number> {
    const deadLetters = await this.prisma.webhookDelivery.findMany({
      where: {
        webhookId: BigInt(webhookId),
        status: 'failed',
      },
    });

    let resent = 0;
    for (const dl of deadLetters) {
      const success = await this.resend(Number(dl.id));
      if (success) resent++;
    }

    this.logger.log(
      `Resent ${resent}/${deadLetters.length} dead letters for webhook ${webhookId}`,
    );

    return resent;
  }
}
