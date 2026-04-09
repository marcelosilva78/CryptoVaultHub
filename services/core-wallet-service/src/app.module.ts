import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ChainModule } from './chain/chain.module';
import { TokenModule } from './token/token.module';
import { WalletModule } from './wallet/wallet.module';
import { DepositAddressModule } from './deposit-address/deposit-address.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { BalanceModule } from './balance/balance.module';
import { ComplianceModule } from './compliance/compliance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    BlockchainModule,
    ChainModule,
    TokenModule,
    WalletModule,
    DepositAddressModule,
    WithdrawalModule,
    BalanceModule,
    ComplianceModule,
  ],
})
export class AppModule {}
