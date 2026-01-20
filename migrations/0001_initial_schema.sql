-- Migration: Initial Auth Service Schema
-- Description: Complete auth service schema with Better Auth, organizations, settings, audit logs, and billing
--
-- IMPORTANT: Column naming convention
-- ============================================================================
-- Better Auth managed tables use camelCase column names because Better Auth
-- generates its own SQL queries that bypass Prisma's @map directives.
-- Tables affected: users, sessions, accounts, verifications, jwks, organizations, members, invitations, subscription
--
-- Custom auth-svc tables use snake_case column names (standard convention).
-- Tables affected: organization_settings, user_settings, audit_logs, used_card_fingerprints, organization_usage
--
-- BILLING MODEL: User-based (not organization-based)
-- - Users are Stripe customers and hold subscriptions
-- - Subscription limits determine how many organizations a user can own
-- - Usage tracking is per-organization, billed to the owner's subscription
-- ============================================================================

-- Drop legacy tables if they exist
DROP TABLE IF EXISTS tasks;

-- Drop all existing tables to ensure clean state
-- Old billing tables (organization-based - deprecated)
DROP TABLE IF EXISTS usage_records;
DROP TABLE IF EXISTS organization_subscriptions;
-- New billing tables (user-based)
DROP TABLE IF EXISTS plan_prices;
DROP TABLE IF EXISTS plan_limits;
DROP TABLE IF EXISTS enterprise_licenses;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS organization_usage;
DROP TABLE IF EXISTS used_card_fingerprints;
DROP TABLE IF EXISTS subscription;
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
-- Better Auth Core Tables (camelCase columns - required by Better Auth)
-- ============================================================================

-- Users table (Better Auth managed)
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    name TEXT,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    banned INTEGER NOT NULL DEFAULT 0,
    banReason TEXT,
    banExpires DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions table (Better Auth managed)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expiresAt DATETIME NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    activeOrganizationId TEXT,
    impersonatedBy TEXT,
    userId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_activeOrganizationId ON sessions(activeOrganizationId);

-- Accounts table (Better Auth managed)
CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt DATETIME,
    refreshTokenExpiresAt DATETIME,
    scope TEXT,
    password TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);

-- Verifications table (Better Auth managed)
CREATE TABLE verifications (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON verifications(identifier);

-- JWKS table (Better Auth JWT plugin managed)
CREATE TABLE jwks (
    id TEXT PRIMARY KEY NOT NULL,
    publicKey TEXT NOT NULL,
    privateKey TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME,
    alg TEXT,
    crv TEXT
);

CREATE INDEX IF NOT EXISTS idx_jwks_createdAt ON jwks(createdAt);
CREATE INDEX IF NOT EXISTS idx_jwks_expiresAt ON jwks(expiresAt);

-- ============================================================================
-- Better Auth Organizations Plugin Tables (camelCase columns - required by Better Auth)
-- ============================================================================

-- Organizations table (Better Auth managed)
CREATE TABLE organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    metadata TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Members table (Better Auth managed - organization memberships)
CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    organizationId TEXT NOT NULL,
    userId TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(organizationId, userId)
);

CREATE INDEX IF NOT EXISTS idx_members_organizationId ON members(organizationId);
CREATE INDEX IF NOT EXISTS idx_members_userId ON members(userId);

-- Invitations table (Better Auth managed - organization invitations)
CREATE TABLE invitations (
    id TEXT PRIMARY KEY NOT NULL,
    organizationId TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending',
    inviterId TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (inviterId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invitations_organizationId ON invitations(organizationId);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ============================================================================
-- Custom Auth-SVC Tables (snake_case columns - standard convention)
-- These tables are NOT managed by Better Auth and use Prisma's @map directives
-- ============================================================================

-- Organization settings table (custom - snake_case)
CREATE TABLE organization_settings (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL UNIQUE,
    theme TEXT DEFAULT 'system',
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    date_format TEXT DEFAULT 'MM/DD/YYYY',
    clock_format TEXT DEFAULT '12h',
    avatar_url TEXT,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_organization_id ON organization_settings(organization_id);

-- User settings table (custom - snake_case)
CREATE TABLE user_settings (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    theme TEXT,
    timezone TEXT,
    language TEXT,
    date_format TEXT,
    clock_format TEXT,
    avatar_url TEXT,
    payment_methods TEXT,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ============================================================================
-- Audit Logs Domain (custom - snake_case)
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
-- Better Auth Stripe Plugin Tables (camelCase columns - required by Better Auth)
-- User-based billing: users are Stripe customers, not organizations
-- ============================================================================

-- Stripe subscription table (Better Auth Stripe plugin managed)
CREATE TABLE subscription (
    id TEXT PRIMARY KEY NOT NULL,
    plan TEXT NOT NULL,
    referenceId TEXT NOT NULL,
    stripeCustomerId TEXT,
    stripeSubscriptionId TEXT,
    status TEXT,
    periodStart DATETIME,
    periodEnd DATETIME,
    cancelAtPeriodEnd INTEGER DEFAULT 0,
    cancelAt DATETIME,
    canceledAt DATETIME,
    seats INTEGER,
    trialStart DATETIME,
    trialEnd DATETIME,
    licenseId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_referenceId ON subscription(referenceId);
CREATE INDEX IF NOT EXISTS idx_subscription_stripeCustomerId ON subscription(stripeCustomerId);
CREATE INDEX IF NOT EXISTS idx_subscription_stripeSubscriptionId ON subscription(stripeSubscriptionId);
CREATE INDEX IF NOT EXISTS idx_subscription_status ON subscription(status);
CREATE INDEX IF NOT EXISTS idx_subscription_licenseId ON subscription(licenseId);

-- ============================================================================
-- Custom Billing Tables (snake_case columns)
-- ============================================================================

-- Card fingerprint tracking for trial abuse prevention
-- Stores fingerprints of cards that have been used for trials
-- If a fingerprint exists, deny trial and charge immediately
CREATE TABLE used_card_fingerprints (
    id TEXT PRIMARY KEY NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    first_user_id TEXT NOT NULL,
    first_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usage_count INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (first_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_card_fingerprints_fingerprint ON used_card_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_card_fingerprints_first_user_id ON used_card_fingerprints(first_user_id);

-- Per-organization usage tracking (for metered billing)
-- Tracks usage within each organization for the billing period
CREATE TABLE organization_usage (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    reports_used INTEGER NOT NULL DEFAULT 0,
    notices_used INTEGER NOT NULL DEFAULT 0,
    alerts_used INTEGER NOT NULL DEFAULT 0,
    transactions_used INTEGER NOT NULL DEFAULT 0,
    clients_used INTEGER NOT NULL DEFAULT 0,
    users_count INTEGER NOT NULL DEFAULT 0,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    overage_reported_at DATETIME,
    stripe_usage_record_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_usage_organization_id ON organization_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_usage_owner_user_id ON organization_usage(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_organization_usage_period_start ON organization_usage(period_start);

-- ============================================================================
-- Subscription Plans & Pricing Tables (snake_case columns)
-- Database-driven pricing and limits configuration
-- ============================================================================

-- Subscription plan definitions (base plans like business, pro)
CREATE TABLE subscription_plans (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    trial_days INTEGER NOT NULL DEFAULT 14,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_name ON subscription_plans(name);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);

-- Plan pricing (main subscription prices and add-on fees)
-- Note: stripe_price_id is NOT unique because the same Stripe price may be 
-- shared across plans in dev/preview environments
CREATE TABLE plan_prices (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL,
    stripe_price_id TEXT NOT NULL,
    price_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'MXN',
    interval TEXT,
    interval_count INTEGER,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
    UNIQUE(plan_id, price_type)
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan_id ON plan_prices(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_prices_price_type ON plan_prices(price_type);
CREATE INDEX IF NOT EXISTS idx_plan_prices_stripe_price_id ON plan_prices(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_plan_prices_is_active ON plan_prices(is_active);

-- Plan limits (configurable limits per plan)
CREATE TABLE plan_limits (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL UNIQUE,
    max_organizations INTEGER NOT NULL DEFAULT 1,
    users_per_org INTEGER NOT NULL DEFAULT 5,
    reports_per_month INTEGER NOT NULL DEFAULT 0,
    notices_per_month INTEGER NOT NULL DEFAULT 3,
    alerts_per_month INTEGER NOT NULL DEFAULT 50,
    transactions_per_month INTEGER NOT NULL DEFAULT 250,
    clients_per_month INTEGER NOT NULL DEFAULT 50,
    watchlist_queries_per_day INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_id ON plan_limits(plan_id);

-- Enterprise licenses for direct sales (not through Stripe)
CREATE TABLE enterprise_licenses (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,
    organization_name TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    user_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at DATETIME,
    activated_at DATETIME,
    max_organizations INTEGER,
    max_users INTEGER,
    reports_included INTEGER,
    notices_included INTEGER,
    alerts_included INTEGER,
    transactions_included INTEGER,
    clients_included INTEGER,
    metadata TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_key ON enterprise_licenses(key);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_user_id ON enterprise_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_status ON enterprise_licenses(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_plan_id ON enterprise_licenses(plan_id);

-- ============================================================================
-- Seed Data: Use the seeder script for environment-specific Stripe IDs
-- ============================================================================
-- After running migrations, seed the plans, prices, and limits:
--
--   # Local development
--   node scripts/seed-plans.mjs
--
--   # Preview environment
--   ENV=preview REMOTE=true node scripts/seed-plans.mjs
--
--   # Production environment  
--   ENV=prod REMOTE=true node scripts/seed-plans.mjs
--
-- IMPORTANT: Update the Stripe price IDs in scripts/seed-plans.mjs before
-- running the seeder for each environment.
-- ============================================================================
