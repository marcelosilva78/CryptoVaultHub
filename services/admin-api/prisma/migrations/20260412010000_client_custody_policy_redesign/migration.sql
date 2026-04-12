-- Step 1: Add self_managed value to existing custody_mode enum
ALTER TABLE `clients` MODIFY COLUMN `custody_mode` ENUM('full_custody', 'co_sign', 'client_initiated', 'self_managed') NOT NULL DEFAULT 'full_custody';

-- Step 2: Migrate client_initiated data to self_managed
UPDATE `clients` SET `custody_mode` = 'self_managed' WHERE `custody_mode` = 'client_initiated';

-- Step 3: Rename column + remove client_initiated from enum
ALTER TABLE `clients` CHANGE COLUMN `custody_mode` `custody_policy` ENUM('full_custody', 'co_sign', 'self_managed') NOT NULL DEFAULT 'full_custody';

-- Step 4: Add email column
ALTER TABLE `clients` ADD COLUMN `email` VARCHAR(255) NULL;

-- Step 5: Add custodyMode column to projects
ALTER TABLE `projects` ADD COLUMN `custody_mode` ENUM('full_custody', 'co_sign') NULL;
