import { Module } from '@nestjs/common';
import { JobClientModule } from '@cvh/job-client';
import { JobManagementController } from './job-management.controller';
import { JobManagementService } from './job-management.service';

@Module({
  imports: [JobClientModule.forRootAsync()],
  controllers: [JobManagementController],
  providers: [JobManagementService],
  exports: [JobManagementService],
})
export class JobManagementModule {}
