-- Add environment column to api_keys for multi-environment API key scoping.
-- Existing keys default to 'production'.
ALTER TABLE api_keys ADD COLUMN environment TEXT NOT NULL DEFAULT 'production';
CREATE INDEX idx_api_keys_environment ON api_keys(environment);
CREATE INDEX idx_api_keys_org_env ON api_keys(organization_id, environment);
