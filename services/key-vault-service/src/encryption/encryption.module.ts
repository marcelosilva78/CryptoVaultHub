import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { KeyRotationService } from './key-rotation.service';
import { KeyRotationController } from './key-rotation.controller';

@Module({
  controllers: [KeyRotationController],
  providers: [EncryptionService, KeyRotationService],
  exports: [EncryptionService, KeyRotationService],
})
export class EncryptionModule {}
