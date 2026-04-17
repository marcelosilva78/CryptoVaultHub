-- =============================================================================
-- CryptoVaultHub — Per-Project BIP-39 Seed Storage
-- Creates: project_seeds in cvh_keyvault
-- Alters:  derived_keys — adds project_id column
-- Depends on: 002-cvh-keyvault.sql (derived_keys table)
--             013-create-projects.sql (projects table in cvh_admin)
-- =============================================================================

USE `cvh_keyvault`;

-- -----------------------------------------------------------------------------
-- project_seeds — Per-project BIP-39 seed encrypted with envelope encryption
-- Each project gets its own HD seed, fully isolated from other projects.
-- Encryption: AES-256-GCM with a DEK wrapped by the platform KEK.
-- -----------------------------------------------------------------------------

-- NOTE: encrypted columns use TEXT (not BLOB) because EncryptionService
-- hex-encodes all ciphertext, IV, auth tag, and salt values. This is
-- intentional and differs from master_seeds which uses BLOB for legacy reasons.
-- The master_seeds table stores raw binary data, whereas project_seeds stores
-- hex-encoded strings produced by the V2 envelope encryption pipeline.
CREATE TABLE IF NOT EXISTS `project_seeds` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `project_id`           BIGINT       NOT NULL,
  `encrypted_seed`       TEXT         NOT NULL,
  `encrypted_dek`        TEXT         NOT NULL,
  `iv`                   VARCHAR(64)  NOT NULL,
  `auth_tag`             VARCHAR(64)  NOT NULL,
  `salt`                 VARCHAR(128) NOT NULL,
  `kdf_iterations`       INT          NOT NULL DEFAULT 600000,
  `seed_shown_to_client` TINYINT(1)   NOT NULL DEFAULT 0,
  `shamir_split_done`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_seed` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- derived_keys — Add project_id for project-scoped key derivation
-- -----------------------------------------------------------------------------

ALTER TABLE `derived_keys`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`,
  ADD INDEX `idx_project_keys` (`project_id`, `key_type`);
