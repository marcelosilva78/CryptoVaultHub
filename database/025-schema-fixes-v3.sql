-- =============================================================================
-- CryptoVaultHub — Schema Fixes V3
-- Adds unique constraint on wallets(address, chain_id), widens address columns
-- missed in migration 012, and removes a redundant index.
-- =============================================================================

-- =============================================================================
-- 1. cvh_wallets.wallets
--    Prevent duplicate blockchain addresses within the same chain
-- =============================================================================

USE `cvh_wallets`;

ALTER TABLE `wallets`
  ADD UNIQUE KEY `uq_address_chain` (`address`, `chain_id`);

-- =============================================================================
-- 2. cvh_indexer.indexed_events
--    Widen address columns that were missed in migration 012
-- =============================================================================

USE `cvh_indexer`;

ALTER TABLE `indexed_events`
  MODIFY COLUMN `from_address` VARCHAR(100) NULL,
  MODIFY COLUMN `to_address` VARCHAR(100) NULL;

-- =============================================================================
-- 3. cvh_transactions.deploy_traces
--    Widen address column that was missed in migration 012
-- =============================================================================

USE `cvh_transactions`;

ALTER TABLE `deploy_traces`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 4. cvh_transactions.flush_items
--    Widen address column that was missed in migration 012
-- =============================================================================

ALTER TABLE `flush_items`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 5. cvh_jobs.jobs
--    Remove redundant index (023's idx_jobs_queue_status duplicates 016's
--    idx_queue_status leading prefix on queue_name, status)
-- =============================================================================

USE `cvh_jobs`;

ALTER TABLE `jobs`
  DROP INDEX IF EXISTS `idx_jobs_queue_status`;
