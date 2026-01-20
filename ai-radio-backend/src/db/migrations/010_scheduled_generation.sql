-- Migration: 010_scheduled_generation.sql
-- Adds support for scheduled daily brief generation and push notifications

-- User settings table (extends or creates)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    briefing_time TEXT DEFAULT '07:00', -- HH:MM format
    timezone TEXT DEFAULT 'America/Los_Angeles',
    notifications_enabled BOOLEAN DEFAULT true,
    device_tokens TEXT[] DEFAULT '{}', -- Array of APNs/FCM tokens
    preferences JSONB DEFAULT '{}',
    last_generated_date TEXT, -- YYYY-MM-DD format
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding users by briefing time
CREATE INDEX IF NOT EXISTS idx_user_settings_briefing_time ON user_settings(briefing_time);
CREATE INDEX IF NOT EXISTS idx_user_settings_last_generated ON user_settings(last_generated_date);

-- Scheduled generation log (track generation history)
CREATE TABLE IF NOT EXISTS scheduled_generation_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    scheduled_time TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    episode_id TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_log_user ON scheduled_generation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_log_status ON scheduled_generation_log(status);
CREATE INDEX IF NOT EXISTS idx_generation_log_created ON scheduled_generation_log(created_at DESC);

-- Push notification log (track sent notifications)
CREATE TABLE IF NOT EXISTS push_notification_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'daily_brief_ready', 'daily_brief_failed', etc.
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivery_status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON push_notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent ON push_notification_log(sent_at DESC);

-- Add date column to podcast_episodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'podcast_episodes' AND column_name = 'date'
    ) THEN
        ALTER TABLE podcast_episodes ADD COLUMN date TEXT;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notification_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Service key full access to user_settings"
    ON user_settings FOR ALL USING (true);

CREATE POLICY "Service key full access to scheduled_generation_log"
    ON scheduled_generation_log FOR ALL USING (true);

CREATE POLICY "Service key full access to push_notification_log"
    ON push_notification_log FOR ALL USING (true);
