-- =============================================================================
-- CryptoVaultHub — Project-Isolated Contract Architecture
-- Creates: project_chains, project_deploy_traces in cvh_wallets
-- Depends on: 013-create-projects.sql (projects table in cvh_admin)
-- =============================================================================

USE `cvh_wallets`;

-- -----------------------------------------------------------------------------
-- project_chains — Tracks deployed contracts per project per chain
-- Each row represents one project's full contract set on a single chain.
-- deploy_status tracks the lifecycle: pending → deploying → ready | failed
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `project_chains` (
  `id`                         BIGINT      NOT NULL AUTO_INCREMENT,
  `project_id`                 BIGINT      NOT NULL,
  `chain_id`                   INT         NOT NULL,
  `wallet_factory_address`     VARCHAR(42) NULL,
  `forwarder_factory_address`  VARCHAR(42) NULL,
  `wallet_impl_address`        VARCHAR(42) NULL,
  `forwarder_impl_address`     VARCHAR(42) NULL,
  `hot_wallet_address`         VARCHAR(42) NULL,
  `hot_wallet_sequence_id`     INT         NOT NULL DEFAULT 0,
  `deploy_status`              VARCHAR(20) NOT NULL DEFAULT 'pending',
  `deploy_started_at`          TIMESTAMP   NULL,
  `deploy_completed_at`        TIMESTAMP   NULL,
  `deploy_error`               TEXT        NULL,
  `created_at`                 TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                 TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_chain` (`project_id`, `chain_id`),
  INDEX `idx_deploy_status` (`deploy_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- project_deploy_traces — Full JSON trace of each deploy transaction
-- Rich traceability: calldata, signed tx, RPC request/response, ABI,
-- bytecode hash, constructor args, and verification proof.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `project_deploy_traces` (
  `id`                      BIGINT       NOT NULL AUTO_INCREMENT,
  `project_id`              BIGINT       NOT NULL,
  `chain_id`                INT          NOT NULL,
  `project_chain_id`        BIGINT       NOT NULL,
  `contract_type`           VARCHAR(30)  NOT NULL,
  `contract_address`        VARCHAR(42)  NULL,
  `tx_hash`                 VARCHAR(66)  NULL,
  `block_number`            BIGINT       NULL,
  `block_hash`              VARCHAR(66)  NULL,
  `gas_used`                VARCHAR(78)  NULL,
  `gas_price`               VARCHAR(78)  NULL,
  `gas_cost_wei`            VARCHAR(78)  NULL,
  `deployer_address`        VARCHAR(42)  NOT NULL,
  `calldata_hex`            MEDIUMTEXT   NULL,
  `constructor_args_json`   JSON         NULL,
  `signed_tx_hex`           MEDIUMTEXT   NULL,
  `rpc_request_json`        JSON         NULL,
  `rpc_response_json`       JSON         NULL,
  `abi_json`                JSON         NULL,
  `bytecode_hash`           VARCHAR(66)  NULL,
  `verification_proof_json` JSON         NULL,
  `explorer_url`            VARCHAR(500) NULL,
  `status`                  VARCHAR(20)  NOT NULL DEFAULT 'pending',
  `error_message`           TEXT         NULL,
  `created_at`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at`            TIMESTAMP    NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_project_chain` (`project_id`, `chain_id`),
  INDEX `idx_tx_hash` (`tx_hash`),
  CONSTRAINT `fk_deploy_traces_project_chain` FOREIGN KEY (`project_chain_id`)
    REFERENCES `project_chains` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
