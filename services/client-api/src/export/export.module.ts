import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportApiService } from './export.service';

@Module({
  controllers: [ExportController],
  providers: [ExportApiService],
  exports: [ExportApiService],
})
export class ExportModule {}
