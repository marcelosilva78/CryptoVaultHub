import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExportService } from './export.service';
import { ExportWorkerService } from './export.worker';
import { ExportCleanupService } from './export-cleanup.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'export' }),
  ],
  providers: [ExportService, ExportWorkerService, ExportCleanupService],
  exports: [ExportService],
})
export class ExportModule {}
