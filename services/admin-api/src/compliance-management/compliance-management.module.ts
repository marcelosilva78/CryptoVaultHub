import { Module } from '@nestjs/common';
import { ComplianceManagementController } from './compliance-management.controller';
import { ComplianceManagementService } from './compliance-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [ComplianceManagementController],
  providers: [ComplianceManagementService, AuditLogService],
  exports: [ComplianceManagementService],
})
export class ComplianceManagementModule {}
