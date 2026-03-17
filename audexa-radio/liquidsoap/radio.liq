# Audexa Radio - Liquidsoap Configuration
# Controls the always-on radio stream: speech segments + music interleaving

# Enable telnet server for orchestrator control
settings.server.telnet.set(true)
settings.server.telnet.bind_addr.set("0.0.0.0")
settings.server.telnet.port.set(1234)

# Log level
settings.log.level.set(3)

# Interactive queue for speech segments (orchestrator pushes via telnet)
speech = request.queue(id="speech")

# Interactive queue for specific music requests
music_queue = request.queue(id="music")

# Random music fallback - plays when no speech/music queued
music_fallback = playlist(
  id="music_fallback",
  mode="randomize",
  reload_mode="watch",
  reload=10,
  "/music"
)

# Station ID jingle - plays periodically
jingle = single(id="jingle", "/jingles/station_id.mp3")

# Build the radio chain:
# 1. Speech segments have highest priority
# 2. Music queue (specific songs) next
# 3. Random music as fallback (stream never goes silent)
#
# track_sensitive=true means we wait for current track to finish
# before switching to higher priority source
radio = fallback(
  id="main",
  track_sensitive=true,
  [speech, music_queue, music_fallback]
)

# Insert station ID jingle every ~6 tracks
radio = rotate(
  id="with_jingles",
  weights=[1, 6],
  [jingle, radio]
)

# Normalize audio levels across all sources
radio = normalize(id="normalized", radio)

# Crossfade between tracks for smooth transitions
radio = crossfade(
  id="crossfaded",
  duration=2.0,
  radio
)

# Output to Icecast
output.icecast(
  %mp3(bitrate=128, samplerate=44100, stereo=true),
  id="icecast_out",
  host="icecast",
  port=8000,
  password="changeme_source",
  mount="/stream",
  name="Audexa Radio",
  description="AI-powered 24/7 news and talk radio",
  genre="News/Talk",
  url="https://radio.audexa.fm",
  public=true,
  radio
)
