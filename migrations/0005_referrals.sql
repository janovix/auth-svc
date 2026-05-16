-- Referral program: opt-in codes and referee attribution / conversions
-- Depends on 0001_initial.sql (users table).

CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "successful_referrals" INTEGER NOT NULL DEFAULT 0,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE INDEX "referral_codes_code_idx" ON "referral_codes"("code");
CREATE INDEX "referral_codes_user_id_idx" ON "referral_codes"("user_id");

CREATE TABLE "referral_conversions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referral_code_id" TEXT NOT NULL,
    "referred_user_id" TEXT NOT NULL,
    "attributed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "converted_at" DATETIME,
    "conversion_type" TEXT,
    "conversion_reference" TEXT,
    CONSTRAINT "referral_conversions_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "referral_conversions_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "referral_conversions_referred_user_id_key" ON "referral_conversions"("referred_user_id");
CREATE INDEX "referral_conversions_referral_code_id_idx" ON "referral_conversions"("referral_code_id");
CREATE INDEX "referral_conversions_referred_user_id_idx" ON "referral_conversions"("referred_user_id");
CREATE INDEX "referral_conversions_converted_at_idx" ON "referral_conversions"("converted_at");
