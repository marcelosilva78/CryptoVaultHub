import { Module } from '@nestjs/common';
import { ExportManagementController } from './export-management.controller';
import { ExportManagementService } from './export-management.service';

@Module({
  controllers: [ExportManagementController],
  providers: [ExportManagementService],
  exports: [ExportManagementService],
})
export class ExportManagementModule {}
