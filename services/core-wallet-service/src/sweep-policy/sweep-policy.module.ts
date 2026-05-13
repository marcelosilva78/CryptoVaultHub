import { Module } from '@nestjs/common';
import { SweepPolicyService } from './sweep-policy.service';
import { SweepPolicyController } from './sweep-policy.controller';
import { SweepTriggerController } from './sweep-trigger.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [SweepPolicyController, SweepTriggerController],
  providers: [SweepPolicyService],
  exports: [SweepPolicyService],
})
export class SweepPolicyModule {}
