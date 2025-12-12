-- Migration: Add language column to topic_episodes
-- This enables multi-language support for topic podcasts

-- Add the language column with default 'en' for existing records
ALTER TABLE topic_episodes
ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- Drop the old unique constraint that was topic_id + date only
ALTER TABLE topic_episodes
DROP CONSTRAINT IF EXISTS unique_topic_date;

-- Create new unique constraint that includes language
-- This allows one episode per topic per day per language
ALTER TABLE topic_episodes
ADD CONSTRAINT unique_topic_date_language UNIQUE(topic_id, date, language);

-- Add index for language queries
CREATE INDEX IF NOT EXISTS idx_topic_episodes_language ON topic_episodes(language);
CREATE INDEX IF NOT EXISTS idx_topic_episodes_topic_date_language ON topic_episodes(topic_id, date, language);

-- Add comment
COMMENT ON COLUMN topic_episodes.language IS 'ISO language code (e.g., en, es, fr, de). Default is en.';
