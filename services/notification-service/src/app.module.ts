import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { MetricsModule, MetricsInterceptor, StructuredLoggerModule } from '@cvh/config';
import { EventBusModule } from '@cvh/event-bus';
import { PostHogModule } from '@cvh/posthog';
import { PrismaModule } from './prisma/prisma.module';
import { WebhookModule } from './webhook/webhook.module';
import { EmailModule } from './email/email.module';
import { EventConsumerModule } from './event-consumer/event-consumer.module';
import { GasTankAlertsModule } from './gas-tank-alerts/gas-tank-alerts.module';
import { InternalServiceGuard } from './common/guards/internal-service.guard';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') ?? undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      }),
    }),
    EventBusModule.forRoot({
      clientId: 'notification-service',
      groupId: 'notification-service',
    }),
    MetricsModule,
    StructuredLoggerModule,
    PostHogModule,
    PrismaModule,
    WebhookModule,
    EmailModule,
    EventConsumerModule,
    GasTankAlertsModule,
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
