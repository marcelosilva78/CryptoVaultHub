import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

/**
 * Lightweight read-only MySQL connection to the cvh_admin database.
 *
 * client-api does not have its own Prisma schema; it communicates with
 * downstream services via HTTP. However, the ProjectScopeGuard needs
 * low-latency access to the `cvh_admin.projects` table to resolve the
 * X-Project-Id header on every request. A raw connection pool avoids
 * the overhead of a second Prisma client generation pipeline.
 */
@Injectable()
export class AdminDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminDatabaseService.name);
  private pool!: mysql.Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>(
      'ADMIN_DATABASE_URL',
      'mysql://root:password@localhost:3306/cvh_admin',
    );
    const parsed = new URL(url);

    this.pool = mysql.createPool({
      host: parsed.hostname,
      port: parseInt(parsed.port || '3306', 10),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace('/', ''),
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    });

    this.logger.log('Admin database pool initialised');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Admin database pool closed');
  }

  /** Execute a parameterised query and return typed rows. */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, params);
    return rows as T[];
  }
}
