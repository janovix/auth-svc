-- Migration: Add api_keys table for third-party programmatic access
-- Convention: snake_case columns (custom auth-svc table, NOT managed by Better Auth)

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "last_used_at" DATETIME,
    "expires_at" DATETIME,
    "revoked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX IF NOT EXISTS "api_keys_created_by_id_idx" ON "api_keys"("created_by_id");
