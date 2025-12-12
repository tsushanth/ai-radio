-- AI Radio Backend - Initial Database Schema
-- Supabase Migration: 001_initial_schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================
-- USERS TABLE
-- ================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    preferences JSONB NOT NULL DEFAULT jsonb_build_object(
        'briefing_time', '07:00',
        'topics', '[]'::jsonb,
        'voice_host1', 'en-US-Neural2-J',
        'voice_host2', 'en-US-Neural2-D',
        'include_weather', false,
        'include_calendar', true,
        'include_email', true
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add constraints for preferences JSON structure
ALTER TABLE users ADD CONSTRAINT valid_preferences_structure CHECK (
    preferences ? 'briefing_time' AND
    preferences ? 'topics' AND
    preferences ? 'voice_host1' AND
    preferences ? 'voice_host2' AND
    preferences ? 'include_weather' AND
    preferences ? 'include_calendar' AND
    preferences ? 'include_email'
);

-- Index for efficient lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ================================================
-- OAUTH TOKENS TABLE
-- ================================================
-- NOTE: OAuth tokens should be encrypted at rest
-- Consider using Supabase Vault or pgcrypto for encryption
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),

    -- TODO: Encrypt these fields using pgcrypto or Supabase Vault
    -- Example: access_token = pgp_sym_encrypt('token_value', 'encryption_key')
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one token per provider per user
    UNIQUE(user_id, provider)
);

-- Indexes for efficient token lookups
CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_provider ON oauth_tokens(provider);
CREATE INDEX idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);
CREATE INDEX idx_oauth_tokens_user_provider ON oauth_tokens(user_id, provider);

-- ================================================
-- PODCAST EPISODES TABLE
-- ================================================
CREATE TABLE podcast_episodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    script JSONB NOT NULL,
    audio_url TEXT,
    duration_seconds INTEGER CHECK (duration_seconds > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    error_message TEXT,
    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add constraint for script JSON structure
ALTER TABLE podcast_episodes ADD CONSTRAINT valid_script_structure CHECK (
    script ? 'segments' AND
    script ? 'total_duration_estimate'
);

-- Indexes for efficient queries
CREATE INDEX idx_podcast_episodes_user_id ON podcast_episodes(user_id);
CREATE INDEX idx_podcast_episodes_status ON podcast_episodes(status);
CREATE INDEX idx_podcast_episodes_created_at ON podcast_episodes(created_at DESC);
CREATE INDEX idx_podcast_episodes_user_created ON podcast_episodes(user_id, created_at DESC);
CREATE INDEX idx_podcast_episodes_generated_at ON podcast_episodes(generated_at DESC) WHERE generated_at IS NOT NULL;

-- ================================================
-- PODCAST GENERATION JOBS TABLE (for tracking async jobs)
-- ================================================
CREATE TABLE podcast_generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    episode_id UUID REFERENCES podcast_episodes(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    current_step TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for job tracking
CREATE INDEX idx_jobs_user_id ON podcast_generation_jobs(user_id);
CREATE INDEX idx_jobs_status ON podcast_generation_jobs(status);
CREATE INDEX idx_jobs_created_at ON podcast_generation_jobs(created_at DESC);

-- ================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_tokens_updated_at
    BEFORE UPDATE ON oauth_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON podcast_generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Users can read their own data
CREATE POLICY "Users can view their own data"
    ON users FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update their own data"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- OAuth tokens policies
-- Users can only see their own tokens
CREATE POLICY "Users can view their own oauth tokens"
    ON oauth_tokens FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert their own oauth tokens"
    ON oauth_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update their own oauth tokens"
    ON oauth_tokens FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete their own oauth tokens"
    ON oauth_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- Podcast episodes policies
-- Users can view their own episodes
CREATE POLICY "Users can view their own episodes"
    ON podcast_episodes FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own episodes
CREATE POLICY "Users can insert their own episodes"
    ON podcast_episodes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own episodes
CREATE POLICY "Users can update their own episodes"
    ON podcast_episodes FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own episodes
CREATE POLICY "Users can delete their own episodes"
    ON podcast_episodes FOR DELETE
    USING (auth.uid() = user_id);

-- Podcast generation jobs policies
-- Users can view their own jobs
CREATE POLICY "Users can view their own jobs"
    ON podcast_generation_jobs FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can insert their own jobs"
    ON podcast_generation_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ================================================
-- HELPER FUNCTIONS
-- ================================================

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM oauth_tokens
    WHERE expires_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats(user_uuid UUID)
RETURNS TABLE (
    total_episodes INTEGER,
    completed_episodes INTEGER,
    failed_episodes INTEGER,
    total_duration_seconds BIGINT,
    last_episode_date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_episodes,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER as completed_episodes,
        COUNT(*) FILTER (WHERE status = 'failed')::INTEGER as failed_episodes,
        COALESCE(SUM(duration_seconds), 0)::BIGINT as total_duration_seconds,
        MAX(generated_at) as last_episode_date
    FROM podcast_episodes
    WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================

COMMENT ON TABLE users IS 'User accounts with preferences for podcast generation';
COMMENT ON TABLE oauth_tokens IS 'OAuth tokens for external service integrations (Gmail, Outlook). Tokens should be encrypted.';
COMMENT ON TABLE podcast_episodes IS 'Generated podcast episodes with scripts and audio URLs';
COMMENT ON TABLE podcast_generation_jobs IS 'Async job tracking for podcast generation pipeline';

COMMENT ON COLUMN oauth_tokens.access_token IS 'TODO: Encrypt using pgcrypto or Supabase Vault';
COMMENT ON COLUMN oauth_tokens.refresh_token IS 'TODO: Encrypt using pgcrypto or Supabase Vault';

-- ================================================
-- TODO: SECURITY ENHANCEMENTS
-- ================================================
-- TODO: Implement token encryption using pgcrypto
-- TODO: Add rate limiting at database level
-- TODO: Add audit logging for sensitive operations
-- TODO: Implement token rotation mechanism
-- TODO: Add webhook signature verification table
-- TODO: Create indexes for performance optimization after initial data collection
-- TODO: Set up automated cleanup jobs for old episodes (>90 days)
