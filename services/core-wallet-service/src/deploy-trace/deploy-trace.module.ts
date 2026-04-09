import { Module } from '@nestjs/common';
import { DeployTraceService } from './deploy-trace.service';
import { DeployTraceController } from './deploy-trace.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [DeployTraceController],
  providers: [DeployTraceService],
  exports: [DeployTraceService],
})
export class DeployTraceModule {}
