import { Module } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalExecutorService } from './withdrawal-executor.service';
import { WithdrawalController } from './withdrawal.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [BlockchainModule, ComplianceModule],
  controllers: [WithdrawalController],
  providers: [WithdrawalService, WithdrawalExecutorService],
  exports: [WithdrawalService, WithdrawalExecutorService],
})
export class WithdrawalModule {}
