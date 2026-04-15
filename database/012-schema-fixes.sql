-- =============================================================================
-- CryptoVaultHub — Schema Fixes
-- Addresses discrepancies found between SQL DDL and Prisma schemas, and adds
-- missing constraints and data type corrections.
-- =============================================================================

-- =============================================================================
-- 1. cvh_wallets.whitelisted_addresses
--    ISSUE: Missing unique constraint on (client_id, chain_id, address) to
--           prevent duplicate whitelist entries.
-- =============================================================================

USE `cvh_wallets`;

ALTER TABLE `whitelisted_addresses`
  ADD UNIQUE KEY `uq_whitelist_client_chain_addr` (`client_id`, `chain_id`, `address`);

-- =============================================================================
-- 2. cvh_notifications.webhook_deliveries
--    ISSUE: Missing foreign key to webhooks table on webhook_id column.
-- =============================================================================

USE `cvh_notifications`;

ALTER TABLE `webhook_deliveries`
  ADD CONSTRAINT `fk_deliveries_webhook`
    FOREIGN KEY (`webhook_id`) REFERENCES `webhooks` (`id`) ON DELETE CASCADE;

-- =============================================================================
-- 3. cvh_auth.users
--    ISSUE: totp_secret can be up to 300 chars when encrypted + encoded.
-- =============================================================================

USE `cvh_auth`;

ALTER TABLE `users` MODIFY COLUMN `totp_secret` VARCHAR(300) NULL;

-- =============================================================================
-- 4. cvh_transactions.deposits
--    ISSUE: from_address is VARCHAR(42) which only fits EVM addresses.
--           For future multi-chain (BTC, Solana), widen to VARCHAR(100).
-- =============================================================================

USE `cvh_transactions`;

ALTER TABLE `deposits`
  MODIFY COLUMN `from_address` VARCHAR(100) NOT NULL;

ALTER TABLE `deposits`
  MODIFY COLUMN `forwarder_address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 5. cvh_transactions.withdrawals
--    ISSUE: Same address width concern for to_address and from_wallet.
-- =============================================================================

ALTER TABLE `withdrawals`
  MODIFY COLUMN `to_address` VARCHAR(100) NOT NULL;

ALTER TABLE `withdrawals`
  MODIFY COLUMN `from_wallet` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 6. cvh_wallets.wallets
--    ISSUE: Address column is VARCHAR(42), only fits EVM. Widen for future
--           multi-chain support.
-- =============================================================================

USE `cvh_wallets`;

ALTER TABLE `wallets`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 7. cvh_wallets.deposit_addresses
--    ISSUE: Same address width concern.
-- =============================================================================

ALTER TABLE `deposit_addresses`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 8. cvh_wallets.whitelisted_addresses
--    ISSUE: Same address width concern.
-- =============================================================================

ALTER TABLE `whitelisted_addresses`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 9. cvh_compliance.compliance_alerts
--    ISSUE: Address is VARCHAR(42), widen for multi-chain.
-- =============================================================================

USE `cvh_compliance`;

ALTER TABLE `compliance_alerts`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

ALTER TABLE `screening_results`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 10. cvh_indexer.monitored_addresses
--     ISSUE: Address is VARCHAR(42), widen for multi-chain.
-- =============================================================================

USE `cvh_indexer`;

ALTER TABLE `monitored_addresses`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

-- =============================================================================
-- 11. cvh_keyvault.derived_keys
--     ISSUE: Address is VARCHAR(42), widen for multi-chain.
-- =============================================================================

USE `cvh_keyvault`;

ALTER TABLE `derived_keys`
  MODIFY COLUMN `address` VARCHAR(100) NOT NULL;

ALTER TABLE `key_vault_audit`
  MODIFY COLUMN `address` VARCHAR(100) NULL;

-- =============================================================================
-- 12. (Removed) Duplicate of section 3 — totp_secret VARCHAR(300) already
--     applied above. Kept this comment for audit trail.
-- =============================================================================
