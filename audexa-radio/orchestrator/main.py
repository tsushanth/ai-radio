"""
Audexa Radio Orchestrator — the brain of the always-on AI radio.

Runs two concurrent tasks:
1. FastAPI server for health checks and Retell webhooks
2. Content generation loop that feeds the Liquidsoap stream

Supports multilingual radio streams: en, es, hi, pt, fr, de, ja, ko, zh, it.
English uses Kokoro TTS; other languages use Microsoft Edge TTS.
"""

import asyncio
import logging
import os
import random
import telnetlib
import time
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import Config
from content_fetcher import ContentFetcher
from edge_tts_client import EdgeTTSClient, EDGE_TTS_VOICES, get_edge_voices_for_language
from email_alerter import (
    install_asyncio_exception_handler,
    mark_generation_success,
    report_error,
    seconds_since_last_generation,
)
from queue_manager import QueueManager
from retell_handler import router as retell_router
from retell_handler import set_queue_manager
from scheduler import TopicScheduler
from script_generator import RadioScriptGenerator
from segment_assembler import assemble_segment
from topic_podcast_injector import TopicPodcastInjector
from topics import get_sources_for_region
from tts_client import TTSClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.getenv("LOGS_DIR", "/app/logs") + "/orchestrator.log"),
    ],
)
logger = logging.getLogger("audexa-radio")

# ── Supported languages ──────────────────────────────────────────────────────
RADIO_LANGUAGES = ["en", "es", "hi", "pt", "fr", "de", "ja", "ko", "zh", "it"]

# Map language code to region for source selection
LANGUAGE_TO_REGION = {
    "en": "us",
    "es": "es",
    "hi": "in",
    "pt": "br",
    "fr": "fr",
    "de": "de",
    "ja": "jp",
    "ko": "kr",
    "zh": "cn",
    "it": "it",
}

# Map language code to BCP 47 language tag for script generation
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "hi": "Hindi",
    "pt": "Portuguese",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "it": "Italian",
}


# --- Globals (initialized at startup) ---
config: Config
fetcher: ContentFetcher
script_gen: RadioScriptGenerator
tts: TTSClient
edge_tts_client: EdgeTTSClient
queue: QueueManager
scheduler: TopicScheduler

# Per-language schedulers — each language rotates through topics independently
lang_schedulers: dict[str, TopicScheduler] = {}

# Voice rotation state — avoid repeating the same pair back-to-back
_last_host1_voice: dict[str, str] = {}  # keyed by language
_last_host2_voice: dict[str, str] = {}


def get_tts_for_language(lang: str):
    """
    Return the appropriate TTS client for a language.
    English uses Kokoro; all others use Edge TTS.
    """
    if lang == "en":
        return tts
    return edge_tts_client


def pick_voices(lang: str = "en") -> tuple[str, str]:
    """
    Pick a random host voice pair for this segment.
    For English: uses Kokoro voice pools from config.
    For other languages: uses Edge TTS voice pools.
    """
    global _last_host1_voice, _last_host2_voice

    if lang == "en":
        region = config.radio_region
        if region == "uk":
            pool1 = config.tts_host1_voices_uk
            pool2 = config.tts_host2_voices_uk
        else:
            pool1 = config.tts_host1_voices
            pool2 = config.tts_host2_voices
    else:
        voices = get_edge_voices_for_language(lang)
        pool1 = voices["male"]
        pool2 = voices["female"]

    last_h1 = _last_host1_voice.get(lang, "")
    last_h2 = _last_host2_voice.get(lang, "")

    # Avoid repeating the previous voice if we have options
    candidates1 = [v for v in pool1 if v != last_h1] or pool1
    h1 = random.choice(candidates1)

    candidates2 = [v for v in pool2 if v != last_h2 and v != h1] or [v for v in pool2 if v != h1] or pool2
    h2 = random.choice(candidates2)

    _last_host1_voice[lang] = h1
    _last_host2_voice[lang] = h2
    logger.debug(f"Voice pair [{lang}]: {h1} / {h2}")
    return h1, h2


def _to_liquidsoap_path(filepath: str) -> str:
    """Translate container-internal paths to Liquidsoap-visible mount paths."""
    p = Path(filepath)
    # Orchestrator: /app/queue/ready/foo.mp3  -> Liquidsoap: /queue/foo.mp3
    # Orchestrator: /app/music/foo.mp3        -> Liquidsoap: /music/foo.mp3
    if "/queue/ready/" in filepath or "/queue/rendering/" in filepath:
        return f"/queue/{p.name}"
    if "/music/" in filepath:
        return f"/music/{p.name}"
    return filepath


def push_to_liquidsoap(filepath: str, queue_name: str = "speech"):
    """Push an audio file to Liquidsoap via telnet."""
    try:
        liq_path = _to_liquidsoap_path(filepath)
        tn = telnetlib.Telnet(config.liquidsoap_host, config.liquidsoap_port, timeout=5)
        command = f"{queue_name}.push {liq_path}\n"
        tn.write(command.encode())
        response = tn.read_until(b"END", timeout=3)
        tn.close()
        logger.info(f"Pushed to Liquidsoap {queue_name}: {Path(filepath).name}")
        return True
    except Exception as e:
        logger.warning(f"Liquidsoap push failed: {e}")
        return False


def push_random_song():
    """Push a random song from the music directory to Liquidsoap."""
    music_dir = Path(config.music_dir)
    songs = list(music_dir.glob("*.mp3"))
    if not songs:
        logger.warning("No songs in music directory")
        return
    song = random.choice(songs)
    push_to_liquidsoap(str(song), queue_name="music")


def get_queue_name_for_language(lang: str) -> str:
    """Return the Liquidsoap queue name for a given language."""
    return f"speech_{lang}"


async def generate_and_queue_listener_request(request) -> bool:
    """Generate a segment for a listener request and add to ready queue."""
    logger.info(f"Generating listener request: '{request.topic}'")
    try:
        # Listener requests are always in the primary language (English)
        lang = "en"
        h1, h2 = pick_voices(lang)
        tts_client = get_tts_for_language(lang)
        segments = await script_gen.generate_listener_request(
            request.topic,
            language=config.radio_language,
            region=config.radio_region,
        )
        audio = await assemble_segment(segments, tts_client, h1, h2)
        filepath = await queue.push_ready_segment(
            audio, "listener_request", priority=0, topic_name=request.topic
        )
        push_to_liquidsoap(filepath, queue_name=get_queue_name_for_language(lang))
        push_random_song()
        mark_generation_success()
        return True
    except Exception as e:
        report_error(e, source="listener_request", context={"topic": request.topic})
        return False


async def generate_and_queue_scheduled_for_language(lang: str) -> bool:
    """Generate a scheduled segment for a specific language and add to ready queue."""
    sched = lang_schedulers.get(lang, scheduler)
    topic = sched.next_topic()
    seg_type = sched.next_segment_type()

    # Determine the region for this language's content sources
    region = LANGUAGE_TO_REGION.get(lang, config.radio_region)
    language_name = LANGUAGE_NAMES.get(lang, "English")

    logger.info(
        f"Generating {seg_type} [{lang}] for topic: {topic.name} (region={region})"
    )
    try:
        # Use region-appropriate sources
        sources = get_sources_for_region(topic, region)
        topic_with_regional_sources = topic
        if sources is not topic.sources:
            import dataclasses
            topic_with_regional_sources = dataclasses.replace(topic, sources=sources)

        content = await fetcher.fetch_topic_content(topic_with_regional_sources)
        if not content.stories:
            logger.warning(f"No stories for {topic.name} [{lang}], skipping")
            return False

        h1, h2 = pick_voices(lang)
        tts_client = get_tts_for_language(lang)

        if seg_type == "headlines":
            segments = await script_gen.generate_headlines(
                topic.name, content.stories, topic.prompt_context,
                language=lang, region=region,
            )
        else:
            segments = await script_gen.generate_deep_dive(
                topic.name, content.stories, topic.prompt_context,
                language=lang, region=region,
            )

        audio = await assemble_segment(segments, tts_client, h1, h2)
        filepath = await queue.push_ready_segment(
            audio, seg_type, priority=1, topic_name=f"[{lang}] {topic.name}"
        )

        queue_name = get_queue_name_for_language(lang)
        push_to_liquidsoap(filepath, queue_name=queue_name)
        push_random_song()
        # Mark heartbeat for the scheduler-health endpoint + watchdog
        mark_generation_success()
        return True

    except Exception as e:
        # Email-batched alert + structured log; the loop continues.
        report_error(e, source="scheduled_gen", context={"lang": lang, "topic": getattr(topic, "name", "?"), "type": seg_type})
        return False


async def generate_and_queue_scheduled() -> bool:
    """Generate a scheduled segment for English (backward compat wrapper)."""
    return await generate_and_queue_scheduled_for_language("en")


async def reconcile_liquidsoap_queues():
    """
    Periodically check Liquidsoap queues and re-push ready segments
    if a queue is empty. Handles Liquidsoap restarts gracefully.
    """
    while True:
        try:
            await asyncio.sleep(60)
            liq_queues = get_liquidsoap_queue_lengths()

            for lang in RADIO_LANGUAGES:
                queue_name = get_queue_name_for_language(lang)
                queue_len = liq_queues.get(lang, -1)

                if queue_len == 0:
                    # Queue empty — find ready segments for this language and push
                    segments = queue.list_ready_segments()
                    lang_segments = [
                        s for s in segments
                        if (lang == "en" and not s["topic_name"].startswith("["))
                        or s["topic_name"].startswith(f"[{lang}]")
                    ]

                    if lang_segments:
                        pushed = 0
                        for seg in lang_segments[:5]:
                            if push_to_liquidsoap(seg["filepath"], queue_name=queue_name):
                                pushed += 1
                        if pushed:
                            logger.info(f"Reconciled [{lang}]: pushed {pushed} segments to {queue_name}")

        except Exception as e:
            logger.debug(f"Reconciliation error: {e}")


async def content_generation_loop():
    """
    Main content generation loop. Runs forever.

    Rotates through all supported languages, generating content for each.
    Priority: listener requests > scheduled content > sleep if buffer full.
    """
    logger.info(
        f"Content generation loop started (languages: {', '.join(RADIO_LANGUAGES)})"
    )

    # Wait for TTS service (Kokoro) to be ready
    while not await tts.health_check():
        logger.info("Waiting for TTS service (Kokoro)...")
        await asyncio.sleep(5)
    logger.info("TTS service (Kokoro) is ready")

    # Check Edge TTS availability
    edge_ok = await edge_tts_client.health_check()
    if edge_ok:
        logger.info("Edge TTS is available for non-English languages")
    else:
        logger.warning("Edge TTS not available — only English will be generated")

    # Determine which languages we can serve
    active_languages = ["en"]
    if edge_ok:
        active_languages = RADIO_LANGUAGES.copy()
    logger.info(f"Active languages: {active_languages}")

    # Initial buffer fill — fill English first, then others
    logger.info(f"Filling initial buffer ({config.min_buffer_segments} segments per language)...")
    sem = asyncio.Semaphore(4)  # max 4 concurrent generation processes

    async def _bounded_generate(lang: str):
        async with sem:
            return await generate_and_queue_scheduled_for_language(lang)

    # Fill English buffer first (highest priority)
    en_tasks = [_bounded_generate("en") for _ in range(config.min_buffer_segments)]
    results = await asyncio.gather(*en_tasks, return_exceptions=True)
    filled = sum(1 for r in results if r is True)
    logger.info(f"English initial buffer: {filled}/{config.min_buffer_segments} segments")

    # Fill other language buffers with fewer initial segments
    other_langs = [l for l in active_languages if l != "en"]
    initial_per_lang = max(3, config.min_buffer_segments // 3)
    for lang in other_langs:
        lang_tasks = [_bounded_generate(lang) for _ in range(initial_per_lang)]
        results = await asyncio.gather(*lang_tasks, return_exceptions=True)
        filled = sum(1 for r in results if r is True)
        logger.info(f"[{lang}] initial buffer: {filled}/{initial_per_lang} segments")

    logger.info("Entering main loop")

    # Language rotation index for round-robin scheduling
    lang_index = 0

    while True:
        try:
            # Priority 1: Listener requests — process immediately
            request = await queue.pop_listener_request()
            if request:
                await generate_and_queue_listener_request(request)
                continue

            # Priority 2: Keep buffer filled, rotating through languages
            ready = queue.count_ready_segments()
            if ready < config.max_buffer_segments * len(active_languages):
                lang = active_languages[lang_index % len(active_languages)]
                lang_index += 1
                await generate_and_queue_scheduled_for_language(lang)
            else:
                logger.debug(f"Buffer full ({ready} segments), sleeping 30s")
                await asyncio.sleep(30)

        except Exception as e:
            # Send email + dedupe so a stuck failure mode tells us, not just logs
            report_error(e, source="content_generation_loop")
            await asyncio.sleep(10)


# --- FastAPI App ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the content generation loop when the server starts."""
    global config, fetcher, script_gen, tts, edge_tts_client, queue, scheduler, lang_schedulers

    config = Config()
    fetcher = ContentFetcher(config.reddit_client_id, config.reddit_client_secret)
    script_gen = RadioScriptGenerator(config.claude_bin, config.claude_model)
    tts = TTSClient(config.tts_service_url, config.tts_model, config.tts_speed)
    edge_tts_client = EdgeTTSClient(rate="+5%")
    queue = QueueManager(config.queue_ready_dir, config.queue_rendering_dir)
    scheduler = TopicScheduler()

    # Create per-language schedulers so each language rotates topics independently
    lang_schedulers = {lang: TopicScheduler() for lang in RADIO_LANGUAGES}

    set_queue_manager(queue)

    # Wire the global asyncio exception handler BEFORE creating tasks so any
    # silent task death surfaces in logs + alerts (this is what would have
    # caught the 2026-06-11 06:09 scheduler stall instead of letting it
    # disappear for 16 hours).
    install_asyncio_exception_handler(asyncio.get_running_loop())

    gen_task = asyncio.create_task(content_generation_loop(), name="content_generation_loop")
    reconcile_task = asyncio.create_task(reconcile_liquidsoap_queues(), name="reconcile_liquidsoap_queues")

    # Pull today's completed topic-podcast MP3s from the backend and inject
    # them into the radio rotation. Adds ~55 episodes/lang of cached content
    # alongside the 13 hardcoded topics — variety without burning TTS budget.
    podcast_injector = TopicPodcastInjector(
        queue=queue,
        push_to_liquidsoap=push_to_liquidsoap,
        get_queue_name_for_language=get_queue_name_for_language,
        languages=RADIO_LANGUAGES,
    )
    podcast_inject_task = asyncio.create_task(
        podcast_injector.run_loop(), name="topic_podcast_injector"
    )

    # Attach a done callback that promotes silent task failures into alerts.
    # This is belt-and-suspenders next to the exception handler above —
    # asyncio's behavior around task exceptions has changed across versions.
    def _task_done(t: asyncio.Task) -> None:
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            report_error(exc, source=f"task:{t.get_name()}")

    gen_task.add_done_callback(_task_done)
    reconcile_task.add_done_callback(_task_done)
    podcast_inject_task.add_done_callback(_task_done)

    logger.info(
        f"Audexa Radio started (region={config.radio_region}, "
        f"lang={config.radio_language}, multilingual={RADIO_LANGUAGES})"
    )

    yield

    gen_task.cancel()
    reconcile_task.cancel()
    podcast_inject_task.cancel()
    await fetcher.close()
    await tts.close()
    logger.info("Orchestrator shut down")


app = FastAPI(title="Audexa Radio Orchestrator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(retell_router)


@app.get("/api/health")
async def health():
    tts_ok = await tts.health_check()
    edge_ok = await edge_tts_client.health_check()
    return {
        "status": "ok",
        "region": config.radio_region,
        "language": config.radio_language,
        "supported_languages": RADIO_LANGUAGES,
        "tts_service": "healthy" if tts_ok else "unhealthy",
        "edge_tts": "healthy" if edge_ok else "unhealthy",
        "request_queue_depth": queue.get_request_queue_depth(),
        "ready_segments": queue.count_ready_segments(),
        "buffer_target": config.max_buffer_segments,
        "estimated_wait_minutes": queue.estimate_wait_minutes(),
    }


# Deep liveness check: validates that the SCHEDULER thread is alive, not
# just that the HTTP server is up. /api/health stays cheap + always-200
# for load balancers; this endpoint returns 503 when the scheduler has
# been silent past a threshold, so an external watchdog (cron on Hetzner)
# can auto-restart the container. The 2026-06-11 06:09 stall would have
# been caught here within 15 minutes instead of 16 hours.
SCHEDULER_STALE_THRESHOLD_SEC = int(os.getenv("SCHEDULER_STALE_THRESHOLD_SEC", "900"))


@app.get("/api/scheduler-health")
async def scheduler_health():
    from fastapi import Response
    secs = seconds_since_last_generation()
    stale = secs > SCHEDULER_STALE_THRESHOLD_SEC
    body = {
        "scheduler_ok": not stale,
        "seconds_since_last_generation": None if secs == float("inf") else int(secs),
        "stale_threshold_sec": SCHEDULER_STALE_THRESHOLD_SEC,
        "ready_segments": queue.count_ready_segments(),
    }
    import json
    return Response(
        content=json.dumps(body),
        media_type="application/json",
        status_code=503 if stale else 200,
    )


def _liq_cmd(cmd: str) -> str:
    """Send a command to Liquidsoap via raw socket and return the response."""
    import socket as _socket
    s = _socket.create_connection((config.liquidsoap_host, config.liquidsoap_port), timeout=3)
    s.sendall(f"{cmd}\n".encode())
    import time; time.sleep(0.3)
    data = s.recv(8192).decode().strip()
    if data.endswith("END"):
        data = data[:-3].strip()
    return data


def get_liquidsoap_queue_lengths() -> dict[str, int]:
    """Query Liquidsoap for the queue length of each language stream."""
    queue_lengths = {}
    for lang in RADIO_LANGUAGES:
        queue_name = f"speech_{lang}"
        try:
            raw = _liq_cmd(f"{queue_name}.queue")
            # queue command returns space-separated request IDs
            count = len(raw.split()) if raw.strip() else 0
            queue_lengths[lang] = count
        except Exception:
            queue_lengths[lang] = -1  # unknown
    # Also check the legacy "speech" queue
    try:
        raw = _liq_cmd("speech.queue")
        queue_lengths["speech_legacy"] = len(raw.split()) if raw.strip() else 0
    except Exception:
        queue_lengths["speech_legacy"] = -1
    return queue_lengths


def get_liquidsoap_now_playing(lang: str = "en") -> dict:
    """Query Liquidsoap for what's currently on air for a specific language stream."""
    try:
        output_id = "out_stream" if lang == "en" else f"out_{lang}"
        remaining_raw = _liq_cmd(f"{output_id}.remaining")
        meta_raw = _liq_cmd(f"{output_id}.metadata")

        now_playing = {"source": "unknown", "remaining_seconds": 0}
        try:
            now_playing["remaining_seconds"] = round(float(remaining_raw), 1)
        except (ValueError, TypeError):
            pass

        # Parse the most recent metadata block (--- 1 ---)
        # If it has title/artist, it's music. If it has filename matching queue, it's speech.
        title = ""
        artist = ""
        filename = ""
        # Get the last metadata block
        lines = meta_raw.split("\n")
        in_last_block = False
        for line in lines:
            if "--- 1 ---" in line:
                in_last_block = True
                continue
            if in_last_block and line.strip():
                if line.startswith("title="):
                    title = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("artist="):
                    artist = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("filename="):
                    filename = line.split("=", 1)[1].strip().strip('"')

        if title and artist:
            # Has music metadata — it's a music track
            now_playing["source"] = "music"
            now_playing["track"] = title
        elif filename:
            basename = Path(filename).name
            if "/music/" in filename:
                now_playing["source"] = "music"
                now_playing["track"] = basename
            else:
                # Match against ready queue for topic info
                now_playing["source"] = "speech"
                now_playing["filename"] = basename
                for seg in queue.list_ready_segments():
                    if seg["filename"] == basename:
                        now_playing["topic_name"] = seg.get("topic_name", "")
                        now_playing["segment_type"] = seg.get("segment_type", "")
                        break
        else:
            # No metadata — check remaining time to determine if playing
            if now_playing["remaining_seconds"] > 0:
                now_playing["source"] = "speech"
            else:
                now_playing["source"] = "silence"

        return now_playing
    except Exception as e:
        logger.debug(f"Failed to get now playing [{lang}]: {e}")
        return {"source": "unknown", "remaining_seconds": 0}


@app.get("/api/status")
async def status(lang: str = "en"):
    segments = queue.list_ready_segments()
    now_playing = get_liquidsoap_now_playing(lang)

    # Per-language queue info from Liquidsoap
    try:
        liq_queues = get_liquidsoap_queue_lengths()
    except Exception:
        liq_queues = {}

    # Group ready segments by language tag
    per_lang_segments = {l: [] for l in RADIO_LANGUAGES}
    for seg in segments:
        topic_name = seg.get("topic_name", "")
        matched = False
        for l in RADIO_LANGUAGES:
            if topic_name.startswith(f"[{l}]"):
                per_lang_segments[l].append(seg)
                matched = True
                break
        if not matched:
            per_lang_segments["en"].append(seg)

    # Return only segments for the requested language
    lang_segments = per_lang_segments.get(lang, [])

    return {
        "now_playing": now_playing,
        "ready_queue": lang_segments,
        "request_queue_depth": queue.get_request_queue_depth(),
        "total_ready": len(lang_segments),
        "buffer_max": config.max_buffer_segments,
        "language": lang,
        "supported_languages": RADIO_LANGUAGES,
    }


@app.get("/api/upcoming-plays")
async def upcoming_plays(lang: str = "en"):
    """Predicted play times for segments already in the ready queue.

    Powers client-side "your bookmarked topic is about to play" local
    notifications: app pulls this, matches against the user's bookmarks,
    schedules AlarmManager / UNUserNotificationCenter alarms.

    Time model: now_playing's remaining_seconds + Nth-queued * 420s
    (~4 min speech segment + ~3 min music interleave). Coarse — drift up
    to ~minutes as the queue churns or listener requests preempt. Clients
    should re-poll on app foreground.

    Only returns segments currently in the ready queue (next ~30-60 min);
    does not predict topics that haven't been enqueued yet.
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    segments = queue.list_ready_segments()
    now_playing = get_liquidsoap_now_playing(lang)
    remaining_seconds = float(now_playing.get("remaining_seconds") or 0)

    # Filter to segments tagged for this language. The "en" branch keys off
    # the absence of the bracket prefix — matches how reconcile + injector
    # both label segments. Sort by filename (priority + timestamp) so the
    # play order matches what Liquidsoap will see.
    if lang == "en":
        lang_segments = [s for s in segments if not s["topic_name"].startswith("[")]
    else:
        marker = f"[{lang}]"
        lang_segments = [s for s in segments if s["topic_name"].startswith(marker)]
    lang_segments.sort(key=lambda s: s.get("filename", ""))

    # Each queued speech segment is followed by ~1 random song, so a topic
    # at queue position N plays roughly (remaining + N * 420s) from now.
    SEGMENT_GAP_SECONDS = 420
    upcoming = []
    for i, seg in enumerate(lang_segments):
        play_time = now + timedelta(seconds=remaining_seconds + i * SEGMENT_GAP_SECONDS)
        raw_name = seg.get("topic_name", "")
        # Strip the [lang] prefix for non-EN before returning so clients
        # can match against their cached topic catalog directly.
        display_name = (
            raw_name[len(f"[{lang}] "):] if raw_name.startswith(f"[{lang}] ") else raw_name
        )
        upcoming.append({
            "topic_name": display_name,
            "segment_type": seg.get("segment_type", ""),
            "estimated_play_time": play_time.isoformat(),
            "queue_position": i,
        })

    return {
        "language": lang,
        "now": now.isoformat(),
        "now_playing": {
            "topic_name": now_playing.get("topic_name", ""),
            "remaining_seconds": remaining_seconds,
        },
        "upcoming": upcoming,
        "segment_gap_seconds": SEGMENT_GAP_SECONDS,
    }


@app.post("/api/request-topic")
async def request_topic(topic: str, caller_phone: str = ""):
    """Manual topic request (for web/app integration, not just Retell)."""
    from retell_handler import validate_topic_request
    valid, reason = validate_topic_request(topic)
    if not valid:
        return {"success": False, "error": reason}
    position = await queue.add_listener_request(topic, caller_phone)
    return {
        "success": True,
        "position": position,
        "estimated_wait_minutes": queue.estimate_wait_minutes(),
    }


@app.get("/api/languages")
async def languages():
    """List supported languages and their stream URLs."""
    edge_ok = await edge_tts_client.health_check()
    return {
        "languages": [
            {
                "code": lang,
                "name": LANGUAGE_NAMES[lang],
                "stream_mount": f"/stream-{lang}" if lang != "en" else "/stream",
                "stream_url": f"https://radio.audexa.fm/stream-{lang}" if lang != "en" else "https://radio.audexa.fm/stream",
                "tts_engine": "kokoro" if lang == "en" else "edge-tts",
                "available": True if lang == "en" else edge_ok,
            }
            for lang in RADIO_LANGUAGES
        ],
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8081"))
    uvicorn.run(app, host="0.0.0.0", port=port)
