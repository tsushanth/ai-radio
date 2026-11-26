# What is deployed (Audexa)

Newest first. Parity rule: whatever runs in production is on `main` (tree compared for the deployed paths).


## 2026-11-26 web v25 and backend v55: tap-to-play on the home page, test-device flag (#104)

- Database first: migration `019_analytics_test_flag` applied to `lxtuvvsrtpoqgikbpasm` (adds `analytics_events.is_test`, a partial index and the view `analytics_events_real`; additive). Checked: 1268 rows before and in the view; `anon` and `authenticated` cannot read the view.
- Backend: Fly v55, image `registry.fly.io/ai-radio-backend:deployment-01M8CPWGJR6JZQ3YDHPQYESWXP`, `flyctl deploy --remote-only` from `ai-radio-backend/` of a clean detached worktree at `origin/main` `c83c373`; tree `acccfa4c1fd39bfc684b39cbead5b3830c72f0cf` equals `origin/main`. No episode, ask, batch, suggestion or podcast job in flight.
- Web: Fly v25, image `registry.fly.io/audexa-web:deployment-01M8CPYF438RDVM2HH0E9R03ZD`, same worktree, `web-app/`; tree `f54858e0325eb4a4cb22a7150f2ee11966032751` equals `origin/main`.
- `audexa-radio` was not deployed. No secret set or changed.
- Verified live: a headless browser on audexa.app tapped the item, audio played (about 1.9 s to start, still playing after 34 s), and `home_play_shown`, `home_play_tap`, `home_play_started`, `listen_progress` arrived marked `is_test` and absent from `analytics_events_real`; `test_device: "yes"` answers 400. Backend 503 tests, web 156 tests.
- NOT verified: iOS Safari, a physical phone.
- No Android release sends `test_device` yet, so Android testers are still counted.
- Rollback: web `flyctl deploy -a audexa-web --image registry.fly.io/audexa-web:deployment-01M80NPXX4YAYH7SAHBJRWWDXQ` (roll the web back before the backend); backend `flyctl releases rollback 54 -a ai-radio-backend`; database `ai-radio-backend/supabase/rollbacks/019_analytics_test_flag_down.sql` (after the backend).


## 2026-11-26 radio v15 (audexa-radio-fly): rotate the whole ready pool instead of looping five segments (#102)

- Fault: new segments are made mostly at the four daily orchestrator restarts. Once the play queue drained, reconcile re-queued the newest five each time, so for hours the station looped about 20 minutes of audio (14:00 to 15:40 UTC the same segments came round about every 20 minutes; the log shows the same re-push through 11-25 as well).
- Release: Fly v15, image `registry.fly.io/audexa-radio-fly:deployment-01M8C8FSH18S1D4Y9VZ2PES8XH`, `flyctl deploy . -c fly/fly.toml --dockerfile fly/Dockerfile -a audexa-radio-fly --remote-only --ha=false` from `audexa-radio/` of a clean detached worktree at `origin/main` `0ce8518`; the `audexa-radio/` tree `43f510c` equals `origin/main`. Before: live files matched the previous `main`, 0 listeners, no pending request. No secret was set or changed.
- Verified: live files match `origin/main` (30 md5), health check passing, `/stream` 200 within about 40 s of the restart, `reair_gap_sec` present in `/api/scheduler-health`, and the new selection run read-only on the live ready pool picks the segments queued longest ago. NOT verified live: an actual re-air by the new code (the queue was full of new segments after the restart; covered by `tests/test_reair.py`).
- Deploy cost: the restart's usual 20-segment fill, about $0.02 of script generation.
- Generation volume is unchanged, so repeats remain: the rotation spreads them over the whole pool (about 3 h) instead of 20 minutes.
- Rollback: `flyctl deploy -a audexa-radio-fly --image registry.fly.io/audexa-radio-fly:deployment-01M8A01QDW8QB5BCNAE8ETV7K6` (v14).


## Android: merged, NOT released (next release: 12.13.3, versionCode 55)

- On-device voice download no longer crashes the app on Android 14+. 54 and earlier start a `dataSync` foreground service that the manifest does not declare, so turning the on-device voice on crashes the app, and it crashes again each time the pending download restarts. From Android 14 the download now runs as ordinary background work (no progress notification; in-app progress stays); Android 13 and older are unchanged. No new permission, no Play foreground-service declaration needed.
- A media button that starts the playback service with nothing to play no longer crashes the app (`startForegroundService() did not then call Service.startForeground()`, reported once from 12.13.1 on Android 11, 2026-11-25 18:29 UTC; the code is the same in 54). Cause reproduced on an Android 11 emulator: play, pause, process killed, headset play button. Media3 1.3.1 has no playback resumption here and never goes foreground. The service now answers such a start and stops. Pressing the button still does not resume playback.
- Checks for that: before the fix the crash on Android 11 (headset button) and Android 14 (the same intent sent by a temporary harness); after it no crash on either, and play/pause with headset keys still works. `:app:testDebugUnitTest` 192 tests, 0 failures (9 new runs); `:app:compileReleaseKotlin`; `:app:lintDebug` still 11 errors. Not tested on a physical device or the Infinix model.
- Checks: `:app:testDebugUnitTest` 183 tests, 0 failures; `:app:compileReleaseKotlin`; `:app:lintDebug` 0 fatal, 11 errors (10 media3 opt-in markers in `AudioPlaybackService.kt`, 1 `FlowOperatorInvokedInComposition` in `MainActivity.kt`; judged not to be runtime faults, unchanged).
- Device (Pixel 9 Pro, API 37, side-by-side debug build, download started by a temporary harness, not through the settings screen): before the fix, `IllegalArgumentException` from `SystemForegroundService` and a repeat crash on restart; the fixed build installed over it finished the pending download (86,033,585 bytes) with no crash. The release AAB was not built or installed.


## 2026-11-25 Android 12.13.2 (54) on Google Play production, 20% staged

- Play production track read back after commit: 12.13.2 (54) inProgress at userFraction 0.2, 12.13.1 (53) completed. Beta, alpha and internal moved to 54 completed (they held 53). Uploaded with the Play edit API. Not raised above 20%.
- Built from `main` `1f15027` (#98, version bump only on top of `8a6d6c3`); tag `play/12.13.2-54`. Built in a clean detached worktree of exactly that commit; the `paywallkit`, `ratingkit` and `crosspromokit` library modules come from their local checkouts, as before.
- AAB sha256 `a6fa9d19706508858619754493564223ce5ee40813748847b32cb08776b41239`, signed with the upload key (`jarsigner -verify` ok), manifest 12.13.2 (54), targetSdk 36, Play Billing 8.3.0, no permission added compared with the Play-generated APK of 53.
- Release note (en-US): "The topic list now updates when you change the podcast language, and topics a language does not offer no longer show Generate. Notification settings no longer mention scheduled briefs."
- Contents: #96 (reload topics on a podcast language change; no Generate for a topic the language does not offer; fresh Google token before the Daily Brief; no scheduled-brief wording in notification settings).
- Checks: `:app:testDebugUnitTest` 181 tests, 0 failures; `:app:bundleRelease`. `:app:lintDebug` reports 1 fatal and 11 errors, all in files unchanged since 12.13.1: `SpecifyForegroundServiceType` in `KokoroDownloadWorker.kt` (the merged manifest declares no dataSync foreground service type, so the offline voice download probably crashes on Android 14+ if that path is reachable; not reproduced), `UnsafeOptInUsageError` in `AudioPlaybackService.kt`, `FlowOperatorInvokedInComposition` in `MainActivity.kt`.
- NOT verified: any device run. The Gmail token refresh for the Daily Brief has never run against a real linked account.
- Rollback: halt the rollout; 12.13.1 (53) stays completed. Promotion to 100% needs a 24-48 h crash and ANR review first.

## 2026-11-25 Database: row-level security hardening (Supabase `lxtuvvsrtpoqgikbpasm`)

- Applied to production before this was committed, as migration `018_close_open_policies` (`ai-radio-backend/supabase/migrations/018_close_open_policies.sql`). No deploy, no data change, no secret change.
- Five server-only tables lost every client grant and their over-broad policy; client write grants removed from four server-written tables; five database functions are now callable by the server only.
- Verified with role checks in transactions that were rolled back: client roles refused; public catalogue reads and server access still pass.
- Reverse: `ai-radio-backend/supabase/rollbacks/018_close_open_policies_down.sql` (restore only the single object that is needed).


## 2026-11-25 radio v14 (audexa-radio-fly): no contact details in the public feed; upcoming plays from Liquidsoap (#94)

- Release: Fly v14, image `registry.fly.io/audexa-radio-fly:deployment-01M8A01QDW8QB5BCNAE8ETV7K6`, `flyctl deploy . -c fly/fly.toml --dockerfile fly/Dockerfile -a audexa-radio-fly --remote-only --ha=false` from `audexa-radio/` of a clean worktree at `origin/main` `f84e834`; the `audexa-radio/` tree `66d4342` equals `origin/main`. Before the deploy the live files matched the previous `main` byte for byte, there were 0 listeners and no queued request. No secret was set or changed.
- Data change (18:29 UTC, before the deploy): one listener-request segment whose topic was an email address was published by `/api/status` and `/api/upcoming-plays`. Its two files were moved from `/data/queue/ready/` to `/data/quarantine/pii-2026-11-25/`: segment id `0_1795592289945_listener_request` (`.mp3`, `.json`). Reverse by moving them back. The ready directory would have expired them after 12 h; nothing expires the quarantine copy, so delete it once it is not needed.
- Verified live: speech on air, `now_playing` names the topic, `/api/upcoming-plays` lists only queued segments with times about one segment apart, a request containing an address answers `personal_info` and neither access log keeps the query string, `/api/request-health` answers.
- Old Android builds (versionCode 40 and lower) call `178.156.192.31:8081`, a server deleted on 2026-11-07. Nothing here reaches them; only an app update does.
- Rollback: `flyctl deploy -a audexa-radio-fly --image registry.fly.io/audexa-radio-fly:deployment-01M796529PQV6P0SD6TY73DXCW` (v13).


## 2026-11-25 backend v54 (ai-radio-backend): all launch topics listed, topicOffered flag, token cache, suggestion check (#95)

- Release: Fly v54, image `registry.fly.io/ai-radio-backend:deployment-01M8A0AMW2QE70P3ZTKNNYM2Y3`, `flyctl deploy --remote-only` from a clean worktree at `origin/main` `daf3dea`; the `ai-radio-backend/` tree `c36799a` equals `origin/main`. No episode, ask, batch or suggestion job was in flight. No secret was set or changed.
- Verified live: `/health` 200; `GET /api/topics?lang=ja` and `el` list 12 topics (sports-roundup included); `GET /api/topics/us-politics/episode?lang=el` has `topicOffered: false`; a suggestion containing an address answers 400.
- Rollback: `flyctl releases rollback 53 -a ai-radio-backend`.


## Android: merged, NOT released (next release: 12.13.2, versionCode 54)

- Reload topics on a podcast language change; no Generate for a topic the language does not offer; fresh Google token before the Daily Brief; no scheduled-brief promise in notification settings. Unit tests 181 passed. Not checked on a device: in particular the Gmail token refresh has never run against a real linked account.


## 2026-11-23 Android 12.13.1 (53) on Google Play production, 20% staged

- Play production track read back after commit: 12.13.1 (53) inProgress at userFraction 0.2, 12.13.0 (52) completed. Not raised above 20%.
- Built from `main` `071ff3f` (merge of #92 on top of #89 and #90); tag `play/12.13.1-53`. Tree identical to `origin/main`.
- AAB sha256 `bdbb161eea4b73c0a6189cff492df09e6b78593a0608b42ec0b8fcaaf7154a2c`, signed with the upload key (`jarsigner -verify` ok), manifest versionName 12.13.1. Checks run: `:app:testDebugUnitTest` (179 tests, 0 failures) and `:app:bundleRelease` exit 0.
- Device check (Pixel 9 Pro, side-by-side `.dev` debug build of the same tree, per-app language, system language untouched): zh-TW and zh-HK show Traditional characters (zh-TW 信箱 / 電臺, zh-HK 郵箱 / 電台), zh-CN still Simplified, es and en unaffected; home, profile, settings, discover and the radio player checked; no FATAL or ANR in logcat. The release AAB itself was not installed.
- Contents: Traditional Chinese (zh-TW, zh-HK, script fallback `b+zh+Hant`) for the app and its language picker (#89, #90). Server side already live as backend v53.
- Rollback: halt the rollout in Play Console (Production > Halt rollout).


## 2026-11-24 backend v53 (ai-radio-backend on Fly): Traditional Chinese server text (#89, #90)

- Release: Fly v53 (previous v52, image `registry.fly.io/ai-radio-backend:deployment-01M853983BNSNXZJJGSGCC83AY`), image `registry.fly.io/ai-radio-backend:deployment-01M85HM2DJ09Y0RQBKJV79DE0C`, `flyctl deploy --remote-only` from a clean detached worktree at `origin/main` `5e0af90` (#89 and #90); the `ai-radio-backend/` tree `a62f929` equals `origin/main`. No episode generation was running (last job finished 01:01 UTC, deploy 01:10 UTC; invariant sweep clean). The radio stream runs on Hetzner and was not touched. No secret was set or changed; no new env var.
- Contains: zh-TW / zh-HK category, topic and push-copy tables (Taiwan wording sweep in #90), Traditional entry for `zhongguo-xinwen`, `normalizeLanguage` keeps the Chinese script, `formatEpisodeDate` zh-TW / zh-HK locales, `/api/topics/briefing` accepts zh-TW / zh-HK, own-property language-name maps (`constructor` / `__proto__` safe).
- Verified live: `/health` 200; `GET /api/topics/world-update?lang=zh-TW` gives 世界動態, `lang=zh-HK` 世界動態, `lang=zh` 世界动态 (Simplified unchanged); markets-finance and space-nasa Traditional for zh-TW / zh-HK; `lang=constructor`, `__proto__`, `toString` return the English name with 200 on `/api/topics`, `/api/topics/:id` and `/api/topics/briefing` (never 500); no-lang requests unchanged (35 topics). Briefing is a read-only Supabase read (no LLM); zh-TW / zh-HK return 200 with an empty list, as `fil` does, because no Chinese episodes exist.
- Behaviour to know: `GET /api/topics?lang=zh-TW` and `lang=zh-HK` now return an empty list, the same as `lang=zh`, because they follow the `zh` language gate and `zh` is not switched on (`/api/config/languages` does not list it). Before this deploy they bypassed the gate and returned the full list in Simplified names. The app sends `zh-TW` only when Chinese is the podcast language, which cannot be picked while `zh` is off. The Traditional category and topic list therefore becomes visible when `zh` is enabled with `language-flags.js enable zh`; that was not done here (it starts paid generation).
- Rollback: `flyctl releases rollback 52 -a ai-radio-backend` (or `flyctl deploy -a ai-radio-backend --image registry.fly.io/ai-radio-backend:deployment-01M853983BNSNXZJJGSGCC83AY`). v53 is additive; the Android app does not depend on it.


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
