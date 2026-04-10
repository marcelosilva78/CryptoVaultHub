import { Module } from '@nestjs/common';
import { RpcManagementController } from './rpc-management.controller';
import { RpcManagementService } from './rpc-management.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  imports: [PrismaModule],
  controllers: [RpcManagementController],
  providers: [RpcManagementService, AuditLogService],
  exports: [RpcManagementService],
})
export class RpcManagementModule {}
