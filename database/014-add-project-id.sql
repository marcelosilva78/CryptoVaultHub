-- =============================================================================
-- CryptoVaultHub v2 — Add project_id to All Tenant-Scoped Tables
-- Adds: project_id BIGINT to 13 tables across 6 databases
-- Backfills: Sets project_id from the client's default project
-- Creates: Composite indexes for (client_id, project_id) queries
-- Depends on: 013-create-projects.sql (projects table with default projects)
-- =============================================================================

-- =============================================================================
-- STEP 1: Add project_id columns (NULLABLE first for safe backfill)
-- =============================================================================

-- cvh_wallets: wallets
USE `cvh_wallets`;

ALTER TABLE `wallets`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

ALTER TABLE `deposit_addresses`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

ALTER TABLE `whitelisted_addresses`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- cvh_transactions: deposits, withdrawals
USE `cvh_transactions`;

ALTER TABLE `deposits`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

ALTER TABLE `withdrawals`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- cvh_compliance: screening_results, compliance_alerts
USE `cvh_compliance`;

ALTER TABLE `screening_results`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

ALTER TABLE `compliance_alerts`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- cvh_auth: api_keys
USE `cvh_auth`;

ALTER TABLE `api_keys`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- cvh_notifications: webhooks, webhook_deliveries, email_logs
USE `cvh_notifications`;

ALTER TABLE `webhooks`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

ALTER TABLE `webhook_deliveries`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

ALTER TABLE `email_logs`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- cvh_indexer: monitored_addresses
USE `cvh_indexer`;

ALTER TABLE `monitored_addresses`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- cvh_keyvault: key_vault_audit (nullable — platform ops have no project)
USE `cvh_keyvault`;

ALTER TABLE `key_vault_audit`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`;

-- =============================================================================
-- STEP 2: Backfill project_id from each client's default project
-- =============================================================================

-- cvh_wallets
USE `cvh_wallets`;

UPDATE `wallets` w
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = w.`client_id` AND p.`is_default` = 1
SET w.`project_id` = p.`id`
WHERE w.`project_id` IS NULL;

UPDATE `deposit_addresses` da
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = da.`client_id` AND p.`is_default` = 1
SET da.`project_id` = p.`id`
WHERE da.`project_id` IS NULL;

UPDATE `whitelisted_addresses` wa
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = wa.`client_id` AND p.`is_default` = 1
SET wa.`project_id` = p.`id`
WHERE wa.`project_id` IS NULL;

-- cvh_transactions
USE `cvh_transactions`;

UPDATE `deposits` d
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = d.`client_id` AND p.`is_default` = 1
SET d.`project_id` = p.`id`
WHERE d.`project_id` IS NULL;

UPDATE `withdrawals` w
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = w.`client_id` AND p.`is_default` = 1
SET w.`project_id` = p.`id`
WHERE w.`project_id` IS NULL;

-- cvh_compliance
USE `cvh_compliance`;

UPDATE `screening_results` sr
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = sr.`client_id` AND p.`is_default` = 1
SET sr.`project_id` = p.`id`
WHERE sr.`project_id` IS NULL;

UPDATE `compliance_alerts` ca
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = ca.`client_id` AND p.`is_default` = 1
SET ca.`project_id` = p.`id`
WHERE ca.`project_id` IS NULL;

-- cvh_auth
USE `cvh_auth`;

UPDATE `api_keys` ak
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = ak.`client_id` AND p.`is_default` = 1
SET ak.`project_id` = p.`id`
WHERE ak.`project_id` IS NULL;

-- cvh_notifications
USE `cvh_notifications`;

UPDATE `webhooks` wh
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = wh.`client_id` AND p.`is_default` = 1
SET wh.`project_id` = p.`id`
WHERE wh.`project_id` IS NULL;

UPDATE `webhook_deliveries` wd
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = wd.`client_id` AND p.`is_default` = 1
SET wd.`project_id` = p.`id`
WHERE wd.`project_id` IS NULL;

UPDATE `email_logs` el
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = el.`client_id` AND p.`is_default` = 1
SET el.`project_id` = p.`id`
WHERE el.`project_id` IS NULL;

-- cvh_indexer
USE `cvh_indexer`;

UPDATE `monitored_addresses` ma
  JOIN `cvh_admin`.`projects` p ON p.`client_id` = ma.`client_id` AND p.`is_default` = 1
SET ma.`project_id` = p.`id`
WHERE ma.`project_id` IS NULL;

-- cvh_keyvault: key_vault_audit stays nullable (platform operations have no project)

-- =============================================================================
-- STEP 3: Set NOT NULL constraints (except key_vault_audit)
-- =============================================================================

USE `cvh_wallets`;
ALTER TABLE `wallets` MODIFY `project_id` BIGINT NOT NULL;
ALTER TABLE `deposit_addresses` MODIFY `project_id` BIGINT NOT NULL;
ALTER TABLE `whitelisted_addresses` MODIFY `project_id` BIGINT NOT NULL;

USE `cvh_transactions`;
ALTER TABLE `deposits` MODIFY `project_id` BIGINT NOT NULL;
ALTER TABLE `withdrawals` MODIFY `project_id` BIGINT NOT NULL;

USE `cvh_compliance`;
ALTER TABLE `screening_results` MODIFY `project_id` BIGINT NOT NULL;
ALTER TABLE `compliance_alerts` MODIFY `project_id` BIGINT NOT NULL;

USE `cvh_auth`;
ALTER TABLE `api_keys` MODIFY `project_id` BIGINT NOT NULL;

USE `cvh_notifications`;
ALTER TABLE `webhooks` MODIFY `project_id` BIGINT NOT NULL;
ALTER TABLE `webhook_deliveries` MODIFY `project_id` BIGINT NOT NULL;
ALTER TABLE `email_logs` MODIFY `project_id` BIGINT NOT NULL;

USE `cvh_indexer`;
ALTER TABLE `monitored_addresses` MODIFY `project_id` BIGINT NOT NULL;

-- =============================================================================
-- STEP 4: Add composite indexes for (client_id, project_id) queries
-- =============================================================================

USE `cvh_wallets`;
ALTER TABLE `wallets` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
ALTER TABLE `deposit_addresses` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
ALTER TABLE `whitelisted_addresses` ADD INDEX `idx_client_project` (`client_id`, `project_id`);

USE `cvh_transactions`;
ALTER TABLE `deposits` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
ALTER TABLE `withdrawals` ADD INDEX `idx_client_project` (`client_id`, `project_id`);

USE `cvh_compliance`;
ALTER TABLE `screening_results` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
ALTER TABLE `compliance_alerts` ADD INDEX `idx_client_project` (`client_id`, `project_id`);

USE `cvh_auth`;
ALTER TABLE `api_keys` ADD INDEX `idx_client_project` (`client_id`, `project_id`);

USE `cvh_notifications`;
ALTER TABLE `webhooks` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
ALTER TABLE `webhook_deliveries` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
ALTER TABLE `email_logs` ADD INDEX `idx_client_project` (`client_id`, `project_id`);

USE `cvh_indexer`;
ALTER TABLE `monitored_addresses` ADD INDEX `idx_client_project` (`client_id`, `project_id`);

USE `cvh_keyvault`;
ALTER TABLE `key_vault_audit` ADD INDEX `idx_client_project` (`client_id`, `project_id`);
