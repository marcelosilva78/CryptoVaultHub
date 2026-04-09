-- =============================================================================
-- CryptoVaultHub — Phase 5: Webhooks v2
-- Tables: webhook_delivery_attempts, webhook_dead_letters
-- ALTER: webhooks, webhook_deliveries
-- =============================================================================

USE `cvh_notifications`;

-- Enhance webhooks with retry configuration
ALTER TABLE `webhooks`
  ADD COLUMN `retry_max_attempts` INT NOT NULL DEFAULT 5 AFTER `is_active`,
  ADD COLUMN `retry_backoff_type` ENUM('exponential','linear','fixed') NOT NULL DEFAULT 'exponential',
  ADD COLUMN `retry_backoff_base_ms` INT NOT NULL DEFAULT 1000,
  ADD COLUMN `retry_backoff_max_ms` INT NOT NULL DEFAULT 3600000,
  ADD COLUMN `retry_jitter` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `retry_timeout_ms` INT NOT NULL DEFAULT 10000,
  ADD COLUMN `retry_on_status_codes` JSON DEFAULT '["500","502","503","504","408","429"]',
  ADD COLUMN `fail_on_status_codes` JSON DEFAULT '["400","401","403","404"]',
  ADD COLUMN `description` TEXT NULL;

-- Enhance webhook_deliveries with full history
ALTER TABLE `webhook_deliveries`
  ADD COLUMN `correlation_id` VARCHAR(255) NULL,
  ADD COLUMN `idempotency_key` VARCHAR(255) NULL,
  ADD COLUMN `request_url` VARCHAR(2048) NULL,
  ADD COLUMN `request_headers` JSON NULL,
  ADD COLUMN `response_headers` JSON NULL,
  ADD COLUMN `response_time_ms_v2` INT NULL,
  ADD COLUMN `error_message` TEXT NULL,
  ADD COLUMN `error_code` VARCHAR(50) NULL,
  ADD COLUMN `is_manual_resend` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `original_delivery_id` BIGINT NULL,
  ADD INDEX `idx_idempotency` (`idempotency_key`),
  ADD INDEX `idx_status_retry` (`status`, `next_retry_at`);

CREATE TABLE IF NOT EXISTS `webhook_delivery_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `delivery_id` BIGINT NOT NULL,
  `attempt_number` INT NOT NULL,
  `status` ENUM('success','failed','timeout','error') NOT NULL,
  `request_url` VARCHAR(2048) NOT NULL,
  `request_headers` JSON NULL,
  `request_body` JSON NULL,
  `response_status` INT NULL,
  `response_headers` JSON NULL,
  `response_body` TEXT NULL,
  `response_time_ms` INT NULL,
  `error_message` TEXT NULL,
  `error_code` VARCHAR(50) NULL,
  `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_delivery` (`delivery_id`, `attempt_number`),
  CONSTRAINT `fk_attempts_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_dead_letters` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `delivery_id` BIGINT NOT NULL,
  `webhook_id` BIGINT NOT NULL,
  `client_id` BIGINT NOT NULL,
  `project_id` BIGINT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payload` JSON NOT NULL,
  `last_error` TEXT NULL,
  `total_attempts` INT NOT NULL,
  `dead_lettered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` ENUM('pending_review','resent','discarded') NOT NULL DEFAULT 'pending_review',
  `resent_at` DATETIME(3) NULL,
  `resent_delivery_id` BIGINT NULL,
  `reviewed_by` BIGINT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_client_status` (`client_id`, `status`),
  INDEX `idx_event_time` (`event_type`, `dead_lettered_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
