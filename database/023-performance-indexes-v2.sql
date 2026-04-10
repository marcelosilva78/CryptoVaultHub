-- =============================================================================
-- CryptoVaultHub — Performance Indexes V2
-- Covers the new databases: cvh_jobs, cvh_exports
-- Also adds supplementary indexes for cvh_indexer.indexed_events and
-- common query patterns discovered after the initial deployment.
-- =============================================================================

-- =============================================================================
-- cvh_jobs — rpc_providers, rpc_nodes, job_schedules, job_runs
-- =============================================================================

USE `cvh_jobs`;

-- rpc_providers: by slug (unique lookups), by active status
CREATE INDEX IF NOT EXISTS `idx_rpc_providers_slug` ON `rpc_providers` (`slug`);
CREATE INDEX IF NOT EXISTS `idx_rpc_providers_active` ON `rpc_providers` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_rpc_providers_priority` ON `rpc_providers` (`priority`, `is_active`);

-- rpc_nodes: by chain_id, by provider, by health, composite for routing
CREATE INDEX IF NOT EXISTS `idx_rpc_nodes_chain` ON `rpc_nodes` (`chain_id`);
CREATE INDEX IF NOT EXISTS `idx_rpc_nodes_provider` ON `rpc_nodes` (`provider_id`);
CREATE INDEX IF NOT EXISTS `idx_rpc_nodes_health` ON `rpc_nodes` (`health_status`);
CREATE INDEX IF NOT EXISTS `idx_rpc_nodes_active_chain` ON `rpc_nodes` (`is_active`, `chain_id`, `priority`);
CREATE INDEX IF NOT EXISTS `idx_rpc_nodes_last_check` ON `rpc_nodes` (`last_health_check`);

-- job_schedules: by job_type, by active status, by next_run for scheduler pickup
CREATE INDEX IF NOT EXISTS `idx_job_schedules_type` ON `job_schedules` (`job_type`);
CREATE INDEX IF NOT EXISTS `idx_job_schedules_active` ON `job_schedules` (`is_active`);
CREATE INDEX IF NOT EXISTS `idx_job_schedules_next_run` ON `job_schedules` (`next_run_at`, `is_active`);

-- job_runs: by schedule_id, by status, by started_at for time-range queries,
--           composite for retry logic (status + retry_count + next_retry_at)
CREATE INDEX IF NOT EXISTS `idx_job_runs_schedule` ON `job_runs` (`schedule_id`);
CREATE INDEX IF NOT EXISTS `idx_job_runs_status` ON `job_runs` (`status`);
CREATE INDEX IF NOT EXISTS `idx_job_runs_started` ON `job_runs` (`started_at`);
CREATE INDEX IF NOT EXISTS `idx_job_runs_finished` ON `job_runs` (`finished_at`);
CREATE INDEX IF NOT EXISTS `idx_job_runs_retry` ON `job_runs` (`status`, `retry_count`, `next_retry_at`);
CREATE INDEX IF NOT EXISTS `idx_job_runs_schedule_status` ON `job_runs` (`schedule_id`, `status`);

-- =============================================================================
-- cvh_exports — export_templates, export_jobs
-- =============================================================================

USE `cvh_exports`;

-- export_templates: by slug (unique lookups), by entity_type, by system flag
CREATE INDEX IF NOT EXISTS `idx_export_templates_slug` ON `export_templates` (`slug`);
CREATE INDEX IF NOT EXISTS `idx_export_templates_entity` ON `export_templates` (`entity_type`);
CREATE INDEX IF NOT EXISTS `idx_export_templates_system` ON `export_templates` (`is_system`);

-- export_jobs: by client_id, by template_id, by status, by created_at,
--              composite for cleanup (status + expires_at)
CREATE INDEX IF NOT EXISTS `idx_export_jobs_client` ON `export_jobs` (`client_id`);
CREATE INDEX IF NOT EXISTS `idx_export_jobs_template` ON `export_jobs` (`template_id`);
CREATE INDEX IF NOT EXISTS `idx_export_jobs_status` ON `export_jobs` (`status`);
CREATE INDEX IF NOT EXISTS `idx_export_jobs_created` ON `export_jobs` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_export_jobs_cleanup` ON `export_jobs` (`status`, `expires_at`);
CREATE INDEX IF NOT EXISTS `idx_export_jobs_client_status` ON `export_jobs` (`client_id`, `status`);
CREATE INDEX IF NOT EXISTS `idx_export_jobs_admin` ON `export_jobs` (`admin_user_id`);

-- =============================================================================
-- cvh_indexer — indexed_events (supplementary indexes for time-range queries)
-- =============================================================================

USE `cvh_indexer`;

-- indexed_events: by chain + block range, by event_type, by timestamp range
CREATE INDEX IF NOT EXISTS `idx_indexed_events_chain_block` ON `indexed_events` (`chain_id`, `block_number`);
CREATE INDEX IF NOT EXISTS `idx_indexed_events_type` ON `indexed_events` (`event_type`);
CREATE INDEX IF NOT EXISTS `idx_indexed_events_timestamp` ON `indexed_events` (`block_timestamp`);
CREATE INDEX IF NOT EXISTS `idx_indexed_events_chain_time` ON `indexed_events` (`chain_id`, `block_timestamp`);
CREATE INDEX IF NOT EXISTS `idx_indexed_events_address` ON `indexed_events` (`address`);
CREATE INDEX IF NOT EXISTS `idx_indexed_events_tx_hash` ON `indexed_events` (`tx_hash`);
