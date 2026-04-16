# CryptoVaultHub Database Migrations

Complete MySQL 8+ DDL scripts for all 10 CryptoVaultHub databases. 31 migration scripts (000-030).

## Databases

| File | Database | Description |
|------|----------|-------------|
| `000-create-databases.sql` | All | Creates all 10 databases |
| `001-cvh-auth.sql` | `cvh_auth` | users, sessions, api_keys |
| `002-cvh-keyvault.sql` | `cvh_keyvault` | master_seeds, derived_keys, shamir_shares, key_vault_audit |
| `003-cvh-admin.sql` | `cvh_admin` | clients, tiers, client_tier_overrides, chains, tokens, client_tokens, client_chain_config, audit_logs |
| `004-cvh-wallets.sql` | `cvh_wallets` | wallets, deposit_addresses, whitelisted_addresses |
| `005-cvh-transactions.sql` | `cvh_transactions` | deposits, withdrawals |
| `006-cvh-compliance.sql` | `cvh_compliance` | sanctions_entries, screening_results, compliance_alerts |
| `007-cvh-notifications.sql` | `cvh_notifications` | webhooks, webhook_deliveries, email_logs |
| `008-cvh-indexer.sql` | `cvh_indexer` | sync_cursors, monitored_addresses |
| `009-seed-data.sql` | Multiple | Default chains, tokens, tiers, admin user |
| `010-performance-indexes.sql` | Multiple | Performance optimization indexes across all databases |
| `011-traceability-views.sql` | Multiple | Cross-database views for transaction traceability |
| `012-schema-fixes.sql` | Multiple | Schema corrections (DDL vs. Prisma discrepancies) |
| `013-create-projects.sql` | `cvh_admin` | Projects table (v2 multi-project scoping) |
| `014-add-project-id.sql` | Multiple | Add project_id to 13 tenant-scoped tables across 6 databases |
| `015-rpc-providers.sql` | `cvh_admin` | RPC provider management tables (providers, nodes, health metrics) |
| `016-create-cvh-jobs.sql` | `cvh_jobs` | Persistent BullMQ job tracking database |
| `017-indexer-v2.sql` | `cvh_indexer` | Chain Indexer v2 (indexed_blocks, events, materialized_balances, sync_gaps, reorg_log) |
| `018-webhooks-v2.sql` | `cvh_notifications` | Webhook v2 (delivery_attempts, dead_letters) |
| `019-flush-operations.sql` | `cvh_transactions` | Flush operations tracking table |
| `020-deploy-traces.sql` | `cvh_transactions` | Deploy traces tracking table |
| `021-create-cvh-exports.sql` | `cvh_exports` | Export requests database |
| `022-impersonation.sql` | `cvh_auth` | Impersonation sessions table |
| `023-performance-indexes-v2.sql` | Multiple | Supplementary performance indexes |
| `024-chain-lifecycle.sql` | `cvh_admin` | Chain lifecycle status + RPC node quota tracking |
| `025-schema-fixes-v3.sql` | `cvh_wallets` | UNIQUE KEY on wallets(address, chain_id), widen address columns |
| `026-client-initiated-custody.sql` | `cvh_admin` | Add client_initiated custody mode |
| `027-notification-rules.sql` | `cvh_notifications` | Notification rules table |
| `028-client-chain-config.sql` | `cvh_admin` | Per-client chain monitoring mode config |
| `029-client-deletion.sql` | `cvh_admin` | Client soft-deletion with 30-day grace period |
| `030-system-settings.sql` | `cvh_admin` | System settings table (SMTP config, feature flags) |

## Quick Start

### Option 1: Migration Script

```bash
chmod +x database/migrate.sh

# Local MySQL (root, no password)
./database/migrate.sh

# Custom host / user with password prompt
./database/migrate.sh -h 10.0.0.5 -u admin -p

# Using environment variables
MYSQL_HOST=db.example.com MYSQL_USER=deploy ./database/migrate.sh -p
```

### Option 2: Manual Execution

```bash
# Run all 31 scripts in order (000-030)
mysql -u root -p < database/000-create-databases.sql
mysql -u root -p < database/001-cvh-auth.sql
mysql -u root -p < database/002-cvh-keyvault.sql
mysql -u root -p < database/003-cvh-admin.sql
mysql -u root -p < database/004-cvh-wallets.sql
mysql -u root -p < database/005-cvh-transactions.sql
mysql -u root -p < database/006-cvh-compliance.sql
mysql -u root -p < database/007-cvh-notifications.sql
mysql -u root -p < database/008-cvh-indexer.sql
mysql -u root -p < database/009-seed-data.sql
mysql -u root -p < database/010-performance-indexes.sql
mysql -u root -p < database/011-traceability-views.sql
mysql -u root -p < database/012-schema-fixes.sql
mysql -u root -p < database/013-create-projects.sql
mysql -u root -p < database/014-add-project-id.sql
mysql -u root -p < database/015-rpc-providers.sql
mysql -u root -p < database/016-create-cvh-jobs.sql
mysql -u root -p < database/017-indexer-v2.sql
mysql -u root -p < database/018-webhooks-v2.sql
mysql -u root -p < database/019-flush-operations.sql
mysql -u root -p < database/020-deploy-traces.sql
mysql -u root -p < database/021-create-cvh-exports.sql
mysql -u root -p < database/022-impersonation.sql
mysql -u root -p < database/023-performance-indexes-v2.sql
mysql -u root -p < database/024-chain-lifecycle.sql
mysql -u root -p < database/025-schema-fixes-v3.sql
mysql -u root -p < database/026-client-initiated-custody.sql
mysql -u root -p < database/027-notification-rules.sql
mysql -u root -p < database/028-client-chain-config.sql
mysql -u root -p < database/029-client-deletion.sql
mysql -u root -p < database/030-system-settings.sql
```

## Seed Data

The `009-seed-data.sql` script inserts:

- **7 EVM chains**: Ethereum (1), BSC (56), Polygon (137), Arbitrum (42161), Optimism (10), Avalanche (43114), Base (8453)
- **23 tokens**: Native currencies for all chains + ERC-20 tokens (USDT, USDC, DAI, WBTC, WETH, LINK, BUSD, BTCB, WBNB, WMATIC)
- **3 tiers**: Starter (60 req/s, $10k/day), Business (300 req/s, $100k/day), Enterprise (1000 req/s, $1M/day)
- **Admin user**: `admin@cryptovaulthub.com` / `changeme` (bcrypt hashed)
- **Sync cursors**: Initial block=0 for all 7 chains

## Requirements

- MySQL 8.0+ (uses JSON column defaults, InnoDB)
- `mysql` CLI client available in PATH
- User must have CREATE DATABASE, CREATE TABLE, INSERT privileges

## All 10 Databases

| Database | Service(s) | Purpose |
|----------|-----------|---------|
| `cvh_auth` | auth-service | Users, sessions, API keys, impersonation sessions |
| `cvh_keyvault` | key-vault-service | Master seeds, derived keys, Shamir shares, vault audit log |
| `cvh_admin` | admin-api | Clients, tiers, chains, tokens, audit logs, projects, RPC providers, system settings |
| `cvh_wallets` | core-wallet-service | Wallets, deposit addresses, whitelisted addresses |
| `cvh_transactions` | core-wallet-service | Deposits, withdrawals, flush operations, deploy traces |
| `cvh_compliance` | core-wallet-service | Sanctions entries, screening results, compliance alerts |
| `cvh_notifications` | notification-service | Webhooks, deliveries, email logs, notification rules, dead letters |
| `cvh_indexer` | chain-indexer-service | Sync cursors, monitored addresses, indexed blocks/events, materialized balances, reorg log |
| `cvh_jobs` | admin-api | Persistent BullMQ job tracking |
| `cvh_exports` | cron-worker-service | Export requests metadata |

## Notes

- All scripts use `IF NOT EXISTS` / `ON DUPLICATE KEY UPDATE` for idempotent execution
- Character set: `utf8mb4` with `utf8mb4_unicode_ci` collation throughout
- Engine: InnoDB on all tables
- All timestamps use MySQL `TIMESTAMP` type with `CURRENT_TIMESTAMP` defaults
- Foreign keys are used where tables live in the same database; cross-database references are by convention only
- Migrations 013-030 are incremental ALTER/CREATE scripts safe to run on an existing database
