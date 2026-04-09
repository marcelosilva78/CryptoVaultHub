import { Module } from '@nestjs/common';
import { KeyGenerationService } from './key-generation.service';
import { KeyGenerationController } from './key-generation.controller';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [EncryptionModule],
  controllers: [KeyGenerationController],
  providers: [KeyGenerationService],
  exports: [KeyGenerationService],
})
export class KeyGenerationModule {}
