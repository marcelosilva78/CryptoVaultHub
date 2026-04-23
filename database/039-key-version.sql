USE cvh_keyvault;

-- Add key_version column to all encrypted tables for rotation tracking.
-- Default 1 = original encryption; incremented on each rotation.

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cvh_keyvault' AND TABLE_NAME='master_seeds' AND COLUMN_NAME='key_version');
SET @s = IF(@col=0, 'ALTER TABLE master_seeds ADD COLUMN key_version INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cvh_keyvault' AND TABLE_NAME='project_seeds' AND COLUMN_NAME='key_version');
SET @s = IF(@col=0, 'ALTER TABLE project_seeds ADD COLUMN key_version INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cvh_keyvault' AND TABLE_NAME='derived_keys' AND COLUMN_NAME='key_version');
SET @s = IF(@col=0, 'ALTER TABLE derived_keys ADD COLUMN key_version INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cvh_keyvault' AND TABLE_NAME='shamir_shares' AND COLUMN_NAME='key_version');
SET @s = IF(@col=0, 'ALTER TABLE shamir_shares ADD COLUMN key_version INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
