import { Module } from '@nestjs/common';
import { FlushController } from './flush.controller';
import { FlushService } from './flush.service';

@Module({
  controllers: [FlushController],
  providers: [FlushService],
  exports: [FlushService],
})
export class FlushModule {}
