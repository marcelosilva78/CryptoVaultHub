import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventBusModule } from '@cvh/event-bus';
import { PrismaModule } from './prisma/prisma.module';
import { ClientManagementModule } from './client-management/client-management.module';
import { TierManagementModule } from './tier-management/tier-management.module';
import { ChainManagementModule } from './chain-management/chain-management.module';
import { ComplianceManagementModule } from './compliance-management/compliance-management.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RpcManagementModule } from './rpc-management/rpc-management.module';
import { ProjectManagementModule } from './project-management/project-management.module';
import { JobManagementModule } from './job-management/job-management.module';
import { SyncManagementModule } from './sync-management/sync-management.module';
import { ExportManagementModule } from './export-management/export-management.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PostHogInterceptor } from './common/interceptors/posthog.interceptor';
import { HealthController } from './common/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AdminRoleGuard } from './common/guards/admin-role.guard';
import { ImpersonationGuard } from './common/guards/impersonation.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    EventBusModule.forRoot({
      clientId: 'admin-api',
    }),
    PrismaModule,
    ClientManagementModule,
    TierManagementModule,
    ChainManagementModule,
    ComplianceManagementModule,
    MonitoringModule,
    RpcManagementModule,
    ProjectManagementModule,
    JobManagementModule,
    SyncManagementModule,
    ExportManagementModule,
    TransactionsModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PostHogInterceptor,
    },
    /**
     * HIGH-1: Global guards applied in order:
     * 1. JwtAuthGuard — validates JWT token
     * 2. AdminRoleGuard — validates admin role
     * 3. ImpersonationGuard — attaches impersonation context if present
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AdminRoleGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ImpersonationGuard,
    },
  ],
})
export class AppModule {}
