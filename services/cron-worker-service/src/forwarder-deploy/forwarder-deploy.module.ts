import { Module } from '@nestjs/common';
import { ForwarderDeployService } from './forwarder-deploy.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { SweepModule } from '../sweep/sweep.module';
import { GasTankModule } from '../gas-tank/gas-tank.module';

@Module({
  imports: [
    BlockchainModule,
    SweepModule,
    GasTankModule,
  ],
  providers: [ForwarderDeployService],
  exports: [ForwarderDeployService],
})
export class ForwarderDeployModule {}
