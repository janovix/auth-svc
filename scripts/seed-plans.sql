-- Seed subscription plans for dev environment
-- Created: 2026-01-12

INSERT INTO subscription_plans (
    id, name, tier, billing_interval, stripe_price_id, base_price,
    notices_included, users_included, transactions_included, alerts_included,
    overage_price_id, overage_price, features, active
) VALUES 
-- Business Plan
(
    'plan-business-monthly',
    'Business',
    'business',
    'month',
    'price_1SoaP3A9qUPmowPeSsX2cRsS',
    9999,
    50,
    5,
    NULL,
    NULL,
    NULL,
    20,
    '["data_capture","compliance_validation","report_generation","acknowledgment_tracking"]',
    1
),
-- Pro Plan
(
    'plan-pro-monthly',
    'Pro',
    'pro',
    'month',
    'price_1SoaPTA9qUPmowPeWQ5UuqEz',
    19999,
    150,
    10,
    NULL,
    NULL,
    NULL,
    15,
    '["data_capture","compliance_validation","report_generation","acknowledgment_tracking","advanced_roles","approval_flows","report_templates","priority_support"]',
    1
)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    tier = excluded.tier,
    stripe_price_id = excluded.stripe_price_id,
    base_price = excluded.base_price,
    notices_included = excluded.notices_included,
    users_included = excluded.users_included,
    features = excluded.features,
    updated_at = datetime('now');
