# Shamir Secret Share Physical Separation -- Operational Runbook

## Background

CryptoVaultHub uses Shamir Secret Sharing (3-of-5 threshold) for backup key recovery. The `secrets.js-grempe` library splits each client's (or project's) backup private key into 5 shares, any 3 of which can reconstruct the original key. Currently, all 5 shares reside encrypted in `cvh_keyvault.shamir_shares`. For production custody-grade security, shares must be physically distributed to separate custodians so that no single breach can compromise the backup key.

### How It Works

- The backup private key is split via `ShamirService.splitBackupKey()` into 5 hex-encoded shares.
- Each share is encrypted with AES-256-GCM (envelope encryption: per-share DEK encrypted by the master KEK) before storage.
- Shares are scoped to a `(clientId, projectId)` pair, so each project gets its own independent set.
- Reconstruction requires a minimum of 3 shares via `ShamirService.reconstructBackupKey()`, which verifies the reconstructed address matches the stored backup address.

### Database Schema (`cvh_keyvault.shamir_shares`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | Auto-increment ID |
| `client_id` | BIGINT | Client owning the key |
| `project_id` | BIGINT (nullable) | Project scope (null for legacy clients) |
| `share_index` | TINYINT | Share number (1-5) |
| `custodian` | VARCHAR(50) | Custodian identifier |
| `encrypted_share` | BLOB | AES-256-GCM encrypted share data |
| `encrypted_dek` | BLOB | Envelope-encrypted data encryption key |
| `iv` | VARBINARY(16) | Initialization vector |
| `auth_tag` | VARBINARY(16) | GCM authentication tag |
| `salt` | VARBINARY(32) | PBKDF2 salt for KEK derivation |
| `is_distributed` | BOOLEAN | Whether share has been physically distributed |
| `distributed_at` | DATETIME | Timestamp of physical distribution |

---

## Pre-Requisites

- [ ] SSH access to the Key Vault database (`cvh_keyvault`) -- remember that key-vault-service runs on the `vault-net` network with zero internet access
- [ ] 5 identified custodians with agreed roles:
  - `company_vault` -- Company physical vault
  - `ceo_safe` -- CEO's personal safe
  - `cto_safe` -- CTO's personal safe
  - `legal_escrow` -- Legal counsel escrow
  - `bank_safe_deposit` -- Bank safe deposit box
- [ ] 5 physical storage media: encrypted USB drives (hardware-encrypted, FIPS 140-2 certified recommended) or paper wallets printed on acid-free paper in tamper-evident bags
- [ ] A witness present for each share extraction (dual-control requirement)
- [ ] Secure air-gapped workstation for the export process (no network access during extraction)
- [ ] SHA-256 checksum utility available on the workstation

---

## Procedure

### Step 1: Identify Shares to Distribute

Query which clients/projects have shares that are not yet physically distributed:

```sql
SELECT
  ss.client_id,
  ss.project_id,
  ss.share_index,
  ss.custodian,
  ss.is_distributed,
  ss.created_at
FROM cvh_keyvault.shamir_shares ss
WHERE ss.is_distributed = 0
ORDER BY ss.client_id, ss.project_id, ss.share_index;
```

### Step 2: Export Shares

For each share (share_index 1-5) of each client/project:

1. Connect to `cvh_keyvault` database from the air-gapped workstation.
2. Export the encrypted share data and all metadata required for reconstruction:

```sql
SELECT
  share_index,
  client_id,
  project_id,
  custodian,
  HEX(encrypted_share)  AS encrypted_share_hex,
  HEX(encrypted_dek)    AS encrypted_dek_hex,
  HEX(iv)               AS iv_hex,
  HEX(auth_tag)         AS auth_tag_hex,
  HEX(salt)             AS salt_hex,
  created_at
FROM cvh_keyvault.shamir_shares
WHERE client_id = <CLIENT_ID>
  AND (project_id = <PROJECT_ID> OR project_id IS NULL)
  AND share_index = <INDEX>
LIMIT 1;
```

3. The share data is already encrypted with AES-256-GCM -- the exported hex values cannot be used without the master KEK. This provides defense-in-depth: even if a custodian's physical storage is compromised, the attacker still needs the `VAULT_MASTER_PASSWORD` and KDF parameters.
4. Write the exported data to the physical medium (USB drive or printed QR code).
5. Compute a SHA-256 checksum of the exported file and record it in the distribution log.

### Step 3: Verify Each Export

Before handing the share to the custodian, verify the export is readable and intact:

1. Re-import the exported data from the physical medium into a scratch table on the air-gapped workstation.
2. Compare SHA-256 checksums of `encrypted_share`, `encrypted_dek`, `iv`, `auth_tag`, and `salt` against the original database values.
3. Confirm all fields match byte-for-byte.

### Step 4: Distribute to Custodians

Hand each share to the designated custodian with a signed chain-of-custody form:

| Share Index | Custodian Role | Physical Location | Witness |
|-------------|---------------|-------------------|---------|
| 1 | `company_vault` | Company physical vault | (name + date) |
| 2 | `ceo_safe` | CEO's personal safe | (name + date) |
| 3 | `cto_safe` | CTO's personal safe | (name + date) |
| 4 | `legal_escrow` | Legal counsel escrow | (name + date) |
| 5 | `bank_safe_deposit` | Bank safe deposit box | (name + date) |

After handing over each share, mark it as distributed in the database:

```sql
UPDATE cvh_keyvault.shamir_shares
SET is_distributed = 1, distributed_at = NOW()
WHERE client_id = <CLIENT_ID>
  AND (project_id = <PROJECT_ID> OR project_id IS NULL)
  AND share_index = <INDEX>;
```

### Step 5: Verify Reconstruction (Pre-Deactivation Test)

Before deactivating database copies, verify reconstruction works with 3 of the 5 physically distributed shares:

1. Gather 3 custodians (e.g., `company_vault`, `ceo_safe`, `cto_safe`).
2. Each custodian provides their encrypted share from their physical medium.
3. Import the 3 shares into a temporary table on the air-gapped workstation.
4. Call the Key Vault reconstruction endpoint:

```bash
curl -X POST http://key-vault-service:3005/shamir/<CLIENT_ID>/reconstruct \
  -H "X-Internal-Service-Key: <SERVICE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "shareIndices": [1, 2, 3],
    "requestedBy": "physical_separation_verification"
  }'
```

5. Verify the returned `address` matches the stored backup address for this client/project.
6. The endpoint already performs this verification internally and will return an `InternalServerErrorException` if the reconstructed key does not match.

### Step 6: Deactivate Database Copies (Optional -- Post-Verification)

After physical distribution is verified and reconstruction tested:

> **WARNING:** This step removes the ability to reconstruct from database-only shares. Only proceed after confirming that physical shares are accessible and reconstruction works.

1. Do NOT delete the rows -- instead, clear the encrypted data while preserving metadata for audit:

```sql
-- Keep metadata but remove the actual encrypted share data
-- This preserves the audit trail while eliminating database-resident shares
UPDATE cvh_keyvault.shamir_shares
SET encrypted_share = x'00',
    encrypted_dek = x'00',
    iv = x'00',
    auth_tag = x'00',
    salt = x'00'
WHERE client_id = <CLIENT_ID>
  AND (project_id = <PROJECT_ID> OR project_id IS NULL)
  AND is_distributed = 1;
```

2. Log the deactivation in the key vault audit:

```sql
INSERT INTO cvh_keyvault.key_vault_audit
  (operation, client_id, key_type, requested_by, metadata, created_at)
VALUES
  ('shamir_db_deactivation', <CLIENT_ID>, 'backup', '<OPERATOR>',
   '{"projectId": <PROJECT_ID>, "reason": "physical_distribution_complete", "custodians": ["company_vault","ceo_safe","cto_safe","legal_escrow","bank_safe_deposit"]}',
   NOW());
```

---

## Recovery Procedure

When backup key reconstruction is needed (e.g., primary hot key compromised, disaster recovery):

### Step 1: Convene Custodians

1. Notify the minimum 3 custodians required for reconstruction.
2. Schedule a supervised recovery session at a secure location.
3. Each custodian brings their physical share and valid government-issued ID.

### Step 2: Verify Custodian Identity

1. Verify each custodian's identity against the chain-of-custody records.
2. Record the custodian names, roles, and timestamps in the recovery log.

### Step 3: Import Shares

1. Each custodian provides their encrypted share on the physical medium.
2. Import the 3 (or more) shares into the `cvh_keyvault.shamir_shares` table:

```sql
INSERT INTO cvh_keyvault.shamir_shares
  (client_id, project_id, share_index, custodian, encrypted_share, encrypted_dek, iv, auth_tag, salt)
VALUES
  (<CLIENT_ID>, <PROJECT_ID>, <INDEX>, '<CUSTODIAN>', <SHARE_HEX>, <DEK_HEX>, <IV_HEX>, <AUTH_HEX>, <SALT_HEX>);
```

### Step 4: Reconstruct

Call the reconstruction API:

```bash
curl -X POST http://key-vault-service:3005/shamir/<CLIENT_ID>/reconstruct \
  -H "X-Internal-Service-Key: <SERVICE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "shareIndices": [1, 2, 3],
    "requestedBy": "disaster_recovery_<DATE>"
  }'
```

The response contains the `address` and `publicKey` (never the private key). The private key is used internally for the required operation (e.g., signing a recovery transaction) and is zeroed from memory immediately after use.

### Step 5: Post-Recovery Cleanup

1. Delete the temporarily imported shares from the database.
2. Log the recovery event in the key vault audit.
3. Each custodian secures their physical share again.

---

## Audit Requirements

### Ongoing Monitoring

- Every share access (read, export, import, reconstruct) is logged to `cvh_keyvault.key_vault_audit` with:
  - `operation`: `shamir_split`, `shamir_reconstruct`, `shamir_db_deactivation`
  - `client_id`: The affected client
  - `requested_by`: The operator who performed the action
  - `metadata`: JSON with `projectId`, `shareIndices`, `custodians`, and other context
  - `created_at`: Timestamp

### Annual Verification

- Contact each custodian annually to confirm:
  - [ ] Physical share is still in their possession
  - [ ] Storage medium is intact (USB drive functional, paper legible)
  - [ ] Custodian's role has not changed
- Document the verification in the audit log.

### Custodian Role Change

When a custodian changes role (e.g., CTO leaves the company):

1. **Immediately** retrieve the departing custodian's share.
2. Re-split the backup key with `POST /shamir/<clientId>/split` (this creates a new set of 5 shares with different split coefficients).
3. Distribute the new shares to the updated custodian roster.
4. The old shares are now cryptographically useless -- they cannot be combined with shares from the new split.
5. Securely destroy the retrieved old share (shred paper, wipe USB drive).

### Compliance Records

Maintain the following records for each client/project:

| Record | Retention |
|--------|-----------|
| Chain-of-custody forms (signed) | Indefinite |
| SHA-256 checksums of exported shares | Indefinite |
| Annual verification logs | 7 years |
| Recovery event logs | Indefinite |
| Key vault audit entries | Indefinite (database) |
