-- =============================================================================
-- Migration 028: Create client_chain_config table for per-client monitoring mode
-- Required by chain-indexer-service's hybrid monitoring mode feature
-- =============================================================================

USE `cvh_admin`;

CREATE TABLE IF NOT EXISTS `client_chain_config` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`        BIGINT       NOT NULL,
  `chain_id`         INT          NOT NULL,
  `monitoring_mode`  VARCHAR(20)  NOT NULL DEFAULT 'hybrid',
  `confirmations_override` INT    NULL,
  `sweep_interval_ms` INT         NULL,
  `is_active`        BOOLEAN      NOT NULL DEFAULT TRUE,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_chain` (`client_id`, `chain_id`),
  INDEX `idx_chain_monitoring` (`chain_id`, `monitoring_mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
