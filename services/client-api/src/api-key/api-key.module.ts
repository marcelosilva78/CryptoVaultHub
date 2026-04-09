import { Module } from '@nestjs/common';
import { ApiKeyManagementService } from './api-key.service';

@Module({
  providers: [ApiKeyManagementService],
  exports: [ApiKeyManagementService],
})
export class ApiKeyModule {}
