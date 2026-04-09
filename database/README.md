# CryptoVaultHub Database Migrations

Complete MySQL 8+ DDL scripts for all 8 CryptoVaultHub databases.

## Databases

| File | Database | Tables |
|------|----------|--------|
| `000-create-databases.sql` | All | Creates all 8 databases |
| `001-cvh-auth.sql` | `cvh_auth` | users, sessions, api_keys |
| `002-cvh-keyvault.sql` | `cvh_keyvault` | master_seeds, derived_keys, shamir_shares, key_vault_audit |
| `003-cvh-admin.sql` | `cvh_admin` | clients, tiers, client_tier_overrides, chains, tokens, client_tokens, client_chain_config, audit_logs |
| `004-cvh-wallets.sql` | `cvh_wallets` | wallets, deposit_addresses, whitelisted_addresses |
| `005-cvh-transactions.sql` | `cvh_transactions` | deposits, withdrawals |
| `006-cvh-compliance.sql` | `cvh_compliance` | sanctions_entries, screening_results, compliance_alerts |
| `007-cvh-notifications.sql` | `cvh_notifications` | webhooks, webhook_deliveries, email_logs |
| `008-cvh-indexer.sql` | `cvh_indexer` | sync_cursors, monitored_addresses |
| `009-seed-data.sql` | Multiple | Default chains, tokens, tiers, admin user |

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

## Notes

- All scripts use `IF NOT EXISTS` / `ON DUPLICATE KEY UPDATE` for idempotent execution
- Character set: `utf8mb4` with `utf8mb4_unicode_ci` collation throughout
- Engine: InnoDB on all tables
- All timestamps use MySQL `TIMESTAMP` type with `CURRENT_TIMESTAMP` defaults
- Foreign keys are used where tables live in the same database; cross-database references are by convention only
