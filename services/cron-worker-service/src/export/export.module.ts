import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExportService } from './export.service';
import { ExportWorkerService } from './export.worker';
import { ExportCleanupService } from './export-cleanup.service';
import { ExportController } from './export.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'export' }),
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportWorkerService, ExportCleanupService],
  exports: [ExportService],
})
export class ExportModule {}
