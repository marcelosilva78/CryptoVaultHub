USE cvh_admin;

CREATE TABLE IF NOT EXISTS system_settings (
  id BIGINT NOT NULL AUTO_INCREMENT,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default SMTP settings (empty, needs configuration)
INSERT INTO system_settings (setting_key, setting_value, is_encrypted) VALUES
  ('smtp_host', '', FALSE),
  ('smtp_port', '587', FALSE),
  ('smtp_user', '', FALSE),
  ('smtp_password', '', TRUE),
  ('smtp_from_email', 'noreply@vaulthub.live', FALSE),
  ('smtp_from_name', 'CryptoVaultHub', FALSE),
  ('smtp_tls', 'true', FALSE)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
