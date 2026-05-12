import { Module } from '@nestjs/common';
import { DepositAddressService } from './deposit-address.service';
import { DepositAddressController } from './deposit-address.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [BlockchainModule, PricingModule],
  controllers: [DepositAddressController],
  providers: [DepositAddressService],
  exports: [DepositAddressService],
})
export class DepositAddressModule {}
