"""
Configuration — all settings loaded from environment variables.
"""

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # Claude CLI (authenticated via `claude login` on the VM)
    claude_bin: str = field(default_factory=lambda: os.getenv("CLAUDE_BIN", "claude"))
    claude_model: str = field(default_factory=lambda: os.getenv("CLAUDE_MODEL", "sonnet"))

    # TTS Service
    tts_service_url: str = field(default_factory=lambda: os.getenv("TTS_SERVICE_URL", "http://tts-service:8080"))
    tts_model: str = field(default_factory=lambda: os.getenv("TTS_MODEL", "kokoro"))
    tts_speed: float = field(default_factory=lambda: float(os.getenv("TTS_SPEED", "1.05")))

    # Voice pools — rotated per segment for variety
    # Comma-separated Kokoro voice IDs
    tts_host1_voices: list = field(default_factory=lambda: os.getenv(
        "TTS_HOST1_VOICES",
        "am_adam,am_echo,am_eric,am_liam,am_michael,am_onyx,am_orion"
    ).split(","))
    tts_host2_voices: list = field(default_factory=lambda: os.getenv(
        "TTS_HOST2_VOICES",
        "af_alloy,af_bella,af_jessica,af_nicole,af_nova,af_sarah,af_sky,af_river"
    ).split(","))

    # British voice pools (used when region=uk)
    tts_host1_voices_uk: list = field(default_factory=lambda: os.getenv(
        "TTS_HOST1_VOICES_UK",
        "bm_daniel,bm_george,bm_lewis,bm_fable"
    ).split(","))
    tts_host2_voices_uk: list = field(default_factory=lambda: os.getenv(
        "TTS_HOST2_VOICES_UK",
        "bf_alice,bf_emma,bf_isabella,bf_lily"
    ).split(","))

    # Reddit OAuth
    reddit_client_id: str = field(default_factory=lambda: os.getenv("REDDIT_CLIENT_ID", ""))
    reddit_client_secret: str = field(default_factory=lambda: os.getenv("REDDIT_CLIENT_SECRET", ""))

    # Retell AI
    retell_api_key: str = field(default_factory=lambda: os.getenv("RETELL_API_KEY", ""))
    retell_agent_id: str = field(default_factory=lambda: os.getenv("RETELL_AGENT_ID", ""))

    # Liquidsoap telnet
    liquidsoap_host: str = field(default_factory=lambda: os.getenv("LIQUIDSOAP_TELNET_HOST", "liquidsoap"))
    liquidsoap_port: int = field(default_factory=lambda: int(os.getenv("LIQUIDSOAP_TELNET_PORT", "1234")))

    # Queue / filesystem
    queue_ready_dir: str = field(default_factory=lambda: os.getenv("QUEUE_READY_DIR", "/app/queue/ready"))
    queue_rendering_dir: str = field(default_factory=lambda: os.getenv("QUEUE_RENDERING_DIR", "/app/queue/rendering"))
    music_dir: str = field(default_factory=lambda: os.getenv("MUSIC_DIR", "/app/music"))
    jingles_dir: str = field(default_factory=lambda: os.getenv("JINGLES_DIR", "/app/jingles"))
    logs_dir: str = field(default_factory=lambda: os.getenv("LOGS_DIR", "/app/logs"))

    # Orchestrator tuning — large buffer keeps the stream running smoothly
    # even during extended generation gaps or traffic spikes
    min_buffer_segments: int = field(default_factory=lambda: int(os.getenv("MIN_BUFFER_SEGMENTS", "20")))
    max_buffer_segments: int = field(default_factory=lambda: int(os.getenv("MAX_BUFFER_SEGMENTS", "40")))
    segment_cycle_minutes: int = 25
    content_refresh_interval_minutes: int = 20

    # Region & language — drives source selection and script language
    # Supported regions: us, uk, in, au, ca, de, fr, es, br, jp, kr, sg, ae, za
    radio_region: str = field(default_factory=lambda: os.getenv("RADIO_REGION", "us"))
    # Language code (BCP 47) — used in script generation prompt
    radio_language: str = field(default_factory=lambda: os.getenv("RADIO_LANGUAGE", "en"))

    # Server
    host: str = "0.0.0.0"
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8081")))
