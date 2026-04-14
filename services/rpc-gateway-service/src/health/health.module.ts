import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { RpcHealthController } from './health.controller';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';

@Module({
  imports: [RateLimiterModule],
  controllers: [RpcHealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
