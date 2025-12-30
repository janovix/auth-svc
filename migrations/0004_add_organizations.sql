-- Migration: Add organization support for multi-tenant architecture
-- This adds support for the better-auth organization plugin

-- Add activeOrganizationId to sessions table
ALTER TABLE sessions ADD COLUMN activeOrganizationId TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_activeOrganizationId ON sessions(activeOrganizationId);

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    metadata TEXT, -- JSON string for organization settings (RFC, vulnerable activity, etc.)
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Create members table (organization memberships)
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY NOT NULL,
    organizationId TEXT NOT NULL,
    userId TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- owner, admin, member
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(organizationId, userId)
);

CREATE INDEX IF NOT EXISTS idx_members_organizationId ON members(organizationId);
CREATE INDEX IF NOT EXISTS idx_members_userId ON members(userId);

-- Create invitations table (organization invitations)
CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY NOT NULL,
    organizationId TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, expired
    inviterId TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (inviterId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invitations_organizationId ON invitations(organizationId);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

