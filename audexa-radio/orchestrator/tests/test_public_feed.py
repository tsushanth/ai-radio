"""
The public radio feed: no contact details in or out, only segments still to play, and an outcome per listener request.
"""

import asyncio
import json
import logging
import os
import socketserver
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("LOGS_DIR", tempfile.mkdtemp())

import liquidsoap_state  # noqa: E402
import pii  # noqa: E402
import request_log  # noqa: E402
from queue_manager import QueueManager  # noqa: E402
from retell_handler import validate_topic_request  # noqa: E402


class PersonalInfoTests(unittest.TestCase):
    BLOCKED = [
        "someone@example.com",
        "please talk about jane.doe+news@mail.co.uk today",
        "user@localhost",
        "jane at gmail dot com",
        "jane (at) example (dot) org",
        "call me on +1 (555) 010-4477",
        "5550104477",
        "98765 43210 news",
    ]
    ALLOWED = [
        "SpaceX launches",
        "the 2024-2025 NBA season",
        "what happened at the dot com crash",
        "AI at scale",
        "1969 moon landing",
        "the S&P 500 passing 6000 points",
        "@elonmusk posts",
        "a look at Booking.com earnings",
    ]

    def test_contact_details_are_refused(self):
        for text in self.BLOCKED:
            with self.subTest(text=text):
                self.assertTrue(pii.contains_personal_info(text))
                self.assertEqual(validate_topic_request(text), (False, "personal_info"))
                self.assertEqual(pii.public_topic_name(text), pii.PUBLIC_PLACEHOLDER)

    def test_ordinary_topics_pass(self):
        for text in self.ALLOWED:
            with self.subTest(text=text):
                self.assertFalse(pii.contains_personal_info(text))
                self.assertEqual(pii.public_topic_name(text), text)

    def test_language_tag_survives_masking_and_logs_are_masked(self):
        self.assertEqual(pii.public_topic_name("[es] someone@example.com"), "[es] Listener request")
        self.assertEqual(pii.redact("topic someone@example.com now"), "topic [redacted] now")

    def test_stored_sidecar_is_masked(self):
        with tempfile.TemporaryDirectory() as d:
            q = QueueManager(f"{d}/ready", f"{d}/rendering")
            path = asyncio.run(q.push_ready_segment(b"x", "listener_request", 0, "someone@example.com"))
            self.assertNotIn("example.com", Path(path).with_suffix(".json").read_text())

    def test_queued_request_log_has_no_address(self):
        with tempfile.TemporaryDirectory() as d:
            q = QueueManager(f"{d}/ready", f"{d}/rendering")
            with self.assertLogs("queue_manager", level=logging.INFO) as logs:
                asyncio.run(q.add_listener_request("someone@example.com"))
            self.assertNotIn("example.com", "".join(logs.output))


class _FakeLiquidsoap(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, answers):
        self.answers = answers

        class Handler(socketserver.StreamRequestHandler):
            def handle(handler):
                for raw in handler.rfile:
                    body = self.answers.get(raw.decode().strip(), "")
                    handler.wfile.write((body + "\r\nEND\r\n").encode())

        super().__init__(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.serve_forever, daemon=True).start()


def _meta(filename, source=None):
    lines = [f'filename="{filename}"'] + ([f'source="{source}"'] if source else [])
    return "\r\n".join(lines)


class PlayStateTests(unittest.TestCase):
    def setUp(self):
        self.server = _FakeLiquidsoap({
            "request.on_air": "0 6",
            "request.metadata 0": _meta("/jingles/station_id.mp3"),
            "request.metadata 6": _meta("/queue/1_100_headlines.mp3", "speech_en"),
            "speech.queue": "",
            "speech_en.queue": "7 8",
            "request.metadata 7": _meta("/queue/1_300_topic_podcast.mp3", "speech_en"),
            "request.metadata 8": _meta("/queue/0_200_listener_request.mp3", "speech_en"),
        })
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def test_on_air_and_waiting_in_play_order(self):
        on_air, waiting = liquidsoap_state.play_state("127.0.0.1", self.port, "en")
        self.assertEqual(on_air, "1_100_headlines.mp3")
        self.assertEqual(waiting, ["1_300_topic_podcast.mp3", "0_200_listener_request.mp3"])

    def test_unreachable_raises(self):
        with self.assertRaises(OSError):
            liquidsoap_state.play_state("127.0.0.1", 1, "en")

    def test_endpoints_list_only_unplayed_segments_without_addresses(self):
        import main

        with tempfile.TemporaryDirectory() as d:
            ready = Path(d) / "ready"
            main.queue = QueueManager(str(ready), f"{d}/rendering")
            segments = {
                "0_050_listener_request": "old@example.com",      # played long ago, still on disk
                "1_100_headlines": "[en] US Politics",            # on air
                "1_300_topic_podcast": "European News",
                "0_200_listener_request": "someone@example.com",  # waiting, written before the input check existed
            }
            for stem, name in segments.items():
                (ready / f"{stem}.mp3").write_bytes(b"x")
                (ready / f"{stem}.json").write_text(json.dumps({"topic_name": name, "segment_type": stem.split("_", 2)[2]}))
            main.config = type("C", (), {"liquidsoap_host": "127.0.0.1", "liquidsoap_port": self.port, "max_buffer_segments": 40})()
            main.get_liquidsoap_now_playing = lambda lang="en": {"source": "speech", "remaining_seconds": 30.0}
            main.segment_seconds = lambda seg: 200.0

            upcoming = asyncio.run(main.upcoming_plays("en"))
            status = asyncio.run(main.status("en"))

        self.assertEqual([u["topic_name"] for u in upcoming["upcoming"]], ["European News", "Listener request"])
        self.assertEqual([u["queue_position"] for u in upcoming["upcoming"]], [0, 1])
        times = [datetime.fromisoformat(u["estimated_play_time"]) for u in upcoming["upcoming"]]
        now = datetime.fromisoformat(upcoming["now"])
        self.assertEqual([(t - now).total_seconds() for t in times], [30.0, 230.0])
        self.assertEqual(status["now_playing"]["topic_name"], "[en] US Politics")
        self.assertEqual([s["filename"] for s in status["ready_queue"]],
                         ["1_300_topic_podcast.mp3", "0_200_listener_request.mp3"])
        self.assertEqual(status["total_ready"], 4)
        self.assertNotIn("example.com", json.dumps([upcoming, status]))


class RequestLogTests(unittest.TestCase):
    def test_outcomes_and_unresolved(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "r.jsonl"
            request_log.record("accepted", "a", now=1000, path=path)
            request_log.record("generated", "a", now=1100, path=path)
            request_log.record("accepted", "b", now=1000, path=path)
            request_log.record("failed", "b", now=1100, path=path)
            request_log.record("accepted", "c", now=1000, path=path)   # lost
            request_log.record("accepted", "d", now=4900, path=path)   # still young
            path.open("a").write("not json\n")
            s = request_log.summary(86400, now=5000, path=path)
        self.assertEqual((s["accepted"], s["generated"], s["failed"], s["unresolved"]), (4, 1, 1, 1))

    def test_missing_file_is_empty(self):
        self.assertEqual(request_log.summary(3600, path=Path("/nonexistent/x"))["accepted"], 0)


class AccessLogTests(unittest.TestCase):
    def test_topic_is_dropped_from_the_access_log_line(self):
        import main

        record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                                   ("1.2.3.4", "POST", "/api/request-topic?topic=someone%40example.com", "1.1", 200), None)
        self.assertTrue(main._NoListenerTextInAccessLog().filter(record))
        self.assertNotIn("example.com", record.getMessage())


if __name__ == "__main__":
    unittest.main()
