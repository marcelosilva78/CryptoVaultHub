import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { EncryptionModule } from './encryption/encryption.module';
import { KeyGenerationModule } from './key-generation/key-generation.module';
import { SigningModule } from './signing/signing.module';
import { ShamirModule } from './shamir/shamir.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuditModule,
    EncryptionModule,
    KeyGenerationModule,
    SigningModule,
    ShamirModule,
  ],
})
export class AppModule {}
