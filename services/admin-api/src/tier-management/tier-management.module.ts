import { Module } from '@nestjs/common';
import { TierManagementController } from './tier-management.controller';
import { TierManagementService } from './tier-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [TierManagementController],
  providers: [TierManagementService, AuditLogService],
  exports: [TierManagementService],
})
export class TierManagementModule {}
