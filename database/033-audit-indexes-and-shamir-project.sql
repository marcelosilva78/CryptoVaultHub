-- =============================================================================
-- CryptoVaultHub — Audit indexes + Shamir project-scoping
-- Addresses: M-6 (missing indexes), L-4/H-1 (Shamir project_id)
-- =============================================================================

-- M-6: Add missing index on project_chains.project_id for cross-DB joins
-- and on project_deploy_traces.project_id for admin traceability queries.

USE `cvh_wallets`;

-- project_chains already has a UNIQUE KEY on (project_id, chain_id), but a
-- standalone index on project_id alone accelerates queries that filter by
-- project_id without chain_id (e.g. admin traceability "all chains for project X").
ALTER TABLE `project_chains`
  ADD INDEX `idx_project_id` (`project_id`);

ALTER TABLE `project_deploy_traces`
  ADD INDEX `idx_project_id` (`project_id`);


-- L-4 / H-1: Shamir shares must be project-scoped.
-- The old unique key (client_id, share_index) breaks when a client has
-- multiple projects — each project's backup key needs its own share set.

USE `cvh_keyvault`;

ALTER TABLE `shamir_shares`
  ADD COLUMN `project_id` BIGINT NULL AFTER `client_id`,
  DROP INDEX `uq_client_share`,
  ADD UNIQUE KEY `uq_client_project_share` (`client_id`, `project_id`, `share_index`),
  ADD INDEX `idx_project_shares` (`project_id`);
