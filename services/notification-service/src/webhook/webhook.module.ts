import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookController } from './webhook.controller';
import { WebhookWorker } from './webhook.worker';
import { ConfigurableRetryService } from './configurable-retry.service';
import { DeliveryAttemptRecorderService } from './delivery-attempt-recorder.service';
import { DeadLetterService } from './dead-letter.service';
import { ManualResendService } from './manual-resend.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-delivery',
    }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WebhookDeliveryService,
    WebhookWorker,
    ConfigurableRetryService,
    DeliveryAttemptRecorderService,
    DeadLetterService,
    ManualResendService,
  ],
  exports: [
    WebhookService,
    WebhookDeliveryService,
    ConfigurableRetryService,
    DeliveryAttemptRecorderService,
    DeadLetterService,
    ManualResendService,
  ],
})
export class WebhookModule {}
