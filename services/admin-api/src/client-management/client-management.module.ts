import { Module } from '@nestjs/common';
import { ClientManagementController } from './client-management.controller';
import { ClientManagementService } from './client-management.service';
import { AuditLogService } from '../common/audit-log.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [ClientManagementController],
  providers: [ClientManagementService, AuditLogService],
  exports: [ClientManagementService],
})
export class ClientManagementModule {}
