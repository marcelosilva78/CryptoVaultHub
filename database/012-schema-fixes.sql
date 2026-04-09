-- =============================================================================
-- CryptoVaultHub — Schema Fixes
-- Addresses discrepancies found between SQL DDL and Prisma schemas, and adds
-- missing constraints and data type corrections.
-- =============================================================================

-- =============================================================================
-- 1. cvh_keyvault.derived_keys
--    ISSUE: SQL unique key is (client_id, key_type) but Prisma schema has
--           @@unique([clientId, keyType, chainScope], name: "uq_client_keytype_chain")
--           The Prisma version is correct — chain_scope should be part of the
--           unique constraint so a client can have e.g. a "client" key for both
--           "evm" and a future "btc" chain scope.
-- =============================================================================

USE `cvh_keyvault`;

ALTER TABLE `derived_keys`
  DROP INDEX `uq_client_keytype`,
  ADD UNIQUE KEY `uq_client_keytype_chain` (`client_id`, `key_type`, `chain_scope`);

-- =============================================================================
-- 2. cvh_wallets.deposit_addresses
--    ISSUE: Missing foreign key to wallets table on wallet_id column.
-- =============================================================================

USE `cvh_wallets`;

ALTER TABLE `deposit_addresses`
  ADD CONSTRAINT `fk_deposit_addr_wallet`
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE;

-- =============================================================================
-- 3. cvh_wallets.whitelisted_addresses
--    ISSUE: Missing unique constraint on (client_id, chain_id, address) to
--           prevent duplicate whitelist entries. Missing index on client_id.
-- =============================================================================

ALTER TABLE `whitelisted_addresses`
  ADD UNIQUE KEY `uq_whitelist_client_chain_addr` (`client_id`, `chain_id`, `address`);

-- =============================================================================
-- 4. cvh_notifications.webhook_deliveries
--    ISSUE: Missing foreign key to webhooks table on webhook_id column.
-- =============================================================================

USE `cvh_notifications`;

ALTER TABLE `webhook_deliveries`
  ADD CONSTRAINT `fk_deliveries_webhook`
    FOREIGN KEY (`webhook_id`) REFERENCES `webhooks` (`id`) ON DELETE CASCADE;

-- =============================================================================
-- 5. cvh_notifications.email_logs
--    ISSUE: Missing created_at index for time-based queries.
--    (Indexes are added in 010-performance-indexes.sql, but the FK is here.)
-- =============================================================================

-- No structural fix needed; indexes covered in 010.

-- =============================================================================
-- 6. cvh_transactions.deposits
--    ISSUE: block_number uses BIGINT which is correct for blockchain data.
--           However, from_address is VARCHAR(42) which only fits EVM addresses.
--           For future multi-chain (BTC, Solana), consider VARCHAR(100).
--           Applying a safe widening now.
-- =============================================================================

USE `cvh_transactions`;

ALTER TABLE `deposits`
  MODIFY COLUMN `from_address` VARCHAR(100) NOT NULL;

ALTER TABLE `deposits`
  MODIFY COLUMN `forwarder_address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 7. cvh_transactions.withdrawals
--    ISSUE: Same address width concern for to_address and from_wallet.
-- =============================================================================

ALTER TABLE `withdrawals`
  MODIFY COLUMN `to_address` VARCHAR(100) NOT NULL;

ALTER TABLE `withdrawals`
  MODIFY COLUMN `from_wallet` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 8. cvh_wallets.wallets
--    ISSUE: Address column is VARCHAR(42), only fits EVM. Widen for future
--           multi-chain support.
-- =============================================================================

USE `cvh_wallets`;

ALTER TABLE `wallets`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 9. cvh_wallets.deposit_addresses
--    ISSUE: Same address width concern.
-- =============================================================================

ALTER TABLE `deposit_addresses`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 10. cvh_wallets.whitelisted_addresses
--     ISSUE: Same address width concern.
-- =============================================================================

ALTER TABLE `whitelisted_addresses`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 11. cvh_compliance.compliance_alerts
--     ISSUE: Missing index on created_at for time-range queries on dashboards.
--            (Covered in 010, but ensuring address is also widened.)
-- =============================================================================

USE `cvh_compliance`;

ALTER TABLE `compliance_alerts`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

ALTER TABLE `screening_results`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 12. cvh_indexer.monitored_addresses
--     ISSUE: Address is VARCHAR(42), widen for multi-chain.
-- =============================================================================

USE `cvh_indexer`;

ALTER TABLE `monitored_addresses`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 13. cvh_keyvault.derived_keys
--     ISSUE: Address is VARCHAR(42), widen for multi-chain.
-- =============================================================================

USE `cvh_keyvault`;

ALTER TABLE `derived_keys`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

ALTER TABLE `key_vault_audit`
  MODIFY COLUMN `address` VARCHAR(100) NULL;
