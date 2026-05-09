-- 044-deploy-traces-cross-db-view.sql
--
-- Fix: GET /client/v1/deploy-traces returned HTTP 500
--   "The table `deploy_traces` does not exist in the current database."
--
-- Root cause:
--   core-wallet-service connects Prisma to `cvh_wallets`, but migration
--   020-deploy-traces.sql created `deploy_traces` only inside `cvh_transactions`.
--   Prisma issues the query as `SELECT ... FROM \`deploy_traces\`` (unqualified),
--   which resolves against the connection's default DB — `cvh_wallets`.
--
-- Pattern:
--   Other cross-DB Prisma models (clients, deposits, withdrawals, chains, tokens,
--   sanctions_entries, screening_results) are exposed in `cvh_wallets` as
--   updatable VIEWs that pass through to their canonical database. We follow the
--   same pattern here so Prisma can read AND write deploy traces transparently.
--
-- The view is updatable in MySQL because it is a 1:1 SELECT over a single base
-- table that includes the primary key — covering both the `prisma.deployTrace.create`
-- path (DeployTraceService.captureTrace) and the read paths used by the client API.

USE `cvh_wallets`;

CREATE OR REPLACE
  ALGORITHM = UNDEFINED
  SQL SECURITY DEFINER
VIEW `deploy_traces` AS
SELECT
  `id`,
  `client_id`,
  `project_id`,
  `chain_id`,
  `resource_type`,
  `resource_id`,
  `address`,
  `tx_hash`,
  `block_number`,
  `block_hash`,
  `block_timestamp`,
  `deployer_address`,
  `factory_address`,
  `salt`,
  `init_code_hash`,
  `gas_used`,
  `gas_price`,
  `gas_cost_wei`,
  `rpc_provider_id`,
  `rpc_node_id`,
  `explorer_url`,
  `correlation_id`,
  `triggered_by`,
  `trigger_type`,
  `event_logs`,
  `metadata`,
  `created_at`
FROM `cvh_transactions`.`deploy_traces`;
