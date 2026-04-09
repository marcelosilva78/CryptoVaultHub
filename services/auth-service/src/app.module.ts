import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthModule } from './jwt/jwt-auth.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { TotpModule } from './totp/totp.module';
import { RbacModule } from './rbac/rbac.module';
import { ImpersonationModule } from './impersonation/impersonation.module';
import { AuthController } from './auth.controller';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    JwtAuthModule,
    ApiKeyModule,
    TotpModule,
    RbacModule,
    ImpersonationModule,
  ],
  controllers: [AuthController, HealthController],
})
export class AppModule {}
