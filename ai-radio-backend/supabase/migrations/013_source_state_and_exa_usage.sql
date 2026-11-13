-- PROPOSED, NOT APPLIED. Review, then apply by hand BEFORE turning SOURCE_EXA_ENABLED or SOURCE_CACHE_ENABLED on.
--
-- Why: Reddit ends RSS support on 2026-11-13, so the daily topic podcasts gain an Exa news-search source and a last-good source cache
-- (PR "podcast sources: Reddit archive, Exa fallback"). Two things must survive restarts and be shared by every Fly machine:
--   1. a daily Exa search counter with a HARD cap (EXA_DAILY_CAP, default 80), taken atomically by exa_reserve_search();
--   2. per topic: the UTC day Exa was last searched (a topic is searched at most once per day) with that day's Exa stories, and the
--      last good FEED stories (never Exa text), used as the final fallback when every live source fails.
--
-- Access: service role only (the backend uses the service key). Same lockdown as migrations 010 and 011: RLS on, every privilege taken
-- from anon / authenticated / PUBLIC, and the function executable by service_role only.
-- Retention: exa_usage_daily gets one tiny row per day; topic_source_state holds one row per topic that is overwritten in place.
--
-- Verify afterwards (no rows expected for anon / authenticated):
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name IN ('exa_usage_daily','topic_source_state') AND grantee IN ('anon','authenticated','PUBLIC');
--
-- ROLLBACK (the backend then fails closed on Exa and skips the cache; nothing else depends on these):
--   DROP FUNCTION IF EXISTS public.exa_reserve_search(date, integer);
--   DROP TABLE IF EXISTS public.topic_source_state;
--   DROP TABLE IF EXISTS public.exa_usage_daily;

BEGIN;

CREATE TABLE IF NOT EXISTS public.exa_usage_daily (
  day        date PRIMARY KEY,                       -- UTC day
  searches   integer     NOT NULL DEFAULT 0 CHECK (searches >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.topic_source_state (
  topic_id         text PRIMARY KEY,
  exa_attempt_day  date,                             -- UTC day of the last Exa search for this topic
  exa_attempt_ok   boolean,                          -- whether that search produced usable stories
  exa_stories      jsonb,                            -- that day's Exa stories (titles, outlet, url, excerpts), only when ok
  stories          jsonb,                            -- last good feed stories (RSS / HN / Reddit archive), never Exa text
  stories_at       timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Atomic reserve: +1 only while below the cap. Returns the new count, or -1 when the cap is already reached.
CREATE OR REPLACE FUNCTION public.exa_reserve_search(p_day date, p_cap integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_cap IS NULL OR p_cap <= 0 THEN
    RETURN -1;
  END IF;
  INSERT INTO public.exa_usage_daily AS u (day, searches) VALUES (p_day, 1)
  ON CONFLICT (day) DO UPDATE SET searches = u.searches + 1, updated_at = now()
    WHERE u.searches < p_cap
  RETURNING u.searches INTO n;
  RETURN COALESCE(n, -1);
END;
$$;

ALTER TABLE public.exa_usage_daily    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_source_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.exa_usage_daily    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.topic_source_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exa_reserve_search(date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exa_reserve_search(date, integer) TO service_role;

COMMIT;
