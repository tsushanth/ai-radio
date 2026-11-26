-- Test devices: a client may send test_device: true with its analytics batch (POST /api/events). The row is stored with
-- is_test, and every summary reads analytics_events_real, which leaves out ALL rows of an install that was ever marked.
-- Additive. Apply before deploying the backend that writes is_test.
-- Rollback: supabase/rollbacks/019_analytics_test_flag_down.sql

BEGIN;

ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS analytics_events_test_install_idx ON public.analytics_events (install_id) WHERE is_test;

CREATE OR REPLACE VIEW public.analytics_events_real WITH (security_invoker = true) AS
  SELECT e.id, e.received_at, e.install_id, e.platform, e.app_version, e.name, e.props, e.day
  FROM public.analytics_events e
  WHERE NOT EXISTS (SELECT 1 FROM public.analytics_events t WHERE t.is_test AND t.install_id = e.install_id);

-- Supabase grants new relations to anon and authenticated by default; the base table is server-only and so is this.
REVOKE ALL ON public.analytics_events_real FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.analytics_events_real TO service_role;

COMMIT;
