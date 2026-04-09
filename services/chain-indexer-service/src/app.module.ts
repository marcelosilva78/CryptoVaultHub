import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { RealtimeDetectorModule } from './realtime-detector/realtime-detector.module';
import { PollingDetectorModule } from './polling-detector/polling-detector.module';
import { ConfirmationTrackerModule } from './confirmation-tracker/confirmation-tracker.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { BlockProcessorModule } from './block-processor/block-processor.module';
import { GapDetectorModule } from './gap-detector/gap-detector.module';
import { BackfillModule } from './backfill/backfill.module';
import { FinalityTrackerModule } from './finality/finality-tracker.module';
import { ReorgDetectorModule } from './reorg/reorg-detector.module';
import { BalanceModule } from './balance/balance-materializer.module';
import { SyncHealthModule } from './sync-health/sync-health.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    BlockchainModule,
    RealtimeDetectorModule,
    PollingDetectorModule,
    ConfirmationTrackerModule,
    ReconciliationModule,
    BlockProcessorModule,
    GapDetectorModule,
    BackfillModule,
    FinalityTrackerModule,
    ReorgDetectorModule,
    BalanceModule,
    SyncHealthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
