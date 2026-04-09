import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GapDetectorService } from './gap-detector.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'backfill' }),
  ],
  providers: [GapDetectorService],
  exports: [GapDetectorService],
})
export class GapDetectorModule {}
