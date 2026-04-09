import { Module } from '@nestjs/common';
import { CoSignController } from './co-sign.controller';
import { CoSignService } from './co-sign.service';

@Module({
  controllers: [CoSignController],
  providers: [CoSignService],
  exports: [CoSignService],
})
export class CoSignModule {}
