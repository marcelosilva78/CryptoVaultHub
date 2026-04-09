-- =============================================================================
-- CryptoVaultHub — cvh_keyvault Database
-- Tables: master_seeds, derived_keys, shamir_shares, key_vault_audit
-- Source: services/key-vault-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_keyvault`;

-- -----------------------------------------------------------------------------
-- ENUM types
-- KeyType: platform, client, backup, gas_tank
-- -----------------------------------------------------------------------------

-- master_seeds
CREATE TABLE IF NOT EXISTS `master_seeds` (
  `id`             BIGINT    NOT NULL AUTO_INCREMENT,
  `seed_id`        VARCHAR(64) NOT NULL,
  `encrypted_seed` BLOB      NOT NULL,
  `encrypted_dek`  BLOB      NOT NULL,
  `iv`             VARBINARY(16) NOT NULL,
  `auth_tag`       VARBINARY(16) NOT NULL,
  `salt`           VARBINARY(32) NOT NULL,
  `kdf_iterations` INT       NOT NULL DEFAULT 100000,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_master_seeds_seed_id` (`seed_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- derived_keys
CREATE TABLE IF NOT EXISTS `derived_keys` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`       BIGINT       NOT NULL,
  `key_type`        ENUM('platform','client','backup','gas_tank') NOT NULL,
  `chain_scope`     VARCHAR(10)  NOT NULL DEFAULT 'evm',
  `public_key`      VARCHAR(130) NOT NULL,
  `address`         VARCHAR(42)  NOT NULL,
  `derivation_path` VARCHAR(50)  NOT NULL,
  `encrypted_key`   BLOB         NOT NULL,
  `encrypted_dek`   BLOB         NOT NULL,
  `iv`              VARBINARY(16) NOT NULL,
  `auth_tag`        VARBINARY(16) NOT NULL,
  `salt`            VARBINARY(32) NOT NULL,
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `last_used_at`    TIMESTAMP    NULL,
  `sign_count`      BIGINT       NOT NULL DEFAULT 0,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_keytype` (`client_id`, `key_type`),
  INDEX `idx_address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shamir_shares
CREATE TABLE IF NOT EXISTS `shamir_shares` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`        BIGINT       NOT NULL,
  `share_index`      TINYINT      NOT NULL,
  `custodian`        VARCHAR(50)  NOT NULL,
  `encrypted_share`  BLOB         NOT NULL,
  `encrypted_dek`    BLOB         NOT NULL,
  `iv`               VARBINARY(16) NOT NULL,
  `auth_tag`         VARBINARY(16) NOT NULL,
  `salt`             VARBINARY(32) NOT NULL,
  `is_distributed`   TINYINT(1)   NOT NULL DEFAULT 0,
  `distributed_at`   TIMESTAMP    NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_share` (`client_id`, `share_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- key_vault_audit
CREATE TABLE IF NOT EXISTS `key_vault_audit` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `operation`    VARCHAR(50)  NOT NULL,
  `client_id`    BIGINT       NULL,
  `key_type`     VARCHAR(20)  NULL,
  `address`      VARCHAR(42)  NULL,
  `tx_hash`      VARCHAR(66)  NULL,
  `chain_id`     INT          NULL,
  `requested_by` VARCHAR(100) NOT NULL,
  `metadata`     JSON         NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_client_op` (`client_id`, `operation`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
