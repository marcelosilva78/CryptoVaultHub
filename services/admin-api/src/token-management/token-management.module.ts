import { Module } from '@nestjs/common';
import { TokenManagementController } from './token-management.controller';
import { TokenManagementService } from './token-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [TokenManagementController],
  providers: [TokenManagementService, AuditLogService],
  exports: [TokenManagementService],
})
export class TokenManagementModule {}
