-- AI Radio Backend - Linked Accounts Schema
-- Supabase Migration: 002_linked_accounts
--
-- This migration adds a linked_accounts table that stores OAuth tokens
-- using email as the user identifier (compatible with iOS app flow)

-- ================================================
-- LINKED ACCOUNTS TABLE
-- ================================================
-- Stores OAuth tokens for email/calendar access
-- Uses email as the user identifier (not UUID) for simplicity
CREATE TABLE IF NOT EXISTS linked_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User identifier (email address used for linking)
    user_email TEXT NOT NULL,

    -- OAuth provider
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),

    -- The email associated with the OAuth account (may differ from user_email)
    oauth_email TEXT NOT NULL,

    -- OAuth tokens (should be encrypted in production)
    -- TODO: Encrypt using pgcrypto: access_token = pgp_sym_encrypt('token', 'key')
    access_token TEXT NOT NULL,
    refresh_token TEXT,

    -- Token expiration
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),

    -- OAuth scopes granted
    scopes TEXT[] NOT NULL DEFAULT '{}',

    -- Feature flags
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    calendar_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each user can only have one account per provider
    UNIQUE(user_email, provider)
);

-- ================================================
-- INDEXES
-- ================================================

-- Lookup by user email
CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_email
    ON linked_accounts(user_email);

-- Lookup by provider
CREATE INDEX IF NOT EXISTS idx_linked_accounts_provider
    ON linked_accounts(provider);

-- Lookup by user + provider (most common query)
CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_provider
    ON linked_accounts(user_email, provider);

-- Find expired tokens for cleanup
CREATE INDEX IF NOT EXISTS idx_linked_accounts_expires_at
    ON linked_accounts(expires_at);

-- ================================================
-- TRIGGERS
-- ================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_linked_accounts_updated_at
    BEFORE UPDATE ON linked_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================

-- Enable RLS
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;

-- For now, we'll use service role key from backend
-- which bypasses RLS. In production, you may want to add
-- policies based on JWT claims.

-- Allow service role full access (backend uses service role key)
CREATE POLICY "Service role has full access to linked_accounts"
    ON linked_accounts
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ================================================
-- HELPER FUNCTIONS
-- ================================================

-- Function to get all linked accounts for a user
CREATE OR REPLACE FUNCTION get_user_linked_accounts(p_user_email TEXT)
RETURNS TABLE (
    id UUID,
    provider TEXT,
    oauth_email TEXT,
    email_enabled BOOLEAN,
    calendar_enabled BOOLEAN,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        la.id,
        la.provider,
        la.oauth_email,
        la.email_enabled,
        la.calendar_enabled,
        la.expires_at,
        la.created_at
    FROM linked_accounts la
    WHERE la.user_email = p_user_email
    ORDER BY la.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a token is expired or expiring soon (within 5 minutes)
CREATE OR REPLACE FUNCTION is_token_expiring(p_user_email TEXT, p_provider TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    token_expires TIMESTAMPTZ;
BEGIN
    SELECT expires_at INTO token_expires
    FROM linked_accounts
    WHERE user_email = p_user_email AND provider = p_provider;

    IF token_expires IS NULL THEN
        RETURN true; -- No token found, treat as expired
    END IF;

    RETURN token_expires <= (NOW() + INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired tokens (older than 7 days past expiration)
CREATE OR REPLACE FUNCTION cleanup_expired_linked_accounts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM linked_accounts
    WHERE expires_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- COMMENTS
-- ================================================

COMMENT ON TABLE linked_accounts IS 'OAuth tokens for linked email/calendar accounts. Uses email as user identifier.';
COMMENT ON COLUMN linked_accounts.user_email IS 'Email of the user who linked this account (from app sign-in)';
COMMENT ON COLUMN linked_accounts.oauth_email IS 'Email from the OAuth provider (the account being accessed)';
COMMENT ON COLUMN linked_accounts.access_token IS 'OAuth access token - TODO: encrypt in production';
COMMENT ON COLUMN linked_accounts.refresh_token IS 'OAuth refresh token - TODO: encrypt in production';
COMMENT ON COLUMN linked_accounts.scopes IS 'Array of OAuth scopes granted by user';
