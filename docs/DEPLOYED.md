# What is deployed (Audexa)

Newest first. Parity rule: whatever runs in production is on `main` (tree compared for the deployed paths).

## 2026-11-16 backend v50 (ai-radio-backend on Fly)

- Release: Fly v50, image `ai-radio-backend:deployment-01M7K0...` (see `fly releases -a ai-radio-backend`), built from `main` at `267ef32` (clean worktree, `ai-radio-backend/` tree `24bb4b8` equals `origin/main`).
- Contains: real MP3 episode audio with loudness normalisation (#63), additional podcast languages behind flags (#64), `fly.toml` env caps (#67), speech retry backoff (#68).
- Supabase AIRadio migration `015_language_flags` applied 2026-11-16 (tables `language_flags`, `language_usage_daily`, `language_breaker`, four service-role-only functions; verified by SELECT: 14 flag rows, no anon/authenticated grants).
- Secret `READALOUD_API_KEY` set on the app (value only in macOS Keychain item `readaloud-api-key-audexa`).
- Caps in `fly.toml`: `LANG_GLOBAL_DAILY_CAP=30` episodes a day, `LANG_TTS_DAILY_CHARS=120000` characters a day (120000 x 30 days x 4 USD per million = 14.4 USD a month speech; scripts about 3 to 4 USD).
- Languages ON (Beta): cs nl pl ro ru sv uk hu. OFF: fi tr id el ja hi (wave 2, not enabled).
- Radio (`audexa-radio-fly`) unchanged: nothing in these PRs touches it.
- Rollback: `fly releases rollback 48 -a ai-radio-backend` (previous image v48); one language: `fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js disable <lang>"`; everything: `... pause "reason"`; encoder only: `AUDIO_TRANSCODE=off`.
- Retention tool `node dist/scripts/audio-retention.js` is dry-run only; nothing is scheduled and nothing was deleted.
