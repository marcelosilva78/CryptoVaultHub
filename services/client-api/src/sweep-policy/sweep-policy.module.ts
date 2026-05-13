import { Module } from '@nestjs/common';
import { SweepPolicyService } from './sweep-policy.service';
import { SweepPolicyController } from './sweep-policy.controller';

@Module({
  controllers: [SweepPolicyController],
  providers: [SweepPolicyService],
  exports: [SweepPolicyService],
})
export class SweepPolicyModule {}
