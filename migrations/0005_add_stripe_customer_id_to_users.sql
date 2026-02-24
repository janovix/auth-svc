-- Migration: Add stripeCustomerId to users table
-- Description: Better Auth Stripe plugin requires stripeCustomerId on the users table
-- to cache the Stripe customer ID per user. Without this column, the first subscription
-- upgrade for any user fails because the plugin cannot persist the newly created
-- Stripe customer ID back to the user record.
--
-- NOTE: camelCase column name is intentional — this table is managed by Better Auth
-- which generates SQL that bypasses Prisma's @map directives.

ALTER TABLE users ADD COLUMN stripeCustomerId TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stripeCustomerId ON users(stripeCustomerId);
