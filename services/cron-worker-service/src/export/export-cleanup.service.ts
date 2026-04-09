import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';

/**
 * Cron service that cleans up expired export files.
 * Runs every hour to:
 * 1. Mark expired export requests as 'expired'
 * 2. Delete the associated files from disk
 * 3. Clean up export_files records
 */
@Injectable()
export class ExportCleanupService {
  private readonly logger = new Logger(ExportCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredExports(): Promise<void> {
    this.logger.log('Starting export cleanup...');

    try {
      // 1. Find expired exports that still have status 'completed'
      const expired: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT id, request_uid, file_path
         FROM cvh_exports.export_requests
         WHERE status = 'completed'
           AND expires_at IS NOT NULL
           AND expires_at < NOW(3)`,
      );

      if (expired.length === 0) {
        this.logger.debug('No expired exports found');
        return;
      }

      let filesDeleted = 0;
      let deleteErrors = 0;

      for (const request of expired) {
        // Delete the file from disk
        if (request.file_path) {
          try {
            if (fs.existsSync(request.file_path)) {
              fs.unlinkSync(request.file_path);
              filesDeleted++;
            }
          } catch (error) {
            this.logger.warn(
              `Failed to delete export file ${request.file_path}: ${(error as Error).message}`,
            );
            deleteErrors++;
          }
        }
      }

      // 2. Mark all expired exports as 'expired' in the database
      const expiredIds = expired.map((r) => r.id);
      if (expiredIds.length > 0) {
        const placeholders = expiredIds.map(() => '?').join(',');
        await this.prisma.$executeRawUnsafe(
          `UPDATE cvh_exports.export_requests
           SET status = 'expired'
           WHERE id IN (${placeholders})`,
          ...expiredIds,
        );
      }

      // 3. Also clean up failed exports older than 7 days
      const cleanedFailed: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT file_path FROM cvh_exports.export_requests
         WHERE status = 'failed'
           AND created_at < DATE_SUB(NOW(3), INTERVAL 7 DAY)
           AND file_path IS NOT NULL`,
      );

      for (const request of cleanedFailed) {
        if (request.file_path) {
          try {
            if (fs.existsSync(request.file_path)) {
              fs.unlinkSync(request.file_path);
            }
          } catch {
            // Silently ignore cleanup errors for failed exports
          }
        }
      }

      await this.prisma.$executeRawUnsafe(
        `DELETE FROM cvh_exports.export_requests
         WHERE status = 'failed'
           AND created_at < DATE_SUB(NOW(3), INTERVAL 7 DAY)`,
      );

      this.logger.log(
        `Export cleanup completed: ${expired.length} expired, ${filesDeleted} files deleted, ${deleteErrors} errors`,
      );
    } catch (error) {
      this.logger.error(
        `Export cleanup failed: ${(error as Error).message}`,
      );
    }
  }
}
