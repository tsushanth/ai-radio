"""
TTS Client — HTTP client to the local Kokoro TTS service.
"""

import io
import logging
import wave
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)

# 300ms of silence at 24kHz, 16-bit mono
SILENCE_300MS = b"\x00" * (24000 * 2 * 300 // 1000)


class TTSClient:
    def __init__(
        self,
        base_url: str = "http://tts-service:8080",
        model: str = "kokoro",
        speed: float = 1.05,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.speed = speed
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=300)  # 5 min for long synthesis
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def synthesize(self, text: str, voice_id: str) -> bytes:
        """Synthesize text to WAV bytes using Kokoro."""
        session = await self._get_session()

        payload = {
            "text": text,
            "voice_id": voice_id,
            "model": self.model,
            "speed": self.speed,
            "language": "en",
        }

        url = f"{self.base_url}/synthesize"
        logger.debug(f"TTS request: {len(text)} chars, voice={voice_id}")

        async with session.post(url, json=payload) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise RuntimeError(f"TTS error {resp.status}: {error_text}")

            wav_bytes = await resp.read()
            synth_time = resp.headers.get("X-Synthesis-Time-Ms", "?")
            logger.info(f"TTS done: {len(text)} chars in {synth_time}ms, {len(wav_bytes)} bytes")
            return wav_bytes

    async def synthesize_long(self, text: str, voice_id: str) -> bytes:
        """Synthesize long text using the chunked endpoint."""
        session = await self._get_session()

        payload = {
            "text": text,
            "voice_id": voice_id,
            "model": self.model,
            "speed": self.speed,
            "language": "en",
            "max_chunk_chars": 250,
        }

        url = f"{self.base_url}/synthesize-long"

        async with session.post(url, json=payload) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise RuntimeError(f"TTS long error {resp.status}: {error_text}")
            return await resp.read()

    async def health_check(self) -> bool:
        """Check if TTS service is healthy."""
        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/health") as resp:
                return resp.status == 200
        except Exception:
            return False


def concatenate_wav(wav_chunks: list[bytes], gap_samples: bytes = SILENCE_300MS) -> bytes:
    """Concatenate multiple WAV byte arrays with silence gaps between them."""
    if not wav_chunks:
        return b""

    # Read params from first valid chunk
    params = None
    all_frames = []

    for chunk in wav_chunks:
        try:
            with wave.open(io.BytesIO(chunk), "rb") as wf:
                if params is None:
                    params = wf.getparams()
                all_frames.append(wf.readframes(wf.getnframes()))
                if gap_samples:
                    all_frames.append(gap_samples)
        except Exception as e:
            logger.warning(f"Skipping invalid WAV chunk: {e}")

    if params is None or not all_frames:
        raise RuntimeError("No valid WAV chunks to concatenate")

    # Remove trailing gap
    if gap_samples and all_frames and all_frames[-1] == gap_samples:
        all_frames.pop()

    # Write combined WAV
    output = io.BytesIO()
    with wave.open(output, "wb") as wf:
        wf.setparams(params)
        for frame in all_frames:
            wf.writeframes(frame)

    return output.getvalue()
