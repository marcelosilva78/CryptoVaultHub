import { Module, forwardRef } from '@nestjs/common';
import { FinalityTrackerService } from './finality-tracker.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { BalanceModule } from '../balance/balance-materializer.module';

@Module({
  imports: [BlockchainModule, forwardRef(() => BalanceModule)],
  providers: [FinalityTrackerService],
  exports: [FinalityTrackerService],
})
export class FinalityTrackerModule {}
