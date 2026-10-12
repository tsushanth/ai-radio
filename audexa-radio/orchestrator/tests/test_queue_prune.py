import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from queue_manager import QueueManager  # noqa: E402


def _seg(d: Path, name: str, age_sec: float, now: float, sidecar: bool = True):
    mp3 = d / f"{name}.mp3"
    mp3.write_bytes(b"x")
    os.utime(mp3, (now - age_sec, now - age_sec))
    if sidecar:
        (d / f"{name}.json").write_text("{}")
    return mp3


class PruneTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ready = Path(self.tmp.name) / "ready"
        self.q = QueueManager(str(self.ready), str(Path(self.tmp.name) / "rendering"))
        self.now = time.time()

    def tearDown(self):
        self.tmp.cleanup()

    def test_removes_only_expired_with_sidecars(self):
        _seg(self.ready, "old", 13 * 3600, self.now)
        _seg(self.ready, "fresh", 3600, self.now)
        self.assertEqual(self.q.prune_expired(12 * 3600, now=self.now), 1)
        self.assertFalse((self.ready / "old.mp3").exists())
        self.assertFalse((self.ready / "old.json").exists())
        self.assertTrue((self.ready / "fresh.mp3").exists())
        self.assertTrue((self.ready / "fresh.json").exists())
        self.assertEqual(self.q.count_ready_segments(), 1)

    def test_boundary_is_kept(self):
        _seg(self.ready, "edge", 12 * 3600, self.now)
        self.assertEqual(self.q.prune_expired(12 * 3600, now=self.now), 0)

    def test_orphan_sidecar_removed(self):
        (self.ready / "ghost.json").write_text("{}")
        self.q.prune_expired(12 * 3600, now=self.now)
        self.assertFalse((self.ready / "ghost.json").exists())

    def test_empty_dir(self):
        self.assertEqual(self.q.prune_expired(1, now=self.now), 0)
        self.assertIsNone(self.q.newest_segment_age_sec(now=self.now))

    def test_newest_age(self):
        _seg(self.ready, "a", 5000, self.now)
        _seg(self.ready, "b", 100, self.now)
        self.assertAlmostEqual(self.q.newest_segment_age_sec(now=self.now), 100, delta=1)


if __name__ == "__main__":
    unittest.main()
