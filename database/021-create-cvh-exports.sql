CREATE DATABASE IF NOT EXISTS `cvh_exports` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cvh_exports`;

CREATE TABLE `export_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `request_uid` VARCHAR(255) NOT NULL,
  `client_id` BIGINT NULL,
  `project_id` BIGINT NULL,
  `requested_by` BIGINT NOT NULL,
  `is_admin_export` TINYINT(1) NOT NULL DEFAULT 0,
  `export_type` ENUM('transactions','deposits','withdrawals','flush_operations','webhooks','webhook_failures','audit_logs','events','balances') NOT NULL,
  `format` ENUM('csv','xlsx','json') NOT NULL,
  `filters` JSON NOT NULL,
  `status` ENUM('pending','processing','completed','failed','expired') NOT NULL DEFAULT 'pending',
  `total_rows` INT NULL,
  `file_size_bytes` BIGINT NULL,
  `file_path` VARCHAR(512) NULL,
  `download_count` INT NOT NULL DEFAULT 0,
  `max_downloads` INT NOT NULL DEFAULT 10,
  `expires_at` DATETIME(3) NULL,
  `job_id` BIGINT NULL,
  `error_message` TEXT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_uid` (`request_uid`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `status`),
  INDEX `idx_expires` (`status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `export_files` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `export_request_id` BIGINT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(512) NOT NULL,
  `file_size_bytes` BIGINT NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `checksum_sha256` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_request` (`export_request_id`),
  CONSTRAINT `fk_files_request` FOREIGN KEY (`export_request_id`) REFERENCES `export_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
