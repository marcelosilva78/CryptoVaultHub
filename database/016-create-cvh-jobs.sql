-- ============================================================================
-- CVH Jobs Database — Persistent job tracking for BullMQ queue infrastructure
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `cvh_jobs` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cvh_jobs`;

-- ── Jobs: Primary job tracking table ──────────────────────────────────────────
CREATE TABLE `jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `job_uid` VARCHAR(255) NOT NULL,
  `queue_name` VARCHAR(100) NOT NULL,
  `job_type` VARCHAR(100) NOT NULL,
  `priority` ENUM('critical','standard','bulk') NOT NULL DEFAULT 'standard',
  `status` ENUM('pending','queued','processing','completed','failed','dead_letter','canceled') NOT NULL DEFAULT 'pending',
  `client_id` BIGINT NULL,
  `project_id` BIGINT NULL,
  `chain_id` INT NULL,
  `payload` JSON NOT NULL,
  `result` JSON NULL,
  `correlation_id` VARCHAR(255) NULL,
  `parent_job_id` BIGINT NULL,
  `max_attempts` INT NOT NULL DEFAULT 3,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `backoff_type` ENUM('exponential','linear','fixed') NOT NULL DEFAULT 'exponential',
  `backoff_delay_ms` INT NOT NULL DEFAULT 1000,
  `timeout_ms` INT NOT NULL DEFAULT 30000,
  `scheduled_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `failed_at` DATETIME(3) NULL,
  `next_retry_at` DATETIME(3) NULL,
  `locked_by` VARCHAR(255) NULL,
  `locked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_uid` (`job_uid`),
  INDEX `idx_queue_status` (`queue_name`, `status`, `priority`, `scheduled_at`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `job_type`, `status`),
  INDEX `idx_correlation` (`correlation_id`),
  INDEX `idx_retry` (`status`, `next_retry_at`),
  INDEX `idx_type_status` (`job_type`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Job Attempts: Per-attempt logging ─────────────────────────────────────────
CREATE TABLE `job_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT NOT NULL,
  `attempt_number` INT NOT NULL,
  `status` ENUM('processing','completed','failed') NOT NULL,
  `worker_id` VARCHAR(255) NULL,
  `started_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `duration_ms` INT NULL,
  `error_message` TEXT NULL,
  `error_stack` TEXT NULL,
  `result` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_job_attempt` (`job_id`, `attempt_number`),
  CONSTRAINT `fk_attempts_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Dead Letter Jobs: Failed jobs requiring manual review ─────────────────────
CREATE TABLE `dead_letter_jobs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `original_job_id` BIGINT NOT NULL,
  `job_uid` VARCHAR(255) NOT NULL,
  `queue_name` VARCHAR(100) NOT NULL,
  `job_type` VARCHAR(100) NOT NULL,
  `client_id` BIGINT NULL,
  `project_id` BIGINT NULL,
  `payload` JSON NOT NULL,
  `last_error` TEXT NULL,
  `total_attempts` INT NOT NULL,
  `dead_lettered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reprocessed_at` DATETIME(3) NULL,
  `reprocessed_job_id` BIGINT NULL,
  `status` ENUM('pending_review','reprocessed','discarded') NOT NULL DEFAULT 'pending_review',
  `reviewed_by` BIGINT NULL,
  `review_notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`, `dead_lettered_at`),
  INDEX `idx_client` (`client_id`, `job_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Job Locks: Distributed locking for job processing ─────────────────────────
CREATE TABLE `job_locks` (
  `lock_key` VARCHAR(255) NOT NULL,
  `job_id` BIGINT NOT NULL,
  `locked_by` VARCHAR(255) NOT NULL,
  `locked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`lock_key`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Job Schedules: Recurring job definitions ──────────────────────────────────
CREATE TABLE `job_schedules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `schedule_name` VARCHAR(255) NOT NULL,
  `job_type` VARCHAR(100) NOT NULL,
  `queue_name` VARCHAR(100) NOT NULL,
  `cron_expression` VARCHAR(100) NULL,
  `interval_ms` INT NULL,
  `payload` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_triggered_at` DATETIME(3) NULL,
  `next_trigger_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schedule_name` (`schedule_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
