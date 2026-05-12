import { Module } from '@nestjs/common';
import { ChainListenerService } from './chain-listener.service';

@Module({
  imports: [],
  providers: [ChainListenerService],
})
export class ChainListenerModule {}
