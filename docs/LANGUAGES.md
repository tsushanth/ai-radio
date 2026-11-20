# Additional podcast languages (on-demand, behind flags)

Languages: cs ro sv nl pl ru uk hu (wave 1), fi tr id el ja hi (wave 2) and ar ca hr ms no sk sl sr th vi zh (wave 3, studio voices). All are OFF
until a database flag is switched on. Danish (da) is not offered: the speech API has no Danish voice and Google News has no Danish edition. The
five existing on-demand languages (de es fr it pt) and English are not touched by any of this and keep their own path.

## Demand-driven, data-driven (wave 3 onward)

Principle: code adds a capability once, data switches it on and off. A language is generated ONLY when a listener asks for it
(`POST /api/topics/:id/generate` with `language`), never by the batch scheduler (`TTS_BACKEND=piper` keeps the batch English-only; a
unit test pins this for all 25 languages). Which languages exist for clients is the `language_flags` table: turning one on or off
needs no app release and no deploy (30 s flag cache). Station lists and the picker are derived from it.

- Wave 3 rows (migration `016_language_flags_wave3.sql`): `enabled=false`, `beta=true`, `daily_cap=2`, voices `mira` / `remy`
  (ReadAloud studio voices). `remy` does not speak Malay or Slovenian: `ms` and `sl` use `mira` for BOTH hosts (the two hosts then
  sound alike; the pipeline handles identical voices).
- Enable gate: `node dist/scripts/language-gate.js <lang>` (see "Enable gate" below). Enable only languages that pass.
- Topic names and descriptions: migration `017_topic_names_wave3.sql` (machine-written, needs native review).
- Cost guardrails, unchanged and still pooled: `LANG_GLOBAL_DAILY_CAP=30` episodes a day and `LANG_TTS_DAILY_CHARS=120000` characters a
  day for ALL additional languages together, the shared daily model budget, and a per-language cap (2 for wave 3). One language cannot
  take more than its own cap, so at most 15 languages x 2 can ask but the pool stops at 30. The studio tier is priced above the live tier
  (list 10 USD per million characters against 4): the worst-case speech cost of a pool entirely spent on studio voices is about
  120000 x 30 x 10 / 1e6 = 36 USD a month, which is why wave 3 stays capped at 2 a day per language. Proposal (not implemented): when
  more than about 10 languages are on, reserve a floor (for example 1 episode a day per enabled language) before the shared pool is
  consumed, so the first callers of the day cannot starve the rest; today the per-language cap is the only fairness rule.

## What a listener gets

- On demand only: the first listener of the day in a language triggers generation; everyone after gets the cached episode (UTC day).
  No daily batch, no radio, no Exa for these languages.
- 12 topics per language: world-update, daily-news, tech-news, science-discoveries, space-nasa, health-wellness, markets-finance,
  sports-roundup, gaming, ai-ml, eli5, simulate-this. Other topics are not listed or generated in these languages.
- Labelled Beta (the API says so: `beta: true` on the language list and on the generate answer).

## How an episode is made

1. Sources (`services/languages/sources.ts`): general news topics read the language's publisher RSS first, then Google News section
   feeds for that language's edition (`hl`, `gl`, `ceid`); other native topics use the matching Google News section (WORLD, NATION,
   BUSINESS, TECHNOLOGY, SCIENCE, HEALTH, SPORTS). gaming, eli5 and simulate-this, and any topic with fewer than 3 local stories, use
   the topic's normal English sources (headline mode: no Exa, no Reddit replies) and the script retells them in the language.
2. Script (`script.ts`): prompt in English with the target language's rules: native spoken phrasing, host names per language,
   sentences at most 170 characters (90 for Japanese), foreign names transliterated for Cyrillic, Greek, Japanese and Hindi.
   Numbers: see below. Larger-model-first for cs ro uk hu fi el. Token budget per language (3500 to 5000).
3. Speech (`tts.ts`): ReadAloud API, one voice per host, sentence-sized pieces, at most 2 requests in flight, joined and encoded once
   to a loudness-normalised MP3 by the audio pipeline (`docs/AUDIO_PIPELINE.md`). Voices come from the language's row in
   `language_flags` (default host 1 `aria`, host 2 `kai`).
4. The generator saves the episode as usual (`topic_episodes`, id `{topic}-{date}-{lang}`, path `{topic}/{date}-{lang}.mp3`).

## Numbers (per-language policy table in `services/languages/registry.ts`, field `ttsNormalize`)

The speech engine's number reading was measured per language. `normalize` is NOT sent for any of cs el fi hu ro sv uk nl pl ru tr id
ja; for hi it is sent only when the text contains Devanagari digits. So the script spells numbers, years, percentages (including
decimals), times, ordinals and phone numbers as words, with grammatical endings, and never contains digit codes. A script that still
contains any digit or one of `% $ € £ ¥ # + = °` is sent back for ONE rewrite naming the lines; digits after the rewrite fail
the episode (no speech is bought for it, the episode slot is returned). The test suite checks that every language's prompt carries the rule.

## Controls (data, no deploy)

Migration `supabase/migrations/015_language_flags.sql` (review, then apply by hand; not applied by any deploy):

| What | Where | Default |
|---|---|---|
| language on/off | `language_flags.enabled` | OFF for all 14 |
| Beta label | `language_flags.beta` | true |
| per-language episodes a day | `language_flags.daily_cap` | 8 |
| voices | `language_flags.voice` (host 1), `voice_host2` | aria / kai |
| all languages together, episodes a day | env `LANG_GLOBAL_DAILY_CAP` | 35 in code, 30 in fly.toml |
| TTS characters a day (counted per HTTP attempt, retries included) | env `LANG_TTS_DAILY_CHARS` | 150000 in code, 120000 in fly.toml |
| kill switch | `language_breaker.global_pause` (CLI `pause` / `resume`) or env `NEW_LANGUAGES=off` | off |
| flag cache | env `LANG_FLAGS_CACHE_SEC` | 30 |
| speech format | env `LANG_TTS_FORMAT` `pcm` (default) or `mp3` | pcm |

Episode slots and characters are persisted (shared by every machine, survive restarts). The breaker trips for the rest of the UTC
day when the day's characters pass the limit, and clears itself at 00:00 UTC. A 402 from the speech API (account out of credits)
sets the global pause with reason `readaloud_out_of_credits`, sends a failure report, and is never retried; it stays until `resume`.
If the tables are missing or Supabase is unreadable the backend FAILS CLOSED: every new language answers `language_unavailable`.

### What the API answers (all JSON carry `status`)

| Case | HTTP | `error` | `status` |
|---|---|---|---|
| language off, unknown, topic not offered, controls unreadable | 400 | `language_unavailable` | `unavailable` |
| kill switch or TTS breaker (new generation stopped) | 503 | `language_paused` | `paused` |
| this language or all new languages at today's cap | 429 | `daily_limit` | `daily_cap_reached` (`scope`: `language` or `global`) |
| episode already exists (even while paused) | 200 | | served, `beta` included |

`GET /api/config/languages` lists enabled languages only: `{code, name, nativeName, status: beta|on|paused, beta, wave}` plus, additively,
`flag`, `dir`, `podcast`, `uiTag?` (see "Client contract" below).
`GET /api/topics?lang=xx` is empty while the language is off, the 12 topics when on. `GET /topics/:id/episode(s)?lang=xx` is 400
`language_unavailable` while off, normal while on (also while paused).

## Client contract (additive: old clients keep working)

### GET /api/config/languages (cached 60 s)

```json
{ "success": true, "data": { "languages": [
  { "code": "cs", "name": "Czech", "nativeName": "Čeština", "status": "beta", "beta": true, "wave": 1,
    "flag": "🇨🇿", "dir": "ltr", "podcast": true, "uiTag": "cs" },
  { "code": "ca", "name": "Catalan", "nativeName": "Català", "status": "beta", "beta": true, "wave": 3,
    "flag": null, "dir": "ltr", "podcast": true },
  { "code": "ar", "name": "Arabic", "nativeName": "العربية", "status": "beta", "beta": true, "wave": 3,
    "flag": null, "dir": "rtl", "podcast": true, "uiTag": "ar" } ] } }
```

`code, name, nativeName, status, beta, wave` are exactly as before (`wave` is now 1, 2 or 3). New: `flag` (emoji or `null` when the language has
no single-country flag), `dir` (`ltr` or `rtl`; Arabic is `rtl`), `podcast` (always `true`), `uiTag` (present only when the app has a matching
interface language: ar ms th vi zh-CN and the 14 earlier ones; absent for ca hr no sk sl sr). Codes: `no` is Norwegian Bokmål, `zh` is Simplified
Chinese (Mandarin), `sr` is written in the Latin script. Only enabled languages are listed; a client must ignore unknown keys.

### GET /api/config/stations (cached 60 s)

```json
{ "success": true, "data": { "stations": [
  { "code": "en", "name": "English", "nativeName": "English", "kind": "live",
    "streamUrl": "https://radio.audexa.app/stream", "statusUrl": "https://radio.audexa.app/api/status", "enabled": true, "dir": "ltr" },
  { "code": "ca", "name": "Catalan", "nativeName": "Català", "kind": "playlist",
    "playlistUrl": "/api/config/stations/ca/playlist", "enabled": true, "dir": "ltr" } ] } }
```

- `en` is always first and is the existing live Icecast mount (`{RADIO_STREAM_BASE_URL}/stream`, status `{RADIO_STREAM_BASE_URL}/api/status`).
- Every ENABLED language that has at least one playable episode (completed, audio present, generated today or yesterday UTC, one of the 12
  launch topics) is a `playlist` station: today's on-demand episodes played back to back. No Icecast mount and no `streamUrl`.
  A language with zero audio is never listed; a language whose flag is off is never listed.
- Any error (flags or episodes unreadable) answers the English station only. Cache `max-age=60`.
- `GET /api/config/stations/:code/playlist` returns `{ "success": true, "data": { "code": "ca", "items": [{ "episodeId", "topicId", "title",
  "audioUrl", "durationSeconds", "date" }] } }`, newest first, one item per topic; 404 `station_unavailable` for a language that is off.
- Station `name` / `nativeName` are the language names; the app builds the display name ("Audexa Radio " + nativeName).

### On-demand generation: the `generating` state

`POST /api/topics/:id/generate` (and `GET /api/topics/:id/episode` while it runs) answer, for the additional languages only, with these extra
`data` keys: `status: "generating"`, `retryAfterSeconds: 45`, `generatingMessage`. The episode takes minutes (sources, script, then speech; a
studio voice that was idle also needs about 45 s to start), so the client polls `GET /api/topics/:id/episode?lang=xx` every `retryAfterSeconds`.
Refusals are unchanged: 400 `language_unavailable`, 503 `language_paused`, 429 `daily_limit`.

## Enable gate (before `language-flags.js enable <lang>`)

`node dist/scripts/language-gate.js <lang>` builds ONE real episode through the production path (local-language sources, a real script for a
launch topic, the ReadAloud speech client posting to `https://api.readaloudai.org/v1/text-to-speech` with the backend's key and the language's
studio voices), encodes it as the generator does, transcribes it and checks: script length (a real paragraph, 1200+ characters), speaking
rate over the whole episode and per line (a looping voice makes audio far longer than the text), transcript character error rate (at most
0.30), transcript length against the script, and repetition (no token repeated back to back, no repeated phrase, no dominant token). All must
pass. The flag row and the caps are not touched. Machine only: nobody listens (Beta label stays).

## Worst-case monthly cost (with the fly.toml caps)

Speech: 120000 characters a day x 30 days x 4 USD per million characters = 14.4 USD (the character breaker is exact: retries are counted).
Script model: at most 30 episodes a day x about 0.004 USD (one call, larger model, about 5K tokens in and 3K out) x 30 = about 3.6 USD; the
shared daily model budget (3 USD, 600 calls) stays on top of it. Total about 18 USD, under the 19 USD ceiling. The code defaults (35 and
150000) would give about 21.6 USD, which is why fly.toml sets lower values.

## Operating it

```
fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js status"
fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js enable cs"          # Beta stays on
fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js set cs --cap 4"
fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js disable cs"
fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js pause \"reason\""   # all languages
fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js resume"
```

Or SQL: `UPDATE language_flags SET enabled = true WHERE language = 'cs';` (visible within `LANG_FLAGS_CACHE_SEC`).

Turning a language on: wave 1 first, one language at a time, after a quality check of real episodes (listen to three, run a full-episode
speech-to-text round trip), then watch `status` for the day's characters, cap hits and failures.

## Rollback

- One language misbehaves: `disable <lang>` (it vanishes from the list; stored episodes are no longer listed).
- Spend or quality problem anywhere: `pause`. Existing episodes keep playing. Or set `NEW_LANGUAGES=off` (restart).
- Revert the code: redeploy the previous release. The tables can stay; the old code ignores them.
- Remove the schema: the ROLLBACK block at the top of the migration.

## Deploy plan

1. Review and merge the audio pipeline PR first (ffmpeg in the image, MP3 episodes). Deploy the backend.
2. Review and apply migration 015 by hand in the AIRadio Supabase project (no language is on after it).
3. Set ONE new secret on `ai-radio-backend`: `READALOUD_API_KEY` (a dedicated key for this app). Existing secrets are not changed.
   Optional env: `LANG_GLOBAL_DAILY_CAP`, `LANG_TTS_DAILY_CHARS`, `LANG_TTS_FORMAT`, `READALOUD_API_URL`.
4. Deploy the backend from main (quiet hour: deploys drop in-flight generations).
5. Check with `language-flags.js status`, then enable wave 1 languages one at a time. The Android app reads `GET /api/config/languages`.

## Not done / known gaps

- Wave 3 topic names are machine-written and not native-reviewed. Sports Roundup is not offered in any additional language today (its row lists `en` only).
- Wave 3 Google News: Croatian has no edition (every `hl=hr` request answers the US English edition), so `hr` reads publisher feeds (Index.hr, N1, Jutarnji list) for
  world and daily news and retells the English sources for the other topics.
- The earlier "Not done" items below still apply to wave 3.

- Topic names and descriptions are not translated: an episode title in these languages is the English topic name plus the date in the
  language. A `localized_names` data migration is the follow-up.
- Ask the hosts is not offered in these languages (its language list is the Piper languages).
- No judge-model pass on scripts and no human listening: ship as Beta; quality of Ukrainian vs Russian, Finnish/Hungarian/Czech/Polish
  case endings, Japanese readings and Hindi code-mixing is unmeasured over a full episode.
- Per-language speech speed and long-form stability were not measured by the engine owner.
- Google News RSS terms are not a commercial licence (same practice as the English path today); outlet is named, no quotes.
- Android: the app needs the server-driven language list, the Beta tag and the picker changes (separate work).
