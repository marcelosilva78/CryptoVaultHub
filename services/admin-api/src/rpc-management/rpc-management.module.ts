import { Module } from '@nestjs/common';
import { RpcManagementController } from './rpc-management.controller';
import { RpcManagementService } from './rpc-management.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [RpcManagementController],
  providers: [RpcManagementService, AuditLogService],
  exports: [RpcManagementService],
})
export class RpcManagementModule {}
