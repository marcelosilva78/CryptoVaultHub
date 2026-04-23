import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { MetricsModule, MetricsInterceptor, StructuredLoggerModule } from '@cvh/config';
import { EventBusModule } from '@cvh/event-bus';
import { PostHogModule } from '@cvh/posthog';
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
import { BackfillModule } from './backfill/backfill.module';
import { FinalityTrackerModule } from './finality/finality-tracker.module';
import { AddressRegistrationModule } from './address-registration/address-registration.module';
import { ReorgDetectorModule } from './reorg/reorg-detector.module';
import { InternalServiceGuard } from './common/guards/internal-service.guard';

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
    MetricsModule,
    StructuredLoggerModule,
    PostHogModule,
    PrismaModule,
    RedisModule,
    BlockchainModule,
    RealtimeDetectorModule,
    PollingDetectorModule,
    ConfirmationTrackerModule,
    ReconciliationModule,
    SyncHealthModule,
    GapDetectorModule,
    BackfillModule,
    FinalityTrackerModule,
    AddressRegistrationModule,
    ReorgDetectorModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: InternalServiceGuard,
    },
  ],
})
export class AppModule {}
