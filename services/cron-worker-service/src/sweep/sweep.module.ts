import { Module } from '@nestjs/common';
import { SweepService } from './sweep.service';
import { TransactionSubmitterService } from './transaction-submitter.service';
import { SweepPolicyResolver } from './sweep-policy-resolver.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { GasTankModule } from '../gas-tank/gas-tank.module';

@Module({
  imports: [
    BlockchainModule,
    GasTankModule,
  ],
  providers: [SweepService, TransactionSubmitterService, SweepPolicyResolver],
  exports: [SweepService, TransactionSubmitterService, SweepPolicyResolver],
})
export class SweepModule {}
