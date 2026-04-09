import { Module } from '@nestjs/common';
import { EventConsumerService } from './event-consumer.service';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [WebhookModule],
  providers: [EventConsumerService],
})
export class EventConsumerModule {}
