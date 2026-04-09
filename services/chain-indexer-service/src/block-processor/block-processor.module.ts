import { Module } from '@nestjs/common';
import { BlockProcessorService } from './block-processor.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  providers: [BlockProcessorService],
  exports: [BlockProcessorService],
})
export class BlockProcessorModule {}
