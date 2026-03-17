"""
Segment Assembler — renders a script into a single MP3 file.
Synthesizes each segment via TTS, concatenates, converts WAV→MP3.
"""

import logging
import subprocess
import tempfile
from pathlib import Path

from script_generator import ScriptSegment
from tts_client import TTSClient, concatenate_wav

logger = logging.getLogger(__name__)


async def assemble_segment(
    segments: list[ScriptSegment],
    tts: TTSClient,
    host1_voice: str = "am_adam",
    host2_voice: str = "af_nicole",
) -> bytes:
    """
    Render all script segments via TTS, concatenate with gaps,
    convert to MP3 128kbps. Returns MP3 bytes.
    """
    voice_map = {"host1": host1_voice, "host2": host2_voice}
    wav_chunks: list[bytes] = []

    for i, seg in enumerate(segments):
        voice = voice_map.get(seg.speaker, host1_voice)
        text = seg.text.strip()
        if not text:
            continue

        try:
            # Use long endpoint for texts over 500 chars
            if len(text) > 500:
                wav = await tts.synthesize_long(text, voice)
            else:
                wav = await tts.synthesize(text, voice)
            wav_chunks.append(wav)
            logger.debug(f"Rendered segment {i + 1}/{len(segments)}: {len(text)} chars")
        except Exception as e:
            logger.error(f"TTS failed for segment {i + 1}: {e}")
            # Skip this segment rather than fail the whole assembly
            continue

    if not wav_chunks:
        raise RuntimeError("No segments were rendered successfully")

    # Concatenate WAV chunks with 300ms silence gaps
    combined_wav = concatenate_wav(wav_chunks)

    # Convert WAV to MP3 using ffmpeg
    mp3_bytes = wav_to_mp3(combined_wav)

    logger.info(
        f"Assembled {len(segments)} segments: "
        f"WAV {len(combined_wav) // 1024}KB → MP3 {len(mp3_bytes) // 1024}KB"
    )
    return mp3_bytes


def wav_to_mp3(wav_bytes: bytes, bitrate: str = "128k") -> bytes:
    """Convert WAV bytes to MP3 using ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as wav_file:
        wav_file.write(wav_bytes)
        wav_file.flush()

        mp3_path = wav_file.name.replace(".wav", ".mp3")
        try:
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", wav_file.name,
                    "-codec:a", "libmp3lame",
                    "-b:a", bitrate,
                    "-ar", "44100",
                    "-ac", "1",
                    mp3_path,
                ],
                capture_output=True,
                timeout=120,
            )

            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()}")

            mp3_bytes = Path(mp3_path).read_bytes()
            return mp3_bytes
        finally:
            Path(mp3_path).unlink(missing_ok=True)
