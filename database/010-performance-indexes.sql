-- =============================================================================
-- CryptoVaultHub — Performance Indexes
-- Covers all databases: cvh_auth, cvh_keyvault, cvh_admin, cvh_wallets,
--   cvh_transactions, cvh_compliance, cvh_notifications, cvh_indexer
-- =============================================================================

-- =============================================================================
-- cvh_auth — users, sessions, api_keys
-- =============================================================================

USE `cvh_auth`;

-- users: lookup by active status, by role, composite for client users
CREATE INDEX IF NOT EXISTS `idx_users_is_active` ON `users` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_users_role` ON `users` (`role`);
CREATE INDEX IF NOT EXISTS `idx_users_client_role` ON `users` (`client_id`, `client_role`);
CREATE INDEX IF NOT EXISTS `idx_users_last_login` ON `users` (`last_login_at`);

-- sessions: lookup by refresh token hash, cleanup by expiry
CREATE INDEX IF NOT EXISTS `idx_sessions_refresh_token` ON `sessions` (`refresh_token_hash`);

-- api_keys: composite for active keys per client, by expiry for cleanup
CREATE INDEX IF NOT EXISTS `idx_api_keys_client_active` ON `api_keys` (`client_id`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_api_keys_expires` ON `api_keys` (`expires_at`);
CREATE INDEX IF NOT EXISTS `idx_api_keys_last_used` ON `api_keys` (`last_used_at`);

-- =============================================================================
-- cvh_keyvault — master_seeds, derived_keys, shamir_shares, key_vault_audit
-- =============================================================================

USE `cvh_keyvault`;

-- derived_keys: by client, by key_type, by active status
CREATE INDEX IF NOT EXISTS `idx_derived_keys_client` ON `derived_keys` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_derived_keys_key_type` ON `derived_keys` (`key_type`);
CREATE INDEX IF NOT EXISTS `idx_derived_keys_active` ON `derived_keys` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_derived_keys_chain_scope` ON `derived_keys` (`chain_scope`);

-- shamir_shares: by client, by custodian, by distribution status
CREATE INDEX IF NOT EXISTS `idx_shamir_client` ON `shamir_shares` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_shamir_custodian` ON `shamir_shares` (`custodian`);
CREATE INDEX IF NOT EXISTS `idx_shamir_distributed` ON `shamir_shares` (`is_distributed`);

-- key_vault_audit: by operation, by address, by created_at, by tx_hash
CREATE INDEX IF NOT EXISTS `idx_kv_audit_operation` ON `key_vault_audit` (`operation`);
CREATE INDEX IF NOT EXISTS `idx_kv_audit_address` ON `key_vault_audit` (`address`);
CREATE INDEX IF NOT EXISTS `idx_kv_audit_created` ON `key_vault_audit` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_kv_audit_tx_hash` ON `key_vault_audit` (`tx_hash`);
CREATE INDEX IF NOT EXISTS `idx_kv_audit_chain` ON `key_vault_audit` (`chain_id`);

-- =============================================================================
-- cvh_admin — clients, tiers, client_tier_overrides, chains, tokens,
--             client_tokens, client_chain_config, audit_logs
-- =============================================================================

USE `cvh_admin`;

-- clients: by status, by custody_mode, by kyt_level, by created_at
CREATE INDEX IF NOT EXISTS `idx_clients_status` ON `clients` (`status`);
CREATE INDEX IF NOT EXISTS `idx_clients_custody_mode` ON `clients` (`custody_mode`);
CREATE INDEX IF NOT EXISTS `idx_clients_created` ON `clients` (`created_at`);

-- tiers: by name, by preset/custom flags
CREATE INDEX IF NOT EXISTS `idx_tiers_name` ON `tiers` (`name`);
CREATE INDEX IF NOT EXISTS `idx_tiers_preset` ON `tiers` (`is_preset`);

-- client_tier_overrides: composite for key lookup
CREATE INDEX IF NOT EXISTS `idx_overrides_client_key` ON `client_tier_overrides` (`client_id`, `override_key`);

-- chains: by active status, by testnet flag
CREATE INDEX IF NOT EXISTS `idx_chains_active` ON `chains` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_chains_testnet` ON `chains` (`is_testnet`);

-- tokens: by chain_id, by symbol, by active status, by native flag
CREATE INDEX IF NOT EXISTS `idx_tokens_chain` ON `tokens` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_tokens_symbol` ON `tokens` (`symbol`);
CREATE INDEX IF NOT EXISTS `idx_tokens_active` ON `tokens` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_tokens_native` ON `tokens` (`is_native`);
CREATE INDEX IF NOT EXISTS `idx_tokens_chain_active` ON `tokens` (`chain_id`, `is_active`);

-- client_tokens: by client, by token, by deposit/withdrawal enablement
CREATE INDEX IF NOT EXISTS `idx_client_tokens_client` ON `client_tokens` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_client_tokens_token` ON `client_tokens` (`token_id`);
CREATE INDEX IF NOT EXISTS `idx_client_tokens_deposit` ON `client_tokens` (`client_id`, `is_deposit_enabled`);
CREATE INDEX IF NOT EXISTS `idx_client_tokens_withdrawal` ON `client_tokens` (`client_id`, `is_withdrawal_enabled`);

-- client_chain_config: by chain_id, by active status, sweep filter
CREATE INDEX IF NOT EXISTS `idx_chain_config_chain` ON `client_chain_config` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_chain_config_active` ON `client_chain_config` (`client_id`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_chain_config_sweep` ON `client_chain_config` (`sweep_enabled`, `is_active`);

-- audit_logs: by action, by entity_type, composite for date-range searches
CREATE INDEX IF NOT EXISTS `idx_audit_action` ON `audit_logs` (`action`);
CREATE INDEX IF NOT EXISTS `idx_audit_entity_type` ON `audit_logs` (`entity_type`);
CREATE INDEX IF NOT EXISTS `idx_audit_admin_created` ON `audit_logs` (`admin_user_id`, `created_at`);

-- =============================================================================
-- cvh_wallets — wallets, deposit_addresses, whitelisted_addresses
-- =============================================================================

USE `cvh_wallets`;

-- wallets: by client_id, by chain_id, by address, by status, composites
CREATE INDEX IF NOT EXISTS `idx_wallets_client` ON `wallets` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_wallets_chain` ON `wallets` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_wallets_address` ON `wallets` (`address`);
CREATE INDEX IF NOT EXISTS `idx_wallets_active` ON `wallets` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_wallets_client_active` ON `wallets` (`client_id`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_wallets_client_chain` ON `wallets` (`client_id`, `chain_id`);
CREATE INDEX IF NOT EXISTS `idx_wallets_type` ON `wallets` (`wallet_type`);

-- deposit_addresses: by client, by chain, by wallet, by deployed status
CREATE INDEX IF NOT EXISTS `idx_deposit_addr_client` ON `deposit_addresses` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_deposit_addr_chain` ON `deposit_addresses` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_deposit_addr_wallet` ON `deposit_addresses` (`wallet_id`);
CREATE INDEX IF NOT EXISTS `idx_deposit_addr_deployed` ON `deposit_addresses` (`is_deployed`);
CREATE INDEX IF NOT EXISTS `idx_deposit_addr_external` ON `deposit_addresses` (`external_id`);
CREATE INDEX IF NOT EXISTS `idx_deposit_addr_client_chain` ON `deposit_addresses` (`client_id`, `chain_id`);

-- whitelisted_addresses: by client, by address, by chain, by status
CREATE INDEX IF NOT EXISTS `idx_whitelist_client` ON `whitelisted_addresses` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_whitelist_address` ON `whitelisted_addresses` (`address`);
CREATE INDEX IF NOT EXISTS `idx_whitelist_chain` ON `whitelisted_addresses` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_whitelist_status` ON `whitelisted_addresses` (`status`);
CREATE INDEX IF NOT EXISTS `idx_whitelist_client_chain` ON `whitelisted_addresses` (`client_id`, `chain_id`);
CREATE INDEX IF NOT EXISTS `idx_whitelist_cooldown` ON `whitelisted_addresses` (`cooldown_ends_at`);

-- =============================================================================
-- cvh_transactions — deposits, withdrawals
-- =============================================================================

USE `cvh_transactions`;

-- deposits: by wallet (forwarder), by tx_hash, by status, by token, by chain,
--           by block_number, by detected_at, composite for common queries
CREATE INDEX IF NOT EXISTS `idx_deposits_forwarder` ON `deposits` (`forwarder_address`);
CREATE INDEX IF NOT EXISTS `idx_deposits_tx_hash` ON `deposits` (`tx_hash`);
CREATE INDEX IF NOT EXISTS `idx_deposits_status` ON `deposits` (`status`);
CREATE INDEX IF NOT EXISTS `idx_deposits_token` ON `deposits` (`token_id`);
CREATE INDEX IF NOT EXISTS `idx_deposits_chain` ON `deposits` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_deposits_block` ON `deposits` (`block_number`);
CREATE INDEX IF NOT EXISTS `idx_deposits_detected` ON `deposits` (`detected_at`);
CREATE INDEX IF NOT EXISTS `idx_deposits_confirmed` ON `deposits` (`confirmed_at`);
CREATE INDEX IF NOT EXISTS `idx_deposits_from` ON `deposits` (`from_address`);
CREATE INDEX IF NOT EXISTS `idx_deposits_client_chain` ON `deposits` (`client_id`, `chain_id`);
CREATE INDEX IF NOT EXISTS `idx_deposits_client_token` ON `deposits` (`client_id`, `token_id`);
CREATE INDEX IF NOT EXISTS `idx_deposits_chain_status` ON `deposits` (`chain_id`, `status`);
CREATE INDEX IF NOT EXISTS `idx_deposits_chain_block` ON `deposits` (`chain_id`, `block_number`);
CREATE INDEX IF NOT EXISTS `idx_deposits_sweep` ON `deposits` (`sweep_tx_hash`);
CREATE INDEX IF NOT EXISTS `idx_deposits_external` ON `deposits` (`external_id`);
CREATE INDEX IF NOT EXISTS `idx_deposits_kyt` ON `deposits` (`kyt_result`);

-- withdrawals: by tx_hash, by status, by token, by chain, by to_address,
--              by created_at, composite for common queries
CREATE INDEX IF NOT EXISTS `idx_withdrawals_tx_hash` ON `withdrawals` (`tx_hash`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_status` ON `withdrawals` (`status`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_token` ON `withdrawals` (`token_id`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_chain` ON `withdrawals` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_to_address` ON `withdrawals` (`to_address`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_from_wallet` ON `withdrawals` (`from_wallet`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_created` ON `withdrawals` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_submitted` ON `withdrawals` (`submitted_at`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_confirmed` ON `withdrawals` (`confirmed_at`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_client_chain` ON `withdrawals` (`client_id`, `chain_id`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_client_token` ON `withdrawals` (`client_id`, `token_id`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_chain_status` ON `withdrawals` (`chain_id`, `status`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_to_addr_id` ON `withdrawals` (`to_address_id`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_kyt` ON `withdrawals` (`kyt_result`);
CREATE INDEX IF NOT EXISTS `idx_withdrawals_sequence` ON `withdrawals` (`sequence_id`);

-- =============================================================================
-- cvh_compliance — sanctions_entries, screening_results, compliance_alerts
-- =============================================================================

USE `cvh_compliance`;

-- sanctions_entries: by list source, by active status, by address type
CREATE INDEX IF NOT EXISTS `idx_sanctions_source` ON `sanctions_entries` (`list_source`);
CREATE INDEX IF NOT EXISTS `idx_sanctions_active` ON `sanctions_entries` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_sanctions_type` ON `sanctions_entries` (`address_type`);
CREATE INDEX IF NOT EXISTS `idx_sanctions_synced` ON `sanctions_entries` (`last_synced_at`);
CREATE INDEX IF NOT EXISTS `idx_sanctions_addr_active` ON `sanctions_entries` (`address`, `is_active`);

-- screening_results: by result, by direction, by trigger, by tx_hash
CREATE INDEX IF NOT EXISTS `idx_screening_result` ON `screening_results` (`result`);
CREATE INDEX IF NOT EXISTS `idx_screening_direction` ON `screening_results` (`direction`);
CREATE INDEX IF NOT EXISTS `idx_screening_trigger` ON `screening_results` (`trigger`);
CREATE INDEX IF NOT EXISTS `idx_screening_tx_hash` ON `screening_results` (`tx_hash`);
CREATE INDEX IF NOT EXISTS `idx_screening_screened` ON `screening_results` (`screened_at`);
CREATE INDEX IF NOT EXISTS `idx_screening_client_result` ON `screening_results` (`client_id`, `result`);

-- compliance_alerts: by address, by status, by created_at, by severity,
--                    by alert_type, composite for dashboards
CREATE INDEX IF NOT EXISTS `idx_alerts_address` ON `compliance_alerts` (`address`);
CREATE INDEX IF NOT EXISTS `idx_alerts_status` ON `compliance_alerts` (`status`);
CREATE INDEX IF NOT EXISTS `idx_alerts_created` ON `compliance_alerts` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_alerts_severity` ON `compliance_alerts` (`severity`);
CREATE INDEX IF NOT EXISTS `idx_alerts_type` ON `compliance_alerts` (`alert_type`);
CREATE INDEX IF NOT EXISTS `idx_alerts_client_created` ON `compliance_alerts` (`client_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_alerts_client_severity` ON `compliance_alerts` (`client_id`, `severity`);
CREATE INDEX IF NOT EXISTS `idx_alerts_resolved` ON `compliance_alerts` (`resolved_at`);

-- =============================================================================
-- cvh_notifications — webhooks, webhook_deliveries, email_logs
-- =============================================================================

USE `cvh_notifications`;

-- webhooks: by client, by active status
CREATE INDEX IF NOT EXISTS `idx_webhooks_client` ON `webhooks` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_webhooks_active` ON `webhooks` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_webhooks_client_active` ON `webhooks` (`client_id`, `is_active`);

-- webhook_deliveries: by client, by event_type, by next_retry, by created_at
CREATE INDEX IF NOT EXISTS `idx_deliveries_client` ON `webhook_deliveries` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_deliveries_event_type` ON `webhook_deliveries` (`event_type`);
CREATE INDEX IF NOT EXISTS `idx_deliveries_next_retry` ON `webhook_deliveries` (`next_retry_at`);
CREATE INDEX IF NOT EXISTS `idx_deliveries_created` ON `webhook_deliveries` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_deliveries_client_status` ON `webhook_deliveries` (`client_id`, `status`);
CREATE INDEX IF NOT EXISTS `idx_deliveries_status_retry` ON `webhook_deliveries` (`status`, `next_retry_at`);
CREATE INDEX IF NOT EXISTS `idx_deliveries_webhook_status` ON `webhook_deliveries` (`webhook_id`, `status`);

-- email_logs: by client, by status, by sent_at, by created_at
CREATE INDEX IF NOT EXISTS `idx_email_client` ON `email_logs` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_email_status` ON `email_logs` (`status`);
CREATE INDEX IF NOT EXISTS `idx_email_sent` ON `email_logs` (`sent_at`);
CREATE INDEX IF NOT EXISTS `idx_email_created` ON `email_logs` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_email_client_status` ON `email_logs` (`client_id`, `status`);

-- =============================================================================
-- cvh_indexer — sync_cursors, monitored_addresses
-- =============================================================================

USE `cvh_indexer`;

-- sync_cursors: by chain_id (already unique), by last_block for range queries
CREATE INDEX IF NOT EXISTS `idx_cursors_last_block` ON `sync_cursors` (`last_block`);

-- monitored_addresses: by client, by address, by wallet_id
CREATE INDEX IF NOT EXISTS `idx_monitored_client` ON `monitored_addresses` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_monitored_address` ON `monitored_addresses` (`address`);
CREATE INDEX IF NOT EXISTS `idx_monitored_wallet` ON `monitored_addresses` (`wallet_id`);
CREATE INDEX IF NOT EXISTS `idx_monitored_client_active` ON `monitored_addresses` (`client_id`, `is_active`);
