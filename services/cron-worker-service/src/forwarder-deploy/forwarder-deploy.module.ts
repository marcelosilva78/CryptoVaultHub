import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ForwarderDeployService } from './forwarder-deploy.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'forwarder-deploy' }),
    BlockchainModule,
  ],
  providers: [ForwarderDeployService],
  exports: [ForwarderDeployService],
})
export class ForwarderDeployModule {}
