import { Module } from '@nestjs/common';
import { DepositAddressService } from './deposit-address.service';
import { DepositAddressController } from './deposit-address.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [DepositAddressController],
  providers: [DepositAddressService],
  exports: [DepositAddressService],
})
export class DepositAddressModule {}
