import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChainListenerService } from './chain-listener.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sweep' }),
    BullModule.registerQueue({ name: 'forwarder-deploy' }),
  ],
  providers: [ChainListenerService],
})
export class ChainListenerModule {}
