# CryptoVaultHub v2 -- Database Schema Reference

All databases target MySQL 8.0+ with `utf8mb4_unicode_ci` collation and InnoDB engine.

Migration files are located in `database/` and executed via `database/migrate.sh`. Total: **42 migrations** (000-041).

---

## cvh_auth

Source: `database/001-cvh-auth.sql`, `services/auth-service/prisma/schema.prisma`

### users

Platform users (admin staff and client organization users).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `email` | VARCHAR(255) | NO | Unique login email |
| `password_hash` | VARCHAR(255) | NO | bcrypt hash |
| `name` | VARCHAR(200) | NO | Display name |
| `role` | ENUM('super_admin','admin','viewer') | NO | Admin role (default: viewer) |
| `client_id` | BIGINT | YES | Associated client (NULL for platform admins) |
| `client_role` | ENUM('owner','admin','viewer') | YES | Role within client org |
| `is_active` | TINYINT(1) | NO | Account active flag (default: 1) |
| `totp_secret` | VARCHAR(300) | YES | Encrypted TOTP secret |
| `totp_enabled` | TINYINT(1) | NO | 2FA enabled (default: 0) |
| `last_login_at` | TIMESTAMP | YES | Last successful login |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

**Indexes:** `uq_users_email` (UNIQUE), `idx_client`, `idx_users_is_active`, `idx_users_role`, `idx_users_client_role`, `idx_users_last_login`

### sessions

Active refresh token sessions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR(64) | NO | Session ID (PK) |
| `user_id` | BIGINT | NO | FK to users.id (CASCADE) |
| `refresh_token_hash` | VARCHAR(64) | NO | SHA-256 hash of refresh token |
| `ip_address` | VARCHAR(45) | YES | Client IP at login |
| `user_agent` | VARCHAR(500) | YES | Browser user-agent |
| `expires_at` | TIMESTAMP | NO | Session expiry |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `idx_user`, `idx_expires`, `idx_sessions_refresh_token`
**FK:** `fk_sessions_user` -> users(id) ON DELETE CASCADE

### api_keys

Client API keys for programmatic access.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `key_prefix` | VARCHAR(20) | NO | Visible prefix (e.g., `cvh_live_`) |
| `key_hash` | VARCHAR(64) | NO | SHA-256 hash of full key (UNIQUE) |
| `scopes` | JSON | NO | Array of scopes (default: `["read"]`) |
| `ip_allowlist` | JSON | YES | Allowed IP addresses |
| `allowed_chains` | JSON | YES | Allowed chain IDs |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `label` | VARCHAR(100) | YES | Human-readable label |
| `expires_at` | TIMESTAMP | YES | Optional expiration |
| `last_used_at` | TIMESTAMP | YES | Last usage timestamp |
| `last_used_ip` | VARCHAR(45) | YES | IP of last usage |
| `usage_count` | BIGINT | NO | Total usage count (default: 0) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `revoked_at` | TIMESTAMP | YES | Revocation timestamp |

**Indexes:** `uq_api_keys_key_hash` (UNIQUE), `idx_client`, `idx_api_keys_client_active`, `idx_api_keys_expires`, `idx_api_keys_last_used`

---

## cvh_keyvault

Source: `database/002-cvh-keyvault.sql`, `services/key-vault-service/prisma/schema.prisma`

### master_seeds

Encrypted master seeds for HD key derivation.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `seed_id` | VARCHAR(64) | NO | Unique seed identifier |
| `encrypted_seed` | BLOB | NO | AES-256-GCM encrypted seed |
| `encrypted_dek` | BLOB | NO | Encrypted data encryption key |
| `iv` | VARBINARY(16) | NO | Initialization vector |
| `auth_tag` | VARBINARY(16) | NO | GCM authentication tag |
| `salt` | VARBINARY(32) | NO | PBKDF2 salt |
| `kdf_iterations` | INT | NO | KDF iteration count (default: 100000) |
| `key_version` | INT | NO | Key version for rotation tracking (migration 039) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_master_seeds_seed_id` (UNIQUE)

### derived_keys

Per-client derived keys (HD wallet keys, gas tank keys).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `key_type` | ENUM('platform','client','backup','gas_tank') | NO | Key purpose |
| `chain_scope` | VARCHAR(10) | NO | Chain scope (default: 'evm') |
| `public_key` | VARCHAR(130) | NO | Uncompressed public key hex |
| `address` | VARCHAR(100) | NO | Derived on-chain address |
| `derivation_path` | VARCHAR(50) | NO | BIP-44 derivation path |
| `encrypted_key` | BLOB | NO | AES-256-GCM encrypted private key |
| `encrypted_dek` | BLOB | NO | Encrypted DEK |
| `iv` | VARBINARY(16) | NO | IV |
| `auth_tag` | VARBINARY(16) | NO | Auth tag |
| `salt` | VARBINARY(32) | NO | Salt |
| `key_version` | INT | NO | Key version for rotation tracking (migration 039) |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `last_used_at` | TIMESTAMP | YES | Last signing timestamp |
| `sign_count` | BIGINT | NO | Total sign operations (default: 0) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_client_keytype_chain` (UNIQUE), `idx_address`, `idx_derived_keys_client`, `idx_derived_keys_key_type`, `idx_derived_keys_active`, `idx_derived_keys_chain_scope`

### shamir_shares

Shamir Secret Sharing (3-of-5) shares for key recovery.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `share_index` | TINYINT | NO | Share index (1-5) |
| `custodian` | VARCHAR(50) | NO | Custodian identifier |
| `encrypted_share` | BLOB | NO | Encrypted share data |
| `encrypted_dek` | BLOB | NO | Encrypted DEK |
| `iv` | VARBINARY(16) | NO | IV |
| `auth_tag` | VARBINARY(16) | NO | Auth tag |
| `salt` | VARBINARY(32) | NO | Salt |
| `key_version` | INT | NO | Key version for rotation tracking (migration 039) |
| `is_distributed` | TINYINT(1) | NO | Whether share has been distributed (default: 0) |
| `distributed_at` | TIMESTAMP | YES | Distribution timestamp |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_client_share` (UNIQUE on client_id + share_index), `idx_shamir_client`, `idx_shamir_custodian`, `idx_shamir_distributed`

### key_vault_audit

Audit trail for all key vault operations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `operation` | VARCHAR(50) | NO | Operation type (generate, sign, rotate, etc.) |
| `client_id` | BIGINT | YES | Related client |
| `key_type` | VARCHAR(20) | YES | Key type involved |
| `address` | VARCHAR(100) | YES | Address involved |
| `tx_hash` | VARCHAR(66) | YES | Transaction hash (for signing ops) |
| `chain_id` | INT | YES | Chain ID |
| `requested_by` | VARCHAR(100) | NO | Who requested the operation |
| `metadata` | JSON | YES | Additional operation metadata |
| `created_at` | TIMESTAMP | NO | Timestamp |

**Indexes:** `idx_client_op`, `idx_kv_audit_operation`, `idx_kv_audit_address`, `idx_kv_audit_created`, `idx_kv_audit_tx_hash`, `idx_kv_audit_chain`

---

## cvh_admin

Source: `database/003-cvh-admin.sql`, `services/admin-api/prisma/schema.prisma`

### tiers

Service tier definitions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `name` | VARCHAR(100) | NO | Tier name |
| `base_tier_id` | BIGINT | YES | Parent tier for inheritance |
| `is_preset` | TINYINT(1) | NO | Platform default tier (default: 1) |
| `is_custom` | TINYINT(1) | NO | Custom tier flag (default: 0) |
| `global_rate_limit` | INT | NO | Requests per second (default: 100) |
| `endpoint_rate_limits` | JSON | YES | Per-endpoint rate limits |
| `max_forwarders_per_chain` | INT | NO | Max deposit addresses per chain (default: 100) |
| `max_chains` | INT | NO | Max chains (default: 5) |
| `max_webhooks` | INT | NO | Max webhooks (default: 10) |
| `daily_withdrawal_limit_usd` | DECIMAL(15,2) | NO | Daily USD limit (default: 10000) |
| `monitoring_mode` | VARCHAR(50) | NO | polling/hybrid/real-time (default: basic) |
| `kyt_level` | ENUM('basic','enhanced','full') | NO | Compliance level (default: basic) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**FK:** `fk_tiers_base` -> tiers(id) ON DELETE SET NULL

### clients

Client organizations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `name` | VARCHAR(200) | NO | Organization name |
| `slug` | VARCHAR(100) | NO | URL-safe identifier (UNIQUE) |
| `status` | ENUM('active','suspended','onboarding') | NO | Client status (default: active) |
| `tier_id` | BIGINT | YES | FK to tiers |
| `custody_mode` | ENUM('full_custody','co_sign','client_initiated') | NO | Custody model (default: full_custody) |
| `kyt_enabled` | TINYINT(1) | NO | KYT enabled (default: 0) |
| `kyt_level` | ENUM('basic','enhanced','full') | NO | KYT level (default: basic) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

**Indexes:** `uq_clients_slug` (UNIQUE), `idx_tier`, `idx_slug`, `idx_clients_status`, `idx_clients_custody_mode`, `idx_clients_created`
**FK:** `fk_clients_tier` -> tiers(id) ON DELETE SET NULL

### chains

Blockchain network registry.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `chain_id` | INT | NO | Primary key (EVM chain ID) |
| `name` | VARCHAR(50) | NO | Full chain name |
| `short_name` | VARCHAR(10) | NO | Short identifier |
| `native_currency_symbol` | VARCHAR(10) | NO | Native token symbol |
| `native_currency_decimals` | INT | NO | Decimals (default: 18) |
| `rpc_endpoints` | JSON | NO | Array of RPC endpoint configs |
| `block_time_seconds` | DECIMAL(5,2) | NO | Average block time |
| `confirmations_default` | INT | NO | Default confirmation threshold |
| `wallet_factory_address` | VARCHAR(42) | YES | CvhWalletFactory address |
| `forwarder_factory_address` | VARCHAR(42) | YES | CvhForwarderFactory address |
| `wallet_impl_address` | VARCHAR(42) | YES | CvhWalletSimple implementation |
| `forwarder_impl_address` | VARCHAR(42) | YES | CvhForwarder implementation |
| `multicall3_address` | VARCHAR(42) | NO | Multicall3 address |
| `explorer_url` | VARCHAR(200) | YES | Block explorer URL |
| `gas_price_strategy` | VARCHAR(10) | NO | eip1559 or legacy (default: eip1559) |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `is_testnet` | TINYINT(1) | NO | Testnet flag (default: 0) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

### tokens

ERC-20 token registry.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `chain_id` | INT | NO | FK to chains |
| `contract_address` | VARCHAR(42) | NO | Token contract address |
| `symbol` | VARCHAR(20) | NO | Token symbol |
| `name` | VARCHAR(100) | NO | Token name |
| `decimals` | TINYINT | NO | Decimal places |
| `is_native` | TINYINT(1) | NO | Native token flag (default: 0) |
| `is_default` | TINYINT(1) | NO | Default enabled for new clients (default: 1) |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `coingecko_id` | VARCHAR(100) | YES | CoinGecko price feed ID |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_chain_contract` (UNIQUE on chain_id + contract_address)
**FK:** `fk_tokens_chain` -> chains(chain_id) ON DELETE CASCADE

### client_tokens

Per-client token configuration.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | FK to clients |
| `token_id` | BIGINT | NO | FK to tokens |
| `is_deposit_enabled` | TINYINT(1) | NO | Deposit enabled (default: 1) |
| `is_withdrawal_enabled` | TINYINT(1) | NO | Withdrawal enabled (default: 1) |
| `min_deposit_amount` | VARCHAR(78) | NO | Minimum deposit (default: '0') |
| `min_withdrawal_amount` | VARCHAR(78) | NO | Minimum withdrawal (default: '0') |
| `withdrawal_fee` | VARCHAR(78) | NO | Withdrawal fee (default: '0') |

**Indexes:** `uq_client_token` (UNIQUE)
**FK:** clients(id) CASCADE, tokens(id) CASCADE

### client_chain_config

Per-client per-chain settings.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | FK to clients |
| `chain_id` | INT | NO | FK to chains |
| `monitoring_mode` | VARCHAR(20) | NO | hybrid/polling/realtime (default: hybrid) |
| `confirmations` | INT | YES | Override default confirmations |
| `sweep_enabled` | TINYINT(1) | NO | Auto-sweep enabled (default: 1) |
| `sweep_threshold` | VARCHAR(78) | YES | Min balance to trigger sweep |
| `webhook_milestones` | JSON | YES | Confirmation milestones (e.g., [1,3,6,12]) |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

**Indexes:** `uq_client_chain` (UNIQUE)
**FK:** clients(id) CASCADE, chains(chain_id) CASCADE

### client_tier_overrides

Per-client tier setting overrides.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | FK to clients |
| `override_key` | VARCHAR(100) | NO | Setting key name |
| `override_value` | VARCHAR(500) | NO | Override value |
| `override_type` | ENUM('string','number','boolean','json') | NO | Value type (default: string) |

**FK:** `fk_overrides_client` -> clients(id) ON DELETE CASCADE

### audit_logs

Admin action audit trail.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `admin_user_id` | VARCHAR(64) | NO | Acting admin user |
| `action` | VARCHAR(100) | NO | Action performed |
| `entity_type` | VARCHAR(50) | NO | Entity type (client, tier, chain, etc.) |
| `entity_id` | VARCHAR(64) | NO | Entity ID |
| `details` | JSON | YES | Action details |
| `ip_address` | VARCHAR(45) | YES | Admin's IP address |
| `created_at` | TIMESTAMP | NO | Timestamp |

---

## cvh_wallets

Source: `database/004-cvh-wallets.sql`

### wallets

Client hot wallets and gas tank wallets.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `chain_id` | INT | NO | Chain ID |
| `address` | VARCHAR(100) | NO | On-chain address |
| `wallet_type` | VARCHAR(20) | NO | hot, gas_tank |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_client_chain_type` (UNIQUE on client_id + chain_id + wallet_type)

### deposit_addresses

Deterministic forwarder addresses for receiving deposits.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `chain_id` | INT | NO | Chain ID |
| `wallet_id` | BIGINT | NO | FK to parent wallet |
| `address` | VARCHAR(100) | NO | Computed forwarder address |
| `external_id` | VARCHAR(200) | NO | Client-assigned external ID |
| `label` | VARCHAR(200) | YES | Human-readable label |
| `salt` | VARCHAR(66) | NO | CREATE2 salt |
| `is_deployed` | TINYINT(1) | NO | Contract deployed on-chain (default: 0) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_client_chain_external` (UNIQUE), `idx_address`
**FK:** wallets(id) CASCADE

### whitelisted_addresses

Address book for withdrawal destinations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `address` | VARCHAR(100) | NO | Destination address |
| `label` | VARCHAR(200) | NO | Label |
| `chain_id` | INT | NO | Chain ID |
| `status` | VARCHAR(20) | NO | cooldown, active, disabled (default: cooldown) |
| `cooldown_ends_at` | TIMESTAMP | YES | When 24h cooldown expires |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

**Indexes:** `uq_whitelist_client_chain_addr` (UNIQUE on client_id + chain_id + address)

---

## cvh_transactions

Source: `database/005-cvh-transactions.sql`

### deposits

Incoming deposit records.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `chain_id` | INT | NO | Chain ID |
| `forwarder_address` | VARCHAR(100) | NO | Deposit address that received funds |
| `external_id` | VARCHAR(200) | NO | Client external ID |
| `token_id` | BIGINT | NO | Token ID |
| `amount` | VARCHAR(78) | NO | Human-readable amount |
| `amount_raw` | VARCHAR(78) | NO | Raw amount (smallest unit) |
| `tx_hash` | VARCHAR(66) | NO | Deposit transaction hash |
| `block_number` | BIGINT | NO | Block containing deposit |
| `from_address` | VARCHAR(100) | NO | Sender address |
| `status` | VARCHAR(20) | NO | pending, confirmed, swept, failed (default: pending) |
| `confirmations` | INT | NO | Current confirmations (default: 0) |
| `confirmations_required` | INT | NO | Required confirmations |
| `sweep_tx_hash` | VARCHAR(66) | YES | Sweep transaction hash |
| `kyt_result` | VARCHAR(20) | YES | KYT screening result |
| `detected_at` | TIMESTAMP | NO | Detection timestamp |
| `confirmed_at` | TIMESTAMP | YES | Confirmation timestamp |
| `swept_at` | TIMESTAMP | YES | Sweep timestamp |

**Indexes:** `uq_tx_forwarder` (UNIQUE on tx_hash + forwarder_address), `idx_client_status`, plus 15+ performance indexes

### withdrawals

Outgoing withdrawal records.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `chain_id` | INT | NO | Chain ID |
| `token_id` | BIGINT | NO | Token ID |
| `from_wallet` | VARCHAR(100) | NO | Sending hot wallet address |
| `to_address_id` | BIGINT | NO | FK to whitelisted_addresses |
| `to_address` | VARCHAR(100) | NO | Destination address |
| `to_label` | VARCHAR(200) | NO | Destination label |
| `amount` | VARCHAR(78) | NO | Human-readable amount |
| `amount_raw` | VARCHAR(78) | NO | Raw amount |
| `tx_hash` | VARCHAR(66) | YES | Transaction hash (null until broadcast) |
| `status` | VARCHAR(30) | NO | pending_approval, pending_kyt, pending_signing, pending_cosign (migration 038), pending_broadcast, broadcasted, confirming, confirmed, failed, rejected |
| `sequence_id` | INT | YES | Multisig sequence ID |
| `gas_cost` | VARCHAR(78) | YES | Gas cost in native token |
| `kyt_result` | VARCHAR(20) | YES | KYT screening result |
| `idempotency_key` | VARCHAR(200) | NO | Idempotency key (UNIQUE) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `submitted_at` | TIMESTAMP | YES | Broadcast timestamp |
| `confirmed_at` | TIMESTAMP | YES | Confirmation timestamp |

---

## cvh_compliance

Source: `database/006-cvh-compliance.sql`

### sanctions_entries

Cached sanctions list entries (OFAC SDN, EU, UN).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `list_source` | VARCHAR(50) | NO | Source list (ofac_sdn, eu_sanctions, un_sanctions) |
| `address` | VARCHAR(100) | NO | Sanctioned address |
| `address_type` | VARCHAR(20) | NO | Address type (evm, btc, etc.) |
| `entity_name` | VARCHAR(500) | YES | Entity name |
| `entity_id` | VARCHAR(100) | YES | Entity ID in source list |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `last_synced_at` | TIMESTAMP | NO | Last sync timestamp |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_list_address` (UNIQUE on list_source + address), `idx_address`

### screening_results

Individual screening operation records.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Client being screened |
| `address` | VARCHAR(100) | NO | Screened address |
| `direction` | VARCHAR(10) | NO | inbound or outbound |
| `trigger` | VARCHAR(20) | NO | deposit, withdrawal, manual |
| `tx_hash` | VARCHAR(66) | YES | Related transaction hash |
| `lists_checked` | JSON | NO | Which lists were checked |
| `result` | VARCHAR(20) | NO | clear, match, partial_match |
| `match_details` | JSON | YES | Match details (entity, score) |
| `action` | VARCHAR(20) | NO | allow, block, flag |
| `screened_at` | TIMESTAMP | NO | Screening timestamp |

### compliance_alerts

Compliance alerts requiring human review.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Affected client |
| `severity` | VARCHAR(10) | NO | low, medium, high, critical |
| `alert_type` | VARCHAR(50) | NO | sanctions_match, threshold_exceeded, pattern_detected |
| `address` | VARCHAR(100) | NO | Flagged address |
| `matched_entity` | VARCHAR(500) | YES | Matched sanctions entity |
| `matched_list` | VARCHAR(50) | YES | Which sanctions list |
| `amount` | VARCHAR(78) | YES | Transaction amount |
| `token_symbol` | VARCHAR(20) | YES | Token involved |
| `status` | VARCHAR(20) | NO | open, acknowledged, escalated, resolved, dismissed (default: open) |
| `resolved_at` | TIMESTAMP | YES | Resolution timestamp |
| `resolved_by` | VARCHAR(100) | YES | Who resolved it |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

---

## cvh_notifications

Source: `database/007-cvh-notifications.sql`

### webhooks

Client webhook endpoint registrations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `url` | VARCHAR(500) | NO | Delivery URL |
| `secret` | VARCHAR(128) | NO | HMAC-SHA256 signing secret |
| `events` | JSON | NO | Subscribed event types |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_client_url` (UNIQUE on client_id + url)

### webhook_deliveries

Individual webhook delivery attempts.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `delivery_code` | VARCHAR(50) | NO | Unique delivery ID |
| `webhook_id` | BIGINT | NO | FK to webhooks |
| `client_id` | BIGINT | NO | Client ID |
| `event_type` | VARCHAR(50) | NO | Event type |
| `payload` | JSON | NO | Full event payload |
| `status` | VARCHAR(20) | NO | queued, success, retrying, failed (default: queued) |
| `http_status` | INT | YES | Response status code |
| `response_body` | TEXT | YES | Response body |
| `response_time_ms` | INT | YES | Response time |
| `attempts` | INT | NO | Attempt count (default: 0) |
| `max_attempts` | INT | NO | Max retry attempts (default: 5) |
| `last_attempt_at` | TIMESTAMP | YES | Last attempt time |
| `next_retry_at` | TIMESTAMP | YES | Next scheduled retry |
| `error` | TEXT | YES | Error message |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_delivery_code` (UNIQUE), `idx_webhook_created`, `idx_status`, plus many performance indexes
**FK:** `fk_deliveries_webhook` -> webhooks(id) ON DELETE CASCADE

### email_logs

Email notification audit trail.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Client ID |
| `to` | VARCHAR(255) | NO | Recipient email |
| `subject` | VARCHAR(500) | NO | Email subject |
| `body` | TEXT | NO | Email body |
| `status` | VARCHAR(20) | NO | queued, sent, failed (default: queued) |
| `sent_at` | TIMESTAMP | YES | Send timestamp |
| `error` | TEXT | YES | Error message |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

---

## cvh_indexer

Source: `database/008-cvh-indexer.sql`, `services/chain-indexer-service/prisma/schema.prisma`

### sync_cursors

Tracks the last indexed block per chain.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `chain_id` | INT | NO | Chain ID (UNIQUE) |
| `last_block` | BIGINT | NO | Last processed block number |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

### monitored_addresses

Addresses being watched for incoming deposits.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `chain_id` | INT | NO | Chain ID |
| `address` | VARCHAR(100) | NO | Watched address |
| `client_id` | BIGINT | NO | Owning client |
| `wallet_id` | BIGINT | NO | Parent wallet ID |
| `start_block` | BIGINT | YES | Block number from which to start monitoring (migration 036) |
| `is_active` | TINYINT(1) | NO | Active flag (default: 1) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

**Indexes:** `uq_chain_address` (UNIQUE on chain_id + address), `idx_chain_active`

### co_sign_operations

Co-sign withdrawal operations requiring client signature (migration 038).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `client_id` | BIGINT | NO | Owning client |
| `withdrawal_id` | BIGINT | NO | FK to withdrawals |
| `operation_hash` | VARCHAR(66) | NO | Keccak256 operation hash for signing |
| `wallet_address` | VARCHAR(100) | NO | Hot wallet contract address (included in hash) |
| `status` | VARCHAR(30) | NO | pending, signed, expired, rejected |
| `client_signature` | TEXT | YES | Client-provided ECDSA signature |
| `signed_at` | TIMESTAMP | YES | Signature timestamp |
| `expires_at` | TIMESTAMP | NO | Operation expiry |
| `created_at` | TIMESTAMP | NO | Creation timestamp |

---

## cvh_admin (additional tables)

### knowledge_base_articles

Knowledge base help articles (migration 040).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `title` | VARCHAR(255) | NO | Article title |
| `slug` | VARCHAR(255) | NO | URL-safe slug (UNIQUE) |
| `content` | TEXT | NO | Article body (rich text) |
| `category` | VARCHAR(100) | YES | Article category |
| `sort_order` | INT | NO | Display order (default: 0) |
| `is_published` | TINYINT(1) | NO | Published status (default: 0) |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

### project_contracts

Per-project deployed smart contract addresses (migration 041).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGINT AUTO_INCREMENT | NO | Primary key |
| `project_id` | BIGINT | NO | FK to projects |
| `chain_id` | INT | NO | Chain ID |
| `contract_type` | VARCHAR(50) | NO | Contract type (wallet_factory, forwarder_factory, wallet_impl, forwarder_impl, batcher) |
| `address` | VARCHAR(100) | YES | Deployed contract address |
| `deploy_tx_hash` | VARCHAR(66) | YES | Deployment transaction hash |
| `status` | VARCHAR(30) | NO | pending, deployed, failed |
| `created_at` | TIMESTAMP | NO | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | Last update (auto) |

---

## Cross-Database Views

Defined in `database/011-traceability-views.sql`, created in `cvh_wallets`:

| View | Description |
|------|-------------|
| `v_client_wallet_summary` | Aggregated wallet counts, forwarder counts, chain lists per client |
| `v_wallet_transactions` | Unified deposit + withdrawal view with token and chain details |
| `v_client_transaction_history` | Complete transaction history per client with client info |
| `v_daily_volume` | Daily transaction volumes by chain, token, and type |
| `v_wallet_details` | Full wallet details with signer info from cvh_keyvault |

---

## Migration Execution Order

| # | File | Description |
|---|------|-------------|
| 000 | `000-create-databases.sql` | Create all 8 initial databases |
| 001 | `001-cvh-auth.sql` | Auth tables (users, sessions, api_keys) |
| 002 | `002-cvh-keyvault.sql` | Key vault tables |
| 003 | `003-cvh-admin.sql` | Admin tables (clients, tiers, chains, tokens, etc.) |
| 004 | `004-cvh-wallets.sql` | Wallet tables |
| 005 | `005-cvh-transactions.sql` | Transaction tables (deposits, withdrawals) |
| 006 | `006-cvh-compliance.sql` | Compliance tables |
| 007 | `007-cvh-notifications.sql` | Notification tables |
| 008 | `008-cvh-indexer.sql` | Indexer tables |
| 009 | `009-seed-data.sql` | Seed data (chains, tokens, tiers, test data) |
| 010 | `010-performance-indexes.sql` | Additional performance indexes |
| 011 | `011-traceability-views.sql` | Cross-database reporting views |
| 012 | `012-schema-fixes.sql` | Schema corrections (address widths, constraints) |
| 013 | `013-create-projects.sql` | Projects table in cvh_admin |
| 014 | `014-add-project-id.sql` | Add project_id to tenant-scoped tables |
| 015 | `015-rpc-providers.sql` | RPC provider management tables |
| 016 | `016-create-cvh-jobs.sql` | cvh_jobs database for job tracking |
| 017 | `017-indexer-v2.sql` | Chain Indexer v2 tables |
| 018 | `018-webhooks-v2.sql` | Webhook v2 delivery_attempts, dead_letters |
| 019 | `019-flush-operations.sql` | Flush operations table |
| 020 | `020-deploy-traces.sql` | Deploy traces table |
| 021 | `021-create-cvh-exports.sql` | cvh_exports database |
| 022 | `022-impersonation.sql` | Impersonation sessions table |
| 023 | `023-performance-indexes-v2.sql` | Supplementary performance indexes |
| 024 | `024-chain-lifecycle.sql` | Chain lifecycle status + RPC quota |
| 025 | `025-schema-fixes-v3.sql` | UNIQUE KEY on wallets(address, chain_id) |
| 026 | `026-client-initiated-custody.sql` | client_initiated custody mode |
| 027 | `027-notification-rules.sql` | Notification rules table |
| 028 | `028-client-chain-config.sql` | Per-client chain config |
| 029 | `029-client-deletion.sql` | Client soft-deletion |
| 030 | `030-system-settings.sql` | System settings table |
| 031 | `031-project-chains.sql` | Project-chain associations |
| 032 | `032-project-seeds.sql` | Per-project seed management |
| 033 | `033-audit-indexes-and-shamir-project.sql` | Audit indexes, Shamir project scoping |
| 034 | `034-project-deletion.sql` | Project soft-deletion |
| 035 | `035-fix-derived-keys-constraint.sql` | Fix derived_keys unique constraint |
| 036 | `036-add-start-block.sql` | Add start_block to monitored_addresses |
| 037 | `037-fix-custody-column.sql` | Standardize custody_mode column |
| 038 | `038-co-sign-operations.sql` | Co-sign operations table + pending_cosign status |
| 039 | `039-key-version.sql` | key_version on master_seeds, project_seeds, derived_keys, shamir_shares |
| 040 | `040-knowledge-base.sql` | Knowledge base articles in cvh_admin |
| 041 | `041-project-contracts.sql` | Project contracts in cvh_admin |
