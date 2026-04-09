-- =============================================================================
-- CryptoVaultHub — Seed Data
-- Inserts: default chains, default tokens (native + ERC-20), default tiers,
--          admin user, mock clients, wallets, deposit addresses, deposits,
--          withdrawals, webhooks, and compliance data for traceability testing.
-- Source: packages/config/src/chains.ts, packages/config/src/tokens.ts
-- =============================================================================

-- =============================================================================
-- 1. Default Chains (7 EVM networks)
-- =============================================================================

USE `cvh_admin`;

INSERT INTO `chains` (
  `chain_id`, `name`, `short_name`, `native_currency_symbol`,
  `native_currency_decimals`, `rpc_endpoints`, `block_time_seconds`,
  `confirmations_default`, `wallet_factory_address`, `forwarder_factory_address`,
  `wallet_impl_address`, `forwarder_impl_address`, `multicall3_address`,
  `explorer_url`, `gas_price_strategy`, `is_active`, `is_testnet`, `created_at`
) VALUES
  -- Ethereum Mainnet
  (1, 'Ethereum Mainnet', 'eth', 'ETH', 18,
   '[{"url":"https://eth-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   12.00, 12, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://etherscan.io', 'eip1559', 1, 0, NOW()),

  -- BNB Smart Chain
  (56, 'BNB Smart Chain', 'bnb', 'BNB', 18,
   '[{"url":"https://bsc-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   3.00, 20, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://bscscan.com', 'legacy', 1, 0, NOW()),

  -- Polygon Mainnet
  (137, 'Polygon Mainnet', 'matic', 'MATIC', 18,
   '[{"url":"https://polygon-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   2.00, 30, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://polygonscan.com', 'eip1559', 1, 0, NOW()),

  -- Arbitrum One
  (42161, 'Arbitrum One', 'arb1', 'ETH', 18,
   '[{"url":"https://arbitrum-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   1.00, 20, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://arbiscan.io', 'eip1559', 1, 0, NOW()),

  -- OP Mainnet (Optimism)
  (10, 'OP Mainnet', 'oeth', 'ETH', 18,
   '[{"url":"https://optimism-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   2.00, 20, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://optimistic.etherscan.io', 'eip1559', 1, 0, NOW()),

  -- Avalanche C-Chain
  (43114, 'Avalanche C-Chain', 'avax', 'AVAX', 18,
   '[{"url":"https://avalanche-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   2.00, 20, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://snowtrace.io', 'eip1559', 1, 0, NOW()),

  -- Base
  (8453, 'Base', 'base', 'ETH', 18,
   '[{"url":"https://base-mainnet.gateway.tatum.io/","type":"http","priority":1}]',
   2.00, 20, NULL, NULL, NULL, NULL,
   '0xcA11bde05977b3631167028862bE2a173976CA11',
   'https://basescan.org', 'eip1559', 1, 0, NOW())
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- =============================================================================
-- 2. Default Tokens — Native currencies + ERC-20 tokens per chain
-- =============================================================================

INSERT INTO `tokens` (
  `chain_id`, `contract_address`, `symbol`, `name`, `decimals`,
  `is_native`, `is_default`, `is_active`, `coingecko_id`, `created_at`
) VALUES
  -- -----------------------------------------------------------------------
  -- Ethereum Mainnet (chain_id = 1)
  -- -----------------------------------------------------------------------
  -- Native ETH
  (1, '0x0000000000000000000000000000000000000000', 'ETH', 'Ether', 18,
   1, 1, 1, 'ethereum', NOW()),
  -- USDT
  (1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 'Tether USD', 6,
   0, 1, 1, 'tether', NOW()),
  -- USDC
  (1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC', 'USD Coin', 6,
   0, 1, 1, 'usd-coin', NOW()),
  -- DAI
  (1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 'DAI', 'Dai Stablecoin', 18,
   0, 1, 1, 'dai', NOW()),
  -- WBTC
  (1, '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'WBTC', 'Wrapped Bitcoin', 8,
   0, 1, 1, 'wrapped-bitcoin', NOW()),
  -- WETH
  (1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'WETH', 'Wrapped Ether', 18,
   0, 1, 1, 'weth', NOW()),
  -- LINK
  (1, '0x514910771AF9Ca656af840dff83E8264EcF986CA', 'LINK', 'ChainLink Token', 18,
   0, 1, 1, 'chainlink', NOW()),

  -- -----------------------------------------------------------------------
  -- BNB Smart Chain (chain_id = 56)
  -- -----------------------------------------------------------------------
  -- Native BNB
  (56, '0x0000000000000000000000000000000000000000', 'BNB', 'BNB', 18,
   1, 1, 1, 'binancecoin', NOW()),
  -- USDT
  (56, '0x55d398326f99059fF775485246999027B3197955', 'USDT', 'Tether USD', 18,
   0, 1, 1, 'tether', NOW()),
  -- USDC
  (56, '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'USDC', 'USD Coin', 18,
   0, 1, 1, 'usd-coin', NOW()),
  -- BUSD
  (56, '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 'BUSD', 'Binance USD', 18,
   0, 1, 1, 'binance-usd', NOW()),
  -- BTCB
  (56, '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', 'BTCB', 'Bitcoin BEP2', 18,
   0, 1, 1, 'bitcoin-bep2', NOW()),
  -- WBNB
  (56, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'WBNB', 'Wrapped BNB', 18,
   0, 1, 1, 'wbnb', NOW()),

  -- -----------------------------------------------------------------------
  -- Polygon Mainnet (chain_id = 137)
  -- -----------------------------------------------------------------------
  -- Native MATIC
  (137, '0x0000000000000000000000000000000000000000', 'MATIC', 'Matic', 18,
   1, 1, 1, 'matic-network', NOW()),
  -- USDT
  (137, '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'USDT', 'Tether USD', 6,
   0, 1, 1, 'tether', NOW()),
  -- USDC
  (137, '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'USDC', 'USD Coin', 6,
   0, 1, 1, 'usd-coin', NOW()),
  -- WETH
  (137, '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', 'WETH', 'Wrapped Ether', 18,
   0, 1, 1, 'weth', NOW()),
  -- WMATIC
  (137, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', 'WMATIC', 'Wrapped Matic', 18,
   0, 1, 1, 'wmatic', NOW()),
  -- DAI
  (137, '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', 'DAI', 'Dai Stablecoin', 18,
   0, 1, 1, 'dai', NOW()),

  -- -----------------------------------------------------------------------
  -- Arbitrum One (chain_id = 42161)
  -- -----------------------------------------------------------------------
  -- Native ETH on Arbitrum
  (42161, '0x0000000000000000000000000000000000000000', 'ETH', 'Ether', 18,
   1, 1, 1, 'ethereum', NOW()),

  -- -----------------------------------------------------------------------
  -- OP Mainnet (chain_id = 10)
  -- -----------------------------------------------------------------------
  -- Native ETH on Optimism
  (10, '0x0000000000000000000000000000000000000000', 'ETH', 'Ether', 18,
   1, 1, 1, 'ethereum', NOW()),

  -- -----------------------------------------------------------------------
  -- Avalanche C-Chain (chain_id = 43114)
  -- -----------------------------------------------------------------------
  -- Native AVAX
  (43114, '0x0000000000000000000000000000000000000000', 'AVAX', 'Avalanche', 18,
   1, 1, 1, 'avalanche-2', NOW()),

  -- -----------------------------------------------------------------------
  -- Base (chain_id = 8453)
  -- -----------------------------------------------------------------------
  -- Native ETH on Base
  (8453, '0x0000000000000000000000000000000000000000', 'ETH', 'Ether', 18,
   1, 1, 1, 'ethereum', NOW())
ON DUPLICATE KEY UPDATE `symbol` = VALUES(`symbol`);

-- =============================================================================
-- 3. Default Tiers — Starter, Business, Enterprise
-- =============================================================================

INSERT INTO `tiers` (
  `id`, `name`, `base_tier_id`, `is_preset`, `is_custom`,
  `global_rate_limit`, `endpoint_rate_limits`,
  `max_forwarders_per_chain`, `max_chains`, `max_webhooks`,
  `daily_withdrawal_limit_usd`, `monitoring_mode`, `kyt_level`, `created_at`
) VALUES
  -- Starter
  (1, 'Starter', NULL, 1, 0,
   60,
   '{"POST /client/v1/deposit-addresses": 10, "POST /client/v1/withdrawals": 5}',
   100, 3, 5,
   10000.00, 'polling', 'basic', NOW()),

  -- Business
  (2, 'Business', NULL, 1, 0,
   300,
   '{"POST /client/v1/deposit-addresses": 50, "POST /client/v1/withdrawals": 30}',
   1000, 5, 20,
   100000.00, 'hybrid', 'enhanced', NOW()),

  -- Enterprise
  (3, 'Enterprise', NULL, 1, 0,
   1000,
   '{"POST /client/v1/deposit-addresses": 200, "POST /client/v1/withdrawals": 100}',
   10000, 7, 50,
   1000000.00, 'realtime', 'full', NOW())
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- =============================================================================
-- 4. Mock Clients — 3 clients across different tiers
-- =============================================================================

INSERT INTO `clients` (
  `id`, `name`, `slug`, `status`, `tier_id`, `custody_mode`,
  `kyt_enabled`, `kyt_level`, `created_at`, `updated_at`
) VALUES
  (1, 'Acme Exchange',       'acme-exchange',       'active',     3, 'full_custody', 1, 'full',     '2025-01-15 10:00:00', '2025-01-15 10:00:00'),
  (2, 'BlockPay Solutions',  'blockpay-solutions',  'active',     2, 'full_custody', 1, 'enhanced', '2025-02-20 14:30:00', '2025-02-20 14:30:00'),
  (3, 'CryptoMerchant Ltd',  'cryptomerchant-ltd',  'active',     1, 'full_custody', 0, 'basic',    '2025-03-10 09:00:00', '2025-03-10 09:00:00')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- =============================================================================
-- 5. Client Chain Config
-- =============================================================================

INSERT INTO `client_chain_config` (
  `client_id`, `chain_id`, `monitoring_mode`, `confirmations`,
  `sweep_enabled`, `sweep_threshold`, `webhook_milestones`, `is_active`,
  `created_at`, `updated_at`
) VALUES
  -- Acme Exchange: Ethereum + Polygon + Arbitrum
  (1, 1,     'realtime', 12, 1, '100000000000000000', '[1, 3, 6, 12]', 1, NOW(), NOW()),
  (1, 137,   'realtime', 30, 1, '50000000000000000',  '[1, 5, 15, 30]', 1, NOW(), NOW()),
  (1, 42161, 'realtime', 20, 1, '100000000000000000', '[1, 5, 10, 20]', 1, NOW(), NOW()),
  -- BlockPay: Ethereum + BNB
  (2, 1,     'hybrid',   12, 1, '200000000000000000', '[1, 6, 12]', 1, NOW(), NOW()),
  (2, 56,    'hybrid',   20, 1, '100000000000000000', '[1, 10, 20]', 1, NOW(), NOW()),
  -- CryptoMerchant: Polygon only
  (3, 137,   'polling',  30, 1, '100000000000000000', '[1, 15, 30]', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE `monitoring_mode` = VALUES(`monitoring_mode`);

-- =============================================================================
-- 6. Admin User (admin@cryptovaulthub.com / changeme)
-- =============================================================================

USE `cvh_auth`;

-- bcrypt hash for "changeme" with cost factor 10
INSERT INTO `users` (
  `email`, `password_hash`, `name`, `role`, `client_id`, `client_role`,
  `is_active`, `totp_secret`, `totp_enabled`, `created_at`, `updated_at`
) VALUES
  ('admin@cryptovaulthub.com',
   '$2b$10$8K1p/dELQiNsNX7qJGhWaOsNfCkN6UBCzGvp.YwVr0wdF8qMkWmKy',
   'CVH Admin', 'super_admin', NULL, NULL, 1, NULL, 0, NOW(), NOW()),
  -- Client admin users
  ('admin@acme-exchange.com',
   '$2b$10$8K1p/dELQiNsNX7qJGhWaOsNfCkN6UBCzGvp.YwVr0wdF8qMkWmKy',
   'Acme Admin', 'viewer', 1, 'owner', 1, NULL, 0, '2025-01-15 10:30:00', '2025-01-15 10:30:00'),
  ('ops@blockpay.io',
   '$2b$10$8K1p/dELQiNsNX7qJGhWaOsNfCkN6UBCzGvp.YwVr0wdF8qMkWmKy',
   'BlockPay Ops', 'viewer', 2, 'admin', 1, NULL, 0, '2025-02-20 15:00:00', '2025-02-20 15:00:00'),
  ('finance@cryptomerchant.com',
   '$2b$10$8K1p/dELQiNsNX7qJGhWaOsNfCkN6UBCzGvp.YwVr0wdF8qMkWmKy',
   'CM Finance', 'viewer', 3, 'owner', 1, NULL, 0, '2025-03-10 09:30:00', '2025-03-10 09:30:00')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- =============================================================================
-- 7. API Keys for mock clients
-- =============================================================================

INSERT INTO `api_keys` (
  `client_id`, `key_prefix`, `key_hash`, `scopes`, `ip_allowlist`,
  `allowed_chains`, `is_active`, `label`, `expires_at`, `last_used_at`,
  `last_used_ip`, `usage_count`, `created_at`, `revoked_at`
) VALUES
  (1, 'cvh_acme_', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   '["read","write","withdraw"]', '["10.0.0.0/8"]', '[1, 137, 42161]',
   1, 'Acme Production Key', NULL, '2026-04-08 18:30:00', '10.0.1.55', 15420,
   '2025-01-16 08:00:00', NULL),
  (2, 'cvh_bpay_', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
   '["read","write","withdraw"]', NULL, '[1, 56]',
   1, 'BlockPay Main Key', NULL, '2026-04-07 22:15:00', '203.0.113.42', 8310,
   '2025-02-21 10:00:00', NULL),
  (3, 'cvh_cm__', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
   '["read","write"]', NULL, '[137]',
   1, 'CryptoMerchant Key', NULL, '2026-04-05 11:00:00', '198.51.100.10', 2150,
   '2025-03-11 09:00:00', NULL)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

-- =============================================================================
-- 8. Wallets — at least 5 across different chains
-- =============================================================================

USE `cvh_wallets`;

INSERT INTO `wallets` (
  `id`, `client_id`, `chain_id`, `address`, `wallet_type`, `is_active`, `created_at`
) VALUES
  -- Acme Exchange: 3 wallets (ETH, Polygon, Arbitrum)
  (1, 1, 1,     '0xAcme0001111111111111111111111111111111111', 'hot',  1, '2025-01-16 10:00:00'),
  (2, 1, 137,   '0xAcme0002222222222222222222222222222222222', 'hot',  1, '2025-01-16 10:05:00'),
  (3, 1, 42161, '0xAcme0003333333333333333333333333333333333', 'hot',  1, '2025-01-20 08:00:00'),
  -- BlockPay: 2 wallets (ETH, BNB)
  (4, 2, 1,     '0xBPay0004444444444444444444444444444444444', 'hot',  1, '2025-02-21 14:00:00'),
  (5, 2, 56,    '0xBPay0005555555555555555555555555555555555', 'hot',  1, '2025-02-21 14:10:00'),
  -- CryptoMerchant: 1 wallet (Polygon)
  (6, 3, 137,   '0xCMer0006666666666666666666666666666666666', 'hot',  1, '2025-03-12 10:00:00'),
  -- Acme cold wallet (ETH)
  (7, 1, 1,     '0xAcme0007777777777777777777777777777777777', 'cold', 1, '2025-01-16 10:10:00')
ON DUPLICATE KEY UPDATE `wallet_type` = VALUES(`wallet_type`);

-- =============================================================================
-- 9. Deposit Addresses (forwarders) — multiple per wallet
-- =============================================================================

INSERT INTO `deposit_addresses` (
  `id`, `client_id`, `chain_id`, `wallet_id`, `address`, `external_id`,
  `label`, `salt`, `is_deployed`, `created_at`
) VALUES
  -- Acme ETH forwarders
  (1,  1, 1,   1, '0xFwd10001111111111111111111111111111111111', 'user-deposit-001', 'Alice ETH Deposit',  '0x0000000000000000000000000000000000000000000000000000000000000001', 1, '2025-01-17 08:00:00'),
  (2,  1, 1,   1, '0xFwd10002222222222222222222222222222222222', 'user-deposit-002', 'Bob ETH Deposit',    '0x0000000000000000000000000000000000000000000000000000000000000002', 1, '2025-01-18 09:00:00'),
  (3,  1, 1,   1, '0xFwd10003333333333333333333333333333333333', 'user-deposit-003', 'Charlie ETH Deposit','0x0000000000000000000000000000000000000000000000000000000000000003', 1, '2025-01-19 10:00:00'),
  -- Acme Polygon forwarders
  (4,  1, 137, 2, '0xFwd20001111111111111111111111111111111111', 'user-deposit-004', 'Alice MATIC Deposit', '0x0000000000000000000000000000000000000000000000000000000000000004', 1, '2025-01-17 08:30:00'),
  (5,  1, 137, 2, '0xFwd20002222222222222222222222222222222222', 'user-deposit-005', 'Bob MATIC Deposit',   '0x0000000000000000000000000000000000000000000000000000000000000005', 1, '2025-01-18 09:30:00'),
  -- Acme Arbitrum forwarders
  (6,  1, 42161, 3, '0xFwd30001111111111111111111111111111111111', 'user-deposit-006', 'Alice ARB Deposit', '0x0000000000000000000000000000000000000000000000000000000000000006', 1, '2025-01-21 11:00:00'),
  -- BlockPay ETH forwarders
  (7,  2, 1,   4, '0xFwd40001111111111111111111111111111111111', 'merchant-001', 'Merchant A',   '0x0000000000000000000000000000000000000000000000000000000000000007', 1, '2025-02-22 09:00:00'),
  (8,  2, 1,   4, '0xFwd40002222222222222222222222222222222222', 'merchant-002', 'Merchant B',   '0x0000000000000000000000000000000000000000000000000000000000000008', 1, '2025-02-23 10:00:00'),
  -- BlockPay BNB forwarders
  (9,  2, 56,  5, '0xFwd50001111111111111111111111111111111111', 'merchant-003', 'Merchant C BNB','0x0000000000000000000000000000000000000000000000000000000000000009', 1, '2025-02-22 09:30:00'),
  -- CryptoMerchant Polygon forwarders
  (10, 3, 137, 6, '0xFwd60001111111111111111111111111111111111', 'shop-checkout-001', 'Checkout 1',  '0x000000000000000000000000000000000000000000000000000000000000000a', 1, '2025-03-13 08:00:00'),
  (11, 3, 137, 6, '0xFwd60002222222222222222222222222222222222', 'shop-checkout-002', 'Checkout 2',  '0x000000000000000000000000000000000000000000000000000000000000000b', 0, '2025-03-13 08:30:00'),
  (12, 3, 137, 6, '0xFwd60003333333333333333333333333333333333', 'shop-checkout-003', 'Checkout 3',  '0x000000000000000000000000000000000000000000000000000000000000000c', 0, '2025-03-14 09:00:00')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

-- =============================================================================
-- 10. Whitelisted Addresses
-- =============================================================================

INSERT INTO `whitelisted_addresses` (
  `client_id`, `address`, `label`, `chain_id`, `status`, `cooldown_ends_at`, `created_at`
) VALUES
  (1, '0xWL01111111111111111111111111111111111111', 'Acme Treasury',         1,     'active',   NULL,                    '2025-01-17 08:00:00'),
  (1, '0xWL02222222222222222222222222222222222222', 'Acme Cold Storage',     1,     'active',   NULL,                    '2025-01-17 08:10:00'),
  (1, '0xWL03333333333333333333333333333333333333', 'Acme Polygon Payout',   137,   'active',   NULL,                    '2025-01-17 08:20:00'),
  (2, '0xWL04444444444444444444444444444444444444', 'BlockPay Settlement',   1,     'active',   NULL,                    '2025-02-22 10:00:00'),
  (2, '0xWL05555555555555555555555555555555555555', 'BlockPay BNB Payout',   56,    'active',   NULL,                    '2025-02-22 10:10:00'),
  (3, '0xWL06666666666666666666666666666666666666', 'CM Supplier Payment',   137,   'cooldown', '2026-04-12 09:00:00',   '2026-04-05 09:00:00'),
  (3, '0xWL07777777777777777777777777777777777777', 'CM Owner Withdrawal',   137,   'active',   NULL,                    '2025-03-14 09:00:00');

-- =============================================================================
-- 11. Deposits — 12 deposits across different chains, tokens, and statuses
-- =============================================================================

USE `cvh_transactions`;

-- We reference token IDs that match the insert order above:
-- ETH on chain 1 = token_id 1, USDT on chain 1 = token_id 2, USDC on chain 1 = token_id 3
-- MATIC on chain 137 = token_id 14, USDT on chain 137 = token_id 15, USDC on chain 137 = token_id 16
-- ETH on chain 42161 = token_id 21
-- BNB on chain 56 = token_id 8, USDT on chain 56 = token_id 9

INSERT INTO `deposits` (
  `id`, `client_id`, `chain_id`, `forwarder_address`, `external_id`, `token_id`,
  `amount`, `amount_raw`, `tx_hash`, `block_number`, `from_address`,
  `status`, `confirmations`, `confirmations_required`,
  `sweep_tx_hash`, `kyt_result`, `detected_at`, `confirmed_at`, `swept_at`
) VALUES
  -- Acme ETH deposits (confirmed + swept)
  (1,  1, 1, '0xFwd10001111111111111111111111111111111111', 'user-deposit-001', 1,
   '1.500000000000000000', '1500000000000000000',
   '0xaaa1111111111111111111111111111111111111111111111111111111111111', 19800100,
   '0xSender01111111111111111111111111111111111',
   'swept', 12, 12,
   '0xsweep1111111111111111111111111111111111111111111111111111111111', 'clean',
   '2026-03-01 10:00:00', '2026-03-01 10:02:24', '2026-03-01 10:05:00'),

  (2,  1, 1, '0xFwd10001111111111111111111111111111111111', 'user-deposit-001', 2,
   '5000.000000', '5000000000',
   '0xaaa2222222222222222222222222222222222222222222222222222222222222', 19800200,
   '0xSender02222222222222222222222222222222222',
   'swept', 12, 12,
   '0xsweep2222222222222222222222222222222222222222222222222222222222', 'clean',
   '2026-03-05 14:30:00', '2026-03-05 14:32:24', '2026-03-05 14:35:00'),

  (3,  1, 1, '0xFwd10002222222222222222222222222222222222', 'user-deposit-002', 3,
   '10000.000000', '10000000000',
   '0xaaa3333333333333333333333333333333333333333333333333333333333333', 19801000,
   '0xSender03333333333333333333333333333333333',
   'confirmed', 12, 12,
   NULL, 'clean',
   '2026-03-10 09:15:00', '2026-03-10 09:17:24', NULL),

  -- Acme Polygon deposits
  (4,  1, 137, '0xFwd20001111111111111111111111111111111111', 'user-deposit-004', 14,
   '500.000000000000000000', '500000000000000000000',
   '0xbbb1111111111111111111111111111111111111111111111111111111111111', 55000100,
   '0xSender04444444444444444444444444444444444',
   'swept', 30, 30,
   '0xsweep3333333333333333333333333333333333333333333333333333333333', 'clean',
   '2026-03-02 11:00:00', '2026-03-02 11:01:00', '2026-03-02 11:03:00'),

  (5,  1, 137, '0xFwd20002222222222222222222222222222222222', 'user-deposit-005', 16,
   '25000.000000', '25000000000',
   '0xbbb2222222222222222222222222222222222222222222222222222222222222', 55000500,
   '0xSender05555555555555555555555555555555555',
   'pending', 15, 30,
   NULL, NULL,
   '2026-04-08 16:00:00', NULL, NULL),

  -- Acme Arbitrum deposit
  (6,  1, 42161, '0xFwd30001111111111111111111111111111111111', 'user-deposit-006', 21,
   '0.750000000000000000', '750000000000000000',
   '0xccc1111111111111111111111111111111111111111111111111111111111111', 180000100,
   '0xSender06666666666666666666666666666666666',
   'swept', 20, 20,
   '0xsweep4444444444444444444444444444444444444444444444444444444444', 'clean',
   '2026-03-15 07:45:00', '2026-03-15 07:45:20', '2026-03-15 07:48:00'),

  -- BlockPay ETH deposits
  (7,  2, 1, '0xFwd40001111111111111111111111111111111111', 'merchant-001', 1,
   '2.000000000000000000', '2000000000000000000',
   '0xddd1111111111111111111111111111111111111111111111111111111111111', 19850000,
   '0xSender07777777777777777777777777777777777',
   'swept', 12, 12,
   '0xsweep5555555555555555555555555555555555555555555555555555555555', 'clean',
   '2026-03-20 12:00:00', '2026-03-20 12:02:24', '2026-03-20 12:05:00'),

  (8,  2, 1, '0xFwd40002222222222222222222222222222222222', 'merchant-002', 2,
   '1500.000000', '1500000000',
   '0xddd2222222222222222222222222222222222222222222222222222222222222', 19850100,
   '0xSender08888888888888888888888888888888888',
   'confirmed', 12, 12,
   NULL, 'clean',
   '2026-03-22 18:30:00', '2026-03-22 18:32:24', NULL),

  -- BlockPay BNB deposits
  (9,  2, 56, '0xFwd50001111111111111111111111111111111111', 'merchant-003', 8,
   '10.000000000000000000', '10000000000000000000',
   '0xeee1111111111111111111111111111111111111111111111111111111111111', 38000100,
   '0xSender09999999999999999999999999999999999',
   'swept', 20, 20,
   '0xsweep6666666666666666666666666666666666666666666666666666666666', 'clean',
   '2026-03-25 08:00:00', '2026-03-25 08:01:00', '2026-03-25 08:03:00'),

  (10, 2, 56, '0xFwd50001111111111111111111111111111111111', 'merchant-003', 9,
   '3000.000000000000000000', '3000000000000000000000',
   '0xeee2222222222222222222222222222222222222222222222222222222222222', 38000500,
   '0xSender10101010101010101010101010101010101',
   'pending', 8, 20,
   NULL, NULL,
   '2026-04-07 20:00:00', NULL, NULL),

  -- CryptoMerchant Polygon deposits
  (11, 3, 137, '0xFwd60001111111111111111111111111111111111', 'shop-checkout-001', 16,
   '150.000000', '150000000',
   '0xfff1111111111111111111111111111111111111111111111111111111111111', 55100100,
   '0xSender11111111111111111111111111111111111',
   'swept', 30, 30,
   '0xsweep7777777777777777777777777777777777777777777777777777777777', 'clean',
   '2026-03-28 15:00:00', '2026-03-28 15:01:00', '2026-03-28 15:03:00'),

  (12, 3, 137, '0xFwd60001111111111111111111111111111111111', 'shop-checkout-001', 15,
   '75.000000', '75000000',
   '0xfff2222222222222222222222222222222222222222222222222222222222222', 55100200,
   '0xSender12121212121212121212121212121212121',
   'confirmed', 30, 30,
   NULL, 'clean',
   '2026-04-01 10:30:00', '2026-04-01 10:31:00', NULL)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

-- =============================================================================
-- 12. Withdrawals — 10 withdrawals across different chains, tokens, and statuses
-- =============================================================================

INSERT INTO `withdrawals` (
  `id`, `client_id`, `chain_id`, `token_id`, `from_wallet`,
  `to_address_id`, `to_address`, `to_label`, `amount`, `amount_raw`,
  `tx_hash`, `status`, `sequence_id`, `gas_cost`, `kyt_result`,
  `idempotency_key`, `created_at`, `submitted_at`, `confirmed_at`
) VALUES
  -- Acme ETH withdrawals
  (1, 1, 1, 1,
   '0xAcme0001111111111111111111111111111111111',
   1, '0xWL01111111111111111111111111111111111111', 'Acme Treasury',
   '0.800000000000000000', '800000000000000000',
   '0xw0a1111111111111111111111111111111111111111111111111111111111111',
   'confirmed', 1, '21000000000000', 'clean',
   'acme-w-001', '2026-03-02 14:00:00', '2026-03-02 14:00:05', '2026-03-02 14:02:29'),

  (2, 1, 1, 2,
   '0xAcme0001111111111111111111111111111111111',
   2, '0xWL02222222222222222222222222222222222222', 'Acme Cold Storage',
   '3000.000000', '3000000000',
   '0xw0a2222222222222222222222222222222222222222222222222222222222222',
   'confirmed', 2, '65000000000000', 'clean',
   'acme-w-002', '2026-03-06 09:00:00', '2026-03-06 09:00:10', '2026-03-06 09:02:34'),

  (3, 1, 1, 3,
   '0xAcme0001111111111111111111111111111111111',
   1, '0xWL01111111111111111111111111111111111111', 'Acme Treasury',
   '5000.000000', '5000000000',
   '0xw0a3333333333333333333333333333333333333333333333333333333333333',
   'submitted', 3, NULL, 'clean',
   'acme-w-003', '2026-04-08 11:00:00', '2026-04-08 11:00:15', NULL),

  -- Acme Polygon withdrawals
  (4, 1, 137, 14,
   '0xAcme0002222222222222222222222222222222222',
   3, '0xWL03333333333333333333333333333333333333', 'Acme Polygon Payout',
   '200.000000000000000000', '200000000000000000000',
   '0xw0b1111111111111111111111111111111111111111111111111111111111111',
   'confirmed', 1, '5000000000000', 'clean',
   'acme-w-004', '2026-03-03 16:00:00', '2026-03-03 16:00:02', '2026-03-03 16:01:02'),

  (5, 1, 137, 16,
   '0xAcme0002222222222222222222222222222222222',
   3, '0xWL03333333333333333333333333333333333333', 'Acme Polygon Payout',
   '12000.000000', '12000000000',
   NULL,
   'pending_approval', NULL, NULL, NULL,
   'acme-w-005', '2026-04-09 08:00:00', NULL, NULL),

  -- BlockPay ETH withdrawals
  (6, 2, 1, 1,
   '0xBPay0004444444444444444444444444444444444',
   4, '0xWL04444444444444444444444444444444444444', 'BlockPay Settlement',
   '1.200000000000000000', '1200000000000000000',
   '0xw0c1111111111111111111111111111111111111111111111111111111111111',
   'confirmed', 1, '21000000000000', 'clean',
   'bpay-w-001', '2026-03-21 10:00:00', '2026-03-21 10:00:08', '2026-03-21 10:02:32'),

  (7, 2, 56, 8,
   '0xBPay0005555555555555555555555555555555555',
   5, '0xWL05555555555555555555555555555555555555', 'BlockPay BNB Payout',
   '5.000000000000000000', '5000000000000000000',
   '0xw0c2222222222222222222222222222222222222222222222222222222222222',
   'confirmed', 1, '3000000000000', 'clean',
   'bpay-w-002', '2026-03-26 12:00:00', '2026-03-26 12:00:03', '2026-03-26 12:01:03'),

  -- BlockPay pending withdrawal
  (8, 2, 1, 2,
   '0xBPay0004444444444444444444444444444444444',
   4, '0xWL04444444444444444444444444444444444444', 'BlockPay Settlement',
   '800.000000', '800000000',
   NULL,
   'pending_approval', NULL, NULL, NULL,
   'bpay-w-003', '2026-04-08 22:00:00', NULL, NULL),

  -- CryptoMerchant Polygon withdrawals
  (9, 3, 137, 16,
   '0xCMer0006666666666666666666666666666666666',
   7, '0xWL07777777777777777777777777777777777777', 'CM Owner Withdrawal',
   '100.000000', '100000000',
   '0xw0d1111111111111111111111111111111111111111111111111111111111111',
   'confirmed', 1, '5000000000000', 'clean',
   'cm-w-001', '2026-03-30 11:00:00', '2026-03-30 11:00:02', '2026-03-30 11:01:02'),

  (10, 3, 137, 15,
   '0xCMer0006666666666666666666666666666666666',
   7, '0xWL07777777777777777777777777777777777777', 'CM Owner Withdrawal',
   '50.000000', '50000000',
   '0xw0d2222222222222222222222222222222222222222222222222222222222222',
   'failed', 2, NULL, 'clean',
   'cm-w-002', '2026-04-03 09:00:00', '2026-04-03 09:00:05', NULL)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

-- =============================================================================
-- 13. Initial sync cursors for all chains (start from block 0)
-- =============================================================================

USE `cvh_indexer`;

INSERT INTO `sync_cursors` (`chain_id`, `last_block`, `updated_at`) VALUES
  (1,     0, NOW()),
  (56,    0, NOW()),
  (137,   0, NOW()),
  (42161, 0, NOW()),
  (10,    0, NOW()),
  (43114, 0, NOW()),
  (8453,  0, NOW())
ON DUPLICATE KEY UPDATE `last_block` = VALUES(`last_block`);

-- =============================================================================
-- 14. Monitored Addresses (forwarders being watched by the indexer)
-- =============================================================================

INSERT INTO `monitored_addresses` (
  `chain_id`, `address`, `client_id`, `wallet_id`, `is_active`, `created_at`
) VALUES
  -- Acme ETH forwarders
  (1,     '0xFwd10001111111111111111111111111111111111', 1, 1, 1, '2025-01-17 08:00:00'),
  (1,     '0xFwd10002222222222222222222222222222222222', 1, 1, 1, '2025-01-18 09:00:00'),
  (1,     '0xFwd10003333333333333333333333333333333333', 1, 1, 1, '2025-01-19 10:00:00'),
  -- Acme Polygon forwarders
  (137,   '0xFwd20001111111111111111111111111111111111', 1, 2, 1, '2025-01-17 08:30:00'),
  (137,   '0xFwd20002222222222222222222222222222222222', 1, 2, 1, '2025-01-18 09:30:00'),
  -- Acme Arbitrum forwarder
  (42161, '0xFwd30001111111111111111111111111111111111', 1, 3, 1, '2025-01-21 11:00:00'),
  -- BlockPay ETH forwarders
  (1,     '0xFwd40001111111111111111111111111111111111', 2, 4, 1, '2025-02-22 09:00:00'),
  (1,     '0xFwd40002222222222222222222222222222222222', 2, 4, 1, '2025-02-23 10:00:00'),
  -- BlockPay BNB forwarder
  (56,    '0xFwd50001111111111111111111111111111111111', 2, 5, 1, '2025-02-22 09:30:00'),
  -- CryptoMerchant Polygon forwarder
  (137,   '0xFwd60001111111111111111111111111111111111', 3, 6, 1, '2025-03-13 08:00:00')
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

-- =============================================================================
-- 15. Webhooks for mock clients
-- =============================================================================

USE `cvh_notifications`;

INSERT INTO `webhooks` (
  `client_id`, `url`, `secret`, `events`, `is_active`, `created_at`
) VALUES
  (1, 'https://api.acme-exchange.com/webhooks/cvh',
   'whsec_acme_000000000000000000000000000000000000000000000000000000000000',
   '["deposit.detected","deposit.confirmed","deposit.swept","withdrawal.confirmed"]',
   1, '2025-01-16 11:00:00'),
  (2, 'https://api.blockpay.io/callbacks/crypto',
   'whsec_bpay_000000000000000000000000000000000000000000000000000000000000',
   '["deposit.detected","deposit.confirmed","withdrawal.confirmed"]',
   1, '2025-02-21 15:00:00'),
  (3, 'https://cryptomerchant.com/hooks/payments',
   'whsec_cmer_000000000000000000000000000000000000000000000000000000000000',
   '["deposit.confirmed","deposit.swept"]',
   1, '2025-03-12 11:00:00')
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

-- =============================================================================
-- 16. Compliance — Sanctions entries and screening results
-- =============================================================================

USE `cvh_compliance`;

-- Sample sanctions entries (fictional addresses)
INSERT INTO `sanctions_entries` (
  `list_source`, `address`, `address_type`, `entity_name`, `entity_id`,
  `is_active`, `last_synced_at`, `created_at`
) VALUES
  ('OFAC_SDN', '0xBadActor0011111111111111111111111111111111', 'evm', 'Lazarus Group Wallet 1',   'OFAC-001', 1, '2026-04-01 00:00:00', '2025-06-01 00:00:00'),
  ('OFAC_SDN', '0xBadActor0022222222222222222222222222222222', 'evm', 'Sanctioned Entity Alpha',  'OFAC-002', 1, '2026-04-01 00:00:00', '2025-06-01 00:00:00'),
  ('EU_SANCTIONS', '0xBadActor0033333333333333333333333333333333', 'evm', 'EU Sanctioned Org',   'EU-001',   1, '2026-04-01 00:00:00', '2025-07-15 00:00:00')
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

-- Screening results for recent transactions (all clean)
INSERT INTO `screening_results` (
  `client_id`, `address`, `direction`, `trigger`, `tx_hash`,
  `lists_checked`, `result`, `match_details`, `action`, `screened_at`
) VALUES
  (1, '0xSender01111111111111111111111111111111111', 'inbound', 'deposit',
   '0xaaa1111111111111111111111111111111111111111111111111111111111111',
   '["OFAC_SDN","EU_SANCTIONS"]', 'clean', NULL, 'allow', '2026-03-01 10:00:05'),
  (1, '0xSender02222222222222222222222222222222222', 'inbound', 'deposit',
   '0xaaa2222222222222222222222222222222222222222222222222222222222222',
   '["OFAC_SDN","EU_SANCTIONS"]', 'clean', NULL, 'allow', '2026-03-05 14:30:05'),
  (2, '0xSender07777777777777777777777777777777777', 'inbound', 'deposit',
   '0xddd1111111111111111111111111111111111111111111111111111111111111',
   '["OFAC_SDN"]', 'clean', NULL, 'allow', '2026-03-20 12:00:05'),
  (1, '0xWL01111111111111111111111111111111111111', 'outbound', 'withdrawal',
   '0xw0a1111111111111111111111111111111111111111111111111111111111111',
   '["OFAC_SDN","EU_SANCTIONS"]', 'clean', NULL, 'allow', '2026-03-02 14:00:02'),
  (3, '0xSender11111111111111111111111111111111111', 'inbound', 'deposit',
   '0xfff1111111111111111111111111111111111111111111111111111111111111',
   '["OFAC_SDN"]', 'clean', NULL, 'allow', '2026-03-28 15:00:05');

-- =============================================================================
-- 17. Audit Logs — sample admin actions
-- =============================================================================

USE `cvh_admin`;

INSERT INTO `audit_logs` (
  `admin_user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`
) VALUES
  ('1', 'client.create',    'client', '1', '{"name":"Acme Exchange","tier":"Enterprise"}',       '10.0.0.1',  '2025-01-15 10:00:00'),
  ('1', 'client.create',    'client', '2', '{"name":"BlockPay Solutions","tier":"Business"}',     '10.0.0.1',  '2025-02-20 14:30:00'),
  ('1', 'client.create',    'client', '3', '{"name":"CryptoMerchant Ltd","tier":"Starter"}',      '10.0.0.1',  '2025-03-10 09:00:00'),
  ('1', 'tier.update',      'tier',   '3', '{"field":"daily_withdrawal_limit_usd","old":500000,"new":1000000}', '10.0.0.1', '2025-04-01 11:00:00'),
  ('1', 'client.activate',  'client', '1', '{"status":"active"}',                                '10.0.0.1',  '2025-01-15 10:05:00'),
  ('1', 'chain.activate',   'chain',  '1', '{"chain":"Ethereum Mainnet"}',                       '10.0.0.1',  '2025-01-15 10:10:00');
