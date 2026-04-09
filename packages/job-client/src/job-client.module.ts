import { Module, DynamicModule, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { JobOrchestratorService } from './job-orchestrator.service';
import { JobDedupService } from './job-dedup.service';
import { JobMonitorService } from './job-monitor.service';
import type { JobClientModuleOptions } from './types';

const JOB_POOL = 'JOB_MYSQL_POOL';

@Global()
@Module({})
export class JobClientModule {
  private static readonly logger = new Logger('JobClientModule');

  /**
   * Register with explicit options.
   */
  static forRoot(options: JobClientModuleOptions): DynamicModule {
    const poolProvider = {
      provide: JOB_POOL,
      useFactory: async () => {
        const pool = await JobClientModule.createPool(options);
        return pool;
      },
    };

    return {
      module: JobClientModule,
      providers: [
        poolProvider,
        JobOrchestratorService,
        JobDedupService,
        JobMonitorService,
      ],
      exports: [
        JOB_POOL,
        JobOrchestratorService,
        JobDedupService,
        JobMonitorService,
      ],
    };
  }

  /**
   * Register using environment variables via ConfigService.
   *
   * Expected env vars:
   * - CVH_JOBS_MYSQL_HOST (default: localhost)
   * - CVH_JOBS_MYSQL_PORT (default: 3306)
   * - CVH_JOBS_MYSQL_USER (default: root)
   * - CVH_JOBS_MYSQL_PASSWORD (default: '')
   * - CVH_JOBS_MYSQL_DATABASE (default: cvh_jobs)
   * - CVH_JOBS_MYSQL_POOL_SIZE (default: 10)
   */
  static forRootAsync(): DynamicModule {
    const poolProvider = {
      provide: JOB_POOL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const options: JobClientModuleOptions = {
          mysqlHost: config.get<string>('CVH_JOBS_MYSQL_HOST', 'localhost'),
          mysqlPort: config.get<number>('CVH_JOBS_MYSQL_PORT', 3306),
          mysqlUser: config.get<string>('CVH_JOBS_MYSQL_USER', 'root'),
          mysqlPassword: config.get<string>('CVH_JOBS_MYSQL_PASSWORD', ''),
          mysqlDatabase: config.get<string>('CVH_JOBS_MYSQL_DATABASE', 'cvh_jobs'),
          poolSize: config.get<number>('CVH_JOBS_MYSQL_POOL_SIZE', 10),
        };

        // Support full URI override
        const uri = config.get<string>('CVH_JOBS_MYSQL_URI');
        if (uri) {
          options.mysqlUri = uri;
        }

        return JobClientModule.createPool(options);
      },
    };

    return {
      module: JobClientModule,
      imports: [ConfigModule],
      providers: [
        poolProvider,
        JobOrchestratorService,
        JobDedupService,
        JobMonitorService,
      ],
      exports: [
        JOB_POOL,
        JobOrchestratorService,
        JobDedupService,
        JobMonitorService,
      ],
    };
  }

  private static async createPool(
    options: JobClientModuleOptions,
  ): Promise<mysql.Pool> {
    if (options.mysqlUri) {
      JobClientModule.logger.log('Creating cvh_jobs pool from URI');
      return mysql.createPool({
        uri: options.mysqlUri,
        waitForConnections: true,
        connectionLimit: options.poolSize ?? 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,
      });
    }

    JobClientModule.logger.log(
      `Creating cvh_jobs pool: ${options.mysqlHost}:${options.mysqlPort}/${options.mysqlDatabase}`,
    );

    return mysql.createPool({
      host: options.mysqlHost ?? 'localhost',
      port: options.mysqlPort ?? 3306,
      user: options.mysqlUser ?? 'root',
      password: options.mysqlPassword ?? '',
      database: options.mysqlDatabase ?? 'cvh_jobs',
      waitForConnections: true,
      connectionLimit: options.poolSize ?? 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
    });
  }
}
