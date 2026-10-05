#!/bin/bash
# Replaces the Hetzner crons scheduler-watchdog.sh (restart orchestrator after 2 consecutive stale
# /api/scheduler-health, 15 min cooldown) and the 4x/day orchestrator recycle (04:30,10:30,16:30,22:30 UTC).
ENDPOINT=http://127.0.0.1:8081/api/scheduler-health
fails=0; last_restart=0; last_recycle_hour=""
log() { echo "[watchdog $(date -u +%FT%TZ)] $*"; }
sleep 120   # let the orchestrator start
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$ENDPOINT" || echo 000)
  now=$(date +%s)
  if [ "$code" = "200" ]; then
    [ "$fails" -gt 0 ] && log "recovered after $fails fail(s)"; fails=0
  else
    fails=$((fails+1)); log "scheduler-health HTTP $code (fail $fails)"
    if [ "$fails" -ge 2 ] && [ $((now-last_restart)) -ge 900 ]; then
      log "restarting orchestrator"; supervisorctl restart orchestrator; last_restart=$now; fails=0
    fi
  fi
  hm=$(date -u +%H:%M); h=${hm%%:*}
  case "$hm" in 04:3?|10:3?|16:3?|22:3?)
    if [ "$last_recycle_hour" != "$h" ]; then log "scheduled recycle"; supervisorctl restart orchestrator; last_recycle_hour=$h; last_restart=$now; fi;;
  esac
  sleep 60
done
