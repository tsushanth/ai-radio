#!/bin/sh
# Renders station config from secrets, prepares the volume, then runs supervisord.
set -eu
: "${ICECAST_SOURCE_PASSWORD:?set ICECAST_SOURCE_PASSWORD}"
: "${ICECAST_ADMIN_PASSWORD:?set ICECAST_ADMIN_PASSWORD}"
case "$ICECAST_SOURCE_PASSWORD$ICECAST_ADMIN_PASSWORD" in *[!A-Za-z0-9_-]*) echo "ICECAST passwords must match [A-Za-z0-9_-]+ (they are written into XML and liquidsoap source)" >&2; exit 1;; esac

mkdir -p /data/queue/ready /data/queue/rendering /data/music /data/jingles /data/logs /var/log/icecast /var/log/supervisor
# Seed once; never overwrite what is already on the volume.
[ -z "$(ls -A /data/music 2>/dev/null)" ] && cp -a /opt/audexa/seed/music/. /data/music/ 2>/dev/null || true
[ -z "$(ls -A /data/jingles 2>/dev/null)" ] && cp -a /opt/audexa/seed/jingles/. /data/jingles/ 2>/dev/null || true

# radio.liq expects /queue, /music, /jingles
ln -sfn /data/queue/ready /queue; ln -sfn /data/music /music; ln -sfn /data/jingles /jingles

# Escape sed replacement metacharacters in secrets
esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }
SRC=$(esc "$ICECAST_SOURCE_PASSWORD"); ADM=$(esc "$ICECAST_ADMIN_PASSWORD")

# The repo's old literal passwords are replaced; telnet control port and icecast host go to loopback only.
sed -e "s|5J688etweykEMVfTkGXBdw|$SRC|g" \
    -e 's|host="icecast"|host="127.0.0.1"|g' \
    -e 's|telnet.bind_addr.set("0.0.0.0")|telnet.bind_addr.set("127.0.0.1")|' \
    /opt/audexa/radio.liq.tpl > /opt/audexa/radio.liq
sed -e "s|5J688etweykEMVfTkGXBdw|$SRC|g" \
    -e "s|u65i5he3L7PcIspnoS4ouA|$ADM|g" \
    -e "s|<port>8000</port>|<port>8000</port><bind-address>127.0.0.1</bind-address>|" \
    -e 's|<user>icecast</user>|<user>icecast2</user>|; s|<group>icecast</group>|<group>icecast</group>|' \
    /opt/audexa/icecast.xml.tpl > /etc/icecast2/icecast.xml
# Which language streams to run. Each stream is one live MP3 encoder; ten of them starve a shared CPU
# (steal time hit 94% and the stream stalled), so the default is English only. STREAM_LANGS=all keeps everything.
STREAM_LANGS="${STREAM_LANGS:-en}"
if [ "$STREAM_LANGS" != "all" ]; then
  drop=""
  for pair in en:English es:Spanish hi:Hindi pt:Portuguese fr:French de:German ja:Japanese ko:Korean zh:Chinese it:Italian; do
    code=${pair%%:*}; name=${pair##*:}
    case ",$STREAM_LANGS," in *",$code,"*) ;; *) drop="$drop $name";; esac
  done
  awk -v drop="$drop" 'BEGIN{n=split(drop,d," "); for(i=1;i<=n;i++) bad[d[i]]=1}
    /^# ── [A-Za-z]+/ { skip=0; for (k in bad) if (index($0, "# ── " k)==1) skip=1 }
    !skip' /opt/audexa/radio.liq > /opt/audexa/radio.liq.filtered && mv /opt/audexa/radio.liq.filtered /opt/audexa/radio.liq
fi
# fail loudly if any literal old secret survived
if grep -q -e 5J688etweykEMVfTkGXBdw -e u65i5he3L7PcIspnoS4ouA /opt/audexa/radio.liq /etc/icecast2/icecast.xml; then
  echo "refusing to start: template secret not replaced" >&2; exit 1
fi
chown -R icecast2:icecast /var/log/icecast 2>/dev/null || true
chown -R liquidsoap:liquidsoap /data/queue /data/music /data/jingles 2>/dev/null || true
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
