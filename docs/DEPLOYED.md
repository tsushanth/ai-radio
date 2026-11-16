# What is deployed (Audexa)

Newest first. Parity rule: whatever runs in production is on `main` (tree compared for the deployed paths).

## 2026-11-16 Android 12.11.0 (50) on Google Play production, 20% staged

- Play production track read back after commit: 12.11.0 (50) inProgress at userFraction 0.2, 12.10.3 (49) completed. Not raised above 20%.
- Built from `main` `4e45acd` (merge of #71 on top of #65 and #66); tag `play/12.11.0-50`. `Audexa/` tree `3ee28cc` of the built branch equals `origin/main`.
- AAB sha256 `b810ea52887b1a39be19499d1d41582ccc156d3f27caa157d9c7eea792c2b29d`, signed with the upload key. Checks run: `:app:testDebugUnitTest`, `:app:lintDebug` and `:app:bundleRelease` all exit 0. Not run: any device check.
- Contents: app language setting with 27 interface languages (machine translations, need native review), and a podcast language picker that lists the languages the backend has switched on (`GET /api/config/languages`, Beta label).
- Backend languages ON (all Beta, see the entry below): cs nl pl ro ru sv uk hu fi tr id el ja hi.
- Rollback: halt the rollout in Play Console (Production > Halt rollout), or re-upload 12.10.3 (49) as the current release with the same API pattern. A server-side language can be removed at any time with `language-flags.js disable <lang>` and disappears from the picker without an app release.

## 2026-11-16 backend v50 (ai-radio-backend on Fly)

- Release: Fly v50, image `registry.fly.io/ai-radio-backend:deployment-01M7JYSWY3KVPSPW8N382HYTTK` (v49 was the first deploy from main `6228bfd`), built from `main` at `267ef32` (clean worktree, `ai-radio-backend/` tree `24bb4b8` equals `origin/main`).
- Contains: real MP3 episode audio with loudness normalisation (#63), additional podcast languages behind flags (#64), `fly.toml` env caps (#67), speech retry backoff (#68).
- Supabase AIRadio migration `015_language_flags` applied 2026-11-16 (tables `language_flags`, `language_usage_daily`, `language_breaker`, four service-role-only functions; verified by SELECT: 14 flag rows, no anon/authenticated grants).
- Secret `READALOUD_API_KEY` set on the app (value only in macOS Keychain item `readaloud-api-key-audexa`).
- Caps in `fly.toml`: `LANG_GLOBAL_DAILY_CAP=30` episodes a day, `LANG_TTS_DAILY_CHARS=120000` characters a day (120000 x 30 days x 4 USD per million = 14.4 USD a month speech; scripts about 3 to 4 USD).
- Languages ON (Beta): all 14: cs nl pl ro ru sv uk hu (wave 1) and fi tr id el ja hi (wave 2, enabled later the same day, each passed the speech-to-text round trip, loudness and silence checks).
- Radio (`audexa-radio-fly`) unchanged: nothing in these PRs touches it.
- Rollback: `fly deploy -a ai-radio-backend --image registry.fly.io/ai-radio-backend:deployment-01M79AQ5NNBHR9S0EA2MNHJA8R` (the previous v48 image: no ffmpeg, no language code, the new tables stay unused); one language: `fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js disable <lang>"`; everything: `... pause "reason"`; encoder only: `AUDIO_TRANSCODE=off`.
- Retention tool `node dist/scripts/audio-retention.js` is dry-run only; nothing is scheduled and nothing was deleted.
