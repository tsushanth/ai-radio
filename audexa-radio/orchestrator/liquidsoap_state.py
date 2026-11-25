"""
What Liquidsoap will really play next.

The ready directory keeps played segments for READY_MAX_AGE_HOURS, so its file list is not a play queue: used as one it
put an already-aired segment at "plays in under a minute" for half a day. Liquidsoap itself knows what is waiting
(`<queue>.queue`) and what is on air (`request.on_air`); both answer request ids, `request.metadata <id>` names the file.
"""

import socket
from pathlib import Path
from typing import Optional

TIMEOUT_SEC = 3


class LiquidsoapSession:
    """One telnet connection, several commands. Every answer ends with a line "END"."""

    def __init__(self, host: str, port: int):
        self._sock = socket.create_connection((host, port), timeout=TIMEOUT_SEC)
        self._buffer = b""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._sock.close()

    def command(self, cmd: str) -> str:
        self._sock.sendall(f"{cmd}\n".encode())
        lines: list[str] = []
        while True:
            while b"\n" not in self._buffer:
                chunk = self._sock.recv(65536)
                if not chunk:
                    raise ConnectionError("Liquidsoap closed the connection")
                self._buffer += chunk
            raw, self._buffer = self._buffer.split(b"\n", 1)
            line = raw.decode("utf-8", "replace").rstrip("\r")
            if line == "END":
                return "\n".join(lines).strip()
            lines.append(line)


def parse_metadata(raw: str) -> dict[str, str]:
    meta = {}
    for line in raw.split("\n"):
        key, sep, value = line.partition("=")
        if sep:
            meta[key.strip()] = value.strip().strip('"')
    return meta


def speech_queues(lang: str) -> list[str]:
    """Queue names feeding a language's stream, in the order Liquidsoap prefers them (radio.liq)."""
    return ["speech", "speech_en"] if lang == "en" else [f"speech_{lang}"]


def play_state(host: str, port: int, lang: str) -> tuple[Optional[str], list[str]]:
    """
    (file name of the speech segment on air or None, file names waiting to play, in play order).
    Raises OSError when Liquidsoap cannot be asked: the caller must not guess.
    """
    queues = speech_queues(lang)
    with LiquidsoapSession(host, port) as liq:
        def file_of(rid: str) -> tuple[dict[str, str], str]:
            meta = parse_metadata(liq.command(f"request.metadata {rid}"))
            return meta, Path(meta.get("filename", "")).name

        on_air = None
        for rid in liq.command("request.on_air").split():
            meta, name = file_of(rid)
            if meta.get("source") in queues and name:
                on_air = name

        waiting: list[str] = []
        for queue in queues:
            for rid in liq.command(f"{queue}.queue").split():
                _, name = file_of(rid)
                if name and name != on_air and name not in waiting:
                    waiting.append(name)
    return on_air, waiting
