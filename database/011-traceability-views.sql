-- =============================================================================
-- CryptoVaultHub — Traceability Views
-- Cross-database views for client, wallet, and transaction reporting.
--
-- NOTE: These views use fully qualified table names (database.table) so they
-- can be created in any schema. We place them in cvh_wallets since it is the
-- natural home for wallet/transaction reporting, but the queries span
-- cvh_admin, cvh_wallets, cvh_transactions, and cvh_keyvault.
-- =============================================================================

USE `cvh_wallets`;

-- =============================================================================
-- 1. v_client_wallet_summary
--    Aggregated wallet data per client: wallet count, forwarder count, chains.
-- =============================================================================

CREATE OR REPLACE VIEW `v_client_wallet_summary` AS
SELECT
  c.`id`                                          AS `client_id`,
  c.`name`                                        AS `client_name`,
  c.`slug`                                        AS `client_slug`,
  c.`status`                                      AS `client_status`,
  COUNT(DISTINCT w.`id`)                          AS `wallet_count`,
  COUNT(DISTINCT da.`id`)                         AS `forwarder_count`,
  COUNT(DISTINCT w.`chain_id`)                    AS `chain_count`,
  GROUP_CONCAT(DISTINCT ch.`short_name`
    ORDER BY ch.`chain_id` SEPARATOR ', ')        AS `chains`,
  MIN(w.`created_at`)                             AS `first_wallet_at`,
  MAX(w.`created_at`)                             AS `last_wallet_at`
FROM
  `cvh_admin`.`clients` c
  LEFT JOIN `cvh_wallets`.`wallets` w
    ON w.`client_id` = c.`id` AND w.`is_active` = 1
  LEFT JOIN `cvh_wallets`.`deposit_addresses` da
    ON da.`client_id` = c.`id`
  LEFT JOIN `cvh_admin`.`chains` ch
    ON ch.`chain_id` = w.`chain_id`
GROUP BY
  c.`id`, c.`name`, c.`slug`, c.`status`;

-- =============================================================================
-- 2. v_wallet_transactions
--    Unified view of deposits + withdrawals per wallet with full details.
-- =============================================================================

CREATE OR REPLACE VIEW `v_wallet_transactions` AS
SELECT
  d.`id`                      AS `tx_id`,
  'deposit'                   AS `tx_type`,
  d.`client_id`,
  d.`chain_id`,
  ch.`short_name`             AS `chain_name`,
  d.`forwarder_address`       AS `wallet_address`,
  d.`from_address`,
  NULL                        AS `to_address`,
  d.`token_id`,
  t.`symbol`                  AS `token_symbol`,
  t.`decimals`                AS `token_decimals`,
  d.`amount`,
  d.`amount_raw`,
  d.`tx_hash`,
  d.`block_number`,
  d.`status`,
  d.`confirmations`,
  d.`confirmations_required`,
  d.`kyt_result`,
  d.`detected_at`             AS `created_at`,
  d.`confirmed_at`
FROM
  `cvh_transactions`.`deposits` d
  LEFT JOIN `cvh_admin`.`chains` ch ON ch.`chain_id` = d.`chain_id`
  LEFT JOIN `cvh_admin`.`tokens` t  ON t.`id` = d.`token_id`

UNION ALL

SELECT
  w.`id`                      AS `tx_id`,
  'withdrawal'                AS `tx_type`,
  w.`client_id`,
  w.`chain_id`,
  ch.`short_name`             AS `chain_name`,
  w.`from_wallet`             AS `wallet_address`,
  NULL                        AS `from_address`,
  w.`to_address`,
  w.`token_id`,
  t.`symbol`                  AS `token_symbol`,
  t.`decimals`                AS `token_decimals`,
  w.`amount`,
  w.`amount_raw`,
  w.`tx_hash`,
  NULL                        AS `block_number`,
  w.`status`,
  NULL                        AS `confirmations`,
  NULL                        AS `confirmations_required`,
  w.`kyt_result`,
  w.`created_at`,
  w.`confirmed_at`
FROM
  `cvh_transactions`.`withdrawals` w
  LEFT JOIN `cvh_admin`.`chains` ch ON ch.`chain_id` = w.`chain_id`
  LEFT JOIN `cvh_admin`.`tokens` t  ON t.`id` = w.`token_id`;

-- =============================================================================
-- 3. v_client_transaction_history
--    Complete transaction history per client with wallet and client info.
-- =============================================================================

CREATE OR REPLACE VIEW `v_client_transaction_history` AS
SELECT
  vwt.`tx_id`,
  vwt.`tx_type`,
  vwt.`client_id`,
  c.`name`                    AS `client_name`,
  c.`slug`                    AS `client_slug`,
  vwt.`chain_id`,
  vwt.`chain_name`,
  vwt.`wallet_address`,
  vwt.`from_address`,
  vwt.`to_address`,
  vwt.`token_id`,
  vwt.`token_symbol`,
  vwt.`token_decimals`,
  vwt.`amount`,
  vwt.`amount_raw`,
  vwt.`tx_hash`,
  vwt.`block_number`,
  vwt.`status`,
  vwt.`confirmations`,
  vwt.`confirmations_required`,
  vwt.`kyt_result`,
  vwt.`created_at`,
  vwt.`confirmed_at`
FROM
  `v_wallet_transactions` vwt
  LEFT JOIN `cvh_admin`.`clients` c ON c.`id` = vwt.`client_id`;

-- =============================================================================
-- 4. v_daily_volume
--    Daily transaction volumes by chain and token.
-- =============================================================================

CREATE OR REPLACE VIEW `v_daily_volume` AS
SELECT
  DATE(sub.`created_at`)      AS `tx_date`,
  sub.`tx_type`,
  sub.`chain_id`,
  ch.`short_name`             AS `chain_name`,
  sub.`token_id`,
  t.`symbol`                  AS `token_symbol`,
  t.`decimals`                AS `token_decimals`,
  COUNT(*)                    AS `tx_count`,
  SUM(CAST(sub.`amount` AS DECIMAL(38,18))) AS `total_amount`
FROM (
  SELECT
    d.`detected_at`           AS `created_at`,
    'deposit'                 AS `tx_type`,
    d.`chain_id`,
    d.`token_id`,
    d.`amount`
  FROM `cvh_transactions`.`deposits` d
  WHERE d.`status` NOT IN ('rejected', 'failed')

  UNION ALL

  SELECT
    w.`created_at`,
    'withdrawal'              AS `tx_type`,
    w.`chain_id`,
    w.`token_id`,
    w.`amount`
  FROM `cvh_transactions`.`withdrawals` w
  WHERE w.`status` NOT IN ('rejected', 'failed')
) sub
LEFT JOIN `cvh_admin`.`chains` ch ON ch.`chain_id` = sub.`chain_id`
LEFT JOIN `cvh_admin`.`tokens` t  ON t.`id` = sub.`token_id`
GROUP BY
  DATE(sub.`created_at`),
  sub.`tx_type`,
  sub.`chain_id`,
  ch.`short_name`,
  sub.`token_id`,
  t.`symbol`,
  t.`decimals`;

-- =============================================================================
-- 5. v_wallet_details
--    Full wallet details with signer info (from derived_keys) and forwarder
--    count (from deposit_addresses).
-- =============================================================================

CREATE OR REPLACE VIEW `v_wallet_details` AS
SELECT
  w.`id`                      AS `wallet_id`,
  w.`client_id`,
  c.`name`                    AS `client_name`,
  c.`slug`                    AS `client_slug`,
  w.`chain_id`,
  ch.`short_name`             AS `chain_name`,
  ch.`name`                   AS `chain_full_name`,
  w.`address`                 AS `wallet_address`,
  w.`wallet_type`,
  w.`is_active`,
  dk.`public_key`             AS `signer_public_key`,
  dk.`address`                AS `signer_address`,
  dk.`derivation_path`        AS `signer_derivation_path`,
  dk.`key_type`               AS `signer_key_type`,
  COUNT(DISTINCT da.`id`)     AS `forwarder_count`,
  SUM(da.`is_deployed`)       AS `forwarders_deployed`,
  w.`created_at`
FROM
  `cvh_wallets`.`wallets` w
  LEFT JOIN `cvh_admin`.`clients` c
    ON c.`id` = w.`client_id`
  LEFT JOIN `cvh_admin`.`chains` ch
    ON ch.`chain_id` = w.`chain_id`
  LEFT JOIN `cvh_keyvault`.`derived_keys` dk
    ON dk.`client_id` = w.`client_id`
    AND dk.`address` = w.`address`
    AND dk.`is_active` = 1
  LEFT JOIN `cvh_wallets`.`deposit_addresses` da
    ON da.`wallet_id` = w.`id`
GROUP BY
  w.`id`, w.`client_id`, c.`name`, c.`slug`,
  w.`chain_id`, ch.`short_name`, ch.`name`,
  w.`address`, w.`wallet_type`, w.`is_active`,
  dk.`public_key`, dk.`address`, dk.`derivation_path`, dk.`key_type`,
  w.`created_at`;
