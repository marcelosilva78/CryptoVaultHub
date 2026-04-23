-- 038-co-sign-operations.sql
-- Co-sign operations table and withdrawal status extension

USE cvh_transactions;

-- Add pending_cosign to withdrawal status ENUM
ALTER TABLE withdrawals
  MODIFY COLUMN status ENUM(
    'pending_approval','pending_cosign','approved','broadcasting',
    'confirmed','failed','cancelled','rejected'
  ) NOT NULL DEFAULT 'pending_approval';

-- Co-sign operations table
CREATE TABLE IF NOT EXISTS co_sign_operations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  operation_id VARCHAR(64) NOT NULL,
  withdrawal_id BIGINT NOT NULL,
  client_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  chain_id INT NOT NULL,
  operation_hash VARCHAR(66) NOT NULL,
  hot_wallet_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42) NOT NULL,
  amount_raw VARCHAR(78) NOT NULL,
  token_contract_address VARCHAR(42) NULL,
  expire_time BIGINT NOT NULL,
  sequence_id BIGINT NOT NULL,
  network_id VARCHAR(20) NOT NULL,
  status ENUM('pending','signed','expired','cancelled') NOT NULL DEFAULT 'pending',
  client_signature VARCHAR(132) NULL,
  client_address VARCHAR(42) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  signed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_operation_id (operation_id),
  UNIQUE KEY uq_withdrawal (withdrawal_id),
  INDEX idx_client_status (client_id, status),
  INDEX idx_expires (status, expires_at),
  INDEX idx_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
