import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsModule, MetricsInterceptor, StructuredLoggerModule } from '@cvh/config';
import { WalletModule } from './wallet/wallet.module';
import { DepositModule } from './deposit/deposit.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { AddressBookModule } from './address-book/address-book.module';
import { WebhookModule } from './webhook/webhook.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { CoSignModule } from './co-sign/co-sign.module';
import { AdminDatabaseModule } from './prisma/admin-database.module';
import { RedisModule } from './common/redis/redis.module';
import { ProjectModule } from './project/project.module';
import { ProjectSetupModule } from './project-setup/project-setup.module';
import { FlushModule } from './flush/flush.module';
import { DeployTraceModule } from './deploy-trace/deploy-trace.module';
import { AddressGroupModule } from './address-group/address-group.module';
import { ExportModule } from './export/export.module';
import { TokenModule } from './token/token.module';
import { ChainModule } from './chain/chain.module';
import { NotificationRulesModule } from './notification-rules/notification-rules.module';
import { SecurityModule } from './security/security.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { GasTanksModule } from './gas-tanks/gas-tanks.module';
import { HealthController } from './common/health.controller';
import { PostHogInterceptor } from './common/interceptors/posthog.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    MetricsModule,
    StructuredLoggerModule,
    AdminDatabaseModule,
    RedisModule,
    WalletModule,
    DepositModule,
    WithdrawalModule,
    AddressBookModule,
    WebhookModule,
    ApiKeyModule,
    CoSignModule,
    ProjectModule,
    ProjectSetupModule,
    FlushModule,
    DeployTraceModule,
    AddressGroupModule,
    ExportModule,
    TokenModule,
    ChainModule,
    NotificationRulesModule,
    SecurityModule,
    KnowledgeBaseModule,
    GasTanksModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PostHogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
