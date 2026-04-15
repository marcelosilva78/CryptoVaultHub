import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WithdrawalWorkerService } from './withdrawal-worker.service';
import { WithdrawalConfirmService } from './withdrawal-confirm.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'withdrawal' }),
    BullModule.registerQueue({ name: 'withdrawal-confirm' }),
    BlockchainModule,
  ],
  providers: [WithdrawalWorkerService, WithdrawalConfirmService],
  exports: [WithdrawalWorkerService],
})
export class WithdrawalModule {}
