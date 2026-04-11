-- =============================================================================
-- CryptoVaultHub — Performance Indexes V2
-- Adds supplementary indexes using correct database/table references.
-- =============================================================================

-- =============================================================================
-- cvh_admin — rpc_providers, rpc_nodes (these tables live in cvh_admin)
-- =============================================================================

USE `cvh_admin`;

-- rpc_providers: by active status (slug already has unique key)
CREATE INDEX `idx_rpc_providers_active` ON `rpc_providers` (`is_active`);

-- rpc_nodes: by chain_id, by provider, composite for routing
CREATE INDEX `idx_rpc_nodes_chain` ON `rpc_nodes` (`chain_id`);
CREATE INDEX `idx_rpc_nodes_active_chain` ON `rpc_nodes` (`is_active`, `chain_id`, `priority`);

-- =============================================================================
-- cvh_jobs — jobs, job_schedules, job_attempts (actual tables in cvh_jobs)
-- =============================================================================

USE `cvh_jobs`;

-- jobs: by queue+status for worker pickup, by client for reporting
CREATE INDEX `idx_jobs_queue_status` ON `jobs` (`queue_name`, `status`);
CREATE INDEX `idx_jobs_client` ON `jobs` (`client_id`, `status`);
CREATE INDEX `idx_jobs_created` ON `jobs` (`created_at`);

-- =============================================================================
-- cvh_exports — export_requests (actual table in cvh_exports)
-- =============================================================================

USE `cvh_exports`;

-- export_requests: by client, by status+expires for cleanup
CREATE INDEX `idx_export_requests_client_status` ON `export_requests` (`client_id`, `status`);
CREATE INDEX `idx_export_requests_cleanup` ON `export_requests` (`status`, `expires_at`);
CREATE INDEX `idx_export_requests_created` ON `export_requests` (`created_at`);

-- =============================================================================
-- cvh_indexer — indexed_events (supplementary indexes for time-range queries)
-- =============================================================================

USE `cvh_indexer`;

-- indexed_events: by event_type, by timestamp range
CREATE INDEX `idx_indexed_events_type` ON `indexed_events` (`event_type`);
CREATE INDEX `idx_indexed_events_timestamp` ON `indexed_events` (`block_timestamp`);
CREATE INDEX `idx_indexed_events_chain_time` ON `indexed_events` (`chain_id`, `block_timestamp`);
