-- =============================================================================
-- CryptoVaultHub — cvh_notifications Database
-- Tables: webhooks, webhook_deliveries, email_logs
-- Source: services/notification-service/prisma/schema.prisma
-- =============================================================================

USE `cvh_notifications`;

-- webhooks
CREATE TABLE IF NOT EXISTS `webhooks` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`  BIGINT       NOT NULL,
  `url`        VARCHAR(500) NOT NULL,
  `secret`     VARCHAR(128) NOT NULL,
  `events`     JSON         NOT NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_url` (`client_id`, `url`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- webhook_deliveries
CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `delivery_code`    VARCHAR(50)  NOT NULL,
  `webhook_id`       BIGINT       NOT NULL,
  `client_id`        BIGINT       NOT NULL,
  `event_type`       VARCHAR(50)  NOT NULL,
  `payload`          JSON         NOT NULL,
  `status`           VARCHAR(20)  NOT NULL DEFAULT 'queued',
  `http_status`      INT          NULL,
  `response_body`    TEXT         NULL,
  `response_time_ms` INT          NULL,
  `attempts`         INT          NOT NULL DEFAULT 0,
  `max_attempts`     INT          NOT NULL DEFAULT 5,
  `last_attempt_at`  TIMESTAMP    NULL,
  `next_retry_at`    TIMESTAMP    NULL,
  `error`            TEXT         NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_delivery_code` (`delivery_code`),
  INDEX `idx_webhook_created` (`webhook_id`, `created_at`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- email_logs
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `client_id`  BIGINT       NOT NULL,
  `to`         VARCHAR(255) NOT NULL,
  `subject`    VARCHAR(500) NOT NULL,
  `body`       TEXT         NOT NULL,
  `status`     VARCHAR(20)  NOT NULL DEFAULT 'queued',
  `sent_at`    TIMESTAMP    NULL,
  `error`      TEXT         NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
