import { Module } from '@nestjs/common';
import { RpcRouterService } from './rpc-router.service';
import { RpcProxyController } from './rpc-proxy.controller';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [RateLimiterModule, CircuitBreakerModule, HealthModule],
  controllers: [RpcProxyController],
  providers: [RpcRouterService],
  exports: [RpcRouterService],
})
export class RpcRouterModule {}
