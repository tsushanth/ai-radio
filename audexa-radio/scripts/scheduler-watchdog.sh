#!/usr/bin/env bash
# scheduler-watchdog.sh
#
# Runs from cron every 5 minutes on the Hetzner box. Polls
# /api/scheduler-health (which returns 503 when no content has been
# generated in 15 min). After 2 consecutive failures, restarts the
# orchestrator container.
#
# Failures and restarts are logged to /var/log/audexa-watchdog.log.
# Install: copy to /usr/local/bin/scheduler-watchdog.sh, chmod +x, add
#   */5 * * * * /usr/local/bin/scheduler-watchdog.sh >> /var/log/audexa-watchdog.log 2>&1
# to root's crontab.

set -u

ENDPOINT="${ENDPOINT:-http://localhost:8081/api/scheduler-health}"
STATE_FILE="${STATE_FILE:-/var/run/audexa-watchdog.state}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/audexa-radio}"
CONTAINER="${CONTAINER:-audexa-orchestrator}"
THRESHOLD_FAILS="${THRESHOLD_FAILS:-2}"  # consecutive failures before restart
COOLDOWN_SEC="${COOLDOWN_SEC:-900}"      # 15 min between restarts so we don't loop

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*"; }

# Read prior state — schema: <consecutive_fails>:<last_restart_epoch>
state="0:0"
if [[ -f "$STATE_FILE" ]]; then
  state=$(cat "$STATE_FILE" 2>/dev/null || echo "0:0")
fi
fails="${state%%:*}"
last_restart="${state##*:}"

# Poll the endpoint. 200 = healthy, 503 = stale. Anything else = treat as failure.
http_code=$(curl -s -o /tmp/audexa-wd-body.json -w "%{http_code}" -m 5 "$ENDPOINT" || echo "000")

if [[ "$http_code" == "200" ]]; then
  if (( fails > 0 )); then
    log "RECOVERED — endpoint healthy after $fails fail(s)"
  fi
  echo "0:$last_restart" > "$STATE_FILE"
  exit 0
fi

# Failed check
fails=$((fails + 1))
body=$(cat /tmp/audexa-wd-body.json 2>/dev/null || echo "<no body>")
log "UNHEALTHY ($fails/$THRESHOLD_FAILS) http=$http_code body=${body:0:200}"

if (( fails < THRESHOLD_FAILS )); then
  echo "$fails:$last_restart" > "$STATE_FILE"
  exit 0
fi

# Threshold hit — but respect cooldown so we don't restart in a tight loop
now=$(date -u +%s)
if (( now - last_restart < COOLDOWN_SEC )); then
  log "Restart suppressed — last restart was $((now - last_restart))s ago (cooldown ${COOLDOWN_SEC}s)"
  echo "$fails:$last_restart" > "$STATE_FILE"
  exit 0
fi

# Restart
log "RESTARTING container=$CONTAINER (consecutive fails=$fails)"
cd "$COMPOSE_DIR" || { log "compose dir $COMPOSE_DIR missing"; exit 1; }
if docker compose restart "$CONTAINER" 2>&1 | head -10; then
  log "Restart issued"
  echo "0:$now" > "$STATE_FILE"
else
  log "Restart command failed"
  echo "$fails:$last_restart" > "$STATE_FILE"
fi
