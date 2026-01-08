-- Migration: Add admin plugin fields to user and session tables
-- Required for better-auth admin plugin functionality

-- Add admin plugin fields to users table
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN banReason TEXT;
ALTER TABLE users ADD COLUMN banExpires TEXT;

-- Add impersonatedBy field to sessions table for admin impersonation
ALTER TABLE sessions ADD COLUMN impersonatedBy TEXT;

