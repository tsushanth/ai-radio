-- PROPOSED, NOT APPLIED. Review, then apply by hand when ready.
--
-- Why: the backend reaches these tables only with the service-role key. No client reads or writes them with the public (anon)
-- key, yet the roles `anon` and `authenticated` still hold table privileges, so anyone holding the public key can call the
-- database API directly (for example read every suggestion, or insert rows without going through POST /api/topics/suggest and
-- its caps). Row-level security limits some of that today, but the grants should not exist at all.
--
-- What: take every privilege on topic_requests and song_requests away from anon and authenticated, and everything except SELECT
-- on topics and topic_episodes (public catalogue data that the apps may still read directly).
-- service_role is not touched, so the backend keeps working.
--
-- Verify afterwards (should return no rows for the revoked tables, and only SELECT for topics / topic_episodes):
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND table_name IN ('topic_requests','song_requests','topics','topic_episodes')
--     AND grantee IN ('anon','authenticated')
--   ORDER BY table_name, grantee, privilege_type;
--
-- ROLLBACK (restores the usual Supabase defaults; adjust if the earlier grants were narrower):
--   GRANT ALL ON public.topic_requests TO anon, authenticated;
--   GRANT ALL ON public.song_requests  TO anon, authenticated;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.topics         TO anon, authenticated;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.topic_episodes TO anon, authenticated;

BEGIN;

-- Tables that hold user submissions: no direct access for the public roles at all.
-- (to_regclass guards keep this file runnable on a database where a table does not exist.)
DO $$
BEGIN
  IF to_regclass('public.topic_requests') IS NOT NULL THEN
    REVOKE ALL ON public.topic_requests FROM anon, authenticated;
  END IF;
  IF to_regclass('public.song_requests') IS NOT NULL THEN
    REVOKE ALL ON public.song_requests FROM anon, authenticated;
  END IF;
END $$;

-- Public catalogue tables: leave SELECT as it is, remove every other privilege.
DO $$
BEGIN
  IF to_regclass('public.topics') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.topics FROM anon, authenticated;
  END IF;
  IF to_regclass('public.topic_episodes') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.topic_episodes FROM anon, authenticated;
  END IF;
END $$;

COMMIT;
