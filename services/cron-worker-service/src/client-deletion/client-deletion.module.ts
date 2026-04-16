import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ClientDeletionService } from './client-deletion.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'client-deletion' }),
  ],
  providers: [ClientDeletionService],
  exports: [ClientDeletionService],
})
export class ClientDeletionModule {}
