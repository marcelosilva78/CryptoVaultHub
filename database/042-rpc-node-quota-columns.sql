-- 042-rpc-node-quota-columns.sql
-- Add daily and monthly request quota columns to rpc_nodes (idempotent).

USE cvh_admin;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cvh_admin' AND TABLE_NAME='rpc_nodes' AND COLUMN_NAME='max_requests_per_day');
SET @s = IF(@col=0, 'ALTER TABLE rpc_nodes ADD COLUMN max_requests_per_day INT NULL AFTER max_requests_per_minute', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cvh_admin' AND TABLE_NAME='rpc_nodes' AND COLUMN_NAME='max_requests_per_month');
SET @s = IF(@col=0, 'ALTER TABLE rpc_nodes ADD COLUMN max_requests_per_month INT NULL AFTER max_requests_per_day', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
