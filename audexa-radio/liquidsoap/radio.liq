# Audexa Radio - Liquidsoap Configuration
# Supports multilingual streams (en, es, hi, pt, fr, de, ja, ko, zh, it)

settings.server.telnet.set(true)
settings.server.telnet.bind_addr.set("0.0.0.0")
settings.server.telnet.port.set(1234)
settings.log.level.set(3)

# Per-language speech queues
speech = request.queue(id="speech")
speech_en = request.queue(id="speech_en")
speech_es = request.queue(id="speech_es")
speech_hi = request.queue(id="speech_hi")
speech_pt = request.queue(id="speech_pt")
speech_fr = request.queue(id="speech_fr")
speech_de = request.queue(id="speech_de")
speech_ja = request.queue(id="speech_ja")
speech_ko = request.queue(id="speech_ko")
speech_zh = request.queue(id="speech_zh")
speech_it = request.queue(id="speech_it")

# Music queue + fallback (each output needs its own copy)
music_queue = request.queue(id="music")

# Each language stream gets its own music fallback playlist instance
music_en = playlist(id="music_en", mode="randomize", reload_mode="watch", reload=10, "/music")
music_es = playlist(id="music_es", mode="randomize", reload_mode="watch", reload=10, "/music")
music_hi = playlist(id="music_hi", mode="randomize", reload_mode="watch", reload=10, "/music")
music_pt = playlist(id="music_pt", mode="randomize", reload_mode="watch", reload=10, "/music")
music_fr = playlist(id="music_fr", mode="randomize", reload_mode="watch", reload=10, "/music")
music_de = playlist(id="music_de", mode="randomize", reload_mode="watch", reload=10, "/music")
music_ja = playlist(id="music_ja", mode="randomize", reload_mode="watch", reload=10, "/music")
music_ko = playlist(id="music_ko", mode="randomize", reload_mode="watch", reload=10, "/music")
music_zh = playlist(id="music_zh", mode="randomize", reload_mode="watch", reload=10, "/music")
music_it = playlist(id="music_it", mode="randomize", reload_mode="watch", reload=10, "/music")

# Jingle
jingle_en = single(id="jingle_en", "/jingles/station_id.mp3")

# Icecast output settings
icecast_password = "5J688etweykEMVfTkGXBdw"
icecast_format = %mp3(bitrate=128, samplerate=44100, stereo=true)

# ── English (legacy /stream + /stream-en) ────────────────────────────────────

radio_en = fallback(id="main_en", track_sensitive=true, [speech, speech_en, music_queue, music_en])
radio_en = rotate(id="jingles_en", weights=[1, 6], [jingle_en, radio_en])
radio_en = normalize(id="norm_en", radio_en)
radio_en = fallback(id="safe_en", [radio_en, blank()])

output.icecast(icecast_format, id="out_stream", host="icecast", port=8000,
  password=icecast_password, mount="/stream",
  name="Audexa Radio", description="AI-powered 24/7 news and talk radio",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_en)

# ── Spanish ──────────────────────────────────────────────────────────────────

radio_es = fallback(id="main_es", track_sensitive=true, [speech_es, mksafe(music_es)])

output.icecast(icecast_format, id="out_es", host="icecast", port=8000,
  password=icecast_password, mount="/stream-es",
  name="Audexa Radio (Español)", description="Radio de noticias 24/7 - Español",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_es)

# ── Hindi ────────────────────────────────────────────────────────────────────

radio_hi = fallback(id="main_hi", track_sensitive=true, [speech_hi, mksafe(music_hi)])

output.icecast(icecast_format, id="out_hi", host="icecast", port=8000,
  password=icecast_password, mount="/stream-hi",
  name="Audexa Radio (हिन्दी)", description="AI-powered 24/7 radio - Hindi",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_hi)

# ── Portuguese ───────────────────────────────────────────────────────────────

radio_pt = fallback(id="main_pt", track_sensitive=true, [speech_pt, mksafe(music_pt)])

output.icecast(icecast_format, id="out_pt", host="icecast", port=8000,
  password=icecast_password, mount="/stream-pt",
  name="Audexa Radio (Português)", description="Rádio de notícias 24/7 - Português",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_pt)

# ── French ───────────────────────────────────────────────────────────────────

radio_fr = fallback(id="main_fr", track_sensitive=true, [speech_fr, mksafe(music_fr)])

output.icecast(icecast_format, id="out_fr", host="icecast", port=8000,
  password=icecast_password, mount="/stream-fr",
  name="Audexa Radio (Français)", description="Radio d'information 24/7 - Français",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_fr)

# ── German ───────────────────────────────────────────────────────────────────

# German: music_de is infallible (playlist), so just use it as fallback
radio_de = fallback(id="main_de", track_sensitive=true, [speech_de, mksafe(music_de)])

output.icecast(icecast_format, id="out_de", host="icecast", port=8000,
  password=icecast_password, mount="/stream-de",
  name="Audexa Radio (Deutsch)", description="KI-Nachrichtenradio 24/7 - Deutsch",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_de)

# ── Japanese ──────────────────────────────────────────────────────────────────

radio_ja = fallback(id="main_ja", track_sensitive=true, [speech_ja, mksafe(music_ja)])

output.icecast(icecast_format, id="out_ja", host="icecast", port=8000,
  password=icecast_password, mount="/stream-ja",
  name="Audexa Radio (日本語)", description="AI搭載24時間ニュースラジオ - Japanese",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_ja)

# ── Korean ────────────────────────────────────────────────────────────────────

radio_ko = fallback(id="main_ko", track_sensitive=true, [speech_ko, mksafe(music_ko)])

output.icecast(icecast_format, id="out_ko", host="icecast", port=8000,
  password=icecast_password, mount="/stream-ko",
  name="Audexa Radio (한국어)", description="AI 기반 24시간 뉴스 라디오 - Korean",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_ko)

# ── Chinese ───────────────────────────────────────────────────────────────────

radio_zh = fallback(id="main_zh", track_sensitive=true, [speech_zh, mksafe(music_zh)])

output.icecast(icecast_format, id="out_zh", host="icecast", port=8000,
  password=icecast_password, mount="/stream-zh",
  name="Audexa Radio (中文)", description="AI驱动全天候新闻电台 - Chinese",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_zh)

# ── Italian ───────────────────────────────────────────────────────────────────

radio_it = fallback(id="main_it", track_sensitive=true, [speech_it, mksafe(music_it)])

output.icecast(icecast_format, id="out_it", host="icecast", port=8000,
  password=icecast_password, mount="/stream-it",
  name="Audexa Radio (Italiano)", description="Radio notizie 24/7 con IA - Italian",
  genre="News/Talk", url="https://radio.audexa.fm", public=true, radio_it)
