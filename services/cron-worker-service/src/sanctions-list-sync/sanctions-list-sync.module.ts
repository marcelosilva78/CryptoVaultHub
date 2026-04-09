import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SanctionsListSyncService } from './sanctions-list-sync.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sanctions-sync' }),
  ],
  providers: [SanctionsListSyncService],
  exports: [SanctionsListSyncService],
})
export class SanctionsListSyncModule {}
