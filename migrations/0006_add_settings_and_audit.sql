-- Migration: Add settings and audit tables
-- This migration creates:
-- 1. User and organization settings tables for storing preferences
-- 2. Audit logs table with signature chain support for immutable audit trail

--------------------------------------------------------------------------------
-- SETTINGS TABLES
--------------------------------------------------------------------------------

-- Organization-level default settings
CREATE TABLE IF NOT EXISTS organization_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  theme TEXT DEFAULT 'system',           -- light/dark/system
  timezone TEXT DEFAULT 'UTC',           -- IANA timezone (e.g., 'America/Mexico_City')
  language TEXT DEFAULT 'en',            -- ISO 639-1 code (e.g., 'en', 'es')
  date_format TEXT DEFAULT 'MM/DD/YYYY', -- Date display format
  avatar_url TEXT,                       -- Organization avatar/logo URL
  metadata TEXT,                         -- JSON for extensibility (future settings)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- User-level settings (overrides org defaults when set)
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  theme TEXT,                            -- NULL = use org/browser default
  timezone TEXT,                         -- NULL = use org/browser default
  language TEXT,                         -- NULL = use org/browser default
  date_format TEXT,                      -- NULL = use org default
  avatar_url TEXT,                       -- User avatar URL (overrides users.image)
  payment_methods TEXT,                  -- JSON array of payment method references
  metadata TEXT,                         -- JSON for extensibility (future settings)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

--------------------------------------------------------------------------------
-- AUDIT LOGS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  
  -- Event identification
  event_type TEXT NOT NULL,              -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, etc.
  entity_type TEXT NOT NULL,             -- user, organization, transaction, alert, etc.
  entity_id TEXT,                        -- ID of affected entity (nullable for system events)
  
  -- Actor information
  actor_user_id TEXT,                    -- User who performed action (nullable for system actions)
  actor_organization_id TEXT,            -- Org context when action occurred
  actor_ip TEXT,                         -- IP address of the actor
  actor_user_agent TEXT,                 -- User agent string
  
  -- Change data (immutable snapshot)
  previous_state TEXT,                   -- JSON: state before change (null for CREATE)
  new_state TEXT,                        -- JSON: state after change (null for DELETE)
  change_summary TEXT,                   -- JSON: field-level diff for easy reading
  
  -- Context
  source_service TEXT NOT NULL,          -- aml-svc, auth-svc, import-svc, etc.
  request_id TEXT,                       -- Correlation ID for request tracing
  metadata TEXT,                         -- JSON: additional context (tags, notes, etc.)
  
  -- Integrity chain (blockchain-like)
  signature TEXT NOT NULL,               -- SHA-256 hash of (all fields + previous_signature)
  previous_signature TEXT,               -- Points to previous log's signature (NULL for first entry)
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(actor_organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_source ON audit_logs(source_service);
CREATE INDEX IF NOT EXISTS idx_audit_logs_signature ON audit_logs(signature);
CREATE INDEX IF NOT EXISTS idx_audit_logs_prev_sig ON audit_logs(previous_signature);
