import { Module } from '@nestjs/common';
import { RealtimeDetectorService } from './realtime-detector.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [RealtimeDetectorService],
  exports: [RealtimeDetectorService],
})
export class RealtimeDetectorModule {}
