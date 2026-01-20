-- Deep Dive Episodes Table
-- Stores user-generated research podcasts from custom queries

CREATE TABLE IF NOT EXISTS deep_dive_episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT,
  audio_path TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  language TEXT DEFAULT 'en',
  sources JSONB DEFAULT '[]'::jsonb,
  script TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  error TEXT,

  -- Valid status values
  CONSTRAINT valid_deep_dive_status CHECK (status IN ('pending', 'researching', 'generating', 'completed', 'failed'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_deep_dive_episodes_user_id ON deep_dive_episodes(user_id);
CREATE INDEX IF NOT EXISTS idx_deep_dive_episodes_status ON deep_dive_episodes(status);
CREATE INDEX IF NOT EXISTS idx_deep_dive_episodes_created_at ON deep_dive_episodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deep_dive_episodes_user_created ON deep_dive_episodes(user_id, created_at DESC);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_deep_dive_episodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_deep_dive_episodes_updated_at ON deep_dive_episodes;
CREATE TRIGGER trigger_deep_dive_episodes_updated_at
  BEFORE UPDATE ON deep_dive_episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_deep_dive_episodes_updated_at();

-- Enable Row Level Security
ALTER TABLE deep_dive_episodes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own deep dives
CREATE POLICY deep_dive_episodes_user_read ON deep_dive_episodes
  FOR SELECT
  USING (true); -- For now, allow all reads (we filter by user_id in code)

-- Policy: Service role can do everything
CREATE POLICY deep_dive_episodes_service_all ON deep_dive_episodes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE deep_dive_episodes IS 'Stores user-generated Deep Dive research podcasts';
COMMENT ON COLUMN deep_dive_episodes.user_id IS 'User who created the deep dive';
COMMENT ON COLUMN deep_dive_episodes.query IS 'Original user query/topic';
COMMENT ON COLUMN deep_dive_episodes.status IS 'Generation status: pending, researching, generating, completed, failed';
COMMENT ON COLUMN deep_dive_episodes.sources IS 'JSON array of research sources used';
COMMENT ON COLUMN deep_dive_episodes.language IS 'Language code (en, es, fr, etc.)';
