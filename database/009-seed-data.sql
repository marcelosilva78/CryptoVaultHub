-- =============================================================================
-- CryptoVaultHub — Seed Data
-- Inserts: default chains, default tokens (native + ERC-20), default tiers,
--          admin user
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
-- 4. Admin User (admin@cryptovaulthub.com / changeme)
-- =============================================================================

USE `cvh_auth`;

-- bcrypt hash for "changeme" with cost factor 10
INSERT INTO `users` (
  `email`, `password_hash`, `name`, `role`, `client_id`, `client_role`,
  `is_active`, `totp_secret`, `totp_enabled`, `created_at`, `updated_at`
) VALUES (
  'admin@cryptovaulthub.com',
  '$2b$10$8K1p/dELQiNsNX7qJGhWaOsNfCkN6UBCzGvp.YwVr0wdF8qMkWmKy',
  'CVH Admin',
  'super_admin',
  NULL,
  NULL,
  1,
  NULL,
  0,
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- =============================================================================
-- 5. Initial sync cursors for all chains (start from block 0)
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
