import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailWorker } from './email.worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email-delivery',
    }),
  ],
  providers: [EmailService, EmailWorker],
  exports: [EmailService],
})
export class EmailModule {}
