import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SweepService } from './sweep.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sweep' }),
    BlockchainModule,
  ],
  providers: [SweepService],
  exports: [SweepService],
})
export class SweepModule {}
