-- 029-client-deletion.sql
-- Add columns to support client soft-deletion with 30-day grace period

USE `cvh_admin`;

ALTER TABLE `clients`
  ADD COLUMN `deletion_requested_at`  DATETIME(3) NULL DEFAULT NULL AFTER `updated_at`,
  ADD COLUMN `deletion_scheduled_for` DATETIME(3) NULL DEFAULT NULL AFTER `deletion_requested_at`,
  ADD COLUMN `deletion_requested_by`  BIGINT      NULL DEFAULT NULL AFTER `deletion_scheduled_for`;

-- Index to efficiently find clients pending deletion (used by daily cron)
CREATE INDEX `idx_deletion_scheduled` ON `clients` (`status`, `deletion_scheduled_for`);
