-- Migration: Rename "transactions" to "operations" across billing tables
-- This renames the usage metric from "transactions" to "operations" to better
-- reflect the domain terminology.

-- Rename columns in plan_limits
ALTER TABLE plan_limits RENAME COLUMN transactions_per_month TO operations_per_month;

-- Rename columns in organization_usage
ALTER TABLE organization_usage RENAME COLUMN transactions_used TO operations_used;

-- Rename columns in enterprise_licenses
ALTER TABLE enterprise_licenses RENAME COLUMN transactions_included TO operations_included;

-- Update price_type values in plan_prices
UPDATE plan_prices SET price_type = 'overage_operation' WHERE price_type = 'overage_transaction';
