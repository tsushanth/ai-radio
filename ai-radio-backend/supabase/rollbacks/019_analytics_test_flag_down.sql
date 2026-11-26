-- Reverses 019_analytics_test_flag.sql. Roll the backend back first (or it answers 503 to batches from test devices).
-- Point any query or check back at public.analytics_events before dropping the view.
BEGIN;
DROP VIEW IF EXISTS public.analytics_events_real;
DROP INDEX IF EXISTS public.analytics_events_test_install_idx;
ALTER TABLE public.analytics_events DROP COLUMN IF EXISTS is_test;
COMMIT;
