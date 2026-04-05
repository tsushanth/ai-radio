"""
Edge TTS Client — Microsoft's free TTS for non-English languages.

Uses the edge-tts library to synthesize speech in languages that Kokoro 82M
does not support. Returns MP3 bytes which are then converted to WAV for
compatibility with the existing segment assembler pipeline.
"""

import io
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Default voices per language — female (host2) and male (host1) variants
EDGE_TTS_VOICES = {
    # language: (male_voices, female_voices)
    "es": {
        "male": ["es-MX-JorgeNeural", "es-ES-AlvaroNeural"],
        "female": ["es-MX-DaliaNeural", "es-ES-ElviraNeural"],
    },
    "hi": {
        "male": ["hi-IN-MadhurNeural"],
        "female": ["hi-IN-SwaraNeural"],
    },
    "pt": {
        "male": ["pt-BR-AntonioNeural", "pt-PT-DuarteNeural"],
        "female": ["pt-BR-FranciscaNeural", "pt-PT-RaquelNeural"],
    },
    "fr": {
        "male": ["fr-FR-HenriNeural", "fr-CA-AntoineNeural"],
        "female": ["fr-FR-DeniseNeural", "fr-CA-SylvieNeural"],
    },
    "de": {
        "male": ["de-DE-ConradNeural", "de-AT-JonasNeural"],
        "female": ["de-DE-KatjaNeural", "de-AT-IngridNeural"],
    },
    "ja": {
        "male": ["ja-JP-KeitaNeural"],
        "female": ["ja-JP-NanamiNeural"],
    },
    "ko": {
        "male": ["ko-KR-InJoonNeural"],
        "female": ["ko-KR-SunHiNeural"],
    },
    "zh": {
        "male": ["zh-CN-YunxiNeural"],
        "female": ["zh-CN-XiaoxiaoNeural"],
    },
    "it": {
        "male": ["it-IT-DiegoNeural"],
        "female": ["it-IT-ElsaNeural"],
    },
}


def get_edge_voices_for_language(lang: str) -> dict:
    """Return the male/female voice lists for a given language code."""
    return EDGE_TTS_VOICES.get(lang, EDGE_TTS_VOICES["es"])


class EdgeTTSClient:
    """
    Async TTS client using Microsoft Edge TTS (via the edge-tts library).
    Produces WAV output to stay compatible with the existing assembler pipeline.
    """

    def __init__(self, rate: str = "+5%"):
        """
        Args:
            rate: Speech rate adjustment (e.g., "+5%", "-10%", "+0%").
        """
        self.rate = rate

    async def synthesize(self, text: str, voice: str) -> bytes:
        """
        Synthesize text to WAV bytes using edge-tts.

        Args:
            text: The text to synthesize.
            voice: Edge TTS voice name (e.g., "es-MX-DaliaNeural").

        Returns:
            WAV bytes (24kHz, 16-bit, mono) for compatibility with Kokoro output.
        """
        import edge_tts

        communicate = edge_tts.Communicate(text, voice, rate=self.rate)

        # edge-tts outputs MP3 natively — collect all chunks
        mp3_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                mp3_chunks.append(chunk["data"])

        if not mp3_chunks:
            raise RuntimeError(f"edge-tts returned no audio for voice={voice}")

        mp3_bytes = b"".join(mp3_chunks)

        # Convert MP3 to WAV (24kHz, 16-bit, mono) for pipeline compatibility
        wav_bytes = self._mp3_to_wav(mp3_bytes)

        logger.info(
            f"EdgeTTS done: {len(text)} chars, voice={voice}, "
            f"MP3 {len(mp3_bytes) // 1024}KB -> WAV {len(wav_bytes) // 1024}KB"
        )
        return wav_bytes

    async def synthesize_long(self, text: str, voice: str) -> bytes:
        """
        Synthesize long text. edge-tts handles chunking internally,
        so this is the same as synthesize().
        """
        return await self.synthesize(text, voice)

    @staticmethod
    def _mp3_to_wav(mp3_bytes: bytes) -> bytes:
        """Convert MP3 bytes to WAV (24kHz, 16-bit, mono) using ffmpeg."""
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=True) as mp3_file:
            mp3_file.write(mp3_bytes)
            mp3_file.flush()

            wav_path = mp3_file.name.replace(".mp3", ".wav")
            try:
                result = subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-i", mp3_file.name,
                        "-ar", "24000",
                        "-ac", "1",
                        "-sample_fmt", "s16",
                        wav_path,
                    ],
                    capture_output=True,
                    timeout=60,
                )
                if result.returncode != 0:
                    raise RuntimeError(f"ffmpeg MP3->WAV failed: {result.stderr.decode()}")

                return Path(wav_path).read_bytes()
            finally:
                Path(wav_path).unlink(missing_ok=True)

    async def health_check(self) -> bool:
        """Edge TTS is a cloud service — always considered healthy."""
        try:
            import edge_tts  # noqa: F401
            return True
        except ImportError:
            return False
