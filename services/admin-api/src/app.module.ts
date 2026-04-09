import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { ClientManagementModule } from './client-management/client-management.module';
import { TierManagementModule } from './tier-management/tier-management.module';
import { ChainManagementModule } from './chain-management/chain-management.module';
import { ComplianceManagementModule } from './compliance-management/compliance-management.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PostHogInterceptor } from './common/interceptors/posthog.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    ClientManagementModule,
    TierManagementModule,
    ChainManagementModule,
    ComplianceManagementModule,
    MonitoringModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PostHogInterceptor,
    },
  ],
})
export class AppModule {}
