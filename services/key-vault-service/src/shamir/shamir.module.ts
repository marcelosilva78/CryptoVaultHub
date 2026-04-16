import { Module, forwardRef } from '@nestjs/common';
import { ShamirService } from './shamir.service';
import { ShamirController } from './shamir.controller';
import { KeyGenerationModule } from '../key-generation/key-generation.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [forwardRef(() => KeyGenerationModule), EncryptionModule],
  controllers: [ShamirController],
  providers: [ShamirService],
  exports: [ShamirService],
})
export class ShamirModule {}
