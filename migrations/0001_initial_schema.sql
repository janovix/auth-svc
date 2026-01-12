-- Migration: Initial Auth Service Schema
-- Description: Complete auth service schema with Better Auth, organizations, settings, audit logs, and billing
-- All column names use snake_case for consistency across all services

-- Drop legacy tables if they exist
DROP TABLE IF EXISTS tasks;

-- Drop all existing tables to ensure clean state
DROP TABLE IF EXISTS usage_records;
DROP TABLE IF EXISTS enterprise_licenses;
DROP TABLE IF EXISTS organization_subscriptions;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS organization_settings;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS jwks;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

-- ============================================================================
-- Better Auth Core Tables
-- ============================================================================

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    name TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,
    ban_expires DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    active_organization_id TEXT,
    impersonated_by TEXT,
    user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_active_organization_id ON sessions(active_organization_id);

-- Accounts table
CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at DATETIME,
    refresh_token_expires_at DATETIME,
    scope TEXT,
    password TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Verifications table
CREATE TABLE verifications (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON verifications(identifier);

-- JWKS table (Better Auth JWT plugin)
CREATE TABLE jwks (
    id TEXT PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    alg TEXT,
    crv TEXT
);

CREATE INDEX IF NOT EXISTS idx_jwks_created_at ON jwks(created_at);
CREATE INDEX IF NOT EXISTS idx_jwks_expires_at ON jwks(expires_at);

-- ============================================================================
-- Organizations Domain
-- ============================================================================

-- Organizations table
CREATE TABLE organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Members table (organization memberships)
CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_organization_id ON members(organization_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- Invitations table (organization invitations)
CREATE TABLE invitations (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending',
    inviter_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ============================================================================
-- Settings Domain
-- ============================================================================

-- Organization settings table
CREATE TABLE organization_settings (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL UNIQUE,
    theme TEXT DEFAULT 'system',
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    date_format TEXT DEFAULT 'MM/DD/YYYY',
    avatar_url TEXT,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_organization_id ON organization_settings(organization_id);

-- User settings table
CREATE TABLE user_settings (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    theme TEXT,
    timezone TEXT,
    language TEXT,
    date_format TEXT,
    avatar_url TEXT,
    payment_methods TEXT,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ============================================================================
-- Audit Logs Domain
-- ============================================================================

CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    actor_user_id TEXT,
    actor_organization_id TEXT,
    actor_ip TEXT,
    actor_user_agent TEXT,
    previous_state TEXT,
    new_state TEXT,
    change_summary TEXT,
    source_service TEXT NOT NULL,
    request_id TEXT,
    metadata TEXT,
    signature TEXT NOT NULL,
    previous_signature TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_organization_id ON audit_logs(actor_organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_source_service ON audit_logs(source_service);
CREATE INDEX IF NOT EXISTS idx_audit_logs_signature ON audit_logs(signature);
CREATE INDEX IF NOT EXISTS idx_audit_logs_previous_signature ON audit_logs(previous_signature);

-- ============================================================================
-- Billing & Subscriptions Domain
-- ============================================================================

-- Subscription plans table
CREATE TABLE subscription_plans (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    tier TEXT NOT NULL,
    billing_interval TEXT NOT NULL DEFAULT 'month',
    stripe_price_id TEXT NOT NULL UNIQUE,
    base_price REAL NOT NULL,
    notices_included INTEGER NOT NULL,
    users_included INTEGER NOT NULL,
    transactions_included INTEGER,
    alerts_included INTEGER,
    overage_price_id TEXT,
    overage_price REAL,
    features TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_tier ON subscription_plans(tier);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(active);

-- Organization subscriptions table
CREATE TABLE organization_subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    plan_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    stripe_subscription_item_id TEXT,
    status TEXT NOT NULL DEFAULT 'inactive',
    current_period_start DATETIME,
    current_period_end DATETIME,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    notices_used INTEGER NOT NULL DEFAULT 0,
    alerts_used INTEGER NOT NULL DEFAULT 0,
    transactions_used INTEGER NOT NULL DEFAULT 0,
    users_count INTEGER NOT NULL DEFAULT 0,
    license_id TEXT UNIQUE,
    billing_email TEXT,
    billing_name TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    FOREIGN KEY (license_id) REFERENCES enterprise_licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_stripe_customer_id ON organization_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_stripe_subscription_id ON organization_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_status ON organization_subscriptions(status);

-- Enterprise licenses table
CREATE TABLE enterprise_licenses (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT UNIQUE,
    license_key TEXT NOT NULL UNIQUE,
    notices_per_month INTEGER NOT NULL,
    max_users INTEGER NOT NULL,
    max_transactions INTEGER,
    max_alerts INTEGER,
    features TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    stripe_invoice_id TEXT,
    issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at DATETIME,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    issued_by TEXT NOT NULL,
    customer_name TEXT,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_organization_id ON enterprise_licenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_stripe_subscription_id ON enterprise_licenses(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_expires_at ON enterprise_licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_revoked_at ON enterprise_licenses(revoked_at);

-- Usage records table
CREATE TABLE usage_records (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    notices_created INTEGER NOT NULL DEFAULT 0,
    alerts_created INTEGER NOT NULL DEFAULT 0,
    transactions_created INTEGER NOT NULL DEFAULT 0,
    notices_overage INTEGER NOT NULL DEFAULT 0,
    overage_reported_at DATETIME,
    stripe_usage_record_ids TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES organization_subscriptions(id) ON DELETE CASCADE,
    UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_organization_id ON usage_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_subscription_id ON usage_records(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_period_start ON usage_records(period_start);
