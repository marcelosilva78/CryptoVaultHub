-- =============================================================================
-- CryptoVaultHub — Database Creation Script
-- Creates all 10 databases for the CryptoVaultHub platform
-- Target: MySQL 8.0+
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `cvh_auth`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_keyvault`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_admin`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_wallets`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_transactions`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_compliance`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_notifications`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_indexer`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_jobs`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `cvh_exports`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- =============================================================================
-- MySQL Users for new databases
-- NOTE: Replace passwords before production deployment. See DEPLOYMENT_REPORT.md
-- =============================================================================

CREATE USER IF NOT EXISTS 'cvh_jobs'@'%' IDENTIFIED BY 'REPLACE_IN_PRODUCTION';
GRANT SELECT, INSERT, UPDATE, DELETE ON `cvh_jobs`.* TO 'cvh_jobs'@'%';

CREATE USER IF NOT EXISTS 'cvh_exports'@'%' IDENTIFIED BY 'REPLACE_IN_PRODUCTION';
GRANT SELECT, INSERT, UPDATE, DELETE ON `cvh_exports`.* TO 'cvh_exports'@'%';

FLUSH PRIVILEGES;
