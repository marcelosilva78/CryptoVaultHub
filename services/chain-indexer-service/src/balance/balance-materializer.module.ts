import { Module } from '@nestjs/common';
import { BalanceMaterializerService } from './balance-materializer.service';

@Module({
  providers: [BalanceMaterializerService],
  exports: [BalanceMaterializerService],
})
export class BalanceModule {}
