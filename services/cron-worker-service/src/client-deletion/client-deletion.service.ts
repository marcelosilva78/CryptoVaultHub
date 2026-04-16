import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Daily cron service for processing client deletions:
 *  1. Finds all clients with status = 'pending_deletion'
 *  2. If deletion_scheduled_for <= NOW()  -> soft-deletes (status = 'deleted')
 *  3. If deletion_scheduled_for > NOW()   -> sends daily countdown email
 */
@Processor('client-deletion', { concurrency: 1 })
@Injectable()
export class ClientDeletionService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ClientDeletionService.name);
  private readonly notificationServiceUrl: string;
  private readonly internalKey: string;

  constructor(
    @InjectQueue('client-deletion')
    private readonly deletionQueue: Queue,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
    this.notificationServiceUrl = this.config.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
    this.internalKey = this.config.get<string>('INTERNAL_SERVICE_KEY', '');
  }

  async onModuleInit(): Promise<void> {
    await this.initDeletionJob();
  }

  /**
   * Initialize daily client deletion processing job — runs at 09:00 UTC.
   */
  async initDeletionJob(): Promise<void> {
    await this.deletionQueue.add(
      'process-client-deletions',
      {},
      {
        repeat: { pattern: '0 9 * * *' },
        jobId: 'client-deletion-daily',
      },
    );

    this.logger.log('Client deletion cron job initialized (daily at 09:00 UTC)');
  }

  /**
   * BullMQ worker: process pending client deletions.
   */
  async process(job: Job): Promise<{ deleted: number; notified: number }> {
    this.logger.log('Processing pending client deletions…');

    try {
      const result = await this.processPendingDeletions();
      this.logger.log(
        `Client deletion cron complete: ${result.deleted} deleted, ${result.notified} notified`,
      );
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Client deletion cron failed: ${msg}`);
      throw error;
    }
  }

  /**
   * Find all clients with status = 'pending_deletion' and process them.
   */
  async processPendingDeletions(): Promise<{ deleted: number; notified: number }> {
    const pendingClients = await this.prisma.$queryRaw<any[]>`
      SELECT id, name, email, deletion_scheduled_for AS deletionScheduledFor
      FROM cvh_admin.clients
      WHERE status = 'pending_deletion'
        AND deletion_scheduled_for IS NOT NULL
    `;

    let deleted = 0;
    let notified = 0;
    const now = new Date();

    for (const client of pendingClients) {
      const scheduledFor = new Date(client.deletionScheduledFor);
      const daysRemaining = Math.ceil(
        (scheduledFor.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysRemaining <= 0) {
        // Grace period expired — soft-delete
        await this.prisma.$executeRaw`
          UPDATE cvh_admin.clients
          SET status = 'deleted', updated_at = NOW(3)
          WHERE id = ${BigInt(client.id)}
        `;

        // Write audit log
        await this.prisma.$executeRaw`
          INSERT INTO cvh_admin.audit_logs
            (admin_user_id, action, entity_type, entity_id, details, created_at)
          VALUES
            ('system', 'client.auto_deleted', 'client', ${String(client.id)},
             ${JSON.stringify({ reason: 'grace_period_expired', scheduledFor: scheduledFor.toISOString() })},
             NOW(3))
        `;

        // Publish event
        await this.redis.publishToStream('client:deletion', {
          event: 'client.auto_deleted',
          clientId: String(client.id),
          clientName: client.name ?? '',
          timestamp: new Date().toISOString(),
        });

        this.logger.log(`Client ${client.id} (${client.name}) auto-deleted after grace period`);
        deleted++;
      } else {
        // Still within grace period — send daily countdown email
        if (client.email) {
          await this.sendDeletionCountdownEmail(client, daysRemaining);
          notified++;
        } else {
          this.logger.warn(`Client ${client.id} has no email, skipping countdown notification`);
        }
      }
    }

    return { deleted, notified };
  }

  /**
   * Send a daily countdown email to the client about upcoming deletion.
   */
  private async sendDeletionCountdownEmail(
    client: { id: bigint | number; name: string; email: string; deletionScheduledFor: Date | string },
    daysRemaining: number,
  ): Promise<void> {
    try {
      await axios.post(
        `${this.notificationServiceUrl}/email/deletion-countdown`,
        {
          to: client.email,
          clientId: Number(client.id),
          orgName: client.name,
          daysRemaining,
          scheduledFor: new Date(client.deletionScheduledFor).toISOString(),
        },
        {
          timeout: 10000,
          headers: { 'X-Internal-Service-Key': this.internalKey },
        },
      );
      this.logger.debug(
        `Deletion countdown email sent to ${client.email} (${daysRemaining} days remaining)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to send deletion countdown email for client ${client.id}: ${msg}`,
      );
    }
  }
}
