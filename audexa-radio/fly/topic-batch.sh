#!/bin/bash
# Replaces the Hetzner cron /opt/audexa-cron/topic-batch.sh: daily 05:00 UTC trigger of the topic
# episode batch on ai-radio-backend (idempotent). Secret comes from BATCH_SECRET, never from the script.
while true; do
  if [ "$(date -u +%H%M)" = "0500" ]; then
    if [ -z "${BATCH_SECRET:-}" ]; then echo "[topic-batch] BATCH_SECRET unset, skipping"; else
      echo "[topic-batch $(date -u +%FT%TZ)] triggering"
      curl -sS -m 60 -X POST https://ai-radio-backend.fly.dev/api/batch/generate-topics \
        -H "Authorization: Bearer ${BATCH_SECRET}" -H "Content-Type: application/json" \
        -d '{"language":"en","concurrency":3}' | cut -c1-300
    fi
    sleep 120
  fi
  sleep 30
done
