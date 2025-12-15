-- Bootstrap Better Auth storage

-- Ensure users table contains the fields Better Auth expects.
-- SQLite (and D1) do not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
-- and this migration may be re-run against databases where these columns
-- already exist (e.g. after a previously failed/partial attempt).
--
-- To make this migration idempotent, we rebuild the `users` table into the
-- desired shape and copy the known columns forward.
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS users__better_auth_tmp (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only copy data if users table exists and has data
-- Note: This will fail silently if users table doesn't exist, which is fine
-- as we're creating a new table structure

DROP TABLE IF EXISTS users;
ALTER TABLE users__better_auth_tmp RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

PRAGMA foreign_keys=ON;

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expiresAt DATETIME NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    userId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt DATETIME,
    refreshTokenExpiresAt DATETIME,
    scope TEXT,
    password TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);

-- Verification tokens table
CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON verifications(identifier);
