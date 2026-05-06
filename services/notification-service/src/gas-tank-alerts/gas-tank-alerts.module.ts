import { Module } from '@nestjs/common';
import { GasTankAlertsConsumer } from './gas-tank-alerts.consumer';
import { WebhookModule } from '../webhook/webhook.module';

/**
 * GasTankAlertsModule — consumes the gas_tank:alerts Redis stream and
 * dispatches gas_tank.low_balance webhooks (and email stubs) to subscribed projects.
 *
 * PrismaService is available globally via PrismaModule (@Global), so it does
 * not need to be imported here. WebhookModule is imported to provide
 * WebhookDeliveryService.
 */
@Module({
  imports: [WebhookModule],
  providers: [GasTankAlertsConsumer],
})
export class GasTankAlertsModule {}
