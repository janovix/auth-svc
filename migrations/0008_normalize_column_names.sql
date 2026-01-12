-- Migration: Normalize column names to snake_case
-- This migration renames columns from camelCase to snake_case for consistency
-- across all services (auth-svc, aml-svc, watchlist-svc)

--------------------------------------------------------------------------------
-- USERS TABLE
--------------------------------------------------------------------------------
ALTER TABLE users RENAME COLUMN emailVerified TO email_verified;
ALTER TABLE users RENAME COLUMN createdAt TO created_at;
ALTER TABLE users RENAME COLUMN updatedAt TO updated_at;
ALTER TABLE users RENAME COLUMN banReason TO ban_reason;
ALTER TABLE users RENAME COLUMN banExpires TO ban_expires;

--------------------------------------------------------------------------------
-- SESSIONS TABLE
--------------------------------------------------------------------------------
ALTER TABLE sessions RENAME COLUMN expiresAt TO expires_at;
ALTER TABLE sessions RENAME COLUMN ipAddress TO ip_address;
ALTER TABLE sessions RENAME COLUMN userAgent TO user_agent;
ALTER TABLE sessions RENAME COLUMN activeOrganizationId TO active_organization_id;
ALTER TABLE sessions RENAME COLUMN impersonatedBy TO impersonated_by;
ALTER TABLE sessions RENAME COLUMN userId TO user_id;
ALTER TABLE sessions RENAME COLUMN createdAt TO created_at;
ALTER TABLE sessions RENAME COLUMN updatedAt TO updated_at;

--------------------------------------------------------------------------------
-- ACCOUNTS TABLE
--------------------------------------------------------------------------------
ALTER TABLE accounts RENAME COLUMN accountId TO account_id;
ALTER TABLE accounts RENAME COLUMN providerId TO provider_id;
ALTER TABLE accounts RENAME COLUMN userId TO user_id;
ALTER TABLE accounts RENAME COLUMN accessToken TO access_token;
ALTER TABLE accounts RENAME COLUMN refreshToken TO refresh_token;
ALTER TABLE accounts RENAME COLUMN idToken TO id_token;
ALTER TABLE accounts RENAME COLUMN accessTokenExpiresAt TO access_token_expires_at;
ALTER TABLE accounts RENAME COLUMN refreshTokenExpiresAt TO refresh_token_expires_at;
ALTER TABLE accounts RENAME COLUMN createdAt TO created_at;
ALTER TABLE accounts RENAME COLUMN updatedAt TO updated_at;

--------------------------------------------------------------------------------
-- VERIFICATIONS TABLE
--------------------------------------------------------------------------------
ALTER TABLE verifications RENAME COLUMN expiresAt TO expires_at;
ALTER TABLE verifications RENAME COLUMN createdAt TO created_at;
ALTER TABLE verifications RENAME COLUMN updatedAt TO updated_at;

--------------------------------------------------------------------------------
-- JWKS TABLE
--------------------------------------------------------------------------------
ALTER TABLE jwks RENAME COLUMN publicKey TO public_key;
ALTER TABLE jwks RENAME COLUMN privateKey TO private_key;
ALTER TABLE jwks RENAME COLUMN createdAt TO created_at;
ALTER TABLE jwks RENAME COLUMN expiresAt TO expires_at;

--------------------------------------------------------------------------------
-- ORGANIZATIONS TABLE
--------------------------------------------------------------------------------
ALTER TABLE organizations RENAME COLUMN createdAt TO created_at;
ALTER TABLE organizations RENAME COLUMN updatedAt TO updated_at;

--------------------------------------------------------------------------------
-- MEMBERS TABLE
--------------------------------------------------------------------------------
ALTER TABLE members RENAME COLUMN organizationId TO organization_id;
ALTER TABLE members RENAME COLUMN userId TO user_id;
ALTER TABLE members RENAME COLUMN createdAt TO created_at;
ALTER TABLE members RENAME COLUMN updatedAt TO updated_at;

--------------------------------------------------------------------------------
-- INVITATIONS TABLE
--------------------------------------------------------------------------------
ALTER TABLE invitations RENAME COLUMN organizationId TO organization_id;
ALTER TABLE invitations RENAME COLUMN inviterId TO inviter_id;
ALTER TABLE invitations RENAME COLUMN expiresAt TO expires_at;
ALTER TABLE invitations RENAME COLUMN createdAt TO created_at;
ALTER TABLE invitations RENAME COLUMN updatedAt TO updated_at;

--------------------------------------------------------------------------------
-- ORGANIZATION_SETTINGS TABLE
-- Note: Already had some snake_case columns, only rename missing ones
--------------------------------------------------------------------------------
ALTER TABLE organization_settings RENAME COLUMN organizationId TO organization_id;

--------------------------------------------------------------------------------
-- USER_SETTINGS TABLE  
-- Note: Already had some snake_case columns via @map
--------------------------------------------------------------------------------
-- No changes needed, already using snake_case

--------------------------------------------------------------------------------
-- AUDIT_LOGS TABLE
-- Note: Already had all snake_case columns via @map
--------------------------------------------------------------------------------
-- No changes needed, already using snake_case

--------------------------------------------------------------------------------
-- SUBSCRIPTION_PLANS TABLE
-- Note: Already had all snake_case columns via @map
--------------------------------------------------------------------------------
-- No changes needed, already using snake_case

--------------------------------------------------------------------------------
-- ORGANIZATION_SUBSCRIPTIONS TABLE
-- Note: Already had all snake_case columns via @map
--------------------------------------------------------------------------------
-- No changes needed, already using snake_case

--------------------------------------------------------------------------------
-- ENTERPRISE_LICENSES TABLE
-- Note: Already had all snake_case columns via @map
--------------------------------------------------------------------------------
-- No changes needed, already using snake_case

--------------------------------------------------------------------------------
-- USAGE_RECORDS TABLE
-- Note: Already had all snake_case columns via @map
--------------------------------------------------------------------------------
-- No changes needed, already using snake_case
