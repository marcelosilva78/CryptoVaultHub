import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { MetricsModule, MetricsInterceptor, StructuredLoggerModule } from '@cvh/config';
import { EventBusModule } from '@cvh/event-bus';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { SweepModule } from './sweep/sweep.module';
import { ForwarderDeployModule } from './forwarder-deploy/forwarder-deploy.module';
import { GasTankModule } from './gas-tank/gas-tank.module';
import { SanctionsListSyncModule } from './sanctions-list-sync/sanctions-list-sync.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { ChainListenerModule } from './chain-listener/chain-listener.module';
import { ClientDeletionModule } from './client-deletion/client-deletion.module';
import { ProjectDeletionModule } from './project-deletion/project-deletion.module';
import { HealthController } from './common/health.controller';
import { InternalServiceGuard } from './common/guards/internal-service.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    EventBusModule.forRoot({
      clientId: 'cron-worker-service',
      groupId: 'cron-worker-group',
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
    MetricsModule,
    StructuredLoggerModule,
    PrismaModule,
    RedisModule,
    BlockchainModule,
    SweepModule,
    ForwarderDeployModule,
    GasTankModule,
    SanctionsListSyncModule,
    WithdrawalModule,
    ChainListenerModule,
    ClientDeletionModule,
    ProjectDeletionModule,
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
