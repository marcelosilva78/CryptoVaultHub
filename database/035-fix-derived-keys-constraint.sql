-- =============================================================================
-- Fix derived_keys unique constraint to be per-project instead of per-client
-- The old constraint (client_id, key_type, chain_scope) prevented multiple
-- projects from having their own keys. New constraint uses project_id.
-- =============================================================================

USE `cvh_keyvault`;

-- Drop the old constraint (may already be dropped if migration ran manually)
-- Use a procedure to handle the case where it doesn't exist
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'cvh_keyvault'
  AND TABLE_NAME = 'derived_keys'
  AND CONSTRAINT_NAME = 'uq_client_keytype_chain'
);

SET @sql = IF(@constraint_exists > 0,
  'ALTER TABLE `derived_keys` DROP INDEX `uq_client_keytype_chain`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the new project-scoped constraint (if not exists)
SET @new_constraint_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'cvh_keyvault'
  AND TABLE_NAME = 'derived_keys'
  AND CONSTRAINT_NAME = 'uq_project_keytype_chain'
);

SET @sql2 = IF(@new_constraint_exists = 0,
  'ALTER TABLE `derived_keys` ADD UNIQUE KEY `uq_project_keytype_chain` (`project_id`, `key_type`, `chain_scope`)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
