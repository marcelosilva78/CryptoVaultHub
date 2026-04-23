import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsModule, MetricsInterceptor, StructuredLoggerModule } from '@cvh/config';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthModule } from './jwt/jwt-auth.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { TotpModule } from './totp/totp.module';
import { RbacModule } from './rbac/rbac.module';
import { ImpersonationModule } from './impersonation/impersonation.module';
import { InviteModule } from './invite/invite.module';
import { AuthController } from './auth.controller';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    MetricsModule,
    StructuredLoggerModule,
    PrismaModule,
    JwtAuthModule,
    ApiKeyModule,
    TotpModule,
    RbacModule,
    ImpersonationModule,
    InviteModule,
  ],
  controllers: [AuthController, HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
