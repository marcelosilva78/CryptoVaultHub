import { Module } from '@nestjs/common';
import { EvmProviderService } from './evm-provider.service';
import { ContractService } from './contract.service';
import { NonceService } from './nonce.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [EvmProviderService, ContractService, NonceService],
  exports: [EvmProviderService, ContractService, NonceService],
})
export class BlockchainModule {}
