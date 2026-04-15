import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MetricsModule, StructuredLoggerModule } from '@cvh/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { EncryptionModule } from './encryption/encryption.module';
import { KeyGenerationModule } from './key-generation/key-generation.module';
import { SigningModule } from './signing/signing.module';
import { ShamirModule } from './shamir/shamir.module';
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
    PrismaModule,
    AuditModule,
    EncryptionModule,
    KeyGenerationModule,
    SigningModule,
    ShamirModule,
  ],
  controllers: [HealthController],
  providers: [
    // M1: Apply internal service auth globally to all Key Vault endpoints
    {
      provide: APP_GUARD,
      useClass: InternalServiceGuard,
    },
  ],
})
export class AppModule {}
