import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SyncHealthService } from './sync-health.service';
import { SyncHealthController } from './sync-health.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    BlockchainModule,
    RedisModule,
    BullModule.registerQueue({ name: 'backfill' }),
  ],
  controllers: [SyncHealthController],
  providers: [SyncHealthService],
  exports: [SyncHealthService],
})
export class SyncHealthModule {}
