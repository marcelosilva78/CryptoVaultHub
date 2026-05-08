-- Adds per-chain threshold + amount for automatic top-up of platform-key EOAs.
-- Stored as VARCHAR(78) to match the wei representation used elsewhere
-- (uint256 max fits in 78 decimal digits).
--
-- NOTE: cvh_wallets.chains is a VIEW over cvh_admin.chains (the base table).
-- We ALTER the base table and then recreate the view to expose the new columns.

ALTER TABLE cvh_admin.chains
  ADD COLUMN platform_topup_threshold_wei VARCHAR(78) NULL
    COMMENT 'Top-up trigger: refill platform key EOA when its balance falls below this (wei).',
  ADD COLUMN platform_topup_amount_wei VARCHAR(78) NULL
    COMMENT 'Top-up amount: how much wei to send to the platform key when triggered.';

-- BSC defaults: trigger at 0.005 BNB, top up to 0.01 BNB.
UPDATE cvh_admin.chains
SET
  platform_topup_threshold_wei = '5000000000000000',
  platform_topup_amount_wei    = '10000000000000000'
WHERE chain_id = 56;

-- Other EVM chains use the same defaults (operator can override per chain later).
UPDATE cvh_admin.chains
SET
  platform_topup_threshold_wei = COALESCE(platform_topup_threshold_wei, '5000000000000000'),
  platform_topup_amount_wei    = COALESCE(platform_topup_amount_wei,   '10000000000000000');

-- Recreate the cvh_wallets.chains view to expose the two new columns.
CREATE OR REPLACE VIEW cvh_wallets.chains AS
SELECT
  `cvh_admin`.`chains`.`chain_id`                    AS `chain_id`,
  `cvh_admin`.`chains`.`name`                        AS `name`,
  `cvh_admin`.`chains`.`short_name`                  AS `short_name`,
  `cvh_admin`.`chains`.`native_currency_symbol`      AS `native_currency_symbol`,
  `cvh_admin`.`chains`.`native_currency_decimals`    AS `native_currency_decimals`,
  `cvh_admin`.`chains`.`rpc_endpoints`               AS `rpc_endpoints`,
  `cvh_admin`.`chains`.`block_time_seconds`          AS `block_time_seconds`,
  `cvh_admin`.`chains`.`confirmations_default`       AS `confirmations_default`,
  `cvh_admin`.`chains`.`finality_threshold`          AS `finality_threshold`,
  `cvh_admin`.`chains`.`wallet_factory_address`      AS `wallet_factory_address`,
  `cvh_admin`.`chains`.`forwarder_factory_address`   AS `forwarder_factory_address`,
  `cvh_admin`.`chains`.`wallet_impl_address`         AS `wallet_impl_address`,
  `cvh_admin`.`chains`.`forwarder_impl_address`      AS `forwarder_impl_address`,
  `cvh_admin`.`chains`.`multicall3_address`          AS `multicall3_address`,
  `cvh_admin`.`chains`.`explorer_url`                AS `explorer_url`,
  `cvh_admin`.`chains`.`gas_price_strategy`          AS `gas_price_strategy`,
  `cvh_admin`.`chains`.`status`                      AS `status`,
  `cvh_admin`.`chains`.`status_reason`               AS `status_reason`,
  `cvh_admin`.`chains`.`status_changed_at`           AS `status_changed_at`,
  `cvh_admin`.`chains`.`is_active`                   AS `is_active`,
  `cvh_admin`.`chains`.`is_testnet`                  AS `is_testnet`,
  `cvh_admin`.`chains`.`platform_topup_threshold_wei` AS `platform_topup_threshold_wei`,
  `cvh_admin`.`chains`.`platform_topup_amount_wei`   AS `platform_topup_amount_wei`,
  `cvh_admin`.`chains`.`created_at`                  AS `created_at`,
  `cvh_admin`.`chains`.`updated_at`                  AS `updated_at`
FROM `cvh_admin`.`chains`;
