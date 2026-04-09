USE `cvh_transactions`;

CREATE TABLE IF NOT EXISTS `deploy_traces` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `client_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `chain_id` INT NOT NULL,
  `resource_type` ENUM('wallet','forwarder','factory','token_contract') NOT NULL,
  `resource_id` BIGINT NOT NULL,
  `address` VARCHAR(42) NOT NULL,
  `tx_hash` VARCHAR(66) NOT NULL,
  `block_number` BIGINT NOT NULL,
  `block_hash` VARCHAR(66) NULL,
  `block_timestamp` BIGINT NULL,
  `deployer_address` VARCHAR(42) NULL,
  `factory_address` VARCHAR(42) NULL,
  `salt` VARCHAR(66) NULL,
  `init_code_hash` VARCHAR(66) NULL,
  `gas_used` BIGINT NULL,
  `gas_price` BIGINT NULL,
  `gas_cost_wei` DECIMAL(78,0) NULL,
  `rpc_provider_id` BIGINT NULL,
  `rpc_node_id` BIGINT NULL,
  `explorer_url` VARCHAR(512) NOT NULL,
  `correlation_id` VARCHAR(255) NULL,
  `triggered_by` BIGINT NULL,
  `trigger_type` ENUM('user','system','automated') NOT NULL DEFAULT 'system',
  `event_logs` JSON NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_client_project` (`client_id`, `project_id`, `resource_type`),
  INDEX `idx_chain_tx` (`chain_id`, `tx_hash`),
  INDEX `idx_address` (`address`),
  INDEX `idx_correlation` (`correlation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

USE `cvh_wallets`;

CREATE TABLE IF NOT EXISTS `address_groups` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `group_uid` VARCHAR(255) NOT NULL,
  `client_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `external_id` VARCHAR(255) NULL,
  `label` VARCHAR(255) NULL,
  `derivation_salt` VARCHAR(66) NOT NULL,
  `computed_address` VARCHAR(42) NOT NULL,
  `status` ENUM('active','disabled') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_uid` (`group_uid`),
  UNIQUE KEY `uq_client_salt` (`client_id`, `derivation_salt`),
  INDEX `idx_client_project` (`client_id`, `project_id`),
  INDEX `idx_address` (`computed_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add FK columns to deposit_addresses
ALTER TABLE `deposit_addresses`
  ADD COLUMN `address_group_id` BIGINT NULL,
  ADD COLUMN `deploy_trace_id` BIGINT NULL,
  ADD INDEX `idx_address_group` (`address_group_id`);
