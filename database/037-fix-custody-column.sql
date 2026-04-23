-- =============================================================================
-- CryptoVaultHub — Migration 037: Standardize custody_mode column
-- Resolves conflict between SQL (custody_mode) and Prisma mapping.
-- admin-api Prisma previously mapped to custody_policy (wrong column name).
-- core-wallet-service Prisma correctly maps to custody_mode.
-- This migration ensures the column is named custody_mode with all required
-- ENUM values (adds self_managed used by admin-api CustodyPolicy enum).
-- =============================================================================

USE `cvh_admin`;

-- Add self_managed to the custody_mode ENUM if not already present.
-- The original ENUM was ('full_custody','co_sign','client_initiated').
-- The admin-api CustodyPolicy enum also uses 'self_managed'.
ALTER TABLE `clients`
  MODIFY COLUMN `custody_mode` ENUM('full_custody','co_sign','client_initiated','self_managed') NOT NULL DEFAULT 'full_custody';

-- If a previous Prisma migration accidentally created a custody_policy column,
-- migrate its data to custody_mode and drop it.
-- This is a safety net — skip if the column doesn't exist.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cvh_admin'
    AND TABLE_NAME = 'clients'
    AND COLUMN_NAME = 'custody_policy'
);

SET @migrate_sql = IF(@col_exists > 0,
  'UPDATE `cvh_admin`.`clients` SET `custody_mode` = `custody_policy` WHERE `custody_policy` IS NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @migrate_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_sql = IF(@col_exists > 0,
  'ALTER TABLE `cvh_admin`.`clients` DROP COLUMN `custody_policy`',
  'SELECT 1');
PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
