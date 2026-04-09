import { Module } from '@nestjs/common';
import { ReorgDetectorService } from './reorg-detector.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [ReorgDetectorService],
  exports: [ReorgDetectorService],
})
export class ReorgDetectorModule {}
