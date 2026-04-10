import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from './email.service';

@Processor('email-delivery', { concurrency: 10 })
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<{ emailLogId: number }>) {
    const { emailLogId } = job.data;

    this.logger.debug(`Processing email delivery job: emailLogId=${emailLogId}`);

    try {
      await this.emailService.sendEmail(BigInt(emailLogId));
    } catch (error: any) {
      this.logger.error(
        `Email delivery job failed: emailLogId=${emailLogId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
