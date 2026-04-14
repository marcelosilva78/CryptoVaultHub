import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChainListenerService } from './chain-listener.service';
import { SweepModule } from '../sweep/sweep.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sweep' }),
    BullModule.registerQueue({ name: 'forwarder-deploy' }),
    SweepModule,
  ],
  providers: [ChainListenerService],
})
export class ChainListenerModule {}
