-- Reverse of ../migrations/018_close_open_policies.sql (run as one transaction). WARNING: reopens access to anyone holding the public app key.
grant all on table public.playback_interactions, public.push_notification_log, public.scheduled_generation_log, public.tell_me_more_expansions, public.user_preferences to anon, authenticated;
create policy "Service key has full access to interactions" on public.playback_interactions as permissive for all to public using (true);
create policy "Service key full access to push_notification_log" on public.push_notification_log as permissive for all to public using (true);
create policy "Service key full access to scheduled_generation_log" on public.scheduled_generation_log as permissive for all to public using (true);
create policy "Service key has full access to expansions" on public.tell_me_more_expansions as permissive for all to public using (true);
create policy "Service key has full access to preferences" on public.user_preferences as permissive for all to public using (true);
grant insert, update, delete, truncate, references, trigger on table public.users, public.oauth_tokens, public.podcast_episodes, public.podcast_generation_jobs to anon, authenticated;
grant execute on function public.cleanup_expired_linked_accounts() to public, anon, authenticated;
grant execute on function public.cleanup_expired_tokens() to public, anon, authenticated;
grant execute on function public.get_user_linked_accounts(p_user_email text) to public, anon, authenticated;
grant execute on function public.get_user_stats(user_uuid uuid) to public, anon, authenticated;
grant execute on function public.is_token_expiring(p_user_email text, p_provider text) to public, anon, authenticated;
