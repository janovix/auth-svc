-- Migration: Add Stripe billing and subscription models
-- This migration creates:
-- 1. Subscription plans table (synced with Stripe Products)
-- 2. Organization subscriptions table (Stripe Customer + Subscription)
-- 3. Enterprise licenses table (JWT + Stripe yearly subscription)
-- 4. Usage records table (tracking and Stripe metered billing)

--------------------------------------------------------------------------------
-- SUBSCRIPTION PLANS TABLE
--------------------------------------------------------------------------------

-- Subscription plan definitions (synced with Stripe Products)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,                           -- Stripe Product ID
  name TEXT NOT NULL,                            -- "Business", "Pro", or "Enterprise"
  tier TEXT NOT NULL,                            -- "business", "pro", "enterprise"
  billing_interval TEXT NOT NULL DEFAULT 'month', -- "month" or "year"
  stripe_price_id TEXT NOT NULL UNIQUE,          -- Stripe Price ID for base subscription
  base_price REAL NOT NULL,                      -- Base price in MXN
  notices_included INTEGER NOT NULL,             -- Notices included per period
  users_included INTEGER NOT NULL,               -- Users included
  transactions_included INTEGER,                 -- Optional transaction limit (enterprise)
  alerts_included INTEGER,                       -- Optional alert limit (enterprise)
  overage_price_id TEXT,                         -- Stripe Price ID for metered overage
  overage_price REAL,                            -- Price per overage unit
  features TEXT NOT NULL,                        -- JSON array of feature flags
  active INTEGER NOT NULL DEFAULT 1,             -- Boolean: 1=true, 0=false
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Subscription plans indexes
CREATE INDEX IF NOT EXISTS idx_subscription_plans_tier ON subscription_plans(tier);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(active);

--------------------------------------------------------------------------------
-- ORGANIZATION SUBSCRIPTIONS TABLE
--------------------------------------------------------------------------------

-- Organization billing (Stripe Customer + Subscription)
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  
  -- Stripe Customer (created for ALL orgs)
  stripe_customer_id TEXT NOT NULL UNIQUE,
  
  -- Stripe Subscription (NULL until they subscribe)
  plan_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_subscription_item_id TEXT,              -- For metered billing
  status TEXT NOT NULL DEFAULT 'inactive',       -- inactive, trialing, active, past_due, canceled, unpaid
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  
  -- Current period usage tracking
  notices_used INTEGER NOT NULL DEFAULT 0,
  alerts_used INTEGER NOT NULL DEFAULT 0,
  transactions_used INTEGER NOT NULL DEFAULT 0,
  users_count INTEGER NOT NULL DEFAULT 0,
  
  -- Enterprise license (for offline JWT verification)
  license_id TEXT UNIQUE,
  
  -- Billing contact (can differ from org owner)
  billing_email TEXT,
  billing_name TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  FOREIGN KEY (license_id) REFERENCES enterprise_licenses(id)
);

-- Organization subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_stripe_customer ON organization_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_stripe_sub ON organization_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON organization_subscriptions(status);

--------------------------------------------------------------------------------
-- ENTERPRISE LICENSES TABLE
--------------------------------------------------------------------------------

-- Enterprise licenses (JWT for offline verification, backed by Stripe yearly sub)
CREATE TABLE IF NOT EXISTS enterprise_licenses (
  id TEXT PRIMARY KEY,
  organization_id TEXT UNIQUE,                   -- NULL until activated
  
  -- The signed JWT license key (for offline verification)
  license_key TEXT NOT NULL UNIQUE,
  
  -- Limits (also encoded in JWT payload)
  notices_per_month INTEGER NOT NULL,
  max_users INTEGER NOT NULL,
  max_transactions INTEGER,
  max_alerts INTEGER,
  features TEXT NOT NULL,                        -- JSON array of enabled features
  
  -- Stripe tracking
  stripe_subscription_id TEXT UNIQUE,            -- Yearly enterprise subscription
  stripe_invoice_id TEXT,                        -- Initial invoice reference
  
  -- Validity
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,                             -- When org activated the license
  expires_at TEXT NOT NULL,                      -- 1 year from issuance
  revoked_at TEXT,
  
  -- Metadata
  issued_by TEXT NOT NULL,                       -- Admin user ID who created
  customer_name TEXT,                            -- Company name for the license
  notes TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

-- Enterprise licenses indexes
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_org ON enterprise_licenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_stripe_sub ON enterprise_licenses(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_expires ON enterprise_licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_revoked ON enterprise_licenses(revoked_at);

--------------------------------------------------------------------------------
-- USAGE RECORDS TABLE
--------------------------------------------------------------------------------

-- Usage tracking per billing period (for analytics and Stripe reporting)
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  
  -- Counts for the period
  notices_created INTEGER NOT NULL DEFAULT 0,
  alerts_created INTEGER NOT NULL DEFAULT 0,
  transactions_created INTEGER NOT NULL DEFAULT 0,
  
  -- Overage tracking
  notices_overage INTEGER NOT NULL DEFAULT 0,
  overage_reported_at TEXT,                      -- Last time overage was reported to Stripe
  stripe_usage_record_ids TEXT,                  -- JSON array of Stripe usage record IDs
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (subscription_id) REFERENCES organization_subscriptions(id) ON DELETE CASCADE,
  UNIQUE (organization_id, period_start)
);

-- Usage records indexes
CREATE INDEX IF NOT EXISTS idx_usage_records_org ON usage_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_sub ON usage_records(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(period_start);
