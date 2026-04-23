import { Module } from '@nestjs/common';
import { ReorgDetectorService } from './reorg-detector.service';
import { ReorgRollbackHandler } from './reorg-rollback.handler';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [ReorgDetectorService, ReorgRollbackHandler],
  exports: [ReorgDetectorService],
})
export class ReorgDetectorModule {}
