# Audexa: what the code does with user data (evidence for the privacy policy and Play Data safety drafts)

DRAFT, for owner review. Not legal advice. Written 2026-11-07 from `origin/main` at f62949d, plus read-only checks of the live
database metadata and the Fly app's secret NAMES (never values). Paths are relative to the repository root; `file:line` points at
the statement that supports the sentence. Anything the code cannot prove is marked **NOT VERIFIED** with what to check.

Repository map: `Audexa/` Android app, `web-app/` Next.js web app (audexa.app), `ai-radio-backend/` Express API on Fly
(`ai-radio-backend`, region iad, `ai-radio-backend/fly.toml:2`), `audexa-radio/` live radio (icecast + orchestrator on Fly app
`audexa-radio-fly`, `audexa-radio/fly/fly.toml:1`). Database and file storage: one Supabase project (Postgres, Auth, Storage, Realtime).

## 0. Which features are switched on in production

The backend reads feature switches from Fly secrets. I listed the secret names (read-only; values are never shown):
`ANALYTICS_ENABLED`, `ASK_HOSTS_ENABLED` and `TOPIC_SUGGEST_PROCESSING` all exist as secrets on `ai-radio-backend`. The live
database already contains the tables `analytics_events` and `ask_episodes` with a few rows each, with row security on and no
privileges for the public roles. So these three features are live, not just merged. **NOT VERIFIED**: the secret values (set a value
of `true`/`on` or something else); the owner can check with `flyctl ssh console -a ai-radio-backend -C "printenv ANALYTICS_ENABLED"`
or by looking for rows arriving.

Text-to-speech for episodes made by the backend: `TTS_BACKEND = "piper"` (`ai-radio-backend/fly.toml:9`), a Piper server reached
over Fly's private network (`PIPER_URL`, `ai-radio-backend/fly.toml:10`). No `ELEVENLABS_API_KEY` secret exists. `OPENAI_API_KEY`
exists as a secret, but nothing in the live path calls OpenAI: the file named `openai.tts.ts` only keeps OpenAI-style voice names and
calls the self-hosted worker (`ai-radio-backend/src/services/tts/openai.tts.ts:2-3`, `:67`, and `:11-12` Piper map). Edge TTS is
used only by the radio orchestrator for non-English streams (`audexa-radio/orchestrator/edge_tts_client.py`); the Fly config pauses
all languages except English (`audexa-radio/fly/fly.toml:10-11`), so **NOT VERIFIED** whether any text goes to Microsoft's speech
service today (owner: check `RADIO_LANGUAGES_ACTIVE` on `audexa-radio-fly`).

## 1. Sign-in and account

| Item | Evidence |
|---|---|
| Android sign-in is Google Sign-In (name, email, profile, ID token) and the ID token is exchanged for a Supabase Auth session | `Audexa/app/src/main/java/com/kreativekoala/audexa/data/repository/AuthRepository.kt:41-49`, `:84-87` |
| The user id used everywhere in the backend IS the email address | `AuthRepository.kt:93-98` (`userId = email`); backend tables key on `user_email` (`ai-radio-backend/src/db/migrations/002_linked_accounts.sql:12`) |
| Guest mode: `guest_<timestamp>`, no email, nothing sent | `AuthRepository.kt:251-266` |
| Web "Get Started" signs in locally as the shared identity `guest@audexa.app`; no server call, no Google sign-in on the web | `web-app/src/app/auth/page.tsx:13-17` |
| Supabase Auth keeps a user record (email, name, avatar from Google) for Android Google sign-ins | `AuthRepository.kt:84-87` (live database: the Auth user table is populated) |
| Local data on the phone: user id/email/name, preferences, bookmarks, hidden topics, language (DataStore) | `Audexa/app/src/main/java/com/kreativekoala/audexa/data/local/PreferencesManager.kt` |
| Android backup is allowed, so Android may copy this app data to the user's Google backup | `Audexa/app/src/main/AndroidManifest.xml:16` (`allowBackup="true"`) |

## 2. Linked Gmail and Google Calendar (optional)

| Item | Evidence |
|---|---|
| Scopes asked: `gmail.modify` (read AND modify mail) and `calendar.readonly` | `AuthRepository.kt:36`, `:38`; web: `web-app/src/app/(dashboard)/settings/page.tsx:141,147` |
| What is stored: the OAuth access token (Android sends an EMPTY refresh token; the web flow asks for offline access and stores a refresh token) in table `linked_accounts` (`user_email`, `oauth_email`, `access_token`, `refresh_token`, `expires_at`, `scopes`) | `AuthRepository.kt:153,225`; `ai-radio-backend/src/services/auth/gmail.auth.ts:59`; `ai-radio-backend/src/services/auth/token.manager.ts:83-91,272-280`; table `ai-radio-backend/src/db/migrations/002_linked_accounts.sql:16-37` |
| Tokens are stored as plain text columns; the migration itself says they "should be encrypted in production" | `002_linked_accounts.sql:17-19` |
| What is read from Gmail when a briefing is made: the full message (`format: 'full'`), then sender, subject, snippet and the first 500 characters of the body | `ai-radio-backend/src/services/email/gmail.service.ts:181`, `:205-232`, `:280` |
| How body text is used: subject + snippet + body preview are searched for action items | `ai-radio-backend/src/services/email/email.utils.ts:206` |
| What goes to the language model (Anthropic, `claude-sonnet-4-6`): the part of the address before the @ as the user's name, up to five email highlights (sender name part, subject, snippet start), up to five action items, and today's calendar: next event title and location, up to four key meeting summaries | `ai-radio-backend/src/services/ai/script.generator.ts:41`, `:187`, `:203`, `:84-142`, `:503` |
| Raw email text is held in memory for the request; a spoken briefing MP3 is stored (see section 3). The code that would save the briefing row to the database is commented out. | `ai-radio-backend/src/services/podcast/podcast.generator.ts:613`; live table `podcast_episodes` is empty |
| Server logs contain the user id (email) for linking and generation (`Found N linked accounts for user <id>`, `Linked account created: google - <email>`, `Generating brief for user: <id>`) | `ai-radio-backend/src/routes/linked-accounts.ts:56,109-110`; `ai-radio-backend/src/services/scheduler/daily-brief.scheduler.ts:187` |
| Android "Unlink" / "Disconnect" only flips local flags. It does not call the server and does not remove or revoke the stored token | `Audexa/app/src/main/java/com/kreativekoala/audexa/ui/navigation/LinkedAccountsViewModel.kt:221-257`; the server route that looks like it would is a stub that only logs: `ai-radio-backend/src/routes/linked-accounts.ts:192-233` |
| Web "Disconnect" calls `DELETE /auth/revoke/<provider>`, which revokes with Google and deletes the stored row | `web-app/src/lib/api/episodes.ts:145-150`; `ai-radio-backend/src/services/auth/token.manager.ts:303-345` |
| Outlook/Microsoft exists in the backend only; Android shows "coming soon" | `Audexa/app/src/main/java/com/kreativekoala/audexa/ui/navigation/LinkedAccountsScreen.kt:278-290` |
| The scheduled (server-side) morning brief only runs for rows in `user_settings` that hold device tokens; Android has no push registration | `daily-brief.scheduler.ts:131-143`; `Audexa/app/src/main/java/com/kreativekoala/audexa/service/RadioReminderManager.kt:31-34`. Live table: no row has a device token. |
| Who can read tokens: the backend (service key). The public roles hold no privileges on `linked_accounts` | live database check (grants empty for `anon`, `authenticated`) |

## 3. Briefing audio files

`podcastGenerator` uploads the finished MP3 to the Supabase Storage bucket `podcasts` (private), at path `<user email>/<timestamp>.mp3`,
and returns a signed link valid for one year (`ai-radio-backend/src/services/storage/storage.service.ts:33`, `:119-123`, `:167`).
The only cleanup is the scheduled job's "delete yesterday's audio" (`daily-brief.scheduler.ts:191`, `:241-280`). Delete Account does
not delete these files (`ai-radio-backend/src/routes/user.ts:222-320` touches `linked_accounts`, `podcast_episodes`, `users` only).
Live bucket check: the `podcasts` bucket holds files named after email addresses, the oldest from December 2025, with no expiry.
Because the audio is a spoken summary of emails and calendar items, this is personal data that stays after "Delete Account".

## 4. Ask the hosts

| Item | Evidence |
|---|---|
| Input: free text 8 to 200 characters, a language, and a random install id (web: `w` + 24 random characters in localStorage `audexa-ask-install`; the Android app has no Ask screen on main) | `ai-radio-backend/src/services/ask/ask.router.ts:59,64`; `web-app/src/lib/ask.ts:10,17-23`; migration `ai-radio-backend/supabase/migrations/012_create_ask_episodes_table.sql:24` (max 200) |
| Stored in `ask_episodes`: install id, the exact request text, language, status, reason, title, description, audio url, duration, headline sources, the generated script, token and speech-second counts | `012_create_ask_episodes_table.sql:21-41`; `ai-radio-backend/src/services/ask/ask.runtime.ts:38-44,52-68` |
| Retention: none in code. No job deletes rows or audio; the table and the audio files stay until someone deletes them. Delete Account does not touch them. | grep for deletes in `ai-radio-backend/src/services/ask/` and `ai-radio-backend/src/routes/ask.ts` finds none; `user.ts:222-320` |
| Sent to Anthropic: (1) review call with the exact text and language, model `claude-haiku-5-5`; (2) script call with the exact text, language and headlines, model `claude-sonnet-4-6` | `ask.runtime.ts:106-119`; `ask.ts:121-122`, `:545`; `ask.ts:199-207` (review prompt) |
| Sent to Google News: only a 2 to 6 word search query that the review model wrote (not the raw text), as a public RSS search request from our server | `ask.ts:237`, `:247-249`, `:533`; `ai-radio-backend/src/services/scheduler/topic-suggest.ts:284-287` |
| Speech: the script text goes to our own Piper/TTS server | `ask.runtime.ts:146-153`; `ai-radio-backend/src/services/tts/openai.tts.ts:67` |
| The finished episode is uploaded to the PUBLIC bucket `topic-podcasts` under `ask/<id>.mp3`; anyone who has the link can play it. The share page `https://audexa.app/ask/<id>` is public, not indexed (`robots: noindex`) and shows title, description, sources | `ask.runtime.ts:19,154-158`; `web-app/src/app/ask/[id]/page.tsx:7,35-41`; public API view `ask.ts:601-617` never returns the request text or install id |
| The id in the link is a random UUID (not guessable) and responses for finished episodes may be cached for 5 minutes | `ask.router.ts:16,112` |
| Caps (not retention): per install 3/day, per IP 5/day (memory), 15/day global, token ceiling | `ask.ts:109-112` |
| The generated audio and title are derived from the user's text, so the public episode can reveal what the person asked about even though the exact text is not shown | `ask.ts:545` |
| Moderation is by rules plus the review model; it rejects private individuals and personal data | `ask.ts:199-207` |

## 5. Suggest a topic

| Item | Evidence |
|---|---|
| Input: topic name (3 to a configured max), optional description, language. Neither the Android app nor the web app sends a user id | `Audexa/app/src/main/java/com/kreativekoala/audexa/data/remote/ApiService.kt:370-374`; `web-app/src/lib/topic-suggest.ts:2-3`; `ai-radio-backend/src/routes/topics.ts:96-152` |
| Stored in `topic_requests` (`topic_name`, `description`, `language`, `status`, `error`, timestamps, `user_id` which is null for these clients). Live check: no stored suggestion has a user id | `ai-radio-backend/src/routes/topics.ts:147-153`; migration `supabase/migrations/002_create_topic_requests_table.sql:4-15` |
| Retention: none in code, rows are kept (the oldest is from March 2026) | no delete in `ai-radio-backend/src/services/scheduler/topic-suggest*.ts` |
| Sent to Anthropic (`claude-haiku-5-5`): name, description and language, plus the list of existing topic names; no user id | `ai-radio-backend/src/services/scheduler/topic-suggest.scheduler.ts:152-158` |
| If accepted, a PUBLIC topic is created from the model's cleaned-up name and description; a news search query written by the model is sent to Google News to check coverage | `topic-suggest.ts:387-396` |
| Per-IP cap in memory only (5/day) | `topics.ts:41-50` |
| Because there is no user id, a person cannot be matched to their row; deletion needs the exact text | live check + `topics.ts:151` |

## 6. Episodes on demand in other languages (es, fr, de, it, pt) and topic episodes

Pressing "generate" sends the topic id and language (and a user id the clients may include, which the generator receives but the code
reviewed does not store: `ai-radio-backend/src/routes/topics.ts:533-536,575`). The script is written by Anthropic from news
headlines, spoken by Piper on our Fly machines, and cached as a shared episode in `topic_episodes` and the public bucket
`topic-podcasts`. No user text is involved. There is no expiry for non-English episodes in code (`docs/ON_DEMAND_LANGUAGES.md:20`
describes it as a proposal).

News sources the backend reads (no user text): Google News RSS searches built from topic keywords, a list of publisher RSS feeds,
Reddit (public Atom feeds), Hacker News API (`ai-radio-backend/src/services/content/aggregator.service.ts`, `reddit.rss.ts`).

## 7. Live radio (Android and web)

| Item | Evidence |
|---|---|
| Stream: `https://radio.audexa.app/stream` (Fly app `audexa-radio-fly`) | `Audexa/app/src/main/java/com/kreativekoala/audexa/ui/radio/LiveRadioViewModel.kt:85` |
| Listener counts only are sampled, no IPs, kept 30 days | `audexa-radio/orchestrator/listener_sampler.py:1-8,27` |
| Chat and emoji reactions: sent as Supabase Realtime broadcast on channel `radio:live`; every connected listener receives them; the sender name is the fixed word "Listener" on Android; nothing in the code stores broadcasts | `LiveRadioViewModel.kt:120,215-232`; `web-app/src/components/live/LiveChat.tsx:21-48` |
| "Request a topic" (and any chat message containing `@audexa`): the text is sent as a URL query to `https://radio.audexa.app/api/request-topic?topic=...` (POST, no login) | `LiveRadioViewModel.kt:298`; `audexa-radio/orchestrator/main.py:782-792` |
| The server validates length and keywords only (it does not reject email addresses or phone numbers) and queues the text; an LLM writes a segment about it and it is read on air for everyone | `audexa-radio/orchestrator/retell_handler.py:83-118`; `audexa-radio/orchestrator/main.py:199-221` |
| The queue, including requested topic text, is readable by anyone at `https://radio.audexa.app/api/status` and `/api/upcoming-plays` | `audexa-radio/orchestrator/main.py:668-707,717-780` (field `topic_name` for `listener_request` items); confirmed with a live request, which showed a test request in clear text |
| The radio script model is OpenRouter (default `openai/gpt-6-luna`, fallback another OpenAI model through OpenRouter), a local Ollama model, or a `claude` command line if present. So requested topic text reaches OpenRouter and the model vendor behind it | `audexa-radio/orchestrator/script_generator.py:3-5,32-47`; `audexa-radio/fly/fly.toml:13-14`; `audexa-radio/fly/README.md:3-5` |
| The proxy writes an access log line per request to the container log, and the request line includes the query string (so the requested topic text) | `audexa-radio/fly/nginx.conf:7` (default log format). **NOT VERIFIED**: how long Fly keeps container logs. |
| Phone call-in: the orchestrator accepts webhooks from two voice-agent services (Retell, Calldesk) and takes the caller's number (`from_number`) with the topic into an in-memory queue | `audexa-radio/orchestrator/retell_handler.py:140-160`; `audexa-radio/orchestrator/calldesk_handler.py`; `audexa-radio/orchestrator/queue_manager.py:24,51-58`. **NOT VERIFIED**: whether a public phone number for this exists today; nothing in the apps shows one. |
| Premium gating: the Android request sheet asks for a paid plan, but every user is treated as subscribed (see 9) | `LiveRadioViewModel.kt:281-286`; `Audexa/app/src/main/java/com/kreativekoala/audexa/billing/BillingManager.kt:41-45,202` |

## 8. Anonymous usage statistics (`POST /api/events`)

Everything in `docs/DATA-COLLECTION.md` is confirmed against the code, with these additions and corrections:

* Allowlisted events and properties: `ai-radio-backend/src/lib/analytics.ts:79-97`. Stored columns: `received_at`, `install_id`, `platform`, `app_version`, `name`, `props`, `day` (`ai-radio-backend/supabase/migrations/011_create_analytics_events.sql:26-35`). Insert: `ai-radio-backend/src/routes/events.ts:33`.
* Retention 180 days, daily delete: `events.ts:41-48,57-63` (runs only while the switch is on).
* The install id is generated by the app/browser (`Audexa/app/src/main/java/com/kreativekoala/audexa/analytics/AnalyticsEngine.kt:210-214`; `web-app/src/lib/analytics.ts:26`). The opt-out switch deletes it (`AnalyticsEngine.kt:108-116`).
* **Correction 1.** The Android app ALSO sends a second, separate random install id to `POST /api/notifications/event` for the morning-reminder funnel (events such as `briefing_optin_shown`, `language_picked`). It is NOT covered by the analytics switch (no check in `BriefingManager.kt:139-158`) and it is not removed when analytics is switched off. The backend writes one log line per event with the id (`ai-radio-backend/src/routes/notifications.ts:314-330`); nothing goes to the database. Log retention: **NOT VERIFIED** (Fly).
* **Correction 2.** Crash and failure reports are separate from the switch (see 10). `docs/DATA-COLLECTION.md` already says they are "separate and unchanged", but the in-app switch text says "usage statistics" only, so users could think it also stops crash reports.
* **Correction 3.** The web Ask feature keeps its own random id (`audexa-ask-install`) which the analytics switch does not clear.
* IP address: the analytics code does not read or store it (`events.ts:15-27` uses it as an in-memory rate-limit key). Express has no request logger configured (`ai-radio-backend/src/index.ts`). **NOT VERIFIED**: whether the Fly proxy keeps connection metadata.
* Live state: the table exists with row security on and no privileges for `anon` or `authenticated`.

## 9. Purchases and billing SDKs (Android)

* RevenueCat Purchases SDK is configured at app start with a public SDK key (`AudexaApplication.kt:50-52`), sets two attributes (`app_name`, `platform`, `:53-58`), and loads offerings (`BillingManager.kt`). `identifyUser` (which would send an app user id) exists but is never called (`BillingManager.kt:177`). So RevenueCat gets its own anonymous app user id plus what an SDK sees by default (IP address, device and OS information, purchase and entitlement state). **NOT VERIFIED**: exact RevenueCat fields; check RevenueCat's own Data safety guidance.
* The paywall was removed on 2026-07-22 and every user is treated as subscribed (`BillingManager.kt:41-45,202-206`). The Play listing text still advertises an upgrade (see mismatches).
* The PaywallKit library (a local project outside this repository: `Audexa/settings.gradle.kts:20-21`) can send paywall events (random id, optional email) to `paywallkit-api.fly.dev`, but only when its paywall view is shown (`PaywallKit-Android/paywallkit/.../PaywallView.kt:41-76`), which cannot happen while every user counts as subscribed (`MainActivity.kt:416`). RatingKit and CrossPromoKit are also local projects. **NOT VERIFIED from this repository**: their network behaviour; the owner builds the app with them, so the Data safety form must cover them (review those three repositories).
* No advertising SDK, no Firebase, no Google Analytics, no AdMob in the Android Gradle files (`Audexa/app/build.gradle.kts:105-190`) or the web `package.json`. A first-party ad-impression endpoint exists (`ai-radio-backend/src/routes/ads.ts`); Android sends campaign/creative ids, language and platform, no user id (`Audexa/app/src/main/java/com/kreativekoala/audexa/data/remote/ApiService.kt:345-354`); the live table of ad campaigns is empty, so no ads run today.

## 10. Crash and failure reporting

* Android: uncaught crashes and handled failures are POSTed to a Cloudflare Worker we operate (`https://app-failure-reporter.t-sushanth.workers.dev/v1/report`): app name, app version, flow, error message, full stack trace, thread name, device manufacturer and model, Android version (`Audexa/app/src/main/java/com/kreativekoala/audexa/monitoring/FailureReporter.kt:21`, `:77-83`). Playback errors send only the error code name (`AudioManager.kt:97-100`). The code comment says never to put user content in messages; stack traces can still contain whatever an exception message contains. Not tied to a user id or install id. Not controlled by the usage-statistics switch.
* Web: `web-app/src/components/WebFailureReporter.tsx:5-40`: error message, stack, page path, to the same Worker, only when a build key is set. The key is set in `web-app/fly.toml:8`.
* Backend: 5xx route patterns, crashes and background-job failures, with stack traces, to the same Worker (`ai-radio-backend/src/lib/failureReporter.ts:9,21-40`), plus daily counters; and language-model usage counts and cost per model/feature, never prompts or user ids (`ai-radio-backend/src/lib/llmUsage.js:1-5,17`).
* **NOT VERIFIED**: where the Worker stores reports and for how long, and who can read them (the Worker is a separate project, not in this repository). The owner must check its storage and retention before the policy states a number.

## 11. Delete Account

`DELETE /api/user/<email>` (`ai-radio-backend/src/routes/user.ts:222-320`) deletes: rows in `linked_accounts` for that email, rows in `podcast_episodes` for the user, the `users` profile row, and clears cached tokens (and tries to revoke them with Google).
It does NOT delete or touch: the Supabase Auth user record; briefing audio files in storage (section 3); `ask_episodes` rows and audio (section 4); `topic_requests` rows (section 5); `analytics_events` rows (by design); `user_settings`, `qa_sessions`, `custom_sources` and similar per-user tables (they hold no rows for most users today, but the route does not clear them); server log lines.
There is no authentication on this route: the path carries the email, and no check ties the caller to that email (`user.ts:222-224`; no auth middleware in `ai-radio-backend/src/routes/index.ts`). The Android app calls it with the signed-in email (`AuthRepository.kt:281-290`); the web app calls it for non-guest identities (`web-app/src/lib/account.ts:25-31`).

## 12. Third parties and infrastructure

| Party | What it receives | Evidence |
|---|---|---|
| Supabase (database, Auth, Storage, Realtime) | everything stored above; Android connects to Auth and Realtime directly with a public key | `Audexa/app/build.gradle.kts:47-49`; `web-app/src/lib/supabase.ts` |
| Fly.io | hosts the API, the radio, Piper, the web app; sees every request in transit | `fly.toml` files |
| Anthropic (`api.anthropic.com`) | Ask text; suggestion text; email/calendar-derived text for briefings; news headlines for scripts; `@anthropic-ai/sdk` | sections 2, 4, 5, 6; `ai-radio-backend/package.json` |
| OpenRouter and the model vendor it routes to | radio topic requests and radio script prompts | section 7 |
| Google (sign-in, Gmail API, Calendar API) and Google News RSS | OAuth; mail and calendar reads; keyword searches | sections 2, 4 |
| RevenueCat | anonymous purchase SDK data | section 9 |
| Cloudflare (our failure-report Worker; also the CDN in front of audexa.app and radio.audexa.app) | crash and failure reports; web traffic | section 10; `curl` of `radio.audexa.app` shows Cloudflare |
| Hugging Face | a user-started download of the on-device voice model file (the request reveals the IP address) | `Audexa/app/src/main/java/com/kreativekoala/audexa/tts/kokoro/KokoroDownloadWorker.kt:221` |
| Reddit, Hacker News, publishers' RSS | our server fetches public content, no user text | section 6 |
| OpenWeather | weather is off by default (`ENABLE_WEATHER` default false) and the apps send no location | `ai-radio-backend/src/config/environment.ts:76` |
| Microsoft Edge speech service | radio script text for non-English streams, if those are running | section 0 (**NOT VERIFIED**) |
| Hetzner server | the old radio host; the Fly app replaced it (`audexa-radio/fly/README.md:1`). The backend's default `RADIO_STREAM_BASE_URL` still names the old plain-HTTP address (`environment.ts:108`) and is handed to clients in `/api/config` (`ai-radio-backend/src/routes/config.ts:19`); the Fly secret may override it. **NOT VERIFIED.** | |

## 13. Transport security

All backend, radio and Supabase URLs in the apps are HTTPS (`API_BASE_URL`, `radio.audexa.app`, Supabase URL). The Android manifest nevertheless allows cleartext HTTP (`AndroidManifest.xml:15`). Answer "encrypted in transit: yes" for user data is supported by the code; consider turning cleartext off.
