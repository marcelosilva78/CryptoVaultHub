import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GasTankService } from './gas-tank.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'gas-tank' }),
    BlockchainModule,
  ],
  providers: [GasTankService],
  exports: [GasTankService],
})
export class GasTankModule {}
