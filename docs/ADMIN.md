# Audexa Radio admin and monitoring

Page: `/admin` on the web app. Data: `GET /api/admin/overview` (server route, admin only).
Radio side: `GET /api/listener-history?hours=24` (public, aggregate counts only).

## How it works

- The radio orchestrator samples Icecast (`http://127.0.0.1:8000/status-json.xsl`) every 60s and appends
  `{ts, total, mounts}` to `$LOGS_DIR/listener_history.jsonl` (`/data/logs/` on Fly, on the volume).
  30 days kept (prune hourly), roughly 10 MB at 10 mounts. Icecast down is stored as `total: null` (a gap, not zero).
  No IPs or user agents are read or stored.
- The web route verifies the caller's Supabase access token (`Authorization: Bearer`) with `supabase.auth.getUser`,
  then requires a confirmed email that is in `ADMIN_EMAILS`. Missing/blank `ADMIN_EMAILS` denies everyone.
  401 = no/bad token, 403 = signed in but not allowed. No body is returned in either case.
- The page signs in with Supabase directly (email+password or emailed link). It does not use the app's guest
  AuthProvider, which is a localStorage stub and not real authentication.

## Environment variables (web app)

| Var | Required | Notes |
|---|---|---|
| `ADMIN_EMAILS` | yes | Comma-separated, case-insensitive. Server only (never `NEXT_PUBLIC_`). |
| `RADIO_BASE_URL` | no | Default `https://radio.audexa.app`. |
| Supabase URL / anon key | built in | Currently hardcoded in `src/lib/supabase.ts` (public anon key). |

The Supabase user must exist and have a confirmed email (create it in the Supabase dashboard, Auth > Users,
or use the "Email me a link" button if email sign-ups/OTP are enabled for the project; not verified).

Radio side optional vars: `LISTENER_HISTORY_PATH`, `ICECAST_STATUS_URL`, `LISTENER_SAMPLE_INTERVAL_SEC`.

## Deploy order

1. Radio first (`audexa-radio/`, app `audexa-radio-fly`): `flyctl deploy` from `audexa-radio/` per `fly/README.md`.
   Briefly interrupts the stream. Wait about 2 minutes, then check `curl https://radio.audexa.app/api/listener-history?hours=1`.
2. Web second. Set the secret, then deploy:

```
flyctl secrets set -a audexa-web ADMIN_EMAILS="you@example.com,other@example.com"
```

(App name per `web-app/fly.toml`. Setting a secret restarts the machine. For other hosts, set it as a
server-side env var.) Until the radio is deployed the page still works; the listener panel says history is unavailable.

## Status thresholds

Red matches `/api/scheduler-health`: no generation for more than 900s, newest segment older than 4h, disk at 92% or more.
Amber (early warning, web only): generation over 450s, segment over 2h, disk 85% or more.
