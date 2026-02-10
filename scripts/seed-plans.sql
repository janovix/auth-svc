-- Seed subscription plans, prices, and limits
-- This is a reference file. Use seed-plans.mjs for actual seeding.
-- 
-- Usage:
--   node scripts/seed-plans.mjs              # Local dev environment
--   ENV=preview REMOTE=true node scripts/seed-plans.mjs  # Preview environment
--   ENV=prod REMOTE=true node scripts/seed-plans.mjs     # Production environment
--
-- IMPORTANT: Update Stripe price IDs in seed-plans.mjs before running!

-- ========================================
-- SUBSCRIPTION PLANS
-- ========================================
INSERT INTO subscription_plans (id, name, display_name, description, features, created_at, updated_at)
VALUES (
    'plan_business',
    'business',
    'Business',
    'Plan ideal para pequeñas y medianas empresas',
    '["data_capture","compliance_validation","report_generation","acknowledgment_tracking"]',
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    display_name = excluded.display_name,
    description = excluded.description,
    features = excluded.features,
    updated_at = datetime('now');

INSERT INTO subscription_plans (id, name, display_name, description, features, created_at, updated_at)
VALUES (
    'plan_pro',
    'pro',
    'Pro',
    'Plan avanzado para empresas con mayor volumen de operaciones',
    '["data_capture","compliance_validation","report_generation","acknowledgment_tracking","advanced_roles","approval_flows","report_templates","priority_support"]',
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    display_name = excluded.display_name,
    description = excluded.description,
    features = excluded.features,
    updated_at = datetime('now');

-- ========================================
-- PLAN LIMITS
-- ========================================
INSERT INTO plan_limits (id, plan_id, max_organizations, users_per_org, reports_per_month, notices_per_month, alerts_per_month, operations_per_month, clients_per_month, created_at, updated_at)
VALUES (
    'limit_business',
    'plan_business',
    1,      -- max_organizations
    5,      -- users_per_org
    0,      -- reports_per_month
    3,      -- notices_per_month
    50,     -- alerts_per_month
    250,    -- operations_per_month
    50,     -- clients_per_month
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    max_organizations = excluded.max_organizations,
    users_per_org = excluded.users_per_org,
    reports_per_month = excluded.reports_per_month,
    notices_per_month = excluded.notices_per_month,
    alerts_per_month = excluded.alerts_per_month,
    operations_per_month = excluded.operations_per_month,
    clients_per_month = excluded.clients_per_month,
    updated_at = datetime('now');

INSERT INTO plan_limits (id, plan_id, max_organizations, users_per_org, reports_per_month, notices_per_month, alerts_per_month, operations_per_month, clients_per_month, created_at, updated_at)
VALUES (
    'limit_pro',
    'plan_pro',
    3,      -- max_organizations
    10,     -- users_per_org
    10,     -- reports_per_month
    15,     -- notices_per_month
    250,    -- alerts_per_month
    1500,   -- operations_per_month
    300,    -- clients_per_month
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    max_organizations = excluded.max_organizations,
    users_per_org = excluded.users_per_org,
    reports_per_month = excluded.reports_per_month,
    notices_per_month = excluded.notices_per_month,
    alerts_per_month = excluded.alerts_per_month,
    operations_per_month = excluded.operations_per_month,
    clients_per_month = excluded.clients_per_month,
    updated_at = datetime('now');

-- ========================================
-- PLAN PRICES (DEV ENVIRONMENT - UPDATE STRIPE IDs FOR OTHER ENVIRONMENTS)
-- ========================================
-- Business Plan Prices
INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
VALUES (
    'price_business_monthly',
    'plan_business',
    'price_1Spb4jA9qUPmowPe47LOiLE3', -- DEV: Update for preview/prod
    'subscription',
    999900,
    'MXN',
    'month',
    1,
    'Suscripción mensual Janovix Business',
    1,
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    stripe_price_id = excluded.stripe_price_id,
    amount = excluded.amount,
    description = excluded.description,
    updated_at = datetime('now');

INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
VALUES (
    'price_business_seat',
    'plan_business',
    'price_REPLACE_WITH_SEAT_BUSINESS', -- DEV: Update for preview/prod
    'seat',
    25000,
    'MXN',
    'month',
    1,
    'Usuario Extra',
    1,
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    stripe_price_id = excluded.stripe_price_id,
    amount = excluded.amount,
    description = excluded.description,
    updated_at = datetime('now');

-- Pro Plan Prices
INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
VALUES (
    'price_pro_monthly',
    'plan_pro',
    'price_1Spb5cA9qUPmowPexCafPr3C', -- DEV: Update for preview/prod
    'subscription',
    1999900,
    'MXN',
    'month',
    1,
    'Suscripción mensual Janovix Pro',
    1,
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    stripe_price_id = excluded.stripe_price_id,
    amount = excluded.amount,
    description = excluded.description,
    updated_at = datetime('now');

INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
VALUES (
    'price_pro_seat',
    'plan_pro',
    'price_REPLACE_WITH_SEAT_PRO', -- DEV: Update for preview/prod
    'seat',
    25000,
    'MXN',
    'month',
    1,
    'Usuario Extra',
    1,
    datetime('now'),
    datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
    stripe_price_id = excluded.stripe_price_id,
    amount = excluded.amount,
    description = excluded.description,
    updated_at = datetime('now');

-- Overage Prices (add more as needed)
-- Report overage
INSERT INTO plan_prices (id, plan_id, stripe_price_id, price_type, amount, currency, interval, interval_count, description, is_active, created_at, updated_at)
VALUES 
    ('price_business_report_overage', 'plan_business', 'price_REPLACE_REPORT_OVERAGE_BIZ', 'overage_report', 25000, 'MXN', NULL, NULL, 'Reporte Extra', 1, datetime('now'), datetime('now')),
    ('price_pro_report_overage', 'plan_pro', 'price_REPLACE_REPORT_OVERAGE_PRO', 'overage_report', 25000, 'MXN', NULL, NULL, 'Reporte Extra', 1, datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET
    stripe_price_id = excluded.stripe_price_id,
    amount = excluded.amount,
    description = excluded.description,
    updated_at = datetime('now');
