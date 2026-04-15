-- =============================================================================
-- CryptoVaultHub — Notification Rules Table
-- Database: cvh_notifications
-- =============================================================================

USE cvh_notifications;

CREATE TABLE IF NOT EXISTS notification_rules (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  client_id        BIGINT       NOT NULL,
  name             VARCHAR(100) NOT NULL,
  event_type       VARCHAR(50)  NOT NULL,
  condition_type   VARCHAR(50)  NOT NULL DEFAULT 'always',
  condition_value  VARCHAR(200) NULL,
  delivery_method  VARCHAR(20)  NOT NULL DEFAULT 'email',
  delivery_target  VARCHAR(200) NULL,
  is_enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       TIMESTAMP    NULL,
  PRIMARY KEY (id),
  INDEX idx_client_active (client_id, is_enabled, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
