import { Module } from '@nestjs/common';
import { AddressGroupService } from './address-group.service';
import { AddressGroupController } from './address-group.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [AddressGroupController],
  providers: [AddressGroupService],
  exports: [AddressGroupService],
})
export class AddressGroupModule {}
