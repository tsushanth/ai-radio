-- PROPOSED, NOT APPLIED. Review, then apply by hand BEFORE (or right after) deploying the PR "backend: luna scripts + daily LLM budget".
--
-- Why: the backend now keeps a persisted daily LLM budget (dollars and call count, LLM_DAILY_CAP_USD default 3, LLM_DAILY_CAP_CALLS default 600).
-- Every finished model call adds its cost via llm_budget_add(); the 80% and cap alerts are sent once per UTC day by whichever machine
-- wins llm_budget_mark_alert(). The totals must survive restarts and be shared by every Fly machine.
--
-- Without this migration the backend still enforces the cap, but from each machine's own in-memory tally (reset on restart), and logs
-- "budget store unavailable" once. Nothing else depends on these objects.
--
-- Access: service role only (the backend uses the service key). Same lockdown as migrations 010, 011 and 013: RLS on, every privilege
-- taken from anon / authenticated / PUBLIC, functions executable by service_role only.
-- Retention: one tiny row per UTC day.
--
-- Verify afterwards (no rows expected for anon / authenticated):
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'llm_budget_daily' AND grantee IN ('anon','authenticated','PUBLIC');
--   SELECT public.llm_budget_add(current_date, 0, 0);   -- {"calls": 0, "usd": 0}
--
-- ROLLBACK (the backend then falls back to the in-memory tally):
--   DROP FUNCTION IF EXISTS public.llm_budget_mark_alert(date, text);
--   DROP FUNCTION IF EXISTS public.llm_budget_get(date);
--   DROP FUNCTION IF EXISTS public.llm_budget_add(date, integer, numeric);
--   DROP TABLE IF EXISTS public.llm_budget_daily;

BEGIN;

CREATE TABLE IF NOT EXISTS public.llm_budget_daily (
  day          date PRIMARY KEY,                                   -- UTC day
  calls        integer       NOT NULL DEFAULT 0 CHECK (calls >= 0),
  cost_usd     numeric(12,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  alert_warn_at timestamptz,                                       -- when the 80% alert was claimed
  alert_cap_at  timestamptz,                                       -- when the cap alert was claimed
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

-- Atomic add; returns the new totals for the day as {"calls": n, "usd": x}.
CREATE OR REPLACE FUNCTION public.llm_budget_add(p_day date, p_calls integer, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calls integer;
  v_usd   numeric;
BEGIN
  INSERT INTO public.llm_budget_daily AS b (day, calls, cost_usd)
  VALUES (p_day, GREATEST(p_calls, 0), GREATEST(p_usd, 0))
  ON CONFLICT (day) DO UPDATE
    SET calls = b.calls + GREATEST(p_calls, 0),
        cost_usd = b.cost_usd + GREATEST(p_usd, 0),
        updated_at = now()
  RETURNING b.calls, b.cost_usd INTO v_calls, v_usd;
  RETURN jsonb_build_object('calls', v_calls, 'usd', v_usd);
END;
$$;

-- Current totals for the day ({"calls": 0, "usd": 0} when nothing was recorded yet).
CREATE OR REPLACE FUNCTION public.llm_budget_get(p_day date)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object('calls', COALESCE(MAX(calls), 0), 'usd', COALESCE(MAX(cost_usd), 0))
  FROM public.llm_budget_daily WHERE day = p_day;
$$;

-- Claims the alert for (day, kind): true for exactly one caller, false for everyone after. kind is 'warn' (80%) or 'cap'.
CREATE OR REPLACE FUNCTION public.llm_budget_mark_alert(p_day date, p_kind text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_kind NOT IN ('warn', 'cap') THEN
    RETURN false;
  END IF;
  INSERT INTO public.llm_budget_daily (day) VALUES (p_day) ON CONFLICT (day) DO NOTHING;
  IF p_kind = 'warn' THEN
    UPDATE public.llm_budget_daily SET alert_warn_at = now() WHERE day = p_day AND alert_warn_at IS NULL;
  ELSE
    UPDATE public.llm_budget_daily SET alert_cap_at = now() WHERE day = p_day AND alert_cap_at IS NULL;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

ALTER TABLE public.llm_budget_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.llm_budget_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.llm_budget_add(date, integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.llm_budget_get(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.llm_budget_mark_alert(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_budget_add(date, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.llm_budget_get(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.llm_budget_mark_alert(date, text) TO service_role;

COMMIT;
