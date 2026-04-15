-- database/024-chain-lifecycle.sql
-- Chain lifecycle status + RPC node quota tracking

-- ─── Chain Lifecycle ───────────────────────────────────────

ALTER TABLE cvh_admin.chains
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER gas_price_strategy,
  ADD COLUMN status_reason VARCHAR(255) NULL AFTER status,
  ADD COLUMN status_changed_at DATETIME NULL AFTER status_reason,
  ADD COLUMN finality_threshold INT NOT NULL DEFAULT 32 AFTER confirmations_default,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE cvh_admin.chains SET status = 'active' WHERE is_active = 1;
UPDATE cvh_admin.chains SET status = 'inactive' WHERE is_active = 0;

ALTER TABLE cvh_admin.chains ADD INDEX idx_status (status);

-- ─── RPC Node Quota Tracking ───────────────────────────────

ALTER TABLE cvh_admin.rpc_nodes
  ADD COLUMN max_requests_per_day INT NULL AFTER max_requests_per_minute,
  ADD COLUMN max_requests_per_month INT NULL AFTER max_requests_per_day,
  ADD COLUMN quota_status VARCHAR(20) NOT NULL DEFAULT 'available' AFTER max_requests_per_month,
  ADD COLUMN provider_type VARCHAR(20) NOT NULL DEFAULT 'custom' AFTER quota_status,
  ADD COLUMN auth_method_type VARCHAR(20) NOT NULL DEFAULT 'url_path' AFTER provider_type,
  ADD COLUMN node_type VARCHAR(30) NULL AFTER auth_method_type;
