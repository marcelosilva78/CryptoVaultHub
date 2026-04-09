-- =============================================================================
-- CryptoVaultHub — cvh_wallets Database
-- Tables: wallets, deposit_addresses, whitelisted_addresses
-- Source: services/core-wallet-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_wallets`;

-- wallets
CREATE TABLE IF NOT EXISTS `wallets` (
  `id`          BIGINT      NOT NULL AUTO_INCREMENT,
  `client_id`   BIGINT      NOT NULL,
  `chain_id`    INT         NOT NULL,
  `address`     VARCHAR(42) NOT NULL,
  `wallet_type` VARCHAR(20) NOT NULL,
  `is_active`   TINYINT(1)  NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_chain_type` (`client_id`, `chain_id`, `wallet_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- deposit_addresses
CREATE TABLE IF NOT EXISTS `deposit_addresses` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`   BIGINT       NOT NULL,
  `chain_id`    INT          NOT NULL,
  `wallet_id`   BIGINT       NOT NULL,
  `address`     VARCHAR(42)  NOT NULL,
  `external_id` VARCHAR(200) NOT NULL,
  `label`       VARCHAR(200) NULL,
  `salt`        VARCHAR(66)  NOT NULL,
  `is_deployed` TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_chain_external` (`client_id`, `chain_id`, `external_id`),
  INDEX `idx_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- whitelisted_addresses
CREATE TABLE IF NOT EXISTS `whitelisted_addresses` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`        BIGINT       NOT NULL,
  `address`          VARCHAR(42)  NOT NULL,
  `label`            VARCHAR(200) NOT NULL,
  `chain_id`         INT          NOT NULL,
  `status`           VARCHAR(20)  NOT NULL DEFAULT 'cooldown',
  `cooldown_ends_at` TIMESTAMP    NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
