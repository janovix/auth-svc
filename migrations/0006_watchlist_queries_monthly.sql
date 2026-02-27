-- Migration: Watchlist Queries Per-Month Tracking
-- Description: Rename watchlist_queries_per_day -> watchlist_queries_per_month in
--   plan_limits and enterprise_licenses. Usage is now tracked monthly (SUM over
--   organization_daily_usage within the billing period) instead of daily.
--
-- The organization_daily_usage table is kept unchanged -- daily rows are still
-- inserted on each query and the monthly total is computed by SUMming within the
-- billing period. This preserves daily granularity and makes the table extensible
-- for future per-day metrics.

-- ============================================================================
-- 1. Recreate plan_limits with watchlist_queries_per_month
-- ============================================================================

CREATE TABLE plan_limits_new (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL,
    max_organizations INTEGER NOT NULL DEFAULT 1,
    users_per_org INTEGER NOT NULL DEFAULT 5,
    reports_per_month INTEGER NOT NULL DEFAULT 0,
    notices_per_month INTEGER NOT NULL DEFAULT 3,
    alerts_per_month INTEGER NOT NULL DEFAULT 50,
    operations_per_month INTEGER NOT NULL DEFAULT 250,
    clients_per_month INTEGER NOT NULL DEFAULT 50,
    watchlist_queries_per_month INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
    UNIQUE(plan_id)
);

INSERT INTO plan_limits_new (
    id, plan_id, max_organizations, users_per_org,
    reports_per_month, notices_per_month, alerts_per_month,
    operations_per_month, clients_per_month,
    watchlist_queries_per_month,
    metadata, created_at, updated_at
)
SELECT
    id, plan_id, max_organizations, users_per_org,
    reports_per_month, notices_per_month, alerts_per_month,
    operations_per_month, clients_per_month,
    watchlist_queries_per_day,
    metadata, created_at, updated_at
FROM plan_limits;

DROP TABLE plan_limits;
ALTER TABLE plan_limits_new RENAME TO plan_limits;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_limits_plan_id ON plan_limits(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_id_idx ON plan_limits(plan_id);

-- ============================================================================
-- 2. Recreate enterprise_licenses with watchlist_queries_per_month
-- ============================================================================

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
    max_organizations INTEGER NOT NULL DEFAULT 0,
    max_users INTEGER NOT NULL DEFAULT 0,
    reports_per_month INTEGER NOT NULL DEFAULT 0,
    notices_per_month INTEGER NOT NULL DEFAULT 0,
    alerts_per_month INTEGER NOT NULL DEFAULT 0,
    operations_per_month INTEGER NOT NULL DEFAULT 0,
    clients_per_month INTEGER NOT NULL DEFAULT 0,
    watchlist_queries_per_month INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO enterprise_licenses_new (
    id, key, organization_name, user_id, issued_by,
    status, expires_at, activated_at, notes,
    max_organizations, max_users,
    reports_per_month, notices_per_month, alerts_per_month,
    operations_per_month, clients_per_month,
    watchlist_queries_per_month,
    metadata, created_at, updated_at
)
SELECT
    id, key, organization_name, user_id, issued_by,
    status, expires_at, activated_at, notes,
    max_organizations, max_users,
    reports_per_month, notices_per_month, alerts_per_month,
    operations_per_month, clients_per_month,
    watchlist_queries_per_day,
    metadata, created_at, updated_at
FROM enterprise_licenses;

DROP TABLE enterprise_licenses;
ALTER TABLE enterprise_licenses_new RENAME TO enterprise_licenses;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enterprise_licenses_key ON enterprise_licenses(key);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_user_id ON enterprise_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_status ON enterprise_licenses(status);
