import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FlushService } from './flush.service';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { FlushGuardService } from './flush-guard.service';
import { DryRunService } from './dry-run.service';
import { SweepNativeService } from './sweep-native.service';
import { FlushActivityService } from './flush-activity.service';
import { FlushController } from './flush.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    BlockchainModule,
    PricingModule,
    BullModule.registerQueue({ name: 'sweep' }),
  ],
  controllers: [FlushController],
  providers: [
    FlushService,
    FlushOrchestratorService,
    FlushGuardService,
    DryRunService,
    SweepNativeService,
    FlushActivityService,
  ],
  exports: [FlushService, DryRunService, SweepNativeService],
})
export class FlushModule {}
