import { Module } from '@nestjs/common';
import { AddressRegistrationHandler } from './address-registration.handler';
import { BlockProcessorModule } from '../block-processor/block-processor.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockProcessorModule, BlockchainModule],
  providers: [AddressRegistrationHandler],
})
export class AddressRegistrationModule {}
