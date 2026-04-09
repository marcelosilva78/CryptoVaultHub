import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ImpersonationMode = 'read_only' | 'support' | 'full_operational';

export interface StartImpersonationParams {
  adminUserId: number;
  targetClientId: number;
  targetProjectId?: number;
  mode: ImpersonationMode;
  ipAddress?: string;
  userAgent?: string;
}

export interface ImpersonationSession {
  id: number;
  adminUserId: number;
  targetClientId: number;
  targetProjectId: number | null;
  mode: ImpersonationMode;
  startedAt: Date;
  endedAt: Date | null;
}

/** Roles allowed to impersonate, with their maximum mode */
const ROLE_MAX_MODE: Record<string, ImpersonationMode[]> = {
  super_admin: ['read_only', 'support', 'full_operational'],
  admin: ['read_only', 'support'],
};

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start an impersonation session.
   * Validates the admin's role against the requested mode.
   */
  async startSession(
    params: StartImpersonationParams,
  ): Promise<ImpersonationSession> {
    // 1. Validate admin user exists and has permission
    const adminUser = await this.prisma.user.findUnique({
      where: { id: BigInt(params.adminUserId) },
    });

    if (!adminUser || !adminUser.isActive) {
      throw new NotFoundException('Admin user not found or inactive');
    }

    const allowedModes = ROLE_MAX_MODE[adminUser.role];
    if (!allowedModes) {
      throw new ForbiddenException(
        `Role "${adminUser.role}" is not authorized to impersonate clients`,
      );
    }

    if (!allowedModes.includes(params.mode)) {
      throw new ForbiddenException(
        `Role "${adminUser.role}" cannot use "${params.mode}" mode. Allowed: ${allowedModes.join(', ')}`,
      );
    }

    // 2. Check there's no active session for this admin
    const existingActive: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM cvh_auth.impersonation_sessions
       WHERE admin_user_id = ? AND ended_at IS NULL
       LIMIT 1`,
      params.adminUserId,
    );

    if (existingActive.length > 0) {
      throw new BadRequestException(
        'You already have an active impersonation session. End it first.',
      );
    }

    // 3. Create session
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO cvh_auth.impersonation_sessions
        (admin_user_id, target_client_id, target_project_id, mode, ip_address, user_agent, started_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      params.adminUserId,
      params.targetClientId,
      params.targetProjectId ?? null,
      params.mode,
      params.ipAddress ?? null,
      params.userAgent ?? null,
    );

    // Fetch the created session
    const sessions: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM cvh_auth.impersonation_sessions
       WHERE admin_user_id = ? AND ended_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      params.adminUserId,
    );

    const session = sessions[0];

    this.logger.log(
      `Impersonation started: admin=${params.adminUserId} -> client=${params.targetClientId}, mode=${params.mode}, session=${session.id}`,
    );

    return {
      id: Number(session.id),
      adminUserId: Number(session.admin_user_id),
      targetClientId: Number(session.target_client_id),
      targetProjectId: session.target_project_id
        ? Number(session.target_project_id)
        : null,
      mode: session.mode as ImpersonationMode,
      startedAt: session.started_at,
      endedAt: null,
    };
  }

  /**
   * End an active impersonation session.
   */
  async endSession(adminUserId: number): Promise<void> {
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE cvh_auth.impersonation_sessions
       SET ended_at = NOW(3)
       WHERE admin_user_id = ? AND ended_at IS NULL`,
      adminUserId,
    );

    if (result === 0) {
      throw new NotFoundException('No active impersonation session found');
    }

    this.logger.log(`Impersonation ended for admin=${adminUserId}`);
  }

  /**
   * Get the active impersonation session for an admin user.
   */
  async getActiveSession(
    adminUserId: number,
  ): Promise<ImpersonationSession | null> {
    const sessions: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM cvh_auth.impersonation_sessions
       WHERE admin_user_id = ? AND ended_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      adminUserId,
    );

    if (sessions.length === 0) return null;

    const s = sessions[0];
    return {
      id: Number(s.id),
      adminUserId: Number(s.admin_user_id),
      targetClientId: Number(s.target_client_id),
      targetProjectId: s.target_project_id
        ? Number(s.target_project_id)
        : null,
      mode: s.mode as ImpersonationMode,
      startedAt: s.started_at,
      endedAt: null,
    };
  }

  /**
   * Validate a session by ID and return it.
   */
  async validateSession(
    sessionId: number,
  ): Promise<ImpersonationSession | null> {
    const sessions: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM cvh_auth.impersonation_sessions
       WHERE id = ? AND ended_at IS NULL
       LIMIT 1`,
      sessionId,
    );

    if (sessions.length === 0) return null;

    const s = sessions[0];
    return {
      id: Number(s.id),
      adminUserId: Number(s.admin_user_id),
      targetClientId: Number(s.target_client_id),
      targetProjectId: s.target_project_id
        ? Number(s.target_project_id)
        : null,
      mode: s.mode as ImpersonationMode,
      startedAt: s.started_at,
      endedAt: null,
    };
  }

  /**
   * Record an audit entry for an action performed during impersonation.
   */
  async recordAudit(params: {
    sessionId: number;
    adminUserId: number;
    targetClientId: number;
    targetProjectId?: number;
    action: string;
    resourceType?: string;
    resourceId?: string;
    requestMethod: string;
    requestPath: string;
    requestBodyHash?: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO cvh_auth.impersonation_audit
        (session_id, admin_user_id, target_client_id, target_project_id,
         action, resource_type, resource_id, request_method, request_path,
         request_body_hash, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      params.sessionId,
      params.adminUserId,
      params.targetClientId,
      params.targetProjectId ?? null,
      params.action,
      params.resourceType ?? null,
      params.resourceId ?? null,
      params.requestMethod,
      params.requestPath,
      params.requestBodyHash ?? null,
      params.ipAddress ?? null,
    );
  }

  /**
   * List impersonation sessions with pagination (for audit UI).
   */
  async listSessions(params: {
    page?: number;
    limit?: number;
    adminUserId?: number;
  }): Promise<{ sessions: any[]; total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    let countQuery = `SELECT COUNT(*) as cnt FROM cvh_auth.impersonation_sessions`;
    let dataQuery = `SELECT * FROM cvh_auth.impersonation_sessions`;
    const queryParams: unknown[] = [];

    if (params.adminUserId) {
      const where = ` WHERE admin_user_id = ?`;
      countQuery += where;
      dataQuery += where;
      queryParams.push(params.adminUserId);
    }

    dataQuery += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`;

    const countResult: any[] = await this.prisma.$queryRawUnsafe(
      countQuery,
      ...queryParams,
    );
    const total = Number(countResult[0]?.cnt ?? 0);

    const sessions: any[] = await this.prisma.$queryRawUnsafe(
      dataQuery,
      ...queryParams,
      limit,
      offset,
    );

    return { sessions, total };
  }
}
