import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Supports single and batch manual resend of webhook deliveries
 * with new idempotency keys.
 */
@Injectable()
export class ManualResendService {
  private readonly logger = new Logger(ManualResendService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
  ) {}

  /**
   * Resend a single delivery. Creates a new delivery record linked
   * to the original via originalDeliveryId.
   */
  async resendDelivery(
    deliveryId: bigint,
    clientId: bigint,
  ): Promise<any> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    if (delivery.clientId !== clientId) {
      throw new NotFoundException(
        `Delivery ${deliveryId} not found for this client`,
      );
    }

    const deliveryCode = `dlv_${uuidv4().replace(/-/g, '')}`;
    const idempotencyKey = `idem_${uuidv4().replace(/-/g, '')}`;

    const newDelivery = await this.prisma.webhookDelivery.create({
      data: {
        deliveryCode,
        webhookId: delivery.webhookId,
        clientId: delivery.clientId,
        eventType: delivery.eventType,
        payload: delivery.payload as any,
        status: 'queued',
        maxAttempts: delivery.maxAttempts,
        idempotencyKey,
        isManualResend: true,
        originalDeliveryId: delivery.id,
      },
    });

    await this.deliveryQueue.add(
      'deliver',
      {
        deliveryId: Number(newDelivery.id),
        webhookId: Number(delivery.webhookId),
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Manual resend of delivery ${delivery.deliveryCode} -> ${deliveryCode}`,
    );

    return {
      delivery: {
        id: Number(newDelivery.id),
        deliveryCode,
        originalDeliveryId: Number(delivery.id),
        status: 'queued',
        isManualResend: true,
      },
    };
  }

  /**
   * Batch resend multiple deliveries.
   */
  async batchResend(
    deliveryIds: bigint[],
    clientId: bigint,
  ): Promise<{ resent: number; failed: number; results: any[] }> {
    const results: any[] = [];
    let resent = 0;
    let failed = 0;

    for (const deliveryId of deliveryIds) {
      try {
        const result = await this.resendDelivery(deliveryId, clientId);
        results.push({ deliveryId: Number(deliveryId), ...result });
        resent++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({
          deliveryId: Number(deliveryId),
          error: msg,
        });
        failed++;
      }
    }

    this.logger.log(
      `Batch resend: ${resent} succeeded, ${failed} failed out of ${deliveryIds.length}`,
    );

    return { resent, failed, results };
  }
}
