import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminDatabaseService } from '../prisma/admin-database.service';
import { ProjectRow } from '../common/guards/project-scope.guard';

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  status: string;
  settings: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly adminDb: AdminDatabaseService) {}

  /**
   * List all projects for a client.  Returns active + archived (so the
   * client can see their full history), but not suspended.
   */
  async listProjects(clientId: number): Promise<ProjectSummary[]> {
    const rows = await this.adminDb.query<ProjectRow>(
      `SELECT id, client_id, name, slug, description, is_default, status, settings, created_at, updated_at
       FROM projects
       WHERE client_id = ?
       ORDER BY is_default DESC, created_at ASC`,
      [clientId],
    );

    return rows.map((r) => this.serialize(r));
  }

  /**
   * Get a single project, verifying it belongs to the authenticated client.
   */
  async getProject(clientId: number, projectId: number): Promise<ProjectSummary> {
    const rows = await this.adminDb.query<ProjectRow>(
      `SELECT id, client_id, name, slug, description, is_default, status, settings, created_at, updated_at
       FROM projects
       WHERE id = ? AND client_id = ?
       LIMIT 1`,
      [projectId, clientId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return this.serialize(rows[0]);
  }

  /**
   * Get the project that was resolved by ProjectScopeGuard (cached on the
   * request). Falls back to a DB lookup if the cache is missing.
   */
  async getCurrentProject(
    clientId: number,
    projectId: number,
    cachedProject?: ProjectRow,
  ): Promise<ProjectSummary> {
    if (cachedProject) {
      return this.serialize(cachedProject);
    }

    return this.getProject(clientId, projectId);
  }

  // ---------------------------------------------------------------------------
  private serialize(row: ProjectRow): ProjectSummary {
    let settings: Record<string, any> | null = null;
    if (row.settings) {
      try {
        settings =
          typeof row.settings === 'string'
            ? JSON.parse(row.settings)
            : row.settings;
      } catch {
        this.logger.warn(`Invalid JSON in project.settings for id=${row.id}`);
      }
    }

    return {
      id: row.id.toString(),
      name: row.name,
      slug: row.slug,
      description: row.description,
      isDefault: Boolean(row.is_default),
      status: row.status,
      settings,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
