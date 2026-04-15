import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CRIT-2: Impersonation sessions are limited to MAX_SESSION_HOURS (4h).
 * The validateSession query includes a time constraint so expired
 * impersonation sessions are never honored.
 *
 * NOTE: The ImpersonationSession model exists in prisma/schema.prisma but
 * has not yet been regenerated into the local generated client. All DB
 * access goes through $queryRaw / $executeRaw until the client is regenerated.
 */
const MAX_SESSION_HOURS = 4;

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startSession(data: {
    adminUserId: string;
    targetClientId: number;
    reason: string;
    ipAddress?: string;
  }) {
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO impersonation_sessions
          (admin_user_id, target_client_id, ip_address, reason, started_at)
        VALUES
          (${data.adminUserId}, ${data.targetClientId}, ${data.ipAddress ?? null}, ${data.reason}, NOW())
      `,
    );

    // Atomically fetch the row we just inserted using LAST_INSERT_ID()
    const [created] = await this.prisma.$queryRaw<
      { id: bigint; started_at: Date }[]
    >(Prisma.sql`SELECT LAST_INSERT_ID() as id, NOW() as started_at`);

    this.logger.log(
      `Impersonation session started: admin=${data.adminUserId} client=${data.targetClientId}`,
    );

    return {
      sessionId: created.id.toString(),
      targetClientId: data.targetClientId,
      startedAt: created.started_at,
    };
  }

  async validateSession(sessionId: string) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - MAX_SESSION_HOURS);

    const rows = await this.prisma.$queryRaw<
      {
        id: bigint;
        admin_user_id: string;
        target_client_id: bigint;
        started_at: Date;
        ended_at: Date | null;
      }[]
    >(
      Prisma.sql`
        SELECT id, admin_user_id, target_client_id, started_at, ended_at
        FROM impersonation_sessions
        WHERE id = ${BigInt(sessionId)}
          AND ended_at IS NULL
          AND started_at > ${cutoff}
        LIMIT 1
      `,
    );

    if (!rows.length) {
      throw new NotFoundException(
        'Impersonation session not found, expired, or inactive',
      );
    }

    const session = rows[0];

    return {
      valid: true,
      sessionId: session.id.toString(),
      adminUserId: session.admin_user_id,
      targetClientId: Number(session.target_client_id),
      startedAt: session.started_at,
    };
  }

  async endSession(sessionId: string, adminUserId: string) {
    const rows = await this.prisma.$queryRaw<{ id: bigint; ended_at: Date | null }[]>(
      Prisma.sql`
        SELECT id, ended_at
        FROM impersonation_sessions
        WHERE id = ${BigInt(sessionId)}
          AND admin_user_id = ${adminUserId}
        LIMIT 1
      `,
    );

    if (!rows.length) {
      throw new NotFoundException('Impersonation session not found');
    }

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE impersonation_sessions
        SET ended_at = NOW()
        WHERE id = ${BigInt(sessionId)}
      `,
    );

    this.logger.log(
      `Impersonation session ended: sessionId=${sessionId} admin=${adminUserId}`,
    );

    return { success: true, message: 'Impersonation session ended' };
  }

  async listSessions(params: {
    page: number;
    limit: number;
    adminUserId?: number;
  }) {
    const offset = (params.page - 1) * params.limit;

    const rows = await this.prisma.$queryRaw<
      {
        id: bigint;
        admin_user_id: string;
        target_client_id: bigint;
        started_at: Date;
        ended_at: Date | null;
      }[]
    >(
      params.adminUserId != null
        ? Prisma.sql`
            SELECT id, admin_user_id, target_client_id, started_at, ended_at
            FROM impersonation_sessions
            WHERE admin_user_id = ${String(params.adminUserId)}
            ORDER BY started_at DESC
            LIMIT ${params.limit} OFFSET ${offset}
          `
        : Prisma.sql`
            SELECT id, admin_user_id, target_client_id, started_at, ended_at
            FROM impersonation_sessions
            ORDER BY started_at DESC
            LIMIT ${params.limit} OFFSET ${offset}
          `,
    );

    return {
      sessions: rows.map((r) => ({
        sessionId: r.id.toString(),
        adminUserId: r.admin_user_id,
        targetClientId: Number(r.target_client_id),
        startedAt: r.started_at,
        endedAt: r.ended_at,
      })),
      page: params.page,
      limit: params.limit,
    };
  }
}
