-- =============================================================================
-- CryptoVaultHub — cvh_compliance Database
-- Tables: sanctions_entries, screening_results, compliance_alerts
-- Source: services/core-wallet-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_compliance`;

-- sanctions_entries
CREATE TABLE IF NOT EXISTS `sanctions_entries` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `list_source`   VARCHAR(50)  NOT NULL,
  `address`       VARCHAR(100) NOT NULL,
  `address_type`  VARCHAR(20)  NOT NULL,
  `entity_name`   VARCHAR(500) NULL,
  `entity_id`     VARCHAR(100) NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `last_synced_at` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_list_address` (`list_source`, `address`),
  INDEX `idx_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- screening_results
CREATE TABLE IF NOT EXISTS `screening_results` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`     BIGINT       NOT NULL,
  `address`       VARCHAR(42)  NOT NULL,
  `direction`     VARCHAR(10)  NOT NULL,
  `trigger`       VARCHAR(20)  NOT NULL,
  `tx_hash`       VARCHAR(66)  NULL,
  `lists_checked` JSON         NOT NULL,
  `result`        VARCHAR(20)  NOT NULL,
  `match_details` JSON         NULL,
  `action`        VARCHAR(20)  NOT NULL,
  `screened_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_client_screened` (`client_id`, `screened_at`),
  INDEX `idx_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- compliance_alerts
CREATE TABLE IF NOT EXISTS `compliance_alerts` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`       BIGINT       NOT NULL,
  `severity`        VARCHAR(10)  NOT NULL,
  `alert_type`      VARCHAR(50)  NOT NULL,
  `address`         VARCHAR(42)  NOT NULL,
  `matched_entity`  VARCHAR(500) NULL,
  `matched_list`    VARCHAR(50)  NULL,
  `amount`          VARCHAR(78)  NULL,
  `token_symbol`    VARCHAR(20)  NULL,
  `status`          VARCHAR(20)  NOT NULL DEFAULT 'open',
  `resolved_at`     TIMESTAMP    NULL,
  `resolved_by`     VARCHAR(100) NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_client_status` (`client_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
