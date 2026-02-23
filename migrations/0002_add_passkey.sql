-- Migration: Add Passkey Support
-- Description: Adds the passkey table for Better Auth passkey plugin (WebAuthn/FIDO2)
--
-- IMPORTANT: Column naming convention
-- ============================================================================
-- This table is managed by Better Auth which bypasses Prisma's @map directives.
-- Therefore it MUST use camelCase column names directly (not snake_case).
-- This matches the convention of all other Better Auth managed tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS passkey (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    publicKey TEXT NOT NULL,
    userId TEXT NOT NULL,
    credentialID TEXT NOT NULL UNIQUE,
    counter INTEGER NOT NULL,
    deviceType TEXT NOT NULL,
    backedUp INTEGER NOT NULL,
    transports TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    aaguid TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_userId ON passkey(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_credentialID ON passkey(credentialID);
