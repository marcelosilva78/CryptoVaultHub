import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminDatabaseModule } from './prisma/admin-database.module';
import { WalletModule } from './wallet/wallet.module';
import { DepositModule } from './deposit/deposit.module';
import { WithdrawalModule } from './withdrawal/withdrawal.module';
import { AddressBookModule } from './address-book/address-book.module';
import { WebhookModule } from './webhook/webhook.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { CoSignModule } from './co-sign/co-sign.module';
import { ProjectModule } from './project/project.module';
import { HealthController } from './common/health.controller';
import { PostHogInterceptor } from './common/interceptors/posthog.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    AdminDatabaseModule,
    WalletModule,
    DepositModule,
    WithdrawalModule,
    AddressBookModule,
    WebhookModule,
    ApiKeyModule,
    CoSignModule,
    ProjectModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PostHogInterceptor,
    },
  ],
})
export class AppModule {}
