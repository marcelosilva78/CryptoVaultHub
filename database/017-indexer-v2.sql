-- =============================================================================
-- CryptoVaultHub — Phase 4: Chain Indexer v2
-- Tables: indexed_blocks, indexed_events, materialized_balances, sync_gaps,
--         reorg_log + ALTER sync_cursors
-- =============================================================================

USE `cvh_indexer`;

CREATE TABLE IF NOT EXISTS `indexed_blocks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `block_number` BIGINT NOT NULL,
  `block_hash` VARCHAR(66) NOT NULL,
  `parent_hash` VARCHAR(66) NOT NULL,
  `block_timestamp` BIGINT NOT NULL,
  `transaction_count` INT NOT NULL DEFAULT 0,
  `events_detected` INT NOT NULL DEFAULT 0,
  `indexed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_block` (`chain_id`, `block_number`),
  INDEX `idx_chain_finalized` (`chain_id`, `is_finalized`, `block_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `indexed_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `block_number` BIGINT NOT NULL,
  `tx_hash` VARCHAR(66) NOT NULL,
  `log_index` INT NOT NULL,
  `contract_address` VARCHAR(42) NOT NULL,
  `event_type` ENUM('erc20_transfer','native_transfer','contract_deploy','forwarder_flush','approval','other') NOT NULL,
  `from_address` VARCHAR(42) NULL,
  `to_address` VARCHAR(42) NULL,
  `token_id` BIGINT NULL,
  `amount` DECIMAL(65,0) NULL,
  `client_id` BIGINT NULL,
  `project_id` BIGINT NULL,
  `wallet_id` BIGINT NULL,
  `is_inbound` TINYINT(1) NULL,
  `raw_data` JSON NULL,
  `processed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_tx_log` (`chain_id`, `tx_hash`, `log_index`),
  INDEX `idx_chain_block` (`chain_id`, `block_number`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `event_type`, `block_number`),
  INDEX `idx_to_address` (`to_address`, `chain_id`),
  INDEX `idx_from_address` (`from_address`, `chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `materialized_balances` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `address` VARCHAR(42) NOT NULL,
  `token_id` BIGINT NULL COMMENT 'NULL = native asset',
  `client_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `wallet_id` BIGINT NULL,
  `balance` DECIMAL(65,0) NOT NULL DEFAULT 0,
  `last_updated_block` BIGINT NOT NULL,
  `last_updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_addr_token` (`chain_id`, `address`, `token_id`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sync_gaps` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `gap_start_block` BIGINT NOT NULL,
  `gap_end_block` BIGINT NOT NULL,
  `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` ENUM('detected','backfilling','resolved','failed') NOT NULL DEFAULT 'detected',
  `backfill_job_id` BIGINT NULL,
  `resolved_at` DATETIME(3) NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `last_error` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_chain_status` (`chain_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reorg_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chain_id` INT NOT NULL,
  `reorg_at_block` BIGINT NOT NULL,
  `old_block_hash` VARCHAR(66) NULL,
  `new_block_hash` VARCHAR(66) NULL,
  `depth` INT NOT NULL DEFAULT 1,
  `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reindexed_at` DATETIME(3) NULL,
  `events_invalidated` INT NOT NULL DEFAULT 0,
  `balances_recalculated` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_chain_time` (`chain_id`, `detected_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enhance sync_cursors
ALTER TABLE `sync_cursors`
  ADD COLUMN `latest_finalized_block` BIGINT NOT NULL DEFAULT 0 AFTER `last_block`,
  ADD COLUMN `blocks_behind` INT NOT NULL DEFAULT 0,
  ADD COLUMN `indexer_status` ENUM('syncing','synced','stale','error') NOT NULL DEFAULT 'syncing',
  ADD COLUMN `last_error` TEXT NULL,
  ADD COLUMN `last_error_at` DATETIME(3) NULL;
