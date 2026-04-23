import { Module, forwardRef } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalExecutorService } from './withdrawal-executor.service';
import { WithdrawalController } from './withdrawal.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { CoSignModule } from '../co-sign/co-sign.module';

@Module({
  imports: [BlockchainModule, ComplianceModule, forwardRef(() => CoSignModule)],
  controllers: [WithdrawalController],
  providers: [WithdrawalService, WithdrawalExecutorService],
  exports: [WithdrawalService, WithdrawalExecutorService],
})
export class WithdrawalModule {}
