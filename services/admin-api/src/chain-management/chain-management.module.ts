import { Module } from '@nestjs/common';
import { ChainManagementController } from './chain-management.controller';
import { ChainManagementService } from './chain-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [ChainManagementController],
  providers: [ChainManagementService, AuditLogService],
  exports: [ChainManagementService],
})
export class ChainManagementModule {}
