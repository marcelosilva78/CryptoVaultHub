-- 034-project-deletion.sql
-- Add pending_deletion and deleted statuses + deletion tracking columns to projects

USE `cvh_admin`;

-- Add pending_deletion and deleted to project status enum
ALTER TABLE `projects` MODIFY COLUMN `status` ENUM('active','archived','suspended','pending_deletion','deleted') NOT NULL DEFAULT 'active';

-- Add deletion tracking columns
ALTER TABLE `projects` ADD COLUMN `deletion_requested_at` DATETIME(3) NULL;
ALTER TABLE `projects` ADD COLUMN `deletion_scheduled_for` DATETIME(3) NULL;
