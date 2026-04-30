import { Module } from '@nestjs/common';
import { EvmProviderService } from './evm-provider.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [EvmProviderService],
  exports: [EvmProviderService],
})
export class BlockchainModule {}
