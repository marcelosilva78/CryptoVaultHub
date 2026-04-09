-- =============================================================================
-- CryptoVaultHub — cvh_transactions Database
-- Tables: deposits, withdrawals
-- Source: services/core-wallet-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_transactions`;

-- deposits
CREATE TABLE IF NOT EXISTS `deposits` (
  `id`                     BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`              BIGINT       NOT NULL,
  `chain_id`               INT          NOT NULL,
  `forwarder_address`      VARCHAR(42)  NOT NULL,
  `external_id`            VARCHAR(200) NOT NULL,
  `token_id`               BIGINT       NOT NULL,
  `amount`                 VARCHAR(78)  NOT NULL,
  `amount_raw`             VARCHAR(78)  NOT NULL,
  `tx_hash`                VARCHAR(66)  NOT NULL,
  `block_number`           BIGINT       NOT NULL,
  `from_address`           VARCHAR(42)  NOT NULL,
  `status`                 VARCHAR(20)  NOT NULL DEFAULT 'pending',
  `confirmations`          INT          NOT NULL DEFAULT 0,
  `confirmations_required` INT          NOT NULL,
  `sweep_tx_hash`          VARCHAR(66)  NULL,
  `kyt_result`             VARCHAR(20)  NULL,
  `detected_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at`           TIMESTAMP    NULL,
  `swept_at`               TIMESTAMP    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tx_forwarder` (`tx_hash`, `forwarder_address`),
  INDEX `idx_client_status` (`client_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- withdrawals
CREATE TABLE IF NOT EXISTS `withdrawals` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`       BIGINT       NOT NULL,
  `chain_id`        INT          NOT NULL,
  `token_id`        BIGINT       NOT NULL,
  `from_wallet`     VARCHAR(42)  NOT NULL,
  `to_address_id`   BIGINT       NOT NULL,
  `to_address`      VARCHAR(42)  NOT NULL,
  `to_label`        VARCHAR(200) NOT NULL,
  `amount`          VARCHAR(78)  NOT NULL,
  `amount_raw`      VARCHAR(78)  NOT NULL,
  `tx_hash`         VARCHAR(66)  NULL,
  `status`          VARCHAR(30)  NOT NULL DEFAULT 'pending_approval',
  `sequence_id`     INT          NULL,
  `gas_cost`        VARCHAR(78)  NULL,
  `kyt_result`      VARCHAR(20)  NULL,
  `idempotency_key` VARCHAR(200) NOT NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `submitted_at`    TIMESTAMP    NULL,
  `confirmed_at`    TIMESTAMP    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_withdrawals_idempotency` (`idempotency_key`),
  INDEX `idx_client_status` (`client_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
