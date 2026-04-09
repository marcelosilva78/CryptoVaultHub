-- =============================================================================
-- CryptoVaultHub — cvh_auth Database
-- Tables: users, sessions, api_keys
-- Source: services/auth-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_auth`;

-- -----------------------------------------------------------------------------
-- ENUM types are inlined as MySQL ENUM columns
-- AdminRole: super_admin, admin, viewer
-- ClientRole: owner, admin, viewer
-- -----------------------------------------------------------------------------

-- users
CREATE TABLE IF NOT EXISTS `users` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `email`         VARCHAR(255)  NOT NULL,
  `password_hash` VARCHAR(255)  NOT NULL,
  `name`          VARCHAR(200)  NOT NULL,
  `role`          ENUM('super_admin','admin','viewer') NOT NULL DEFAULT 'viewer',
  `client_id`     BIGINT        NULL,
  `client_role`   ENUM('owner','admin','viewer') NULL,
  `is_active`     TINYINT(1)    NOT NULL DEFAULT 1,
  `totp_secret`   VARCHAR(64)   NULL,
  `totp_enabled`  TINYINT(1)    NOT NULL DEFAULT 0,
  `last_login_at` TIMESTAMP     NULL,
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  INDEX `idx_client` (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `id`                 VARCHAR(64)  NOT NULL,
  `user_id`            BIGINT       NOT NULL,
  `refresh_token_hash` VARCHAR(64)  NOT NULL,
  `ip_address`         VARCHAR(45)  NULL,
  `user_agent`         VARCHAR(500) NULL,
  `expires_at`         TIMESTAMP    NOT NULL,
  `created_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_expires` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- api_keys
CREATE TABLE IF NOT EXISTS `api_keys` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`       BIGINT       NOT NULL,
  `key_prefix`      VARCHAR(20)  NOT NULL,
  `key_hash`        VARCHAR(64)  NOT NULL,
  `scopes`          JSON         NOT NULL DEFAULT ('["read"]'),
  `ip_allowlist`    JSON         NULL,
  `allowed_chains`  JSON         NULL,
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `label`           VARCHAR(100) NULL,
  `expires_at`      TIMESTAMP    NULL,
  `last_used_at`    TIMESTAMP    NULL,
  `last_used_ip`    VARCHAR(45)  NULL,
  `usage_count`     BIGINT       NOT NULL DEFAULT 0,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at`      TIMESTAMP    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_api_keys_key_hash` (`key_hash`),
  INDEX `idx_client` (`client_id`),
  INDEX `idx_key_hash` (`key_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
