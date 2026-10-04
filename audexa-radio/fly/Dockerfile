# Audexa Radio on Fly: icecast + liquidsoap + orchestrator + nginx in ONE machine, one volume at /data.
# Base is the same liquidsoap release the Hetzner stack runs, so radio.liq behaves identically.
FROM savonet/liquidsoap:v2.2.5
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      icecast2 nginx supervisor ffmpeg curl ca-certificates python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Orchestrator (Python deps in a venv; no Claude CLI, no Node)
COPY orchestrator/requirements.txt /app/orchestrator/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /app/orchestrator/requirements.txt \
    && /opt/venv/bin/pip install --no-cache-dir standard-telnetlib  # telnetlib was removed in Python 3.13 (this base ships 3.13)
COPY orchestrator /app/orchestrator

# Station config templates (passwords are injected at start from secrets, never baked in)
COPY liquidsoap/radio.liq /opt/audexa/radio.liq.tpl
COPY icecast/icecast.xml /opt/audexa/icecast.xml.tpl
COPY fly/nginx.conf /etc/nginx/nginx.conf
COPY fly/supervisord.conf /etc/supervisor/supervisord.conf
COPY fly/entrypoint.sh fly/watchdog.sh fly/topic-batch.sh /opt/audexa/
# Seed audio (music + station jingle), copied to the volume only if the volume is empty.
# Not in git: populated locally before deploy (see fly/README.md).
COPY fly/seed /opt/audexa/seed
RUN chmod +x /opt/audexa/*.sh

ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 \
    QUEUE_READY_DIR=/data/queue/ready QUEUE_RENDERING_DIR=/data/queue/rendering \
    MUSIC_DIR=/data/music JINGLES_DIR=/data/jingles LOGS_DIR=/data/logs \
    LIQUIDSOAP_TELNET_HOST=127.0.0.1 LIQUIDSOAP_TELNET_PORT=1234 \
    SCRIPT_CLAUDE=off TTS_BACKEND=piper PORT=8081
EXPOSE 8080
ENTRYPOINT ["/opt/audexa/entrypoint.sh"]
