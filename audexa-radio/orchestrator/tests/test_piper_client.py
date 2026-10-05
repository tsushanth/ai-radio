import asyncio
import io
import os
import sys
import unittest
import wave

from aiohttp import web
from aiohttp.test_utils import TestServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import piper_client as pc  # noqa: E402

PCM = b"\x01\x00" * 2400  # 0.1 s at 24 kHz


class FakePiper:
    def __init__(self, active=0, fail_first=0, status=503):
        self.active, self.fail_left, self.status = active, fail_first, status
        self.posts, self.health_calls, self.bodies, self.auth = 0, 0, [], []

    def app(self):
        a = web.Application()

        async def health(_):
            self.health_calls += 1
            return web.json_response({"status": "healthy", "active": self.active, "max": 4})

        async def stream(req):
            self.posts += 1
            self.auth.append(req.headers.get("Authorization"))
            self.bodies.append(await req.json())
            if self.fail_left > 0:
                self.fail_left -= 1
                return web.json_response({"error": "at capacity"}, status=self.status, headers={"Retry-After": "0"})
            return web.Response(body=PCM, content_type="audio/pcm")

        a.router.add_get("/health", health)
        a.router.add_post("/v1/tts/stream", stream)
        return a


class PiperClientTests(unittest.IsolatedAsyncioTestCase):
    async def start(self, fake, **kw):
        self.server = TestServer(fake.app())
        await self.server.start_server()
        kw.setdefault("poll_sec", 0.01)
        c = pc.PiperTTSClient(str(self.server.make_url("")), "tok-secret", **kw)
        self.addAsyncCleanup(c.close)
        self.addAsyncCleanup(self.server.close)
        return c

    async def test_returns_valid_24k_mono_wav_with_bearer_and_voice(self):
        f = FakePiper()
        c = await self.start(f)
        wav = await c.synthesize("Hello there. General Kenobi.", "custom:en-us-warm-f")
        with wave.open(io.BytesIO(wav)) as w:
            self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate()), (1, 2, 24000))
            self.assertEqual(w.getnframes(), 2400)
        self.assertEqual(f.auth, ["Bearer tok-secret"])
        self.assertEqual(f.bodies[0]["voice"], "custom:en-us-warm-f")
        self.assertEqual(f.bodies[0]["format"], "pcm_24000")

    async def test_retries_on_503_then_succeeds(self):
        f = FakePiper(fail_first=2)
        c = await self.start(f, retries=3)
        await c.synthesize("Hi.", "v")
        self.assertEqual(f.posts, 3)

    async def test_gives_up_after_retries(self):
        f = FakePiper(fail_first=99)
        c = await self.start(f, retries=1)
        with self.assertRaises(pc.PiperError):
            await c.synthesize("Hi.", "v")
        self.assertEqual(f.posts, 2)

    async def test_non_retryable_error_fails_fast(self):
        f = FakePiper(fail_first=99, status=404)
        c = await self.start(f, retries=3)
        with self.assertRaises(pc.PiperError):
            await c.synthesize("Hi.", "nope")
        self.assertEqual(f.posts, 1)

    async def test_yields_to_busy_server_then_proceeds_after_max_wait(self):
        f = FakePiper(active=3)  # Calldesk busy
        c = await self.start(f, busy_active=2, max_wait_sec=0.15)
        await c.synthesize("Hi.", "v")
        self.assertGreater(f.health_calls, 2)  # it waited and polled
        self.assertEqual(f.posts, 1)  # but did not starve forever

    async def test_waits_only_while_busy(self):
        f = FakePiper(active=0)
        c = await self.start(f, busy_active=2)
        await c.synthesize("Hi.", "v")
        self.assertEqual(f.health_calls, 1)

    async def test_concurrency_limited_to_one(self):
        overlap, cur = [0], [0]

        async def slow(req):
            cur[0] += 1
            overlap[0] = max(overlap[0], cur[0])
            await asyncio.sleep(0.05)
            cur[0] -= 1
            return web.Response(body=PCM, content_type="audio/pcm")

        async def health(req):
            return web.json_response({"active": 0})

        app = web.Application()
        app.router.add_get("/health", health)
        app.router.add_post("/v1/tts/stream", slow)
        srv = TestServer(app)
        await srv.start_server()
        self.addAsyncCleanup(srv.close)
        c = pc.PiperTTSClient(str(srv.make_url("")), "t", max_concurrent=1, poll_sec=0.01)
        self.addAsyncCleanup(c.close)
        await asyncio.gather(*(c.synthesize("Hi.", "v") for _ in range(4)))
        self.assertEqual(overlap[0], 1)

    async def test_long_text_split_into_chunks_under_limit(self):
        f = FakePiper()
        c = await self.start(f)
        text = " ".join(f"This is sentence number {i} of a long script." for i in range(80))
        await c.synthesize(text, "v")
        self.assertGreater(f.posts, 1)
        self.assertTrue(all(len(b["text"]) <= pc.MAX_CHUNK_CHARS for b in f.bodies))

    def test_split_hard_cuts_a_huge_sentence(self):
        chunks = pc._split_text("word " * 600, limit=100)
        self.assertTrue(all(len(c) <= 100 for c in chunks))
        self.assertEqual(" ".join(chunks).split(), ("word " * 600).split())

    def test_from_env_requires_token(self):
        os.environ.pop("PIPER_AUTH_TOKEN", None)
        with self.assertRaises(RuntimeError):
            pc.from_env(1.05)


if __name__ == "__main__":
    unittest.main()
