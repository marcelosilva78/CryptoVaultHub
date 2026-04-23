-- =============================================================================
-- CryptoVaultHub — Migration 036: Add start_block to monitored_addresses
-- The chain-indexer-service Prisma schema expects a start_block column on
-- monitored_addresses for gap detection and address registration.
-- NOTE: This column may already exist if Prisma db push was used. Safe to skip.
-- =============================================================================

USE `cvh_indexer`;

-- MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS.
-- Use a procedure to check and add only if missing.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cvh_indexer'
    AND TABLE_NAME = 'monitored_addresses'
    AND COLUMN_NAME = 'start_block'
);

SET @add_col = IF(@col_exists = 0,
  'ALTER TABLE `cvh_indexer`.`monitored_addresses` ADD COLUMN `start_block` BIGINT NOT NULL DEFAULT 0 AFTER `wallet_id`',
  'SELECT 1');
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index (check before creating — MySQL 8.0 lacks CREATE INDEX IF NOT EXISTS)
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'cvh_indexer'
    AND TABLE_NAME = 'monitored_addresses'
    AND INDEX_NAME = 'idx_monitored_start_block'
);

SET @add_idx = IF(@idx_exists = 0,
  'CREATE INDEX `idx_monitored_start_block` ON `cvh_indexer`.`monitored_addresses` (`chain_id`, `start_block`)',
  'SELECT 1');
PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
