-- Close open row-level-security policies and callable functions (2026-11-25). Undo: ../rollbacks/018_close_open_policies_down.sql.
-- The backend uses the service-role key only; the apps and the website use Supabase for sign-in and realtime channels, not for
-- table access. pg_stat_statements showed no write by the anon or authenticated roles before this change.
set local lock_timeout = '5s';

drop policy if exists "Service key has full access to interactions" on public.playback_interactions;
drop policy if exists "Service key full access to push_notification_log" on public.push_notification_log;
drop policy if exists "Service key full access to scheduled_generation_log" on public.scheduled_generation_log;
drop policy if exists "Service key has full access to expansions" on public.tell_me_more_expansions;
drop policy if exists "Service key has full access to preferences" on public.user_preferences;
revoke all on table public.playback_interactions, public.push_notification_log, public.scheduled_generation_log, public.tell_me_more_expansions, public.user_preferences from anon, authenticated;

-- Server-written rows (subscription state, provider tokens, generation jobs): no client writes.
revoke insert, update, delete, truncate, references, trigger on table public.users, public.oauth_tokens, public.podcast_episodes, public.podcast_generation_jobs from anon, authenticated;

-- SECURITY DEFINER functions run with the owner's rights: server only.
revoke execute on function public.cleanup_expired_linked_accounts() from public, anon, authenticated;
grant execute on function public.cleanup_expired_linked_accounts() to service_role;
revoke execute on function public.cleanup_expired_tokens() from public, anon, authenticated;
grant execute on function public.cleanup_expired_tokens() to service_role;
revoke execute on function public.get_user_linked_accounts(p_user_email text) from public, anon, authenticated;
grant execute on function public.get_user_linked_accounts(p_user_email text) to service_role;
revoke execute on function public.get_user_stats(user_uuid uuid) from public, anon, authenticated;
grant execute on function public.get_user_stats(user_uuid uuid) to service_role;
revoke execute on function public.is_token_expiring(p_user_email text, p_provider text) from public, anon, authenticated;
grant execute on function public.is_token_expiring(p_user_email text, p_provider text) to service_role;

