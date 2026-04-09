-- ─── Phase 2: RPC Gateway & Provider Management ───────────────────
-- Creates tables for managing RPC providers, nodes, health metrics,
-- and provider switch logs for the rpc-gateway-service.

USE `cvh_admin`;

CREATE TABLE IF NOT EXISTS `rpc_providers` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(50) NOT NULL,
  `website` VARCHAR(255) NULL,
  `auth_method` ENUM('api_key','bearer','header','none') NOT NULL DEFAULT 'api_key',
  `auth_header_name` VARCHAR(100) NULL DEFAULT 'x-api-key',
  `api_key_encrypted` TEXT NULL,
  `api_secret_encrypted` TEXT NULL,
  `notes` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rpc_nodes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `provider_id` BIGINT NOT NULL,
  `chain_id` INT NOT NULL,
  `endpoint_url` VARCHAR(512) NOT NULL,
  `ws_endpoint_url` VARCHAR(512) NULL,
  `priority` INT NOT NULL DEFAULT 50,
  `weight` INT NOT NULL DEFAULT 100,
  `status` ENUM('active','draining','standby','unhealthy','disabled') NOT NULL DEFAULT 'standby',
  `max_requests_per_second` INT NULL DEFAULT 50,
  `max_requests_per_minute` INT NULL DEFAULT 2000,
  `timeout_ms` INT NOT NULL DEFAULT 15000,
  `health_check_interval_s` INT NOT NULL DEFAULT 30,
  `last_health_check_at` DATETIME(3) NULL,
  `last_healthy_at` DATETIME(3) NULL,
  `consecutive_failures` INT NOT NULL DEFAULT 0,
  `health_score` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `tags` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chain_status` (`chain_id`, `status`, `priority`),
  INDEX `idx_provider` (`provider_id`),
  CONSTRAINT `fk_nodes_provider` FOREIGN KEY (`provider_id`) REFERENCES `rpc_providers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rpc_provider_health` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `node_id` BIGINT NOT NULL,
  `check_type` ENUM('latency','block_height','error_rate','uptime') NOT NULL,
  `value` DECIMAL(12,4) NOT NULL,
  `measured_at` DATETIME(3) NOT NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_node_time` (`node_id`, `measured_at` DESC),
  INDEX `idx_cleanup` (`measured_at`),
  CONSTRAINT `fk_health_node` FOREIGN KEY (`node_id`) REFERENCES `rpc_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `provider_switch_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `from_node_id` BIGINT NULL,
  `to_node_id` BIGINT NOT NULL,
  `reason` ENUM('manual','failover','health_degraded','rate_limited','draining') NOT NULL,
  `initiated_by` VARCHAR(100) NOT NULL DEFAULT 'system',
  `status` ENUM('initiated','draining','completed','rolled_back') NOT NULL DEFAULT 'initiated',
  `pending_jobs_at_switch` INT NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_chain_time` (`chain_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
