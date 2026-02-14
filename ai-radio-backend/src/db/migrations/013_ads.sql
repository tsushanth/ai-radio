-- Migration 013: Native Audio Ad System
-- Supports audio ads with companion images inserted between podcast segments

-- Ad campaigns (an advertiser's campaign with targeting and caps)
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  advertiser TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  start_date DATE NOT NULL,
  end_date DATE,
  daily_impression_cap INT,           -- max impressions per day (null = unlimited)
  total_impression_cap INT,           -- lifetime cap (null = unlimited)
  target_topics TEXT[],               -- topic IDs to target (null = all topics)
  priority INT DEFAULT 0,             -- higher = shown first
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ad creatives (audio file + companion image for a campaign)
CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  audio_url TEXT NOT NULL,            -- URL to ad audio file
  audio_path TEXT,                    -- storage path in ad-assets bucket
  audio_duration_seconds INT NOT NULL CHECK (audio_duration_seconds BETWEEN 5 AND 60),
  companion_image_url TEXT,           -- URL to companion display image
  companion_image_path TEXT,          -- storage path
  click_through_url TEXT,             -- URL opened when user taps companion image
  cta_text TEXT,                      -- call-to-action text (e.g., "Learn More")
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ad impression tracking
CREATE TABLE IF NOT EXISTS ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES ad_creatives(id),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id),
  episode_id TEXT,                    -- topic_episodes.id or live_station_episodes.id
  topic_id TEXT,
  user_id TEXT,                       -- device ID or authenticated user ID
  device_platform TEXT CHECK (device_platform IN ('ios', 'android', 'web')),
  language TEXT DEFAULT 'en',
  impression_at TIMESTAMPTZ DEFAULT now(),
  duration_listened_seconds INT,      -- how much of the ad audio was heard
  was_skipped BOOLEAN DEFAULT false,
  click_occurred BOOLEAN DEFAULT false,
  click_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON ad_campaigns(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON ad_creatives(campaign_id, is_active);
CREATE INDEX IF NOT EXISTS idx_impressions_campaign ON ad_impressions(campaign_id, impression_at);
CREATE INDEX IF NOT EXISTS idx_impressions_creative ON ad_impressions(creative_id, impression_at);
CREATE INDEX IF NOT EXISTS idx_impressions_date ON ad_impressions(impression_at);

-- Add segment timings to topic episodes for client-side ad insertion points
ALTER TABLE topic_episodes ADD COLUMN IF NOT EXISTS segment_timings JSONB;
