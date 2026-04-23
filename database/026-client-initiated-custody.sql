-- =============================================================================
-- Migration 026: Add client_initiated custody mode
-- =============================================================================
-- The SPEC requires a third custody mode: client_initiated.
-- The original DDL (003) already includes 'client_initiated' in the
-- custody_mode ENUM, but the Prisma CustodyPolicy enum in admin-api
-- uses 'self_managed' instead. This migration ensures both MySQL and
-- Prisma stay in sync with the correct naming.
--
-- NOTE: MySQL ALTERs on ENUMs are metadata-only (no table rebuild) if
-- the new value is appended. In this case, the column in 003-cvh-admin.sql
-- already has 'client_initiated'. This migration is a safety net for
-- deployments where the column was created from the Prisma schema
-- (which used full_custody/co_sign/self_managed).
-- =============================================================================

USE `cvh_admin`;

-- Safely add client_initiated to the custody_mode enum.
-- The column is named custody_mode as defined in 003-cvh-admin.sql.
ALTER TABLE `clients`
  MODIFY COLUMN `custody_mode` ENUM('full_custody','co_sign','self_managed','client_initiated')
    NOT NULL DEFAULT 'full_custody';
