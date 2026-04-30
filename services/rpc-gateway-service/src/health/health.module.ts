import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { RpcHealthController } from './health.controller';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RateLimiterModule, RedisModule],
  controllers: [RpcHealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
