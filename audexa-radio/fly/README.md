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

## Known gaps
- Non-English streams still run (Edge TTS) and still need the same CPU for encoding; if audio glitches, use performance-1x or run fewer mounts.
- Telnet control port and icecast listen on loopback only; the orchestrator API (8081) listens on all interfaces inside the Fly private network, public only via nginx `/api/`.
