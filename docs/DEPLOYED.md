# What is deployed (Audexa)

Newest first. Parity rule: whatever runs in production is on `main` (tree compared for the deployed paths).


## 2026-11-23 Android 12.13.0 (52) on Google Play production, 20% staged

- Play production track read back after commit: 12.13.0 (52) inProgress at userFraction 0.2, 12.12.0 (51) completed. Not raised above 20%. Deployed after backend v52 (below), as required.
- Built from `main` `926e60a` (merge of #87 on top of #86); tag `play/12.13.0-52`. The built `Audexa/` tree equals `origin/main`.
- AAB sha256 `081de5af541b539258944dfcbb9105fee862bfe6f01a0ee02fc2ad28e37ddfa1`, signed with the upload key (jarsigner verified; manifest versionCode 52, versionName 12.13.0).
- Checks run: `:app:testDebugUnitTest` forced rerun (171 tests, 0 failures, includes the hard-coded-string guard and the new ServerContentLocalizationTest), `:app:bundleRelease` exit 0. Device check (Pixel 9 Pro, debug build with a `.dev` id suffix, fresh data, per-app locale es then fr, podcast language es then fr): radio screen and Home in Spanish/French, Discover section titles from the server (Ciencia, Deportes, Tecnologia; Sport, Style de vie, Technologie), no FATAL or ANR in logcat. Not tested on device: the Daily Brief player-title match and the push language path (no token reaches the server, see #86 notes). Radio "up next" topic names come from the radio server and stay English.
- Known limit: the queued-request chat line is broadcast in the sender's language to all listeners.
- Contents: category names, topic names, dates in titles and Daily Brief push text follow the listener's language; hard-coded radio chat/error strings moved to resources (machine translations, no native review). Changelog: "Category names, topic names, dates and notifications now appear in your language."
- Rollback: halt the rollout in Play Console (Production > Halt rollout), or re-upload 12.12.0 (51) as the current release; backend v52 is additive and compatible with 12.12.0.


## 2026-11-23 backend v52 (ai-radio-backend on Fly): localized server text (#86)

- Release: Fly v52, image `registry.fly.io/ai-radio-backend:deployment-01M853983BNSNXZJJGSGCC83AY`, `flyctl deploy --remote-only` from a clean detached worktree at `origin/main` `f2cf984` (squash merge of #86); `ai-radio-backend/` of the deployed tree is `origin/main`. No episode generation was running (invariant sweep clean, no generation in the previous hour); the radio stream runs on Hetzner and is not touched by this deploy. No secret was set or changed; no new env var.
- Contains: episode-title dates in the listener's language (Intl, English fallback), category names for 33 languages and topic names for the 14 catalog topics in `GET /api/topics?lang=` (same response shape; old clients unchanged), `language` accepted by `/notifications/register` and `/settings`, Daily Brief push text in 33 languages. Review fix before merge: the language is looked up as an own property only (`?lang=__proto__` used to be able to return an object as the topic name).
- Verified live: `/health` healthy; `lang=es` gives Noticias/Tecnologia/Negocios/Ciencia/Estilo de vida/Entretenimiento/Deportes, `lang=fr` French, no `lang` and `lang=__proto__` English with normal topic names; `/topics/daily-news?lang=es` Spanish; `/topics/briefing?lang=fil` 200.
- Rollback: `flyctl deploy -a ai-radio-backend --image registry.fly.io/ai-radio-backend:deployment-01M7XF6JA9QQEQFVAY8R6Y219T` (v51).


## 2026-11-21 web v24 (audexa-web on Fly, audexa.app): admin card with Gaugemint website visits (#84)

- Release: Fly v24, image `registry.fly.io/audexa-web:deployment-01M80NPXX4YAYH7SAHBJRWWDXQ` (sha256:3c0d7b032921...), `flyctl deploy --remote-only` from `web-app/` of a clean detached worktree at `origin/main` `ce2070a` (squash merge of #84); `web-app/` tree `514d5c91fddfe2764af38392762e8e152db2427c` equals `origin/main`.
- Adds a "Website visits (Gaugemint)" card to /admin: server-side read-only key, new Fly secret `GAUGEMINT_READ_KEY` (copy in Keychain `GAUGEMINT_READ_KEY_audexa.app`), admin-gated route `/api/admin/gaugemint` separate from the overview route, shown even when the radio overview fails. Landing-page visits only (the tag is on the home page). Existing secrets (`ADMIN_EMAILS`, `NEXT_PUBLIC_API_URL`) were not touched.
- Verified live: home 200, `/api/admin/gaugemint` answers 401 without a bearer token. NOT verified: the card rendering for the admin account (needs a login); check once and note it here.
- Tests before merge: 154 pass, 0 fail, `tsc` and `next build` clean.

## 2026-11-20 backend v51 (ai-radio-backend on Fly): 11 more podcast languages (wave 3), stations API

- Release: Fly v51, image `registry.fly.io/ai-radio-backend:deployment-01M7XF6JA9QQEQFVAY8R6Y219T`, deployed from a clean worktree at `origin/main` `fac2389` (merge of #80); `ai-radio-backend/` tree `36da0fc` equals `origin/main`. No episode was generating at deploy time.
- Contains: registry rows for ar ca hr ms no sk sl sr th vi zh (da skipped: no speech voice, no Danish news edition), additive `GET /api/config/languages` keys (`flag`, `dir`, `podcast`, `uiTag`), `GET /api/config/stations` (+ `/stations/:code/playlist`), `generating` state with retry hint, word-boundary speech splitting, `language-flags.js add`, `language-gate.js`. Contract: `docs/LANGUAGES.md`.
- Database: migration `016_language_flags_wave3.sql` was NOT run in SQL (no SQL editor or Supabase MCP sign-in available in the session). The same 11 rows were created through the backend's service role with `language-flags.js add` (OFF, beta, cap 2), then voices corrected with `set` (first run passed the voices wrongly because of a shell word-splitting slip; rows were still OFF and were fixed before enabling; the CLI does not reject a value that looks like an option, a known footgun). Final rows: voices `mira`/`remy`, except `ms` and `sl` `mira`/`mira` (remy does not speak them). Migration 017 (topic names) is NOT applied: apply by hand, machine-written, needs native review.
- Enable gate (`language-gate.js`: a real world-update episode through the production speech route with the backend's key, voices mira/remy, then speaking rate, transcript error rate, transcript length, repetition): PASS ca hr ms no sk sl sr vi (CER 0.001 to 0.135, 12.9 to 15.7 characters a second, no repeated token). ar th zh: the public speech route refuses them (HTTP 400 "language_code is not supported for this voice", the catalog lists studio languages en ca hr ms no sk sl sr vi only), so they stay OFF; not worked around.
- Languages ON (Beta) now: the 14 earlier ones plus ca hr ms no sk sl sr vi (22). OFF: ar th zh.
- Production check after enabling: one world-update episode per new language generated through `POST /api/topics/world-update/generate`, all completed (124 to 163 s), transcripts matched the scripts (CER 0.002 to 0.052). Stations list: en live, ja and the 8 new languages as playlist.
- Rollback: `fly deploy -a ai-radio-backend --image registry.fly.io/ai-radio-backend:deployment-01M7JYSWY3KVPSPW8N382HYTTK` (v50); one language: `language-flags.js disable <lang>`; all: `language-flags.js pause "reason"`.

## 2026-11-18 Android 12.12.0 (51) on Google Play production, 20% staged

- Play production track read back after commit: 12.12.0 (51) inProgress at userFraction 0.2, 12.11.0 (50) completed. Not raised above 20%.
- Built from `main` `44786b9` (merge of #78 on top of #75 i18n sweep, #77 hard-coded-string guard, #76 model-name neutralisation); tag `play/12.12.0-51`. The built `Audexa/` tree equals `origin/main` (later commits, if any, touch docs only).
- AAB sha256 `78fee152b68a632a69f790c22d251eb214445d3a2a33f63895d9573a45ea10d7`, signed with the upload key.
- Checks run: `:app:testDebugUnitTest` (includes the #77 guard) and `:app:bundleRelease` exit 0 on the built tree. `lintDebug` on the PR #75 tree shows 12 pre-existing errors (10 UnsafeOptInUsageError, FlowOperatorInvokedInComposition, SpecifyForegroundServiceType); lint config has `abortOnError=false` and `checkReleaseBuilds=false`, so they do not block the release; owner approved merging with them. Device check (Pixel 9 Pro, dev/debug variant of the same code built with an `.dev` id suffix, 10 locales, 0 crash/ANR, no raw tokens, Arabic mirrors): WARN for cosmetic English leftovers only ("Guest", cross-promo block, voice tier labels).
- Contents: 46 more UI strings moved into string resources (26 locales, machine translations needing native review); user-visible vendor/model names replaced by neutral wording. Changelog: "More of the app is now translated into your language."
- Rollback: halt the rollout in Play Console (Production > Halt rollout), or re-upload 12.11.0 (50) as the current release with the same API pattern.
## 2026-11-21 Web (audexa.app, Fly `audexa-web`): Gaugemint visit counter on the landing page (#82)
- Release v23, built from `origin/main` at `2ed878c` (squash merge of #82; the `web-app/` tree equals main), deployed with `flyctl deploy --remote-only` from a clean detached worktree. Verified live in a real browser: the signed-out landing page injects `<script data-domain="audexa.app" src="https://guagemint.com/js/script.js">`; the tag is absent from the server HTML by design (next/script afterInteractive) and from `/auth`, `/episodes`, `/settings`, `/about`, `/live` and from `/` when signed in (checked before merge). The audexa.app site is registered in the Gaugemint ops account (hello@guagemint.com).
- The script honours Do Not Track and Global Privacy Control (Gaugemint 5df14a5), consistent with the Settings text.

## 2026-11-17 Web (audexa.app, Fly `audexa-web`): install-referrer tags on Play links (#73)

- Release v22, image `registry.fly.io/audexa-web:deployment-01M7P0BYS83EB98A5Q3S5Z7APH`, built from `origin/main` at `d0dea49` (merge of #73); `web-app/` tree identical to main. Previous release v21 (2026-11-13) matched the last `web-app/` commit before this one (`782d18b`).
- `web-app/src/lib/playLinks.ts`: `referrer=utm_source=audexa_web&utm_medium=web&utm_campaign=<hero|cta|about|settings|llms>`. The `/live` share page keeps its own tagging (`share.ts`). Convention: growth-research/LINK-CONVENTION.md.
- Verified live: `/about` and `llms.txt` carry the tag; the home page and settings links render client-side after sign-in, so they were checked by tests (`npm test` 122 pass), not by fetching HTML.

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
