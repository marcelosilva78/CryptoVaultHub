import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('email-delivery') private readonly emailQueue: Queue,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
    });
  }

  /**
   * Queue an email for delivery.
   */
  async queueEmail(params: {
    clientId: number;
    to: string;
    subject: string;
    body: string;
  }) {
    const { clientId, to, subject, body } = params;

    const emailLog = await this.prisma.emailLog.create({
      data: {
        clientId: BigInt(clientId),
        to,
        subject,
        body,
        status: 'queued',
      },
    });

    await this.emailQueue.add(
      'send',
      { emailLogId: Number(emailLog.id) },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Email queued: ${Number(emailLog.id)} to ${to} (client ${clientId})`,
    );

    return {
      id: Number(emailLog.id),
      to,
      subject,
      status: 'queued',
    };
  }

  /**
   * Send an email (called by the worker).
   */
  async sendEmail(emailLogId: bigint) {
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { id: emailLogId },
    });
    if (!emailLog) {
      this.logger.error(`EmailLog ${emailLogId} not found`);
      return;
    }

    try {
      const from = this.config.get<string>(
        'SMTP_FROM',
        'CryptoVaultHub <noreply@example.com>',
      );

      await this.transporter.sendMail({
        from,
        to: emailLog.to,
        subject: emailLog.subject,
        html: emailLog.body,
      });

      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      this.logger.log(`Email sent: ${Number(emailLogId)} to ${emailLog.to}`);
    } catch (error: any) {
      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          status: 'failed',
          error: error.message || 'Unknown error',
        },
      });

      this.logger.error(
        `Email send failed: ${Number(emailLogId)}: ${error.message}`,
      );
      throw error; // Let BullMQ retry
    }
  }

  /**
   * Send a compliance alert email.
   */
  async sendComplianceAlert(params: {
    clientId: number;
    to: string;
    alertType: string;
    address: string;
    matchedEntity?: string;
    matchedList?: string;
    severity: string;
  }) {
    const {
      clientId,
      to,
      alertType,
      address,
      matchedEntity,
      matchedList,
      severity,
    } = params;

    const subject = `[${severity.toUpperCase()}] Compliance Alert: ${alertType}`;
    const body = `
      <h2>Compliance Alert</h2>
      <p><strong>Type:</strong> ${alertType}</p>
      <p><strong>Severity:</strong> ${severity}</p>
      <p><strong>Address:</strong> ${address}</p>
      ${matchedEntity ? `<p><strong>Matched Entity:</strong> ${matchedEntity}</p>` : ''}
      ${matchedList ? `<p><strong>Matched List:</strong> ${matchedList}</p>` : ''}
      <p><strong>Client ID:</strong> ${clientId}</p>
      <hr>
      <p><em>This is an automated alert from CryptoVaultHub compliance system.</em></p>
    `.trim();

    return this.queueEmail({ clientId, to, subject, body });
  }

  /**
   * Queue an invite email for a new client user.
   */
  async sendInviteEmail(params: {
    to: string;
    clientId: number;
    inviteUrl: string;
    orgName: string;
  }) {
    const { to, clientId, inviteUrl, orgName } = params;

    const escHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const subject = `You've been invited to ${orgName} on VaultHub`;
    const body = `
      <h2>Welcome to VaultHub</h2>
      <p>You have been invited to join <strong>${escHtml(orgName)}</strong> on VaultHub.</p>
      <p>Click the button below to set up your account. This link expires in 48 hours.</p>
      <p>
        <a href="${inviteUrl}"
           style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Accept Invitation
        </a>
      </p>
      <p>Or copy this link: <code>${escHtml(inviteUrl)}</code></p>
      <hr>
      <p><em>If you did not expect this invitation, you can safely ignore this email.</em></p>
    `.trim();

    return this.queueEmail({ clientId, to, subject, body });
  }
}
