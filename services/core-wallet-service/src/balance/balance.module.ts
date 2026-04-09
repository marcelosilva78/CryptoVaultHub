import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
