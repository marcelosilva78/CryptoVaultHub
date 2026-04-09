import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Processor('webhook-delivery')
export class WebhookWorker extends WorkerHost {
  private readonly logger = new Logger(WebhookWorker.name);

  constructor(
    private readonly deliveryService: WebhookDeliveryService,
  ) {
    super();
  }

  async process(job: Job<{ deliveryId: number; webhookId: number }>) {
    const { deliveryId, webhookId } = job.data;

    this.logger.debug(
      `Processing webhook delivery job: deliveryId=${deliveryId}, webhookId=${webhookId}`,
    );

    try {
      await this.deliveryService.deliverWebhook(
        BigInt(deliveryId),
        BigInt(webhookId),
      );
    } catch (error: any) {
      this.logger.error(
        `Webhook delivery job failed: deliveryId=${deliveryId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
