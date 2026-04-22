import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Daily cron service for processing project deletions:
 *  1. Finds all projects with status = 'pending_deletion'
 *  2. If deletion_scheduled_for <= NOW():
 *     - No transactions  -> hard-delete (cascade across all databases)
 *     - Has transactions -> soft-delete (status = 'deleted') + trigger JSON export
 *  3. If deletion_scheduled_for > NOW() -> sends daily countdown email
 */
@Processor('project-deletion', { concurrency: 1 })
@Injectable()
export class ProjectDeletionService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ProjectDeletionService.name);
  private readonly notificationServiceUrl: string;
  private readonly clientApiUrl: string;
  private readonly internalKey: string;

  constructor(
    @InjectQueue('project-deletion')
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
    this.clientApiUrl = this.config.get<string>(
      'CLIENT_API_URL',
      'http://localhost:3002',
    );
    this.internalKey = this.config.get<string>('INTERNAL_SERVICE_KEY', '');
  }

  async onModuleInit(): Promise<void> {
    await this.initDeletionJob();
  }

  /**
   * Initialize daily project deletion processing job — runs at 09:30 UTC
   * (staggered 30 min after client deletion at 09:00).
   */
  async initDeletionJob(): Promise<void> {
    await this.deletionQueue.add(
      'process-project-deletions',
      {},
      {
        repeat: { pattern: '30 9 * * *' },
        jobId: 'project-deletion-daily',
      },
    );

    this.logger.log('Project deletion cron job initialized (daily at 09:30 UTC)');
  }

  /**
   * BullMQ worker: process pending project deletions.
   */
  async process(job: Job): Promise<{ hardDeleted: number; softDeleted: number; notified: number }> {
    this.logger.log('Processing pending project deletions...');

    try {
      const result = await this.processPendingDeletions();
      this.logger.log(
        `Project deletion cron complete: ${result.hardDeleted} hard-deleted, ` +
        `${result.softDeleted} soft-deleted, ${result.notified} notified`,
      );
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Project deletion cron failed: ${msg}`);
      throw error;
    }
  }

  /**
   * Find all projects with status = 'pending_deletion' and process them.
   */
  async processPendingDeletions(): Promise<{
    hardDeleted: number;
    softDeleted: number;
    notified: number;
  }> {
    const pendingProjects = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.id,
        p.name,
        p.client_id       AS clientId,
        p.deletion_scheduled_for AS deletionScheduledFor,
        c.email            AS clientEmail,
        c.name             AS clientName
      FROM cvh_admin.projects p
      JOIN cvh_admin.clients c ON c.id = p.client_id
      WHERE p.status = 'pending_deletion'
        AND p.deletion_scheduled_for IS NOT NULL
    `;

    let hardDeleted = 0;
    let softDeleted = 0;
    let notified = 0;
    const now = new Date();

    for (const project of pendingProjects) {
      const scheduledFor = new Date(project.deletionScheduledFor);
      const daysRemaining = Math.ceil(
        (scheduledFor.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysRemaining <= 0) {
        // Grace period expired — determine deletion strategy
        const hasTransactions = await this.projectHasTransactions(project.id);

        if (!hasTransactions) {
          await this.hardDeleteProject(project);
          hardDeleted++;
        } else {
          await this.softDeleteProject(project);
          softDeleted++;
        }
      } else {
        // Still within grace period — send daily countdown email
        if (project.clientEmail) {
          await this.sendDeletionCountdownEmail(project, daysRemaining);
          notified++;
        } else {
          this.logger.warn(
            `Project ${project.id} (client ${project.clientId}) has no email, ` +
            'skipping countdown notification',
          );
        }
      }
    }

    return { hardDeleted, softDeleted, notified };
  }

  /**
   * Check whether a project has any transaction history (deposits or withdrawals).
   */
  private async projectHasTransactions(projectId: bigint | number): Promise<boolean> {
    const deposits = await this.prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt
      FROM cvh_wallets.deposits
      WHERE project_id = ${BigInt(projectId)}
      LIMIT 1
    `;

    if (deposits[0] && Number(deposits[0].cnt) > 0) {
      return true;
    }

    const withdrawals = await this.prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt
      FROM cvh_transactions.withdrawals
      WHERE project_id = ${BigInt(projectId)}
      LIMIT 1
    `;

    return withdrawals[0] ? Number(withdrawals[0].cnt) > 0 : false;
  }

  /**
   * Hard-delete a project with no transaction history.
   * Cascades across all databases that hold project-scoped data.
   */
  private async hardDeleteProject(project: {
    id: bigint | number;
    name: string;
    clientId: bigint | number;
  }): Promise<void> {
    const projectId = BigInt(project.id);

    this.logger.log(`Hard-deleting project ${project.id} (${project.name}) — no transactions`);

    // --- cvh_wallets ---
    await this.prisma.$executeRaw`
      DELETE FROM cvh_wallets.wallets WHERE project_id = ${projectId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM cvh_wallets.deposit_addresses WHERE project_id = ${projectId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM cvh_wallets.project_chains WHERE project_id = ${projectId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM cvh_wallets.project_deploy_traces WHERE project_id = ${projectId}
    `;

    // --- cvh_keyvault ---
    await this.prisma.$executeRaw`
      DELETE FROM cvh_keyvault.derived_keys WHERE project_id = ${projectId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM cvh_keyvault.shamir_shares WHERE project_id = ${projectId}
    `;
    await this.prisma.$executeRaw`
      DELETE FROM cvh_keyvault.project_seeds WHERE project_id = ${projectId}
    `;

    // --- cvh_notifications ---
    await this.prisma.$executeRaw`
      DELETE FROM cvh_notifications.webhooks WHERE project_id = ${projectId}
    `;

    // --- cvh_auth ---
    await this.prisma.$executeRaw`
      DELETE FROM cvh_auth.api_keys WHERE project_id = ${projectId}
    `;

    // --- cvh_admin (the project itself) ---
    await this.prisma.$executeRaw`
      DELETE FROM cvh_admin.projects WHERE id = ${projectId}
    `;

    // Write audit log
    await this.prisma.$executeRaw`
      INSERT INTO cvh_admin.audit_logs
        (admin_user_id, action, entity_type, entity_id, details, created_at)
      VALUES
        ('system', 'project.hard_deleted', 'project', ${String(project.id)},
         ${JSON.stringify({
           reason: 'grace_period_expired_no_transactions',
           projectName: project.name,
           clientId: String(project.clientId),
         })},
         NOW(3))
    `;

    // Publish event
    await this.redis.publishToStream('project:deletion', {
      event: 'project.hard_deleted',
      projectId: String(project.id),
      projectName: project.name ?? '',
      clientId: String(project.clientId),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Project ${project.id} (${project.name}) hard-deleted successfully`);
  }

  /**
   * Soft-delete a project that has transaction history.
   * Triggers a JSON export via client-api, then marks the project as 'deleted'.
   */
  private async softDeleteProject(project: {
    id: bigint | number;
    name: string;
    clientId: bigint | number;
  }): Promise<void> {
    const projectId = BigInt(project.id);

    this.logger.log(
      `Soft-deleting project ${project.id} (${project.name}) — has transactions, exporting first`,
    );

    // Trigger JSON export via client-api
    try {
      await axios.post(
        `${this.clientApiUrl}/internal/projects/${project.id}/export`,
        { reason: 'deletion_grace_period_expired' },
        {
          timeout: 30000,
          headers: { 'X-Internal-Service-Key': this.internalKey },
        },
      );
      this.logger.log(`Export triggered for project ${project.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to trigger export for project ${project.id}: ${msg} — proceeding with soft-delete`,
      );
    }

    // Update status to 'deleted'
    await this.prisma.$executeRaw`
      UPDATE cvh_admin.projects
      SET status = 'deleted', updated_at = NOW(3)
      WHERE id = ${projectId}
    `;

    // Write audit log
    await this.prisma.$executeRaw`
      INSERT INTO cvh_admin.audit_logs
        (admin_user_id, action, entity_type, entity_id, details, created_at)
      VALUES
        ('system', 'project.soft_deleted', 'project', ${String(project.id)},
         ${JSON.stringify({
           reason: 'grace_period_expired_with_transactions',
           projectName: project.name,
           clientId: String(project.clientId),
         })},
         NOW(3))
    `;

    // Publish event
    await this.redis.publishToStream('project:deletion', {
      event: 'project.soft_deleted',
      projectId: String(project.id),
      projectName: project.name ?? '',
      clientId: String(project.clientId),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Project ${project.id} (${project.name}) soft-deleted successfully`);
  }

  /**
   * Send a daily countdown email about upcoming project deletion.
   */
  private async sendDeletionCountdownEmail(
    project: {
      id: bigint | number;
      name: string;
      clientId: bigint | number;
      clientEmail: string;
      clientName: string;
      deletionScheduledFor: Date | string;
    },
    daysRemaining: number,
  ): Promise<void> {
    try {
      await axios.post(
        `${this.notificationServiceUrl}/email/project-deletion-countdown`,
        {
          to: project.clientEmail,
          clientId: Number(project.clientId),
          projectId: Number(project.id),
          projectName: project.name,
          orgName: project.clientName,
          daysRemaining,
          scheduledFor: new Date(project.deletionScheduledFor).toISOString(),
        },
        {
          timeout: 10000,
          headers: { 'X-Internal-Service-Key': this.internalKey },
        },
      );
      this.logger.debug(
        `Project deletion countdown email sent to ${project.clientEmail} ` +
        `for project ${project.id} (${daysRemaining} days remaining)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to send deletion countdown email for project ${project.id}: ${msg}`,
      );
    }
  }
}
