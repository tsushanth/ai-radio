-- Migration: 011_add_language_column.sql
-- Adds missing language column to topic_episodes table

-- Add language column to topic_episodes
ALTER TABLE topic_episodes
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Add index for language queries
CREATE INDEX IF NOT EXISTS idx_topic_episodes_language ON topic_episodes(language);

-- Add comment
COMMENT ON COLUMN topic_episodes.language IS 'Language code for the episode (en, es, fr, etc.)';
