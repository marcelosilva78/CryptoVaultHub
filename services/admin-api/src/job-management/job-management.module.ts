import { Module } from '@nestjs/common';
import { JobManagementController } from './job-management.controller';
import { JobManagementService } from './job-management.service';

@Module({
  controllers: [JobManagementController],
  providers: [JobManagementService],
  exports: [JobManagementService],
})
export class JobManagementModule {}
