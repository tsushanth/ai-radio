# Audexa Radio on Fly (replaces the Hetzner `audexa-radio` box)

One Fly machine (shared-cpu-2x, 2 GB, region sjc) runs icecast + liquidsoap + orchestrator + nginx under supervisord,
with one 3 GB volume at `/data` (queue, music, jingles, logs). English speech comes from the shared Piper app
(`piper-tts-sjc`, private network); the other nine languages already use Edge TTS (no change). No Claude broker,
no Kokoro, no Ollama: scripts come from OpenRouter (`openai/gpt-6-luna`, fallback `openai/gpt-5.6-luna`), see `bakeoff/RESULTS.md`.

## Deploy (from `audexa-radio/`, so the build context contains orchestrator/ liquidsoap/ icecast/)
    flyctl apps create audexa-radio-fly
    flyctl volumes create audexa_data --size 3 --region sjc -a audexa-radio-fly
    # secrets: names only here. Icecast passwords must match [A-Za-z0-9_-]+ (generate fresh ones).
    flyctl secrets set -a audexa-radio-fly ICECAST_SOURCE_PASSWORD=... ICECAST_ADMIN_PASSWORD=... \
      PIPER_AUTH_TOKEN=... OPENROUTER_API_KEY=... BATCH_SECRET=... RESEND_API_KEY=... EMAIL_TO=... EMAIL_FROM=... \
      REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... RETELL_API_KEY=... RETELL_AGENT_ID=...
    flyctl deploy . -c fly/fly.toml --dockerfile fly/Dockerfile -a audexa-radio-fly
Seed audio goes in `fly/seed/{music,jingles}` (gitignored) and is copied to the volume only when the volume is empty.

## Voices
`TTS_HOST1_VOICES` (male host) and `TTS_HOST2_VOICES` (female host) are comma lists of Piper voice ids, e.g.
`custom:en-us-warm-m` and `custom:en-us-warm-f`. Same for the `_UK` variants (UK region uses the same voices).

## Priority vs Calldesk
Piper has no priority lane. The Audexa client (`orchestrator/piper_client.py`) is the low-priority citizen:
1 request at a time, waits (max 120 s) while the Piper machine reports >= 2 active sessions, retries on 503.

## What the Hetzner box did that is replaced here
- scheduler-watchdog cron + 4x/day orchestrator recycle -> `watchdog.sh`
- daily 05:00 UTC topic batch cron -> `topic-batch.sh` (secret `BATCH_SECRET`)
- host nginx (`/stream`, `/api/`) -> `nginx.conf` inside the machine; TLS by Fly; point `radio.audexa.app` at the Fly app
- NOT replaced on purpose: audexa-heal daemon (it asked Claude via the broker, always answered "escalate"), broker-slot-check,
  Kokoro recycle/watchdog crons, Ollama. Alerting is now: orchestrator email alerts + Fly health check on /healthz.

## Content sources (Reddit archive, Exa, feeds, cache)
Each scheduled segment gets its stories from a per-topic chain (`orchestrator/content_fetcher.py`). A link in the chain counts as
failed when it yields fewer than 3 usable stories (`SOURCE_MIN_RESULTS`); the next link is then tried.

    topics with Reddit sources (ai-ml, tech, coding, startups, markets, space, science, health, gaming):
        feed sources (Arctic Shift Reddit archive + RSS + HN)  ->  Exa lite (topics with `exa_query`)  ->  last good cache
    topics without Reddit (us-politics, world-update):
        Exa lite  ->  feed sources (RSS + HN)  ->  last good cache
    daily-news, sports-roundup: feed sources -> last good cache (no Exa)

Reddit content comes from the community-run Arctic Shift archive API (`arctic-shift.photon-reddit.com`), not reddit.com: reddit.com
RSS ends on 2026-11-13. Top posts of the last 24 h (72 h if fewer than 5 qualify) ranked by score, score floor 5, NSFW and removed
posts dropped, hosts attribute them as "discussion on r/<sub>". The author field is never requested. Results are cached per
subreddit for 6 h (also on the volume), requests are 5 s apart, 429 and the archive's "slow down" 422 back off until
`X-RateLimit-Reset`. Exa is opt-in per topic (`exa_query` in `orchestrator/topics.py`): `type: lite`, 8 results, last 48 h,
pages under 400 chars, future-dated, undated and duplicate results dropped, NYT/Politico/CNN-style text cut at 1000 chars is kept
but marked partial. Exa results are cached per topic for 6 h (also on the volume), a failed topic is not retried for 30 min,
and a persisted per-UTC-day counter caps searches (80 % sends an alert email, the cap stops all Exa calls until 00:00 UTC).
"Last good cache" is the previous successful feed result for the topic (max 24 h old); Exa text is only kept in the 6 h Exa cache.
The script prompts tell the hosts to paraphrase, name the outlet, quote at most a short phrase and never mention usernames or
personal details.

| env var | default | meaning |
|---|---|---|
| `SOURCE_EXA_ENABLED` | off | master switch for Exa; also needs the `EXA_API_KEY` secret |
| `EXA_API_KEY` | unset | Exa key (Fly secret, never in the repo, never logged) |
| `EXA_DAILY_CAP` | 60 | hard cap on Exa searches per UTC day (alert at 80 %) |
| `EXA_CACHE_TTL_SEC` | 21600 | Exa result cache per topic |
| `EXA_FAIL_COOLDOWN_SEC` / `EXA_OFF_SEC` | 1800 / 3600 | no retry for a failed topic / Exa off after a 400, 401, 402 or 403 |
| `SOURCE_REDDIT_ENABLED` | on | all Reddit sources (archive and legacy RSS) |
| `SOURCE_REDDIT_ARCHIVE_ENABLED` | on | Arctic Shift archive |
| `SOURCE_REDDIT_RSS_ENABLED` | off | legacy reddit.com .rss / OAuth path (dead after 2026-11-13) |
| `REDDIT_ARCHIVE_CACHE_TTL_SEC` / `_MIN_GAP_SEC` / `_MIN_SCORE` | 21600 / 5 / 5 | per-subreddit cache, spacing between requests, score floor |
| `SOURCE_RSS_ENABLED`, `SOURCE_HN_ENABLED` | on | feed / Hacker News sources |
| `SOURCE_MIN_RESULTS` | 3 | minimum usable stories before a link counts as failed |
| `SOURCE_STALE_SEC` | 86400 | how old the last good cache may be |
| `SOURCE_CACHE_DIR` | `/data/cache/sources` | cache + Exa counter location on the volume |

Turn a source off (no redeploy of code; the machine restarts with the new env):

    flyctl secrets set -a audexa-radio-fly EXA_API_KEY=...                       # Exa needs the key, then:
    flyctl deploy ... --env SOURCE_EXA_ENABLED=1                                  # or add it under [env] in fly.toml
    # off switches: SOURCE_EXA_ENABLED=0 | SOURCE_REDDIT_ARCHIVE_ENABLED=0 | SOURCE_REDDIT_ENABLED=0
    flyctl secrets unset -a audexa-radio-fly EXA_API_KEY                          # also stops Exa

Rolling back: set the flags above (Exa defaults to off, so an unset env is the old behaviour minus Reddit RSS), or redeploy the
previous release (`flyctl releases -a audexa-radio-fly`, `flyctl deploy --image <previous image>`). The cache directory can be
deleted at any time (`rm -rf /data/cache/sources`); deleting it resets the Exa daily counter, so do it only after midnight UTC.
Check the chain in the logs: `Content for <topic> [en]: N stories via exa|feeds|cache|partial`.

## Known gaps
- Non-English streams still run (Edge TTS) and still need the same CPU for encoding; if audio glitches, use performance-1x or run fewer mounts.
- Telnet control port and icecast listen on loopback only; the orchestrator API (8081) listens on all interfaces inside the Fly private network, public only via nginx `/api/`.
