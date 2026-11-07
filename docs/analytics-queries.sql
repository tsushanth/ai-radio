-- Audexa product analytics: ready-to-run queries over public.analytics_events.
-- Run in the Supabase SQL editor (service role). Days are UTC. Time ranges are the last 30 days unless stated.
-- Only meaningful after migration 011 is applied and ANALYTICS_ENABLED is on. Numbers count installs (random per-install ids),
-- not people: a reinstall, a cleared browser or an opt-out reset creates a new id.
--
-- Bots / the owner's own devices are not filtered out. If you want to exclude your test installs, add
--   AND install_id NOT IN (...)
-- to the queries (the id is shown in the app only in debug builds).

-- 1. Daily active installs, by platform -----------------------------------------------------------------------------------
SELECT day, platform, count(DISTINCT install_id) AS active_installs
FROM public.analytics_events
WHERE name = 'app_open' AND day >= current_date - 30
GROUP BY day, platform
ORDER BY day DESC, platform;

-- 2. Install -> first play funnel (by day of first app_open) ---------------------------------------------------------------
-- "Reached first play" = a first_play_start event from the same install on or after the first app_open day.
WITH first_open AS (
  SELECT install_id, platform, min(day) AS first_day
  FROM public.analytics_events
  WHERE name = 'app_open'
  GROUP BY install_id, platform
), first_play AS (
  SELECT install_id, min(day) AS play_day
  FROM public.analytics_events
  WHERE name = 'first_play_start'
  GROUP BY install_id
)
SELECT o.first_day,
       o.platform,
       count(*)                                                        AS new_installs,
       count(p.install_id)                                             AS reached_first_play,
       round(100.0 * count(p.install_id) / nullif(count(*), 0), 1)     AS pct_reached_first_play,
       count(*) FILTER (WHERE p.play_day = o.first_day)                AS played_same_day
FROM first_open o
LEFT JOIN first_play p ON p.install_id = o.install_id
WHERE o.first_day >= current_date - 30
GROUP BY o.first_day, o.platform
ORDER BY o.first_day DESC, o.platform;

-- 3. Listener-minutes per day by source and language ------------------------------------------------------------------------
-- seconds is reported in 30 s buckets (rounded down, the remainder carries to the next report), so this is accurate to
-- about half a minute per listening session.
SELECT day,
       props->>'source'   AS source,
       props->>'language' AS language,
       round(sum((props->>'seconds')::int) / 60.0, 1) AS listener_minutes,
       count(DISTINCT install_id)                     AS listening_installs
FROM public.analytics_events
WHERE name = 'listen_progress' AND day >= current_date - 30
GROUP BY day, source, language
ORDER BY day DESC, listener_minutes DESC;

-- 3b. Average listening per active listening install per day (minutes) -------------------------------------------------------
SELECT day,
       round(sum((props->>'seconds')::int) / 60.0 / nullif(count(DISTINCT install_id), 0), 1) AS avg_minutes_per_listening_install
FROM public.analytics_events
WHERE name = 'listen_progress' AND day >= current_date - 30
GROUP BY day
ORDER BY day DESC;

-- 4. D1 / D7 return, by first-open cohort day ------------------------------------------------------------------------------
-- D1 = opened the app the day after the first open; D7 = opened the app exactly 7 days after. Cohorts too recent to have
-- reached D1 / D7 are included: read only cohorts that are at least 1 / 7 days old.
WITH first_open AS (
  SELECT install_id, min(day) AS first_day
  FROM public.analytics_events
  WHERE name = 'app_open'
  GROUP BY install_id
), opens AS (
  SELECT DISTINCT install_id, day FROM public.analytics_events WHERE name = 'app_open'
)
SELECT f.first_day AS cohort_day,
       count(*)    AS installs,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM opens o WHERE o.install_id = f.install_id AND o.day = f.first_day + 1)) AS returned_d1,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM opens o WHERE o.install_id = f.install_id AND o.day = f.first_day + 7)) AS returned_d7,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM opens o WHERE o.install_id = f.install_id AND o.day = f.first_day + 1)) / count(*), 1) AS pct_d1,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM opens o WHERE o.install_id = f.install_id AND o.day = f.first_day + 7)) / count(*), 1) AS pct_d7
FROM first_open f
WHERE f.first_day >= current_date - 60
GROUP BY f.first_day
ORDER BY f.first_day DESC;

-- 5. Top topics -------------------------------------------------------------------------------------------------------------
-- Opens, listening minutes and distinct installs per topic (last 30 days). Radio listening has no topic id and is not here.
SELECT t.topic_id,
       t.opens,
       t.open_installs,
       coalesce(l.listener_minutes, 0)   AS listener_minutes,
       coalesce(l.listening_installs, 0) AS listening_installs
FROM (
  SELECT props->>'topic_id' AS topic_id, count(*) AS opens, count(DISTINCT install_id) AS open_installs
  FROM public.analytics_events
  WHERE name = 'topic_open' AND day >= current_date - 30
  GROUP BY 1
) t
LEFT JOIN (
  SELECT props->>'topic_id' AS topic_id,
         round(sum((props->>'seconds')::int) / 60.0, 1) AS listener_minutes,
         count(DISTINCT install_id) AS listening_installs
  FROM public.analytics_events
  WHERE name = 'listen_progress' AND props ? 'topic_id' AND day >= current_date - 30
  GROUP BY 1
) l USING (topic_id)
ORDER BY t.opens DESC
LIMIT 25;

-- 6. Languages: current spread and switches ----------------------------------------------------------------------------------
SELECT props->>'language' AS language, count(DISTINCT install_id) AS installs, round(sum((props->>'seconds')::int) / 60.0, 1) AS listener_minutes
FROM public.analytics_events
WHERE name = 'listen_progress' AND day >= current_date - 30
GROUP BY 1
ORDER BY listener_minutes DESC;

SELECT props->>'from' AS from_language, props->>'language' AS to_language, count(*) AS switches
FROM public.analytics_events
WHERE name = 'language_change' AND day >= current_date - 30
GROUP BY 1, 2
ORDER BY switches DESC;

-- 7. Generate Episode and Suggest-a-topic usage -------------------------------------------------------------------------------
SELECT day,
       count(*) FILTER (WHERE name = 'topic_generate_requested') AS generate_requested,
       count(*) FILTER (WHERE name = 'topic_generate_succeeded') AS generate_succeeded,
       count(*) FILTER (WHERE name = 'topic_generate_failed')    AS generate_failed,
       count(DISTINCT install_id) FILTER (WHERE name = 'topic_generate_requested') AS installs_generating,
       count(*) FILTER (WHERE name = 'topic_suggest_submitted')  AS suggestions_submitted,
       count(DISTINCT install_id) FILTER (WHERE name = 'topic_suggest_submitted') AS installs_suggesting
FROM public.analytics_events
WHERE name IN ('topic_generate_requested','topic_generate_succeeded','topic_generate_failed','topic_suggest_submitted')
  AND day >= current_date - 30
GROUP BY day
ORDER BY day DESC;

-- 7b. Share taps and shown errors -----------------------------------------------------------------------------------------------
SELECT name, coalesce(props->>'source', props->>'code') AS detail, count(*) AS n, count(DISTINCT install_id) AS installs
FROM public.analytics_events
WHERE name IN ('share_tap', 'error_shown') AND day >= current_date - 30
GROUP BY 1, 2
ORDER BY n DESC;

-- 8. Health of the pipeline itself ----------------------------------------------------------------------------------------------
-- Rows per day and distinct installs: a sudden drop to zero means the kill switch is off, the migration is missing or clients are blocked.
SELECT received_at::date AS received_day, count(*) AS rows, count(DISTINCT install_id) AS installs, max(received_at) AS last_received
FROM public.analytics_events
WHERE received_at >= now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 9. Retention: delete rows older than 180 days (the backend does this daily while ANALYTICS_ENABLED is on) ----------------------------
-- DELETE FROM public.analytics_events WHERE day < (now() AT TIME ZONE 'utc')::date - 180;

-- 10. Erase one install (only possible if you are given the install id; the id is never linked to an account, so there is no lookup by person) ---------
-- DELETE FROM public.analytics_events WHERE install_id = '00000000-0000-0000-0000-000000000000';
