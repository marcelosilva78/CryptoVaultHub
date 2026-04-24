-- =============================================================================
-- CryptoVaultHub — Project-Isolated Contract Status Tracking
-- Creates: project_contracts in cvh_admin
-- Tracks individual contract deployment status per project per chain.
-- Complements project_chains (cvh_wallets) which stores the final addresses.
-- =============================================================================

USE `cvh_admin`;

-- -----------------------------------------------------------------------------
-- project_contracts — Per-contract deployment status for project isolation.
-- Each row represents one contract type deployed for a project on a chain.
-- Enables granular retry of failed individual contract deployments and
-- project-scoped contract resolution (fallback to chain-level if incomplete).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `project_contracts` (
  `id`               BIGINT      NOT NULL AUTO_INCREMENT,
  `project_id`       BIGINT      NOT NULL,
  `chain_id`         INT         NOT NULL,
  `contract_type`    ENUM('wallet_factory','forwarder_factory','wallet_impl','forwarder_impl','batcher') NOT NULL,
  `address`          VARCHAR(42) NOT NULL,
  `tx_hash`          VARCHAR(66) NULL,
  `deployer_address` VARCHAR(42) NULL,
  `deploy_status`    ENUM('pending','deploying','deployed','failed') NOT NULL DEFAULT 'pending',
  `deploy_error`     TEXT        NULL,
  `block_number`     BIGINT      NULL,
  `gas_used`         VARCHAR(78) NULL,
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deployed_at`      DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_chain_type` (`project_id`, `chain_id`, `contract_type`),
  INDEX `idx_project` (`project_id`),
  INDEX `idx_chain_status` (`chain_id`, `deploy_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
