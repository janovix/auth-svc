-- Organization archive (retention / read-only) + user metered overage preferences.
-- Depends on 0001_initial.sql. For databases that already included these objects in an
-- older monolithic 0001, skip applying this file or resolve duplicate-column errors manually.

-- Better Auth–managed table: camelCase columns (matches Prisma Organization model)
ALTER TABLE "organizations" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "organizations" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "organizations" ADD COLUMN "archivedReason" TEXT;

-- Custom table: snake_case columns
CREATE TABLE "user_overage_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "overage_enabled" INTEGER NOT NULL DEFAULT 0,
    "spend_limit_cents" INTEGER,
    "spend_limit_currency" TEXT NOT NULL DEFAULT 'MXN',
    "period_overage_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "user_overage_settings_user_id_key" ON "user_overage_settings"("user_id");
CREATE INDEX "user_overage_settings_user_id_idx" ON "user_overage_settings"("user_id");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");
