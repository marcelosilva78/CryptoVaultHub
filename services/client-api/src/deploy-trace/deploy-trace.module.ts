import { Module } from '@nestjs/common';
import { DeployTraceController } from './deploy-trace.controller';
import { DeployTraceService } from './deploy-trace.service';

@Module({
  controllers: [DeployTraceController],
  providers: [DeployTraceService],
  exports: [DeployTraceService],
})
export class DeployTraceModule {}
