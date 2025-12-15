-- Add JWKS storage for Better Auth JWT plugin
--
-- The Better Auth `jwt` plugin stores keypairs in a `jwks` table.
-- This migration creates that table so `/api/auth/jwks` and JWT signing work.

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS jwks (
    id TEXT PRIMARY KEY NOT NULL,
    publicKey TEXT NOT NULL,
    privateKey TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME,
    alg TEXT,
    crv TEXT
);

CREATE INDEX IF NOT EXISTS idx_jwks_createdAt ON jwks(createdAt);
CREATE INDEX IF NOT EXISTS idx_jwks_expiresAt ON jwks(expiresAt);

PRAGMA foreign_keys=ON;
