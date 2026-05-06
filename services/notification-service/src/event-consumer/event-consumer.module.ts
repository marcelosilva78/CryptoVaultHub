import { Module } from '@nestjs/common';
import { EventConsumerService } from './event-consumer.service';
import { WebhookModule } from '../webhook/webhook.module';
import { GasTankAlertsModule } from '../gas-tank-alerts/gas-tank-alerts.module';

@Module({
  imports: [WebhookModule, GasTankAlertsModule],
  providers: [EventConsumerService],
})
export class EventConsumerModule {}
