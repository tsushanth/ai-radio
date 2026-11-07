-- PROPOSED, NOT APPLIED. Review, then apply by hand when ready (before turning ANALYTICS_ENABLED on).
--
-- Why: first-party, privacy-respecting product analytics (POST /api/events on ai-radio-backend). Today neither the Android app nor
-- the web app emits any events, so nobody can tell whether a change helps.
--
-- What: one append-only table. The only identifier is a random per-install id generated on the device / browser. There is no
-- email, no account id, no IP address, no device identifier and no advertising id in this table, and the backend validates every
-- event against an allowlist before inserting (see ai-radio-backend/src/lib/analytics.ts and docs/DATA-COLLECTION.md).
--
-- Access: service role only (the backend inserts with the service key). Same lockdown pattern as migration 010: row-level security
-- ON, and every privilege taken away from anon and authenticated, so the public key cannot read or write this table.
--
-- Retention: 180 days. The backend deletes older rows daily while ANALYTICS_ENABLED is on; the same statement can be run by hand:
--   DELETE FROM public.analytics_events WHERE day < (now() AT TIME ZONE 'utc')::date - 180;
--
-- Verify afterwards (should return no rows: anon and authenticated hold no privileges on the table):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'analytics_events' AND grantee IN ('anon','authenticated','PUBLIC');
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.analytics_events'::regclass;   -- true
--
-- ROLLBACK (removes the table and everything in it; the backend then answers 503 to /api/events, clients drop their queues):
--   DROP TABLE IF EXISTS public.analytics_events;

BEGIN;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  install_id  uuid        NOT NULL,                 -- random per-install id; not an account id, not a device id
  platform    text        NOT NULL CHECK (platform IN ('android', 'web', 'ios')),
  app_version text        NOT NULL CHECK (char_length(app_version) <= 20),
  name        text        NOT NULL CHECK (char_length(name) <= 40),  -- the allowlist lives in the backend, so adding an event needs no migration
  props       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(props) <= 512),
  day         date        NOT NULL                  -- UTC day the event happened (received_at minus the client-reported age)
);

CREATE INDEX IF NOT EXISTS analytics_events_day_name_idx    ON public.analytics_events (day, name);
CREATE INDEX IF NOT EXISTS analytics_events_install_day_idx ON public.analytics_events (install_id, day);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: with RLS on and no policy, anon and authenticated see and change nothing even if a grant slips back in.
-- The service role bypasses RLS.

REVOKE ALL ON public.analytics_events FROM anon, authenticated, PUBLIC;
-- The identity sequence is reachable through the same roles unless taken away explicitly.
DO $$
BEGIN
  IF to_regclass('public.analytics_events_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.analytics_events_id_seq FROM anon, authenticated, PUBLIC;
  END IF;
END $$;

COMMIT;
