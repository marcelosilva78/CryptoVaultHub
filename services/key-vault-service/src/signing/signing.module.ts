import { Module } from '@nestjs/common';
import { SigningService } from './signing.service';
import { SigningController } from './signing.controller';
import { KeyGenerationModule } from '../key-generation/key-generation.module';

@Module({
  imports: [KeyGenerationModule],
  controllers: [SigningController],
  providers: [SigningService],
  exports: [SigningService],
})
export class SigningModule {}
