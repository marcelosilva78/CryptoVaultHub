-- =============================================================================
-- CryptoVaultHub — cvh_indexer Database
-- Tables: sync_cursors, monitored_addresses
-- Source: services/chain-indexer-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_indexer`;

-- sync_cursors
CREATE TABLE IF NOT EXISTS `sync_cursors` (
  `id`         BIGINT    NOT NULL AUTO_INCREMENT,
  `chain_id`   INT       NOT NULL,
  `last_block` BIGINT    NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_id` (`chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- monitored_addresses
CREATE TABLE IF NOT EXISTS `monitored_addresses` (
  `id`         BIGINT      NOT NULL AUTO_INCREMENT,
  `chain_id`   INT         NOT NULL,
  `address`    VARCHAR(42) NOT NULL,
  `client_id`  BIGINT      NOT NULL,
  `wallet_id`  BIGINT      NOT NULL,
  `is_active`  TINYINT(1)  NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_address` (`chain_id`, `address`),
  INDEX `idx_chain_active` (`chain_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
