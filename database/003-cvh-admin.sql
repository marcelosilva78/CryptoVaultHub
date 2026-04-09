-- =============================================================================
-- CryptoVaultHub — cvh_admin Database
-- Tables: clients, tiers, client_tier_overrides, audit_logs,
--         chains, tokens, client_tokens, client_chain_config
-- Source: services/admin-api/prisma/schema.prisma
--         services/core-wallet-service/prisma/schema.prisma (chains, tokens)
--         packages/types/src/token.ts (client_tokens)
-- =============================================================================

USE `cvh_admin`;

-- -----------------------------------------------------------------------------
-- ENUM types
-- ClientStatus: active, suspended, onboarding
-- CustodyMode: full_custody, co_sign
-- KytLevel: basic, enhanced, full
-- OverrideType: string, number, boolean, json
-- -----------------------------------------------------------------------------

-- tiers (created first because clients references it)
CREATE TABLE IF NOT EXISTS `tiers` (
  `id`                        BIGINT       NOT NULL AUTO_INCREMENT,
  `name`                      VARCHAR(100) NOT NULL,
  `base_tier_id`              BIGINT       NULL,
  `is_preset`                 TINYINT(1)   NOT NULL DEFAULT 1,
  `is_custom`                 TINYINT(1)   NOT NULL DEFAULT 0,
  `global_rate_limit`         INT          NOT NULL DEFAULT 100,
  `endpoint_rate_limits`      JSON         NULL,
  `max_forwarders_per_chain`  INT          NOT NULL DEFAULT 100,
  `max_chains`                INT          NOT NULL DEFAULT 5,
  `max_webhooks`              INT          NOT NULL DEFAULT 10,
  `daily_withdrawal_limit_usd` DOUBLE     NOT NULL DEFAULT 10000,
  `monitoring_mode`           VARCHAR(50)  NOT NULL DEFAULT 'basic',
  `kyt_level`                 ENUM('basic','enhanced','full') NOT NULL DEFAULT 'basic',
  `created_at`                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_base_tier` (`base_tier_id`),
  CONSTRAINT `fk_tiers_base` FOREIGN KEY (`base_tier_id`) REFERENCES `tiers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- clients
CREATE TABLE IF NOT EXISTS `clients` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(200) NOT NULL,
  `slug`         VARCHAR(100) NOT NULL,
  `status`       ENUM('active','suspended','onboarding') NOT NULL DEFAULT 'active',
  `tier_id`      BIGINT       NULL,
  `custody_mode` ENUM('full_custody','co_sign') NOT NULL DEFAULT 'full_custody',
  `kyt_enabled`  TINYINT(1)   NOT NULL DEFAULT 0,
  `kyt_level`    ENUM('basic','enhanced','full') NOT NULL DEFAULT 'basic',
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clients_slug` (`slug`),
  INDEX `idx_tier` (`tier_id`),
  INDEX `idx_slug` (`slug`),
  CONSTRAINT `fk_clients_tier` FOREIGN KEY (`tier_id`) REFERENCES `tiers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- client_tier_overrides
CREATE TABLE IF NOT EXISTS `client_tier_overrides` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`      BIGINT       NOT NULL,
  `override_key`   VARCHAR(100) NOT NULL,
  `override_value` VARCHAR(500) NOT NULL,
  `override_type`  ENUM('string','number','boolean','json') NOT NULL DEFAULT 'string',
  PRIMARY KEY (`id`),
  INDEX `idx_client` (`client_id`),
  CONSTRAINT `fk_overrides_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- chains
CREATE TABLE IF NOT EXISTS `chains` (
  `chain_id`                   INT          NOT NULL,
  `name`                       VARCHAR(50)  NOT NULL,
  `short_name`                 VARCHAR(10)  NOT NULL,
  `native_currency_symbol`     VARCHAR(10)  NOT NULL,
  `native_currency_decimals`   INT          NOT NULL DEFAULT 18,
  `rpc_endpoints`              JSON         NOT NULL,
  `block_time_seconds`         DECIMAL(5,2) NOT NULL,
  `confirmations_default`      INT          NOT NULL,
  `wallet_factory_address`     VARCHAR(42)  NULL,
  `forwarder_factory_address`  VARCHAR(42)  NULL,
  `wallet_impl_address`        VARCHAR(42)  NULL,
  `forwarder_impl_address`     VARCHAR(42)  NULL,
  `multicall3_address`         VARCHAR(42)  NOT NULL DEFAULT '0xcA11bde05977b3631167028862bE2a173976CA11',
  `explorer_url`               VARCHAR(200) NULL,
  `gas_price_strategy`         VARCHAR(10)  NOT NULL DEFAULT 'eip1559',
  `is_active`                  TINYINT(1)   NOT NULL DEFAULT 1,
  `is_testnet`                 TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`chain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tokens
CREATE TABLE IF NOT EXISTS `tokens` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `chain_id`         INT          NOT NULL,
  `contract_address` VARCHAR(42)  NOT NULL,
  `symbol`           VARCHAR(20)  NOT NULL,
  `name`             VARCHAR(100) NOT NULL,
  `decimals`         TINYINT      NOT NULL,
  `is_native`        TINYINT(1)   NOT NULL DEFAULT 0,
  `is_default`       TINYINT(1)   NOT NULL DEFAULT 1,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `coingecko_id`     VARCHAR(100) NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chain_contract` (`chain_id`, `contract_address`),
  CONSTRAINT `fk_tokens_chain` FOREIGN KEY (`chain_id`) REFERENCES `chains` (`chain_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- client_tokens (per-client token enablement, from design spec + packages/types)
CREATE TABLE IF NOT EXISTS `client_tokens` (
  `id`                     BIGINT      NOT NULL AUTO_INCREMENT,
  `client_id`              BIGINT      NOT NULL,
  `token_id`               BIGINT      NOT NULL,
  `is_deposit_enabled`     TINYINT(1)  NOT NULL DEFAULT 1,
  `is_withdrawal_enabled`  TINYINT(1)  NOT NULL DEFAULT 1,
  `min_deposit_amount`     VARCHAR(78) NOT NULL DEFAULT '0',
  `min_withdrawal_amount`  VARCHAR(78) NOT NULL DEFAULT '0',
  `withdrawal_fee`         VARCHAR(78) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_token` (`client_id`, `token_id`),
  CONSTRAINT `fk_client_tokens_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_client_tokens_token` FOREIGN KEY (`token_id`) REFERENCES `tokens` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- client_chain_config (per-client chain configuration, from design spec)
CREATE TABLE IF NOT EXISTS `client_chain_config` (
  `id`                  BIGINT      NOT NULL AUTO_INCREMENT,
  `client_id`           BIGINT      NOT NULL,
  `chain_id`            INT         NOT NULL,
  `monitoring_mode`     VARCHAR(20) NOT NULL DEFAULT 'hybrid',
  `confirmations`       INT         NULL COMMENT 'Override chain default if set',
  `sweep_enabled`       TINYINT(1)  NOT NULL DEFAULT 1,
  `sweep_threshold`     VARCHAR(78) NULL COMMENT 'Min balance to trigger sweep',
  `webhook_milestones`  JSON        NULL COMMENT 'e.g. [1, 3, 6, 12]',
  `is_active`           TINYINT(1)  NOT NULL DEFAULT 1,
  `created_at`          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_chain` (`client_id`, `chain_id`),
  CONSTRAINT `fk_chain_config_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chain_config_chain` FOREIGN KEY (`chain_id`) REFERENCES `chains` (`chain_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit_logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `admin_user_id` VARCHAR(64)  NOT NULL,
  `action`        VARCHAR(100) NOT NULL,
  `entity_type`   VARCHAR(50)  NOT NULL,
  `entity_id`     VARCHAR(64)  NOT NULL,
  `details`       JSON         NULL,
  `ip_address`    VARCHAR(45)  NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_admin_user` (`admin_user_id`),
  INDEX `idx_entity` (`entity_type`, `entity_id`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
