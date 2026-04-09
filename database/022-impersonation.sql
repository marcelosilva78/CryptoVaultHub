USE `cvh_auth`;

CREATE TABLE IF NOT EXISTS `impersonation_sessions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_user_id` BIGINT NOT NULL,
  `target_client_id` BIGINT NOT NULL,
  `target_project_id` BIGINT NULL,
  `mode` ENUM('read_only','support','full_operational') NOT NULL DEFAULT 'read_only',
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` DATETIME(3) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_admin` (`admin_user_id`, `started_at` DESC),
  INDEX `idx_target` (`target_client_id`, `target_project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `impersonation_audit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT NOT NULL,
  `admin_user_id` BIGINT NOT NULL,
  `target_client_id` BIGINT NOT NULL,
  `target_project_id` BIGINT NULL,
  `action` VARCHAR(200) NOT NULL,
  `resource_type` VARCHAR(100) NULL,
  `resource_id` VARCHAR(100) NULL,
  `request_method` VARCHAR(10) NOT NULL,
  `request_path` VARCHAR(500) NOT NULL,
  `request_body_hash` VARCHAR(64) NULL,
  `ip_address` VARCHAR(45) NULL,
  `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_session` (`session_id`),
  INDEX `idx_admin_time` (`admin_user_id`, `timestamp` DESC),
  CONSTRAINT `fk_audit_session` FOREIGN KEY (`session_id`) REFERENCES `impersonation_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
