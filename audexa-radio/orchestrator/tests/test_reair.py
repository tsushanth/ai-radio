"""
When the play queue runs dry the whole ready pool rotates, instead of the same newest five looping for hours.
"""

import asyncio
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("LOGS_DIR", tempfile.mkdtemp())

import main  # noqa: E402
from queue_manager import QueueManager  # noqa: E402


class _Stop(BaseException):
    """Ends the endless reconcile loop; not an Exception, so the loop does not swallow it."""


class ReairTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.q = QueueManager(f"{self.tmp.name}/ready", f"{self.tmp.name}/rendering")
        old = time.time() - 7200
        for i in range(23):
            self._segment(f"1_{1000 + i}_headlines", "headlines", old + i)

    def tearDown(self):
        self.tmp.cleanup()

    def _segment(self, stem, kind, written):
        for suffix, text in ((".mp3", "x"), (".json", '{"topic_name": "[en] News", "segment_type": "%s"}' % kind)):
            path = self.q.ready_dir / f"{stem}{suffix}"
            path.write_text(text)
            os.utime(path, (written, written))

    def _drain_and_refill(self, times):
        """Run the reconcile loop against an always empty Liquidsoap queue; return the file names pushed."""
        pushed = []
        sleeps = 0

        async def fake_sleep(_):
            nonlocal sleeps
            sleeps += 1
            if sleeps > times:
                raise _Stop

        class FakeTelnet:
            def __init__(self, *a, **k):
                pass

            def write(self, data):
                pushed.append(data.decode().split("/")[-1].strip())

            def read_until(self, *a, **k):
                return b"END"

            def close(self):
                pass

        config = type("C", (), {"liquidsoap_host": "x", "liquidsoap_port": 1})()
        with mock.patch.object(main, "queue", self.q, create=True), \
                mock.patch.object(main, "config", config, create=True), \
                mock.patch.object(main, "RADIO_LANGUAGES", ["en"]), \
                mock.patch.object(main, "get_liquidsoap_queue_lengths", lambda: {"en": 0}), \
                mock.patch.object(main.telnetlib, "Telnet", FakeTelnet), \
                mock.patch.object(main.asyncio, "sleep", fake_sleep):
            try:
                asyncio.run(main.reconcile_liquidsoap_queues())
            except _Stop:
                pass
        return pushed

    def test_every_segment_airs_before_any_repeats(self):
        pushed = self._drain_and_refill(6)  # 30 pushes over a pool of 23
        self.assertEqual(len(set(pushed[:23])), 23)
        self.assertEqual(pushed[23:30], pushed[:7])  # then the ones aired longest ago

    def test_order_survives_a_restart(self):
        first = self._drain_and_refill(1)
        self.q = QueueManager(str(self.q.ready_dir), str(self.q.rendering_dir))
        self.assertFalse(set(first) & set(self._drain_and_refill(1)))

    def test_listener_requests_are_not_re_aired(self):
        self._segment("0_500_listener_request", "listener_request", time.time() - 9000)
        self.assertNotIn("0_500_listener_request.mp3", self._drain_and_refill(10))

    def test_listener_request_is_better_than_nothing(self):
        for path in self.q.ready_dir.iterdir():
            path.unlink()
        self._segment("0_500_listener_request", "listener_request", time.time() - 9000)
        self.assertEqual(self._drain_and_refill(1), ["0_500_listener_request.mp3"])

    def test_marking_a_play_does_not_extend_retention(self):
        self._drain_and_refill(1)
        self.assertEqual(self.q.prune_expired(3600), 23)

    def test_reair_gap_is_reported(self):
        with mock.patch.object(main, "_last_reair_gap_sec", None):
            self._drain_and_refill(1)
            self.assertGreaterEqual(main._last_reair_gap_sec, 7000)
            self._drain_and_refill(5)  # the pool wraps around within seconds here
            self.assertLess(main._last_reair_gap_sec, 60)


if __name__ == "__main__":
    unittest.main()
