import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController, KeyProxyController } from './wallet.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [BlockchainModule, BalanceModule],
  controllers: [WalletController, KeyProxyController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
