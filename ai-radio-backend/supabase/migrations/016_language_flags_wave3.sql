-- PROPOSED, NOT APPLIED. Review, then apply by hand BEFORE deploying the backend that lists these languages (the backend fails CLOSED
-- without the rows: a language with no row is simply off).
--
-- Why: 11 more podcast languages for the on-demand pipeline (ar ca hr ms no sk sl sr th vi zh), wave 3. They are spoken by the speech
-- API's studio voices: mira (female, host 1) and remy (male, host 2). remy does not speak Malay (ms) or Slovenian (sl), so those two rows
-- use mira for BOTH hosts (the pipeline handles identical host voices: the two hosts then sound alike).
-- All rows are OFF (enabled = false), Beta (beta = true) and capped at 2 episodes a day per language. Nothing is generated and nothing
-- is listed in any of these languages until an operator turns a row on (`language-flags.js enable <lang>`) after the enable gate
-- (`language-gate.js <lang>`) passed. Danish (da) is NOT added: the speech API has no Danish voice.
--
-- This migration only INSERTs 11 rows into language_flags (created by migration 015). It changes no table, function or grant.
-- Verify afterwards:
--   SELECT language, enabled, beta, daily_cap, voice, voice_host2 FROM public.language_flags ORDER BY language;   -- 25 rows
--
-- ROLLBACK (the backend then treats the 11 languages as off):
--   DELETE FROM public.language_flags WHERE language IN ('ar','ca','hr','ms','no','sk','sl','sr','th','vi','zh');

BEGIN;

INSERT INTO public.language_flags (language, enabled, beta, daily_cap, voice, voice_host2) VALUES
  ('ar', false, true, 2, 'mira', 'remy'),
  ('ca', false, true, 2, 'mira', 'remy'),
  ('hr', false, true, 2, 'mira', 'remy'),
  ('ms', false, true, 2, 'mira', 'mira'),   -- remy does not speak Malay
  ('no', false, true, 2, 'mira', 'remy'),
  ('sk', false, true, 2, 'mira', 'remy'),
  ('sl', false, true, 2, 'mira', 'mira'),   -- remy does not speak Slovenian
  ('sr', false, true, 2, 'mira', 'remy'),
  ('th', false, true, 2, 'mira', 'remy'),
  ('vi', false, true, 2, 'mira', 'remy'),
  ('zh', false, true, 2, 'mira', 'remy')
ON CONFLICT (language) DO NOTHING;

COMMIT;
