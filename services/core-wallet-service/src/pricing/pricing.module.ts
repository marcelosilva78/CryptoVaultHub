import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
