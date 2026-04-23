-- =============================================================================
-- CryptoVaultHub — Migration 036: Add start_block to monitored_addresses
-- The chain-indexer-service Prisma schema expects a start_block column on
-- monitored_addresses for gap detection and address registration.
-- =============================================================================

USE `cvh_indexer`;

ALTER TABLE `monitored_addresses`
  ADD COLUMN IF NOT EXISTS `start_block` BIGINT NOT NULL DEFAULT 0 AFTER `wallet_id`;

CREATE INDEX `idx_monitored_start_block` ON `monitored_addresses` (`chain_id`, `start_block`);
