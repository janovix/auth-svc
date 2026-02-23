-- Migration: Usage Rights & Licensing System
-- Description: Restructure enterprise_licenses to be self-contained (no plan_id),
--   user-scoped, with explicit limits (0 = unlimited). Add daily usage tracking.
--
-- Changes:
--   1. Recreate enterprise_licenses table (drop plan_id, rename *_included to *_per_month,
--      add issued_by, notes, watchlist_queries_per_day, make limit cols non-nullable with default 0)
--   2. Create organization_daily_usage table for daily-metered limits

-- ============================================================================
-- 1. Recreate enterprise_licenses (SQLite requires table recreation for column changes)
-- ============================================================================

-- Create new table with updated schema
CREATE TABLE enterprise_licenses_new (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,
    organization_name TEXT NOT NULL,
    user_id TEXT,
    issued_by TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at DATETIME,
    activated_at DATETIME,
    notes TEXT,
    -- All limits explicit, no plan inheritance. 0 = unlimited.
    max_organizations INTEGER NOT NULL DEFAULT 0,
    max_users INTEGER NOT NULL DEFAULT 0,
    reports_per_month INTEGER NOT NULL DEFAULT 0,
    notices_per_month INTEGER NOT NULL DEFAULT 0,
    alerts_per_month INTEGER NOT NULL DEFAULT 0,
    operations_per_month INTEGER NOT NULL DEFAULT 0,
    clients_per_month INTEGER NOT NULL DEFAULT 0,
    watchlist_queries_per_day INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Migrate existing data (map old column names to new)
INSERT INTO enterprise_licenses_new (
    id, key, organization_name, user_id, status, expires_at, activated_at,
    max_organizations, max_users, reports_per_month, notices_per_month,
    alerts_per_month, operations_per_month, clients_per_month,
    metadata, created_at, updated_at
)
SELECT
    id, key, organization_name, user_id, status, expires_at, activated_at,
    COALESCE(max_organizations, 0),
    COALESCE(max_users, 0),
    COALESCE(reports_included, 0),
    COALESCE(notices_included, 0),
    COALESCE(alerts_included, 0),
    COALESCE(operations_included, 0),
    COALESCE(clients_included, 0),
    metadata, created_at, updated_at
FROM enterprise_licenses;

-- Drop old table and rename new
DROP TABLE enterprise_licenses;
ALTER TABLE enterprise_licenses_new RENAME TO enterprise_licenses;

-- Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_enterprise_licenses_key ON enterprise_licenses(key);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_user_id ON enterprise_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_status ON enterprise_licenses(status);

-- ============================================================================
-- 2. Create daily usage tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_daily_usage (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    date TEXT NOT NULL,
    watchlist_queries_used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, date)
);

CREATE INDEX IF NOT EXISTS idx_org_daily_usage_org_id ON organization_daily_usage(organization_id);
