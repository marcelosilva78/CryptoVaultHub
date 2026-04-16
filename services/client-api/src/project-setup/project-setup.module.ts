import { Module } from '@nestjs/common';
import { ProjectSetupController } from './project-setup.controller';
import { ProjectSetupService } from './project-setup.service';

@Module({
  controllers: [ProjectSetupController],
  providers: [ProjectSetupService],
  exports: [ProjectSetupService],
})
export class ProjectSetupModule {}
