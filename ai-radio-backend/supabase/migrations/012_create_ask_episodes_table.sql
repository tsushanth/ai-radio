-- PROPOSED, NOT APPLIED. Review, then apply by hand when ready. Needed only when ASK_HOSTS_ENABLED is switched on.
--
-- Why: "Ask the hosts" (POST /api/ask) keeps one row per request: the request, its progress, the finished episode (audio url,
-- whole-second duration, headline sources) and the model-token / speech-second counts used by the daily caps and the spend breaker.
--
-- Lockdown, same pattern as 010: the backend reaches this table only with the service-role key (which bypasses RLS). RLS is ON with
-- no policy for anyone else, and every privilege is taken away from anon and authenticated, so the public key cannot read request
-- text or install ids and cannot insert rows around the caps. The public episode page reads through GET /api/ask/:id, which returns
-- a reduced view (never the request text, install id, script or token counts).
--
-- Verify afterwards (should return no rows):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'ask_episodes' AND grantee IN ('anon', 'authenticated');
--
-- ROLLBACK (the table only holds ask requests; nothing else references it):
--   DROP TABLE IF EXISTS public.ask_episodes;
--   DROP FUNCTION IF EXISTS public.update_ask_episodes_updated_at();

BEGIN;

CREATE TABLE IF NOT EXISTS public.ask_episodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id       TEXT,
  request_text     TEXT NOT NULL CHECK (char_length(request_text) <= 200),
  language         TEXT NOT NULL DEFAULT 'en',
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'reviewing', 'searching', 'writing', 'recording', 'completed', 'rejected', 'no_coverage', 'failed')),
  reason           TEXT,
  title            TEXT,
  description      TEXT,
  audio_url        TEXT,
  duration_seconds INTEGER,
  sources          JSONB NOT NULL DEFAULT '[]'::jsonb,
  script           JSONB,
  input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens    INTEGER NOT NULL DEFAULT 0,
  tts_seconds      INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- Daily caps count by day, per-install caps by install id.
CREATE INDEX IF NOT EXISTS idx_ask_episodes_created_at ON public.ask_episodes (created_at);
CREATE INDEX IF NOT EXISTS idx_ask_episodes_install_created ON public.ask_episodes (install_id, created_at);

CREATE OR REPLACE FUNCTION public.update_ask_episodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ask_episodes_updated_at ON public.ask_episodes;
CREATE TRIGGER ask_episodes_updated_at
  BEFORE UPDATE ON public.ask_episodes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ask_episodes_updated_at();

-- Lockdown: RLS on, no policies, no grants for the public roles.
ALTER TABLE public.ask_episodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ask_episodes FROM anon, authenticated;

COMMIT;
