import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ExportService } from './export.service';
import { ExportWorker } from './export.worker';
import { ExportCleanupService } from './export-cleanup.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'export' }),
    ScheduleModule.forRoot(),
  ],
  providers: [ExportService, ExportWorker, ExportCleanupService],
  exports: [ExportService],
})
export class ExportModule {}
