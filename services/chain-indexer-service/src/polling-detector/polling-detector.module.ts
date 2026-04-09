import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PollingDetectorService } from './polling-detector.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'polling-detector' }),
    BlockchainModule,
  ],
  providers: [PollingDetectorService],
  exports: [PollingDetectorService],
})
export class PollingDetectorModule {}
