"""
Piper TTS client for the shared piper-tts-sjc Fly app (same interface as TTSClient).

Audexa is the LOW-priority tenant of that server (Calldesk calls share it). Priority is
enforced client-side only, the server has no priority lane:
  - at most `max_concurrent` requests at a time (default 1)
  - before each request, poll /health and wait while the machine reports >= `busy_active`
    sessions, up to `max_wait_sec`; then proceed anyway so the stream never starves
  - back off and retry on 503 (server at capacity), honouring Retry-After
Auth is a static bearer (PIPER_AUTH_TOKEN) over Fly's private network. Never logged.
"""

import asyncio
import io
import logging
import os
import re
import time
import wave
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000  # request pcm_24000: matches Kokoro output and tts_client.SILENCE_300MS
MAX_CHUNK_CHARS = 900  # server limit is MAX_TEXT_CHARS; stay well under it


class PiperError(RuntimeError):
    pass


def _split_text(text: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split at sentence boundaries into chunks of at most `limit` chars."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks, cur = [], ""
    for s in sentences:
        while len(s) > limit:  # a single huge "sentence": hard split on whitespace
            cut = s.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(s[:cut].strip())
            s = s[cut:].strip()
        if cur and len(cur) + 1 + len(s) > limit:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    return [c for c in chunks if c]


def pcm_to_wav(pcm: bytes, rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


class PiperTTSClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        speed: float = 1.05,
        max_concurrent: int = 1,
        busy_active: int = 2,
        max_wait_sec: float = 120.0,
        poll_sec: float = 2.0,
        retries: int = 4,
    ):
        self.base_url = base_url.rstrip("/")
        self._token = token
        self.speed = speed
        self.busy_active = busy_active
        self.max_wait_sec = max_wait_sec
        self.poll_sec = poll_sec
        self.retries = retries
        self._sem = asyncio.Semaphore(max_concurrent)
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120))
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _wait_for_quiet(self):
        """Yield to Calldesk: wait while the Piper machine is busy, bounded."""
        session = await self._get_session()
        deadline = time.monotonic() + self.max_wait_sec
        while time.monotonic() < deadline:
            try:
                async with session.get(f"{self.base_url}/health", timeout=aiohttp.ClientTimeout(total=5)) as r:
                    if r.status != 200:
                        return  # unhealthy/unknown: let the real request surface the error
                    active = int((await r.json()).get("active", 0))
            except Exception:
                return
            if active < self.busy_active:
                return
            await asyncio.sleep(self.poll_sec)
        logger.warning(f"Piper still busy after {self.max_wait_sec:.0f}s, proceeding anyway")

    async def _synth_pcm(self, text: str, voice_id: str) -> bytes:
        session = await self._get_session()
        body = {"text": text, "voice": voice_id, "speed": self.speed, "format": "pcm_24000"}
        headers = {"Authorization": f"Bearer {self._token}"}
        last = "no attempt"
        for attempt in range(self.retries + 1):
            async with self._sem:
                await self._wait_for_quiet()
                try:
                    async with session.post(f"{self.base_url}/v1/tts/stream", json=body, headers=headers) as r:
                        if r.status == 200:
                            pcm = await r.read()
                            if not pcm:
                                raise PiperError("Piper returned empty audio")
                            return pcm
                        detail = (await r.text())[:200]
                        last = f"HTTP {r.status}: {detail}"
                        if r.status not in (503, 429):
                            raise PiperError(f"Piper error {last}")
                        delay = float(r.headers.get("Retry-After", "1") or 1)
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    last = f"{type(e).__name__}: {e}"
                    delay = 1.0
            if attempt < self.retries:
                await asyncio.sleep(min(delay * (2 ** attempt), 30))
        raise PiperError(f"Piper failed after {self.retries + 1} attempts: {last}")

    async def synthesize(self, text: str, voice_id: str) -> bytes:
        started = time.monotonic()
        parts = [await self._synth_pcm(c, voice_id) for c in _split_text(text)]
        wav = pcm_to_wav(b"".join(parts))
        logger.info(f"TTS done: {len(text)} chars in {int((time.monotonic() - started) * 1000)}ms, {len(wav)} bytes (piper)")
        return wav

    async def synthesize_long(self, text: str, voice_id: str) -> bytes:
        return await self.synthesize(text, voice_id)

    async def health_check(self) -> bool:
        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/health", timeout=aiohttp.ClientTimeout(total=5)) as r:
                return r.status == 200
        except Exception:
            return False


def from_env(speed: float) -> PiperTTSClient:
    token = os.environ.get("PIPER_AUTH_TOKEN", "")
    if not token:
        raise RuntimeError("TTS_BACKEND=piper requires PIPER_AUTH_TOKEN")
    return PiperTTSClient(
        base_url=os.environ.get("PIPER_URL", "http://piper-tts-sjc.internal:8080"),
        token=token,
        speed=speed,
        max_concurrent=int(os.environ.get("PIPER_MAX_CONCURRENT", "1")),
        busy_active=int(os.environ.get("PIPER_BUSY_ACTIVE", "2")),
        max_wait_sec=float(os.environ.get("PIPER_MAX_WAIT_SEC", "120")),
    )
