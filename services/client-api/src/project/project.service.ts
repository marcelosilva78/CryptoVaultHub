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
  chainsCount: number;
  walletsCount: number;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly adminDb: AdminDatabaseService) {}

  /**
   * List all projects for a client.  Returns active + archived (so the
   * client can see their full history), but not suspended.
   * Includes chainsCount, walletsCount and deletion schedule fields.
   */
  async listProjects(clientId: number): Promise<ProjectSummary[]> {
    interface ProjectListRow extends ProjectRow {
      deletion_requested_at: Date | null;
      deletion_scheduled_for: Date | null;
      chains_count: number;
      wallets_count: number;
    }

    const rows = await this.adminDb.query<ProjectListRow>(
      `SELECT
         p.id, p.client_id, p.name, p.slug, p.description, p.is_default,
         p.status, p.settings, p.created_at, p.updated_at,
         p.deletion_requested_at, p.deletion_scheduled_for,
         (SELECT COUNT(*) FROM cvh_wallets.project_chains pc WHERE pc.project_id = p.id) AS chains_count,
         (SELECT COUNT(*) FROM cvh_wallets.wallets w WHERE w.project_id = p.id) AS wallets_count
       FROM projects p
       WHERE p.client_id = ?
       ORDER BY p.is_default DESC, p.created_at ASC`,
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
  private serialize(row: ProjectRow & {
    deletion_requested_at?: Date | null;
    deletion_scheduled_for?: Date | null;
    chains_count?: number;
    wallets_count?: number;
  }): ProjectSummary {
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
      chainsCount: Number(row.chains_count ?? 0),
      walletsCount: Number(row.wallets_count ?? 0),
      deletionRequestedAt: row.deletion_requested_at
        ? row.deletion_requested_at instanceof Date
          ? row.deletion_requested_at.toISOString()
          : String(row.deletion_requested_at)
        : null,
      deletionScheduledFor: row.deletion_scheduled_for
        ? row.deletion_scheduled_for instanceof Date
          ? row.deletion_scheduled_for.toISOString()
          : String(row.deletion_scheduled_for)
        : null,
    };
  }
}
