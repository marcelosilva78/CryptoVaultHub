import { Module } from '@nestjs/common';
import { FlushService } from './flush.service';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { FlushGuardService } from './flush-guard.service';
import { DryRunService } from './dry-run.service';
import { SweepNativeService } from './sweep-native.service';
import { FlushController } from './flush.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [FlushController],
  providers: [
    FlushService,
    FlushOrchestratorService,
    FlushGuardService,
    DryRunService,
    SweepNativeService,
  ],
  exports: [FlushService, DryRunService, SweepNativeService],
})
export class FlushModule {}
