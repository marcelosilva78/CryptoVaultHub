import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { JobClientModule } from '@cvh/job-client';
import { ClientManagementModule } from './client-management/client-management.module';
import { TierManagementModule } from './tier-management/tier-management.module';
import { ChainManagementModule } from './chain-management/chain-management.module';
import { ComplianceManagementModule } from './compliance-management/compliance-management.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProjectManagementModule } from './project-management/project-management.module';
import { JobManagementModule } from './job-management/job-management.module';
import { RpcManagementModule } from './rpc-management/rpc-management.module';
import { SyncManagementModule } from './sync-management/sync-management.module';
import { PostHogInterceptor } from './common/interceptors/posthog.interceptor';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    JobClientModule.forRootAsync(),
    ClientManagementModule,
    TierManagementModule,
    ChainManagementModule,
    ComplianceManagementModule,
    MonitoringModule,
    ProjectManagementModule,
    JobManagementModule,
    RpcManagementModule,
    SyncManagementModule,
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
