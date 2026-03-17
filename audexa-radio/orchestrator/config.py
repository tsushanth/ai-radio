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
    tts_host1_voice: str = field(default_factory=lambda: os.getenv("TTS_HOST1_VOICE", "am_adam"))
    tts_host2_voice: str = field(default_factory=lambda: os.getenv("TTS_HOST2_VOICE", "af_nicole"))
    tts_speed: float = field(default_factory=lambda: float(os.getenv("TTS_SPEED", "1.05")))

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

    # Orchestrator tuning
    min_buffer_segments: int = 3
    max_buffer_segments: int = 6
    segment_cycle_minutes: int = 25
    content_refresh_interval_minutes: int = 20

    # Server
    host: str = "0.0.0.0"
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8081")))
