import { Module } from '@nestjs/common';
import { ProjectManagementController } from './project-management.controller';
import { ProjectManagementService } from './project-management.service';
import { ProjectContractService } from './project-contract.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [ProjectManagementController],
  providers: [ProjectManagementService, ProjectContractService, AuditLogService],
  exports: [ProjectManagementService, ProjectContractService],
})
export class ProjectManagementModule {}
