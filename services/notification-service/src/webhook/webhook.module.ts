import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookController } from './webhook.controller';
import { WebhookWorker } from './webhook.worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-delivery',
    }),
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookDeliveryService, WebhookWorker],
  exports: [WebhookService, WebhookDeliveryService],
})
export class WebhookModule {}
