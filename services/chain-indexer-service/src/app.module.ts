import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventBusModule } from '@cvh/event-bus';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { RealtimeDetectorModule } from './realtime-detector/realtime-detector.module';
import { PollingDetectorModule } from './polling-detector/polling-detector.module';
import { ConfirmationTrackerModule } from './confirmation-tracker/confirmation-tracker.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { HealthController } from './common/health.controller';
import { SyncHealthModule } from './sync-health/sync-health.module';
import { GapDetectorModule } from './gap-detector/gap-detector.module';
import { FinalityTrackerModule } from './finality/finality-tracker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    EventBusModule.forRoot({
      clientId: 'chain-indexer-service',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') ?? undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    BlockchainModule,
    RealtimeDetectorModule,
    PollingDetectorModule,
    ConfirmationTrackerModule,
    ReconciliationModule,
    SyncHealthModule,
    GapDetectorModule,
    FinalityTrackerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
