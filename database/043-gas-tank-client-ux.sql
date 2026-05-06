-- 043-gas-tank-client-ux.sql
-- Adds gas_tank_transactions (history) and gas_tank_alert_config (per-chain alert prefs).

USE cvh_wallets;

CREATE TABLE IF NOT EXISTS gas_tank_transactions (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  wallet_id       BIGINT       NOT NULL,
  project_id      BIGINT       NOT NULL,
  chain_id        INT          NOT NULL,
  tx_hash         VARCHAR(66)  NOT NULL,
  operation_type  VARCHAR(32)  NOT NULL, -- deploy_wallet | deploy_forwarder | sweep | flush | topup_internal | other
  to_address      VARCHAR(42)  NULL,
  gas_used        BIGINT       NULL,
  gas_price_wei   VARCHAR(80)  NOT NULL,
  gas_cost_wei    VARCHAR(80)  NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'submitted', -- submitted | confirmed | failed
  block_number    BIGINT       NULL,
  metadata        JSON         NULL,
  submitted_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at    DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY idx_proj_chain_time (project_id, chain_id, submitted_at DESC),
  KEY idx_wallet_time     (wallet_id, submitted_at DESC),
  KEY idx_tx_hash         (tx_hash),
  KEY idx_status_submitted (status, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gas_tank_alert_config (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  project_id      BIGINT       NOT NULL,
  chain_id        INT          NOT NULL,
  threshold_wei   VARCHAR(80)  NOT NULL,
  email_enabled   TINYINT(1)   NOT NULL DEFAULT 0,
  webhook_enabled TINYINT(1)   NOT NULL DEFAULT 1,
  last_alert_at   DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_proj_chain (project_id, chain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: create a default alert config row for every existing gas tank wallet,
-- using a placeholder threshold of 0.001 ETH expressed in wei. Clients edit later.
INSERT INTO gas_tank_alert_config (project_id, chain_id, threshold_wei, webhook_enabled)
SELECT DISTINCT w.project_id, w.chain_id, '1000000000000000', 1
FROM wallets w
WHERE w.wallet_type = 'gas_tank'
  AND NOT EXISTS (
    SELECT 1 FROM gas_tank_alert_config c
    WHERE c.project_id = w.project_id AND c.chain_id = w.chain_id
  );
