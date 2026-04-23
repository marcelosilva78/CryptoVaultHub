-- =============================================================================
-- CryptoVaultHub — Migration 037: Standardize custody column name
-- The Prisma migration created 'custody_policy' but the codebase services
-- (core-wallet, client-api) expect 'custody_mode'. This migration renames
-- the column and ensures all ENUM values are present.
-- =============================================================================

USE `cvh_admin`;

-- Check which column name currently exists
SET @has_policy = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cvh_admin'
    AND TABLE_NAME = 'clients'
    AND COLUMN_NAME = 'custody_policy'
);

SET @has_mode = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cvh_admin'
    AND TABLE_NAME = 'clients'
    AND COLUMN_NAME = 'custody_mode'
);

-- If custody_policy exists but custody_mode does not: rename it
SET @rename_sql = IF(@has_policy > 0 AND @has_mode = 0,
  'ALTER TABLE `cvh_admin`.`clients` CHANGE COLUMN `custody_policy` `custody_mode` ENUM(''full_custody'',''co_sign'',''client_initiated'',''self_managed'') NOT NULL DEFAULT ''full_custody''',
  'SELECT 1');
PREPARE stmt FROM @rename_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- If custody_mode already exists: ensure it has all ENUM values
SET @modify_sql = IF(@has_mode > 0 AND @has_policy = 0,
  'ALTER TABLE `cvh_admin`.`clients` MODIFY COLUMN `custody_mode` ENUM(''full_custody'',''co_sign'',''client_initiated'',''self_managed'') NOT NULL DEFAULT ''full_custody''',
  'SELECT 1');
PREPARE stmt FROM @modify_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
