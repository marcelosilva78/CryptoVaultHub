import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';

@Module({
  imports: [RateLimiterModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
