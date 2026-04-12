import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailWorker } from './email.worker';
import { EmailController } from './email.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email-delivery',
    }),
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailWorker],
  exports: [EmailService],
})
export class EmailModule {}
