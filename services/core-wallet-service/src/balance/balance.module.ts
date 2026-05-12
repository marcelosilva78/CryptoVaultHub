import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [BlockchainModule, PricingModule],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
