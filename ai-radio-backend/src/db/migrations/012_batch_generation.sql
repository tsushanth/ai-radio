-- Migration 012: Batch Generation Tracking
-- Tracks daily batch pre-generation runs for topic episodes

CREATE TABLE IF NOT EXISTS batch_generation_runs (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total_topics INT NOT NULL DEFAULT 0,
  successful INT DEFAULT 0,
  failed INT DEFAULT 0,
  skipped INT DEFAULT 0,
  results JSONB,
  trigger_source TEXT DEFAULT 'scheduler',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying recent runs
CREATE INDEX IF NOT EXISTS idx_batch_runs_started ON batch_generation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_generation_runs(status);
