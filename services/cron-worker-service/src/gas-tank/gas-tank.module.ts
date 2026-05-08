import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GasTankService } from './gas-tank.service';
import { GasTankTxLoggerService } from './gas-tank-tx-logger.service';
import { GasTankReceiptReconcilerService } from './gas-tank-receipt-reconciler.service';
import { PlatformKeyTopupService } from './platform-key-topup.service';
import { TransactionSubmitterService } from '../sweep/transaction-submitter.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'gas-tank' }),
    BullModule.registerQueue({ name: 'platform-topup' }),
    BlockchainModule,
  ],
  providers: [
    GasTankService,
    GasTankTxLoggerService,
    GasTankReceiptReconcilerService,
    PlatformKeyTopupService,
    TransactionSubmitterService,
  ],
  exports: [GasTankService, GasTankTxLoggerService],
})
export class GasTankModule {}
