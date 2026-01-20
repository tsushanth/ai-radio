-- Migration: 009_playback_interactions.sql
-- Creates tables for skip/tell-me-more interactions and adaptive learning

-- Playback interactions table
CREATE TABLE IF NOT EXISTS playback_interactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    context_type TEXT NOT NULL, -- 'daily_brief', 'topic', 'deep_dive', 'live_station'
    context_id TEXT NOT NULL,
    segment_type TEXT, -- 'calendar', 'email', 'news', 'weather', etc.
    segment_index INTEGER,
    interaction_type TEXT NOT NULL, -- 'skip', 'tell_me_more', 'completed', 'paused'
    timestamp REAL NOT NULL, -- position in audio
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences table (for adaptive learning)
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    skipped_topics JSONB DEFAULT '{}', -- topic_id -> skip count
    expanded_topics JSONB DEFAULT '{}', -- topic_id -> tell_me_more count
    preferred_segment_types JSONB DEFAULT '{}', -- segment_type -> preference score (0-1)
    avg_listening_duration REAL,
    preferred_time_of_day TEXT, -- 'morning', 'afternoon', 'evening'
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tell Me More expansions table (cache generated expansions)
CREATE TABLE IF NOT EXISTS tell_me_more_expansions (
    id TEXT PRIMARY KEY,
    context_type TEXT NOT NULL,
    context_id TEXT NOT NULL,
    segment_type TEXT,
    segment_index INTEGER,
    original_segment TEXT,
    expanded_content TEXT NOT NULL,
    audio_url TEXT,
    duration_seconds INTEGER,
    sources JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON playback_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_context ON playback_interactions(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON playback_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON playback_interactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expansions_context ON tell_me_more_expansions(context_type, context_id);

-- Enable RLS
ALTER TABLE playback_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tell_me_more_expansions ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow service key full access)
CREATE POLICY "Service key has full access to interactions"
    ON playback_interactions FOR ALL
    USING (true);

CREATE POLICY "Service key has full access to preferences"
    ON user_preferences FOR ALL
    USING (true);

CREATE POLICY "Service key has full access to expansions"
    ON tell_me_more_expansions FOR ALL
    USING (true);
