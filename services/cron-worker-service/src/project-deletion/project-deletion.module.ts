import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProjectDeletionService } from './project-deletion.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'project-deletion' }),
  ],
  providers: [ProjectDeletionService],
  exports: [ProjectDeletionService],
})
export class ProjectDeletionModule {}
