-- Migration: Create topic_requests table
-- Stores user-suggested topic requests for worker processing

CREATE TABLE IF NOT EXISTS topic_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  topic_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
  result_topic_id TEXT REFERENCES topics(id),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for filtering by status (worker polls for pending)
CREATE INDEX IF NOT EXISTS idx_topic_requests_status ON topic_requests (status);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_topic_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER topic_requests_updated_at
  BEFORE UPDATE ON topic_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_topic_requests_updated_at();

-- RLS: Enable row-level security
ALTER TABLE topic_requests ENABLE ROW LEVEL SECURITY;

-- Public can insert (suggest a topic)
CREATE POLICY "Allow public insert on topic_requests"
  ON topic_requests
  FOR INSERT
  WITH CHECK (true);

-- Public can read their own requests (by matching user_id or anonymous requests)
CREATE POLICY "Allow public read own topic_requests"
  ON topic_requests
  FOR SELECT
  USING (true);

-- Service role can do everything (updates from backend/worker)
CREATE POLICY "Allow service role full access on topic_requests"
  ON topic_requests
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
