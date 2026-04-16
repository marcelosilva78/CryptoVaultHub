import { Module, forwardRef } from '@nestjs/common';
import { KeyGenerationService } from './key-generation.service';
import { KeyGenerationController } from './key-generation.controller';
import { ProjectKeyService } from './project-key.service';
import { ProjectKeyController } from './project-key.controller';
import { EncryptionModule } from '../encryption/encryption.module';
import { ShamirModule } from '../shamir/shamir.module';

@Module({
  imports: [EncryptionModule, forwardRef(() => ShamirModule)],
  controllers: [KeyGenerationController, ProjectKeyController],
  providers: [KeyGenerationService, ProjectKeyService],
  exports: [KeyGenerationService, ProjectKeyService],
})
export class KeyGenerationModule {}
