import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AdminDatabaseService } from '../../prisma/admin-database.service';

export interface ProjectRow {
  id: bigint;
  client_id: bigint;
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
  status: string;
  settings: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Guard that resolves and attaches the active project context to the request.
 *
 * Must run AFTER ApiKeyAuthGuard so that `req.clientId` is already set.
 *
 * Resolution logic:
 *  1. If `X-Project-Id` header is present → validate it belongs to the
 *     authenticated client and is active.
 *  2. If header is absent and the client has exactly 1 active project →
 *     auto-select it.
 *  3. If header is absent and the client has multiple active projects →
 *     return 400 with the project list so the caller can pick one.
 *
 * The resolved project is cached on `req.__projectCache` so that
 * downstream services (e.g. ProjectService) can reuse it within the
 * same request without hitting the database again.
 */
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  private readonly logger = new Logger(ProjectScopeGuard.name);

  constructor(private readonly adminDb: AdminDatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clientId: number | undefined = request.clientId;

    if (!clientId) {
      throw new ForbiddenException(
        'ProjectScopeGuard requires an authenticated client (run ApiKeyAuthGuard first)',
      );
    }

    const projectIdHeader = request.headers['x-project-id'];

    if (projectIdHeader) {
      // --- Explicit project selection ---
      const projectId = parseInt(projectIdHeader, 10);
      if (isNaN(projectId)) {
        throw new BadRequestException('X-Project-Id must be a numeric project ID');
      }

      const rows = await this.adminDb.query<ProjectRow>(
        `SELECT id, client_id, name, slug, description, is_default, status, settings, created_at, updated_at
         FROM projects
         WHERE id = ? AND client_id = ?
         LIMIT 1`,
        [projectId, clientId],
      );

      if (rows.length === 0) {
        throw new ForbiddenException(
          `Project ${projectId} not found or does not belong to your client`,
        );
      }

      const project = rows[0];

      if (project.status !== 'active') {
        throw new ForbiddenException(
          `Project ${projectId} is ${project.status} and cannot be used`,
        );
      }

      request.projectId = Number(project.id);
      request.__projectCache = project;

      this.logger.debug(
        `Project resolved from header: ${project.id} (${project.slug})`,
      );

      return true;
    }

    // --- No header: auto-select or prompt ---
    const activeProjects = await this.adminDb.query<ProjectRow>(
      `SELECT id, client_id, name, slug, description, is_default, status, settings, created_at, updated_at
       FROM projects
       WHERE client_id = ? AND status = 'active'
       ORDER BY is_default DESC, created_at ASC`,
      [clientId],
    );

    if (activeProjects.length === 0) {
      throw new BadRequestException(
        'No active projects found for your client. Please contact support.',
      );
    }

    if (activeProjects.length === 1) {
      const project = activeProjects[0];
      request.projectId = Number(project.id);
      request.__projectCache = project;

      this.logger.debug(
        `Project auto-selected (single): ${project.id} (${project.slug})`,
      );

      return true;
    }

    // Multiple active projects — caller must specify
    const projectSummary = activeProjects.map((p) => ({
      id: p.id.toString(),
      name: p.name,
      slug: p.slug,
      isDefault: p.is_default,
    }));

    throw new BadRequestException({
      statusCode: 400,
      message:
        'Multiple active projects found. Please specify X-Project-Id header.',
      projects: projectSummary,
    });
  }
}
