import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WithdrawalWorkerService } from './withdrawal-worker.service';
import { WithdrawalConfirmService } from './withdrawal-confirm.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { KeyResolverService } from './key-resolver.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'withdrawal' }),
    BullModule.registerQueue({ name: 'withdrawal-confirm' }),
    BlockchainModule,
  ],
  providers: [WithdrawalWorkerService, WithdrawalConfirmService, KeyResolverService],
  exports: [WithdrawalWorkerService, KeyResolverService],
})
export class WithdrawalModule {}
