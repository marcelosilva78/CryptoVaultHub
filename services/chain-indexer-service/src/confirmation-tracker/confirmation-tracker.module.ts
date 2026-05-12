import { Module } from '@nestjs/common';
import { ConfirmationTrackerService } from './confirmation-tracker.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [ConfirmationTrackerService],
  exports: [ConfirmationTrackerService],
})
export class ConfirmationTrackerModule {}
