import { Module } from '@nestjs/common';
import { CoSignOrchestratorService } from './co-sign-orchestrator.service';
import { CoSignController } from './co-sign.controller';

@Module({
  controllers: [CoSignController],
  providers: [CoSignOrchestratorService],
  exports: [CoSignOrchestratorService],
})
export class CoSignModule {}
