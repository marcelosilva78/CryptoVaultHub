import { Module } from '@nestjs/common';
import { EvmProviderService } from './evm-provider.service';
import { ContractService } from './contract.service';
import { NonceService } from './nonce.service';

@Module({
  providers: [EvmProviderService, ContractService, NonceService],
  exports: [EvmProviderService, ContractService, NonceService],
})
export class BlockchainModule {}
