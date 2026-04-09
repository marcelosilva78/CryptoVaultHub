import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfirmationTrackerService } from './confirmation-tracker.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'confirmation-tracker' }),
    BlockchainModule,
  ],
  providers: [ConfirmationTrackerService],
  exports: [ConfirmationTrackerService],
})
export class ConfirmationTrackerModule {}
