import { Module } from '@nestjs/common';
import { SyncManagementController } from './sync-management.controller';
import { SyncManagementService } from './sync-management.service';

@Module({
  controllers: [SyncManagementController],
  providers: [SyncManagementService],
  exports: [SyncManagementService],
})
export class SyncManagementModule {}
