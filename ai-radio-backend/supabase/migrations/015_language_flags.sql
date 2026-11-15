-- PROPOSED, NOT APPLIED. Review, then apply by hand BEFORE deploying the backend that reads it.
--
-- Why: on-demand podcast generation in the 14 additional languages (cs ro sv nl pl ru uk hu fi tr id el ja hi) is controlled by data,
-- not by a deploy: a per-language flag (default OFF), a per-language daily episode cap, a global daily cap, and a daily TTS character
-- breaker with a manual pause. Nothing is generated in any of these languages until a row is switched on.
--
-- Without this migration the backend fails CLOSED: every new language answers "language_unavailable" and nothing is spent. The five
-- existing on-demand languages (de es fr it pt) and English do not use these tables.
--
-- Access: service role only (the backend uses the service key). Same lockdown as migrations 010, 011, 013 and 014: RLS on, every
-- privilege taken from anon / authenticated / PUBLIC, functions executable by service_role only.
-- Retention: language_usage_daily is one small row per language per UTC day.
--
-- Verify afterwards (no rows expected for anon / authenticated):
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name IN ('language_flags','language_usage_daily','language_breaker')
--     AND grantee IN ('anon','authenticated','PUBLIC');
--   SELECT language, enabled FROM public.language_flags ORDER BY language;      -- 14 rows, all false
--
-- ROLLBACK (the backend then answers language_unavailable for every new language):
--   DROP FUNCTION IF EXISTS public.language_usage_get(date);
--   DROP FUNCTION IF EXISTS public.language_usage_add_chars(date, text, bigint);
--   DROP FUNCTION IF EXISTS public.language_usage_release(date, text);
--   DROP FUNCTION IF EXISTS public.language_usage_reserve(date, text, integer, integer);
--   DROP TABLE IF EXISTS public.language_breaker;
--   DROP TABLE IF EXISTS public.language_usage_daily;
--   DROP TABLE IF EXISTS public.language_flags;

BEGIN;

-- One row per language. enabled=false hides the language everywhere (picker list, topics, episodes). beta=true is shown to the app as
-- a "Beta" label. voice / voice_host2 are ReadAloud API voice ids for host 1 (female) and host 2 (male).
CREATE TABLE IF NOT EXISTS public.language_flags (
  language    text PRIMARY KEY CHECK (language ~ '^[a-z]{2,3}$'),
  enabled     boolean     NOT NULL DEFAULT false,
  beta        boolean     NOT NULL DEFAULT true,
  daily_cap   integer     NOT NULL DEFAULT 8 CHECK (daily_cap >= 0),
  voice       text        NOT NULL DEFAULT 'aria' CHECK (voice ~ '^[a-z0-9:_-]{1,40}$'),
  voice_host2 text        NOT NULL DEFAULT 'kai' CHECK (voice_host2 ~ '^[a-z0-9:_-]{1,40}$'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

INSERT INTO public.language_flags (language) VALUES
  ('cs'), ('ro'), ('sv'), ('nl'), ('pl'), ('ru'), ('uk'), ('hu'),   -- wave 1
  ('fi'), ('tr'), ('id'), ('el'), ('ja'), ('hi')                    -- wave 2
ON CONFLICT (language) DO NOTHING;

-- Usage per UTC day and language: episodes started (a started episode is counted even if it later fails, because the script and
-- speech are paid for), characters sent to the speech API, and how often the cap turned someone away.
CREATE TABLE IF NOT EXISTS public.language_usage_daily (
  day        date    NOT NULL,
  language   text    NOT NULL,
  episodes   integer NOT NULL DEFAULT 0 CHECK (episodes >= 0),
  tts_chars  bigint  NOT NULL DEFAULT 0 CHECK (tts_chars >= 0),
  cap_hits   integer NOT NULL DEFAULT 0 CHECK (cap_hits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, language)
);

-- Breaker state. 'tts_chars' trips automatically when the day's characters pass the limit and is active only on tripped_day (it
-- clears itself at the next UTC day). 'global_pause' is the manual kill switch for all new languages.
CREATE TABLE IF NOT EXISTS public.language_breaker (
  name        text PRIMARY KEY CHECK (name IN ('tts_chars', 'global_pause')),
  paused      boolean     NOT NULL DEFAULT false,
  tripped_day date,
  tripped_at  timestamptz,
  reason      text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.language_breaker (name) VALUES ('tts_chars'), ('global_pause') ON CONFLICT (name) DO NOTHING;

-- Atomically takes one episode slot for (day, language). Refuses when the language is at p_lang_cap or all languages are at
-- p_global_cap. Returns {"ok":true,"language":n,"global":m} or {"ok":false,"reason":"language_cap"|"global_cap",...}.
CREATE OR REPLACE FUNCTION public.language_usage_reserve(p_day date, p_language text, p_lang_cap integer, p_global_cap integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang   integer;
  v_global integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('language_usage_reserve'));
  INSERT INTO public.language_usage_daily (day, language) VALUES (p_day, p_language) ON CONFLICT (day, language) DO NOTHING;
  SELECT episodes INTO v_lang FROM public.language_usage_daily WHERE day = p_day AND language = p_language;
  SELECT COALESCE(SUM(episodes), 0) INTO v_global FROM public.language_usage_daily WHERE day = p_day;
  IF v_lang >= p_lang_cap THEN
    UPDATE public.language_usage_daily SET cap_hits = cap_hits + 1, updated_at = now() WHERE day = p_day AND language = p_language;
    RETURN jsonb_build_object('ok', false, 'reason', 'language_cap', 'language', v_lang, 'global', v_global);
  END IF;
  IF v_global >= p_global_cap THEN
    UPDATE public.language_usage_daily SET cap_hits = cap_hits + 1, updated_at = now() WHERE day = p_day AND language = p_language;
    RETURN jsonb_build_object('ok', false, 'reason', 'global_cap', 'language', v_lang, 'global', v_global);
  END IF;
  UPDATE public.language_usage_daily SET episodes = episodes + 1, updated_at = now() WHERE day = p_day AND language = p_language;
  RETURN jsonb_build_object('ok', true, 'language', v_lang + 1, 'global', v_global + 1);
END;
$$;

-- Gives a slot back (a generation that failed before anything was spent, for example no source stories).
CREATE OR REPLACE FUNCTION public.language_usage_release(p_day date, p_language text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.language_usage_daily SET episodes = GREATEST(episodes - 1, 0), updated_at = now() WHERE day = p_day AND language = p_language;
$$;

-- Adds characters sent to the speech API; returns the day's totals {"chars_total": n, "chars_language": k}.
CREATE OR REPLACE FUNCTION public.language_usage_add_chars(p_day date, p_language text, p_chars bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang  bigint;
  v_total bigint;
BEGIN
  INSERT INTO public.language_usage_daily AS u (day, language, tts_chars) VALUES (p_day, p_language, GREATEST(p_chars, 0))
  ON CONFLICT (day, language) DO UPDATE SET tts_chars = u.tts_chars + GREATEST(p_chars, 0), updated_at = now()
  RETURNING u.tts_chars INTO v_lang;
  SELECT COALESCE(SUM(tts_chars), 0) INTO v_total FROM public.language_usage_daily WHERE day = p_day;
  RETURN jsonb_build_object('chars_total', v_total, 'chars_language', v_lang);
END;
$$;

-- The day's totals: {"episodes_total", "chars_total", "languages": {"cs": {"episodes", "tts_chars", "cap_hits"}, ...}}.
CREATE OR REPLACE FUNCTION public.language_usage_get(p_day date)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'episodes_total', COALESCE(SUM(episodes), 0),
    'chars_total', COALESCE(SUM(tts_chars), 0),
    'languages', COALESCE(jsonb_object_agg(language, jsonb_build_object('episodes', episodes, 'tts_chars', tts_chars, 'cap_hits', cap_hits)), '{}'::jsonb)
  ) FROM public.language_usage_daily WHERE day = p_day;
$$;

ALTER TABLE public.language_flags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_breaker     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.language_flags, public.language_usage_daily, public.language_breaker FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.language_usage_reserve(date, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.language_usage_release(date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.language_usage_add_chars(date, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.language_usage_get(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.language_usage_reserve(date, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.language_usage_release(date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.language_usage_add_chars(date, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.language_usage_get(date) TO service_role;

COMMIT;
