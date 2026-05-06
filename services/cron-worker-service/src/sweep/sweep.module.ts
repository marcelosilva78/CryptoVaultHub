import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SweepService } from './sweep.service';
import { TransactionSubmitterService } from './transaction-submitter.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { GasTankModule } from '../gas-tank/gas-tank.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sweep' }),
    BlockchainModule,
    GasTankModule,
  ],
  providers: [SweepService, TransactionSubmitterService],
  exports: [SweepService, TransactionSubmitterService],
})
export class SweepModule {}
