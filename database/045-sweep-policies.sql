-- Migration 045 — sweep_policies
--
-- Per (project_id, chain_id) policy that the sweep cron consults before
-- moving funds from forwarder → hot wallet. Default for existing projects is
-- 'auto' (current behavior); clients opt-in to other modes via the portal.
--
-- Modes (string, validated server-side):
--   auto            — sweep every confirmed deposit immediately
--   manual          — never sweep automatically; only via POST /sweep/now
--   threshold_count — sweep when a forwarder accumulates >= N unswept deposits
--   threshold_value — sweep when a forwarder's USD balance >= X
--   schedule        — sweep on a cron expression honoring schedule_tz
--
-- last_run_at is updated by the sweep cron each time a cycle ACTUALLY runs
-- for this (project, chain) — used by `schedule` mode to compute next-due.

CREATE TABLE IF NOT EXISTS cvh_wallets.sweep_policies (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id      BIGINT UNSIGNED NOT NULL,
  chain_id        INT NOT NULL,
  mode            VARCHAR(20) NOT NULL DEFAULT 'auto',
  threshold_count INT NULL,
  threshold_usd   DECIMAL(18, 2) NULL,
  schedule_cron   VARCHAR(64) NULL,
  schedule_tz     VARCHAR(64) NULL DEFAULT 'UTC',
  is_paused       TINYINT(1) NOT NULL DEFAULT 0,
  last_run_at     DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_chain (project_id, chain_id),
  KEY idx_mode (mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
