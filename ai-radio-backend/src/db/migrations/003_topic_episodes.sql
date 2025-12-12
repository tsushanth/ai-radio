-- Topic Episodes Table
-- Stores generated episodes for each topic per day

CREATE TABLE IF NOT EXISTS topic_episodes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_generated',
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT,
  audio_path TEXT,
  duration_seconds INTEGER,
  script TEXT,
  stories JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ,
  generated_by TEXT,
  play_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one episode per topic per day
  CONSTRAINT unique_topic_date UNIQUE(topic_id, date),

  -- Valid status values
  CONSTRAINT valid_status CHECK (status IN ('not_generated', 'generating', 'completed', 'failed'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_topic_episodes_topic_id ON topic_episodes(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_episodes_date ON topic_episodes(date);
CREATE INDEX IF NOT EXISTS idx_topic_episodes_topic_date ON topic_episodes(topic_id, date);
CREATE INDEX IF NOT EXISTS idx_topic_episodes_status ON topic_episodes(status);

-- Function to increment play count
CREATE OR REPLACE FUNCTION increment_play_count(episode_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE topic_episodes
  SET play_count = play_count + 1,
      updated_at = NOW()
  WHERE id = episode_id;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_topic_episodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_topic_episodes_updated_at ON topic_episodes;
CREATE TRIGGER trigger_topic_episodes_updated_at
  BEFORE UPDATE ON topic_episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_topic_episodes_updated_at();

-- Enable Row Level Security (optional, for future multi-tenant support)
ALTER TABLE topic_episodes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read completed episodes
CREATE POLICY IF NOT EXISTS topic_episodes_read_completed ON topic_episodes
  FOR SELECT
  USING (status = 'completed');

-- Policy: Service role can do everything
CREATE POLICY IF NOT EXISTS topic_episodes_service_all ON topic_episodes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE topic_episodes IS 'Stores generated podcast episodes for each topic per day';
COMMENT ON COLUMN topic_episodes.topic_id IS 'References topic definition in code';
COMMENT ON COLUMN topic_episodes.date IS 'Date the episode is for (YYYY-MM-DD)';
COMMENT ON COLUMN topic_episodes.status IS 'Generation status: not_generated, generating, completed, failed';
COMMENT ON COLUMN topic_episodes.stories IS 'JSON array of source stories used to generate the episode';
COMMENT ON COLUMN topic_episodes.play_count IS 'Number of times this episode has been played';
