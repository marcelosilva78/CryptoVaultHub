import { Module } from '@nestjs/common';
import { PollingDetectorService } from './polling-detector.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [PollingDetectorService],
  exports: [PollingDetectorService],
})
export class PollingDetectorModule {}
