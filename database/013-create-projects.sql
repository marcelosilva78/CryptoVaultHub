-- =============================================================================
-- CryptoVaultHub v2 — Projects Table
-- Creates: projects table in cvh_admin
-- Inserts: default project for every existing client
-- Depends on: 003-cvh-admin.sql (clients table)
-- =============================================================================

USE `cvh_admin`;

-- -----------------------------------------------------------------------------
-- projects — multi-project scoping per client
-- Every client can have multiple projects. One project is marked as default.
-- All tenant-scoped resources are associated with a project.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `projects` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `client_id`   BIGINT        NOT NULL,
  `name`        VARCHAR(200)  NOT NULL,
  `slug`        VARCHAR(100)  NOT NULL,
  `description` VARCHAR(500)  NULL,
  `is_default`  TINYINT(1)    NOT NULL DEFAULT 0,
  `status`      ENUM('active','archived','suspended') NOT NULL DEFAULT 'active',
  `settings`    JSON          NULL COMMENT 'Per-project overrides: webhook_prefix, address_label_prefix, custom configs',
  `created_at`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_slug` (`client_id`, `slug`),
  INDEX `idx_client_status` (`client_id`, `status`),
  INDEX `idx_client_default` (`client_id`, `is_default`),

  CONSTRAINT `fk_projects_client` FOREIGN KEY (`client_id`)
    REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Backfill: Create a default project for every existing client
-- This ensures all existing data can be associated with a project
-- -----------------------------------------------------------------------------

INSERT INTO `projects` (`client_id`, `name`, `slug`, `description`, `is_default`, `status`, `created_at`, `updated_at`)
SELECT
  `id` AS `client_id`,
  CONCAT(`name`, ' — Default') AS `name`,
  'default' AS `slug`,
  'Automatically created default project during v2 migration' AS `description`,
  1 AS `is_default`,
  'active' AS `status`,
  NOW(3) AS `created_at`,
  NOW(3) AS `updated_at`
FROM `clients`
WHERE `id` NOT IN (SELECT `client_id` FROM `projects`);
