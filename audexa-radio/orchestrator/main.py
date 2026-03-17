"""
Audexa Radio Orchestrator — the brain of the always-on AI radio.

Runs two concurrent tasks:
1. FastAPI server for health checks and Retell webhooks
2. Content generation loop that feeds the Liquidsoap stream
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
from queue_manager import QueueManager
from retell_handler import router as retell_router
from retell_handler import set_queue_manager
from scheduler import TopicScheduler
from script_generator import RadioScriptGenerator
from segment_assembler import assemble_segment
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


# --- Globals (initialized at startup) ---
config: Config
fetcher: ContentFetcher
script_gen: RadioScriptGenerator
tts: TTSClient
queue: QueueManager
scheduler: TopicScheduler


def push_to_liquidsoap(filepath: str, queue_name: str = "speech"):
    """Push an audio file to Liquidsoap via telnet."""
    try:
        tn = telnetlib.Telnet(config.liquidsoap_host, config.liquidsoap_port, timeout=5)
        command = f"{queue_name}.push {filepath}\n"
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


async def generate_and_queue_listener_request(request) -> bool:
    """Generate a segment for a listener request and add to ready queue."""
    logger.info(f"Generating listener request: '{request.topic}'")
    try:
        segments = await script_gen.generate_listener_request(request.topic)
        audio = await assemble_segment(
            segments, tts, config.tts_host1_voice, config.tts_host2_voice
        )
        filepath = await queue.push_ready_segment(
            audio, "listener_request", priority=0, topic_name=request.topic
        )
        # Push to Liquidsoap immediately
        push_to_liquidsoap(filepath)
        push_random_song()
        return True
    except Exception as e:
        logger.error(f"Failed to generate listener request: {e}")
        return False


async def generate_and_queue_scheduled() -> bool:
    """Generate a scheduled segment and add to ready queue."""
    topic = scheduler.next_topic()
    seg_type = scheduler.next_segment_type()

    logger.info(f"Generating {seg_type} for topic: {topic.name}")
    try:
        # Fetch content
        content = await fetcher.fetch_topic_content(topic)
        if not content.stories:
            logger.warning(f"No stories for {topic.name}, skipping")
            return False

        # Generate script
        if seg_type == "headlines":
            segments = await script_gen.generate_headlines(
                topic.name, content.stories, topic.prompt_context
            )
        else:
            segments = await script_gen.generate_deep_dive(
                topic.name, content.stories, topic.prompt_context
            )

        # Render audio
        audio = await assemble_segment(
            segments, tts, config.tts_host1_voice, config.tts_host2_voice
        )

        # Push to ready queue
        filepath = await queue.push_ready_segment(
            audio, seg_type, priority=1, topic_name=topic.name
        )
        # Push to Liquidsoap
        push_to_liquidsoap(filepath)
        push_random_song()
        return True

    except Exception as e:
        logger.error(f"Failed to generate scheduled segment: {e}")
        return False


async def content_generation_loop():
    """
    Main content generation loop. Runs forever.

    Priority: listener requests > scheduled content > sleep if buffer full.
    """
    logger.info("Content generation loop started")

    # Wait for TTS service to be ready
    while not await tts.health_check():
        logger.info("Waiting for TTS service...")
        await asyncio.sleep(5)
    logger.info("TTS service is ready")

    # Initial buffer fill
    logger.info("Filling initial buffer...")
    for _ in range(config.min_buffer_segments):
        await generate_and_queue_scheduled()

    logger.info("Initial buffer filled, entering main loop")

    while True:
        try:
            # Priority 1: Listener requests
            request = await queue.pop_listener_request()
            if request:
                await generate_and_queue_listener_request(request)
                continue

            # Priority 2: Keep buffer filled with scheduled content
            if not queue.is_buffer_full(config.max_buffer_segments):
                await generate_and_queue_scheduled()
            else:
                logger.debug(
                    f"Buffer full ({queue.count_ready_segments()} segments), "
                    "sleeping 30s"
                )
                await asyncio.sleep(30)

        except Exception as e:
            logger.error(f"Generation loop error: {e}", exc_info=True)
            await asyncio.sleep(10)


# --- FastAPI App ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the content generation loop when the server starts."""
    global config, fetcher, script_gen, tts, queue, scheduler

    config = Config()
    fetcher = ContentFetcher(config.reddit_client_id, config.reddit_client_secret)
    script_gen = RadioScriptGenerator(config.claude_bin, config.claude_model)
    tts = TTSClient(config.tts_service_url, config.tts_model, config.tts_speed)
    queue = QueueManager(config.queue_ready_dir, config.queue_rendering_dir)
    scheduler = TopicScheduler()

    # Wire up Retell handler
    set_queue_manager(queue)

    # Start content generation in background
    gen_task = asyncio.create_task(content_generation_loop())
    logger.info("Audexa Radio orchestrator started")

    yield

    # Shutdown
    gen_task.cancel()
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

# Mount Retell webhook routes
app.include_router(retell_router)


@app.get("/api/health")
async def health():
    tts_ok = await tts.health_check()
    return {
        "status": "ok",
        "tts_service": "healthy" if tts_ok else "unhealthy",
        "request_queue_depth": queue.get_request_queue_depth(),
        "ready_segments": queue.count_ready_segments(),
        "estimated_wait_minutes": queue.estimate_wait_minutes(),
    }


@app.get("/api/status")
async def status():
    """Current radio status — what's playing, what's next."""
    segments = queue.list_ready_segments()
    return {
        "ready_queue": segments,
        "request_queue_depth": queue.get_request_queue_depth(),
        "total_ready": len(segments),
    }


@app.post("/api/request-topic")
async def request_topic(topic: str, caller_phone: str = ""):
    """Manual topic request (for web/app integration, not just Retell)."""
    position = await queue.add_listener_request(topic, caller_phone)
    return {
        "success": True,
        "position": position,
        "estimated_wait_minutes": queue.estimate_wait_minutes(),
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8081"))
    uvicorn.run(app, host="0.0.0.0", port=port)
