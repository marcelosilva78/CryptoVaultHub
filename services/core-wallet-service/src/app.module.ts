import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MetricsModule, StructuredLoggerModule } from '@cvh/config';
import { PostHogModule } from '@cvh/posthog';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ChainModule } from './chain/chain.module';
import { TokenModule } from './token/token.module';
import { WalletModule } from './wallet/wallet.module';
import { DepositAddressModule } from './deposit-address/deposit-address.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { BalanceModule } from './balance/balance.module';
import { ComplianceModule } from './compliance/compliance.module';
import { FlushModule } from './flush/flush.module';
import { DeployTraceModule } from './deploy-trace/deploy-trace.module';
import { DeployModule } from './deploy/deploy.module';
import { AddressGroupModule } from './address-group/address-group.module';
import { InternalServiceGuard } from './common/guards/internal-service.guard';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    MetricsModule,
    StructuredLoggerModule,
    PostHogModule,
    PrismaModule,
    RedisModule,
    BlockchainModule,
    ChainModule,
    TokenModule,
    WalletModule,
    DepositAddressModule,
    WithdrawalModule,
    BalanceModule,
    ComplianceModule,
    FlushModule,
    DeployTraceModule,
    DeployModule,
    AddressGroupModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: InternalServiceGuard,
    },
  ],
})
export class AppModule {}
