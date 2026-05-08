-- Discriminates which project wallet originates the withdrawal.
-- 'hot' (default) = CvhWalletSimple multisig path; 'gas_tank' = single-sig EOA value-transfer.
ALTER TABLE cvh_transactions.withdrawals
  ADD COLUMN source_wallet VARCHAR(16) NOT NULL DEFAULT 'hot' AFTER project_id;

-- Recreate the cvh_wallets.withdrawals view to include the new column.
DROP VIEW IF EXISTS cvh_wallets.withdrawals;
CREATE VIEW cvh_wallets.withdrawals AS SELECT * FROM cvh_transactions.withdrawals;
