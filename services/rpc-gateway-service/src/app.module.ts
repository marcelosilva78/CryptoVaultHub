import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsModule, MetricsInterceptor, StructuredLoggerModule } from '@cvh/config';
import { EventBusModule } from '@cvh/event-bus';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RpcRouterModule } from './router/rpc-router.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { HealthModule } from './health/health.module';
import { InternalServiceGuard } from './common/guards/internal-service.guard';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    EventBusModule.forRoot({
      clientId: 'rpc-gateway-service',
    }),
    ScheduleModule.forRoot(),
    MetricsModule,
    StructuredLoggerModule,
    PrismaModule,
    RedisModule,
    RateLimiterModule,
    CircuitBreakerModule,
    HealthModule,
    RpcRouterModule,
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
