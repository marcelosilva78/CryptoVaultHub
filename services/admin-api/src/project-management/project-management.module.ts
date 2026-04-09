import { Module } from '@nestjs/common';
import { ProjectManagementController } from './project-management.controller';
import { ProjectManagementService } from './project-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [ProjectManagementController],
  providers: [ProjectManagementService, AuditLogService],
  exports: [ProjectManagementService],
})
export class ProjectManagementModule {}
