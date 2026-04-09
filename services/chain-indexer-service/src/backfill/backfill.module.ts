import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackfillWorker } from './backfill.worker';
import { BlockProcessorModule } from '../block-processor/block-processor.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'backfill' }),
    BlockProcessorModule,
  ],
  providers: [BackfillWorker],
  exports: [BackfillWorker],
})
export class BackfillModule {}
