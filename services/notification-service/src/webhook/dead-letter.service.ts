import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Manages the webhook dead letter queue (DLQ).
 * Moves exhausted deliveries to DLQ and supports resending from DLQ.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
  ) {}

  /**
   * Move an exhausted delivery to the dead letter queue.
   */
  async deadLetter(
    deliveryId: bigint,
    lastError: string,
  ): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${deliveryId} not found for dead-lettering`);
      return;
    }

    // Check if already dead-lettered
    const existing = await this.prisma.webhookDeadLetter.findFirst({
      where: { deliveryId },
    });
    if (existing) {
      this.logger.debug(`Delivery ${deliveryId} already in DLQ`);
      return;
    }

    await this.prisma.webhookDeadLetter.create({
      data: {
        deliveryId,
        webhookId: delivery.webhookId,
        clientId: delivery.clientId,
        eventType: delivery.eventType,
        payload: delivery.payload as any,
        lastError,
        totalAttempts: delivery.attempts,
        status: 'pending_review',
      },
    });

    this.logger.warn(
      `Delivery ${delivery.deliveryCode} moved to DLQ after ${delivery.attempts} attempts: ${lastError}`,
    );
  }

  /**
   * List dead-lettered deliveries for a client.
   */
  async listDeadLetters(
    clientId: bigint,
    params: {
      page?: number;
      limit?: number;
      status?: string;
    },
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { clientId };
    if (params.status) {
      where.status = params.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.webhookDeadLetter.findMany({
        where,
        orderBy: { deadLetteredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookDeadLetter.count({ where }),
    ]);

    return {
      deadLetters: items.map((dl) => this.formatDeadLetter(dl)),
      meta: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  /**
   * Resend a dead-lettered delivery: creates a new delivery and enqueues it.
   */
  async resend(deadLetterId: bigint): Promise<any> {
    const deadLetter = await this.prisma.webhookDeadLetter.findUnique({
      where: { id: deadLetterId },
    });

    if (!deadLetter) {
      throw new Error(`Dead letter ${deadLetterId} not found`);
    }

    if (deadLetter.status !== 'pending_review') {
      throw new Error(
        `Dead letter ${deadLetterId} is not in pending_review status`,
      );
    }

    // Create a new delivery with new idempotency key
    const deliveryCode = `dlv_${uuidv4().replace(/-/g, '')}`;
    const idempotencyKey = `idem_${uuidv4().replace(/-/g, '')}`;

    const newDelivery = await this.prisma.webhookDelivery.create({
      data: {
        deliveryCode,
        webhookId: deadLetter.webhookId,
        clientId: deadLetter.clientId,
        eventType: deadLetter.eventType,
        payload: deadLetter.payload as any,
        status: 'queued',
        maxAttempts: 5,
        idempotencyKey,
        isManualResend: true,
        originalDeliveryId: deadLetter.deliveryId,
      },
    });

    // Update dead letter status
    await this.prisma.webhookDeadLetter.update({
      where: { id: deadLetterId },
      data: {
        status: 'resent',
        resentAt: new Date(),
        resentDeliveryId: newDelivery.id,
      },
    });

    // Enqueue for delivery
    await this.deliveryQueue.add(
      'deliver',
      {
        deliveryId: Number(newDelivery.id),
        webhookId: Number(deadLetter.webhookId),
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Dead letter ${deadLetterId} resent as delivery ${deliveryCode}`,
    );

    return {
      delivery: {
        id: Number(newDelivery.id),
        deliveryCode,
        status: 'queued',
      },
    };
  }

  private formatDeadLetter(dl: any) {
    return {
      id: Number(dl.id),
      deliveryId: Number(dl.deliveryId),
      webhookId: Number(dl.webhookId),
      clientId: Number(dl.clientId),
      eventType: dl.eventType,
      payload: dl.payload,
      lastError: dl.lastError,
      totalAttempts: dl.totalAttempts,
      deadLetteredAt: dl.deadLetteredAt,
      status: dl.status,
      resentAt: dl.resentAt,
      resentDeliveryId: dl.resentDeliveryId
        ? Number(dl.resentDeliveryId)
        : null,
    };
  }
}
