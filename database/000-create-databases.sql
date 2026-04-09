-- =============================================================================
-- CryptoVaultHub — Database Creation Script
-- Creates all 8 databases for the CryptoVaultHub platform
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
