import asyncio
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import listener_sampler as ls  # noqa: E402

NOW = 1_760_000_000


class ParseTests(unittest.TestCase):
    def test_single_source_dict(self):
        doc = {"icestats": {"source": {"listenurl": "http://h:8000/stream", "listeners": 3, "ip": "x"}}}
        self.assertEqual(ls.parse_icecast_status(doc), {"/stream": 3})

    def test_multiple_sources(self):
        doc = {"icestats": {"source": [
            {"listenurl": "http://h/stream", "listeners": 2},
            {"listenurl": "http://h/stream-es", "listeners": 5}]}}
        self.assertEqual(ls.parse_icecast_status(doc), {"/stream": 2, "/stream-es": 5})

    def test_no_sources(self):
        self.assertEqual(ls.parse_icecast_status({"icestats": {}}), {})

    def test_garbage_raises(self):
        with self.assertRaises(ValueError):
            ls.parse_icecast_status({"nope": 1})

    def test_sample_has_only_counts(self):
        s = ls.make_sample(NOW, {"/stream": 2, "/b": 1})
        self.assertEqual(s, {"ts": NOW, "total": 3, "mounts": {"/stream": 2, "/b": 1}})
        self.assertIsNone(ls.make_sample(NOW, None)["total"])


class BucketTests(unittest.TestCase):
    def test_avg_max_and_gap(self):
        samples = [
            {"ts": NOW - 590, "total": 2}, {"ts": NOW - 560, "total": 4},
            {"ts": NOW - 100, "total": None},
        ]
        r = ls.bucketize(samples, 1, NOW)
        valid = [b for b in r["buckets"] if b["max"] is not None]
        self.assertEqual(len(valid), 1)
        self.assertEqual((valid[0]["avg"], valid[0]["max"]), (3.0, 4))
        self.assertEqual(r["peak"]["listeners"], 4)
        self.assertIsNone(r["current"]["total"])  # latest sample was a failure
        # bucket of the null sample is a gap, not zero
        nullb = [b for b in r["buckets"] if b["ts"] == (NOW - 100) // 300 * 300][0]
        self.assertIsNone(nullb["avg"])

    def test_excludes_outside_window_and_future(self):
        samples = [{"ts": NOW - 7200, "total": 99}, {"ts": NOW + 500, "total": 77}, {"ts": NOW - 10, "total": 1}]
        r = ls.bucketize(samples, 1, NOW)
        self.assertEqual(r["peak"]["listeners"], 1)

    def test_bucket_alignment_and_count(self):
        r = ls.bucketize([], 1, NOW)
        self.assertTrue(all(b["ts"] % 300 == 0 for b in r["buckets"]))
        self.assertIn(len(r["buckets"]), (12, 13))
        self.assertIsNone(r["peak"])
        self.assertIsNone(r["current"])


class FileTests(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.p = os.path.join(self.d.name, "sub", "h.jsonl")

    def tearDown(self):
        self.d.cleanup()

    def test_append_load_skips_corrupt(self):
        ls.append_sample(self.p, {"ts": NOW, "total": 1, "mounts": {}})
        with open(self.p, "a") as f:
            f.write('{"ts": 12\n')
        self.assertEqual(len(ls.load_samples(self.p)), 1)

    def test_prune_30_days(self):
        ls.append_sample(self.p, {"ts": NOW - 31 * 86400, "total": 1, "mounts": {}})
        ls.append_sample(self.p, {"ts": NOW - 29 * 86400, "total": 2, "mounts": {}})
        self.assertEqual(ls.prune(self.p, NOW), 1)
        self.assertEqual([r["total"] for r in ls.load_samples(self.p)], [2])

    def test_sample_once_icecast_down_records_null(self):
        def boom(url):
            raise ConnectionRefusedError("down")
        s = asyncio.run(ls.sample_once(self.p, "http://x", boom))
        self.assertIsNone(s["total"])
        self.assertIsNone(ls.load_samples(self.p)[0]["total"])

    def test_loop_survives_write_failure(self):
        calls = {"n": 0}

        async def run():
            orig = ls.append_sample

            def flaky(path, sample):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise OSError("disk full")
                orig(path, sample)
            ls.append_sample = flaky
            try:
                t = asyncio.create_task(ls.run_loop(self.p, "http://x", 0.01, lambda u: {"/stream": 1}))
                await asyncio.sleep(0.2)
                t.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await t
            finally:
                ls.append_sample = orig
        asyncio.run(run())
        self.assertGreaterEqual(len(ls.load_samples(self.p)), 1)

    def test_history_clamps_hours(self):
        r = ls.history(10_000, NOW, self.p)
        self.assertEqual(r["hours"], 720)


if __name__ == "__main__":
    unittest.main()
