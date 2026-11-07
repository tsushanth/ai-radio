# Audexa: anonymous usage statistics (what is collected)

This document is for updating the Google Play Data safety form and the privacy policy. It describes what the code in this repository
does; it is not itself the policy. It covers only the first-party usage statistics added with `POST /api/events`. Crash reports
(the app-failure-reporter), the account/sign-in data and the existing anonymous `notifications/event` log line are separate and
unchanged.

## In one paragraph

The Android app and the web app record a small set of usage events (app opened, first play, how long audio was listened to and in
which topic and language, topic opened, episode generated, topic suggested, language changed, share tapped, an error code). They
are sent, in batches, to our own backend and stored in our own Supabase database. The only identifier is a random id generated on
the device or in the browser. It is not linked to an account, email address, name, advertising id or device identifier, and the IP
address is not stored. Users can switch it off (Android: Profile; web: Settings; the web app also respects Do Not Track and Global
Privacy Control), which deletes the id. Rows are deleted after 180 days. No third-party analytics SDK or vendor is involved.

## Exactly what is collected

Every request carries: `install_id` (random UUID), `platform` (`android` or `web`), `app_version`, and up to 25 events. Each event
has a name, a small property object, and `ago_s` (how many seconds earlier it happened, used to set the day).

| Event | When | Properties |
|---|---|---|
| `app_open` | App process start, or return after 30+ minutes away (web: once per tab session) | `locale` (for example `en-US`) |
| `first_play_start` | The first time audio actually plays on this install | `source`, `language` |
| `listen_progress` | Audio played for 30 seconds or more; reported when playback stops, and every 5 minutes during long listening | `source` (`radio`, `topic`, `deepdive`, `brief`), `language`, `seconds` (multiple of 30, 30 to 3600), `topic_id` (topics only, a catalogue slug such as `ai-ml`) |
| `topic_open` | A topic page is opened | `topic_id` |
| `topic_generate_requested`, `topic_generate_succeeded`, `topic_generate_failed` | The user generates an episode | `topic_id`, `language`; failed also has `code` (`generate_failed`, `generate_timeout`, `daily_limit`) |
| `topic_suggest_submitted` | A topic suggestion was sent | `language` only. The suggestion text is NOT in this event (it is stored separately in `topic_requests`, as before) |
| `language_change` | The user changes language | `language`, `from` |
| `share_tap` | The share button is tapped | `source`, optional `language` |
| `error_shown` | An error is shown to the user | `code` only: a short constant such as a player error code name, never a message |

`deepdive` is on the server allowlist for the iOS-only Deep Dive feature; neither the Android nor the web client sends it today.

The server stores `received_at`, `install_id`, `platform`, `app_version`, `name`, `props` and `day` (UTC day the event happened) in the
table `analytics_events`. Nothing else.

## Exactly what is NOT collected

Email address, name, account or user id, phone number, contacts, calendar or mail content, location (neither GPS nor derived from
the IP), IP address (not stored; see "Network metadata" below), device model, OS version, Android id, advertising id, Google/Firebase
installation id, push token, the text of suggestions or any other text the user types, the titles or content of episodes, search
text. The server rejects any event name or property that is not on the allowlist (`ai-radio-backend/src/lib/analytics.ts`), so a
future code change cannot start collecting more without a visible change to that file and to this document.

## Controls

* Opt-out: Android Profile > About > "Share anonymous usage statistics"; web Settings > Privacy. The choice is stored on the device
  (Android SharedPreferences `audexa_analytics` key `do_not_track`; web localStorage `audexa-analytics-optout`). Turning it off stops
  collecting immediately and deletes the install id, the unsent queue and the first-play flag; turning it on later creates a new,
  unrelated id.
* Web only: nothing is collected when the browser sends Do Not Track or Global Privacy Control, or on localhost.
* Server kill switch: `ANALYTICS_ENABLED`. Default off. While off, `POST /api/events` answers `202 {"disabled":true}`, reads nothing
  and stores nothing, and clients drop their queues.
* Limits: at most 25 events and 8 KB per request; per install 30 requests and 300 events per hour; per IP 120 requests per hour;
  global 1000 events per minute and 250000 per day (all configurable by env, in memory per machine). Clients send a few requests
  per session: when 20 events are waiting, about every two minutes, and when the app goes to the background.
* Retention: 180 days. The backend deletes older rows once a day while `ANALYTICS_ENABLED` is on; the same statement can be run by hand
  (`DELETE FROM public.analytics_events WHERE day < (now() AT TIME ZONE 'utc')::date - 180;`).
* Access: the table has row-level security on and no privileges for `anon` or `authenticated`; only the backend (service role) writes,
  and only people with database access read.
* Erasing one person's data is only possible if they can tell us their install id; the id is deliberately not linked to an account.
  Turning the switch off removes the id from their device, and the remaining rows are then unlinkable to anyone and expire after 180 days.

## Network metadata (read this before answering the Data safety form)

Any request to our server necessarily reaches it with the sender's IP address and a User-Agent. The analytics code does not read, log
or store them (the request limiter uses the address as an in-memory counter key only; the Android client sends a fixed
`User-Agent: Audexa-Android` instead of the default one that names the phone model). Whether the hosting platform (Fly.io proxy or
logs) keeps request metadata for its own operations has NOT been verified here; check Fly's data retention before stating "IP address
is never retained anywhere".

## Google Play Data safety: what this changes

Declare these (the app's other, existing declarations stay as they are):

| Play category | Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|---|
| App activity | App interactions (topics opened, listening time, plays, generate / suggest / share taps) | Yes | No | Yes, users can turn it off in Profile | Analytics |
| App info and performance | Diagnostics (the `error_shown` code) | Yes | No | Yes (same switch) | Analytics |
| Device or other IDs | Random app-generated install id | Yes (see note) | No | Yes (same switch) | Analytics |

Notes:

* Personal info (name, email, user id, address, phone): no change, nothing new.
* Location: none. App info "language/locale" is not a Play data type of its own; it is part of the events above.
* Device or other IDs: Play's definition covers "app-scoped IDs" (its own example is the Firebase installation id). The install id is
  random, not tied to hardware or an account and deletable by the user, but it identifies one installation over time, so the safe
  answer is to declare it. Declaring it costs nothing; leaving it out risks a policy finding.
* Data is encrypted in transit (HTTPS only). Users can request deletion: by turning the switch off (removes the id on the device); as
  explained above the stored rows cannot be tied to a person.
* "Data shared": No. There is no third party; the Supabase database is our own processor, which Play treats as a service provider,
  not as sharing.
* Not ephemeral: the data is stored for up to 180 days.

## Suggested privacy-policy wording

> We collect anonymous usage statistics so we can see which features work: when the app is opened, which topics and languages are
> used and for how long, whether episodes are generated or topics suggested, and error codes. These are linked only to a random
> identifier created on your device or in your browser, not to your name, email or account, and we do not store your IP address
> with them. We keep them for up to 180 days and do not share them with anyone. You can turn this off at any time in Profile
> (Android) or Settings (web); turning it off deletes the identifier. The web app also honours Do Not Track and Global Privacy
> Control.

## Operating it

Enable order (nothing below happens automatically):

1. Apply `ai-radio-backend/supabase/migrations/011_create_analytics_events.sql` (reviewed; not applied by the pull request).
2. Deploy the backend. Until `ANALYTICS_ENABLED` is set the endpoint answers `202 disabled` and stores nothing.
3. Ship the web app and the Android build when ready. Old clients are unaffected.
4. Set `ANALYTICS_ENABLED=true` on the `ai-radio-backend` Fly app. Check `docs/analytics-queries.sql` query 8 for rows arriving.
5. Update the Play Data safety form and the privacy policy before the Android build that sends events reaches users.

Rollback: set `ANALYTICS_ENABLED` to anything else (or unset it); the endpoint stops storing at once. To delete the data, drop the table
(the migration file has the rollback statement).

| Env var (backend) | Default | Meaning |
|---|---|---|
| `ANALYTICS_ENABLED` | off | Kill switch. Only `true`, `1`, `on`, `yes` turn it on |
| `ANALYTICS_MAX_EVENTS_PER_REQUEST` | 25 | Batch size limit (413 above it) |
| `ANALYTICS_MAX_BODY_BYTES` | 8192 | Payload size cap |
| `ANALYTICS_INSTALL_EVENTS_PER_HOUR` / `ANALYTICS_INSTALL_REQUESTS_PER_HOUR` | 300 / 30 | Per install id |
| `ANALYTICS_IP_REQUESTS_PER_HOUR` | 120 | Per IP, in memory |
| `ANALYTICS_GLOBAL_EVENTS_PER_MINUTE` / `ANALYTICS_GLOBAL_EVENTS_PER_DAY` | 1000 / 250000 | Global circuit breaker, per machine |

Web build variables (optional): `NEXT_PUBLIC_API_URL` (already used), `NEXT_PUBLIC_APP_VERSION` (sent as `app_version`; `web` when unset).

Known limits: a retried batch whose first attempt actually reached the database can be stored twice (no idempotency key), which
inflates listening time slightly; a reinstall, cleared browser data or an opt-out creates a new id; the limits are per machine, so
with several machines the effective global ceiling is the sum.
