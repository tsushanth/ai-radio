"""Tests for the LLM backend tier order in RadioScriptGenerator.

Run from audexa-radio/orchestrator:  python -m pytest tests   (or: python -m unittest discover tests)
All network access is mocked.
"""
import io
import json
import logging
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import script_generator as sg  # noqa: E402

FAKE_KEY = "sk-or-v1-TESTKEY-do-not-leak-0123456789"


class FakeResp:
    def __init__(self, payload):
        self._raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def ok_payload(text="[]"):
    return {
        "model": "openai/gpt-6-luna",
        "choices": [{"message": {"content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.000001},
    }


def make_gen(key=FAKE_KEY, claude_bin="", api_key=None):
    env = {"OPENROUTER_API_KEY": key} if key else {}
    clean = {k: v for k, v in os.environ.items() if not k.startswith("OPENROUTER_")}
    clean.pop("ANTHROPIC_FALLBACK_KEY", None)
    if api_key:
        clean["ANTHROPIC_FALLBACK_KEY"] = api_key
    clean.update(env)
    with mock.patch.dict(os.environ, clean, clear=True), \
            mock.patch.object(sg.RadioScriptGenerator, "_check_ollama_available", return_value=False):
        gen = sg.RadioScriptGenerator(claude_bin=claude_bin or "/nonexistent/claude")
    # An empty claude_bin would auto-detect a real CLI; force the tier off instead.
    gen.claude_bin = claude_bin
    return gen


class TierTests(unittest.IsolatedAsyncioTestCase):
    async def test_order_cli_then_openrouter_then_ollama_then_api(self):
        gen = make_gen(claude_bin="/bin/claude", api_key="anthropic-test")
        calls = []

        async def fail(name):
            calls.append(name)
            raise RuntimeError(f"{name} 401 auth expired")

        gen._call_cli = lambda p: fail("cli")
        gen._call_openrouter = lambda p: fail("openrouter")
        gen._call_ollama = lambda p: fail("ollama")

        async def api(p):
            calls.append("api")
            return "api-text"

        gen._call_api = api
        self.assertEqual(await gen._call_smart("p"), "api-text")
        self.assertEqual(calls, ["cli", "openrouter", "ollama", "api"])
        self.assertEqual(gen.last_backend, "anthropic-api")

    async def test_cli_success_short_circuits(self):
        gen = make_gen(claude_bin="/bin/claude")

        async def cli(p):
            return "cli-text"

        gen._call_cli = cli
        gen._call_openrouter = mock.AsyncMock(side_effect=AssertionError("must not be called"))
        self.assertEqual(await gen._call_smart("p"), "cli-text")

    async def test_skipped_when_key_unset(self):
        gen = make_gen(key=None)
        gen._call_openrouter = mock.AsyncMock(side_effect=AssertionError("must not be called"))
        gen._call_ollama = mock.AsyncMock(return_value="ollama-text")
        self.assertEqual(await gen._call_smart("p"), "ollama-text")
        gen._call_openrouter.assert_not_called()

    async def test_disabled_logged_once_at_init(self):
        with self.assertLogs("script_generator", level="INFO") as cm:
            make_gen(key=None)
        self.assertEqual(sum("OpenRouter tier disabled" in m for m in cm.output), 1)

    async def test_openrouter_success_used_before_ollama(self):
        gen = make_gen()
        gen._call_ollama = mock.AsyncMock(side_effect=AssertionError("must not be called"))
        with mock.patch("urllib.request.urlopen", return_value=FakeResp(ok_payload("hello script"))) as u:
            self.assertEqual(await gen._call_smart("p"), "hello script")
        req = u.call_args[0][0]
        self.assertEqual(req.full_url, sg.OPENROUTER_URL)
        self.assertEqual(req.get_header("Authorization"), f"Bearer {FAKE_KEY}")
        body = json.loads(req.data)
        self.assertEqual(body["messages"][0]["content"], "p")
        self.assertEqual(body["max_tokens"], sg.OPENROUTER_MAX_TOKENS)
        self.assertEqual(gen.last_backend, f"openrouter:{sg.OPENROUTER_DEFAULT_MODEL}")

    async def _assert_falls_through(self, side_effect=None, return_value=None):
        gen = make_gen()
        gen._call_ollama = mock.AsyncMock(return_value="ollama-text")
        with mock.patch("urllib.request.urlopen", side_effect=side_effect, return_value=return_value):
            self.assertEqual(await gen._call_smart("p"), "ollama-text")
        return gen

    async def test_fallthrough_http_error(self):
        err = urllib.error.HTTPError(sg.OPENROUTER_URL, 500, "boom", {}, io.BytesIO(b"upstream"))
        await self._assert_falls_through(side_effect=err)

    async def test_fallthrough_timeout(self):
        await self._assert_falls_through(side_effect=TimeoutError("timed out"))

    async def test_fallthrough_overall_deadline(self):
        import time
        gen = make_gen()
        gen._openrouter_timeout = 0.05
        gen._call_ollama = mock.AsyncMock(return_value="ollama-text")
        with mock.patch("urllib.request.urlopen", side_effect=lambda *a, **k: (time.sleep(0.3), FakeResp(ok_payload("late")))[1]):
            self.assertEqual(await gen._call_smart("p"), "ollama-text")

    async def test_fallthrough_url_error(self):
        await self._assert_falls_through(side_effect=urllib.error.URLError("dns"))

    async def test_fallthrough_malformed_json(self):
        await self._assert_falls_through(return_value=FakeResp(b"<html>not json"))

    async def test_fallthrough_missing_choices(self):
        await self._assert_falls_through(return_value=FakeResp({"id": "x"}))

    async def test_fallthrough_error_in_200_body(self):
        await self._assert_falls_through(return_value=FakeResp({"error": {"message": "rate limited"}}))

    async def test_fallthrough_empty_content(self):
        await self._assert_falls_through(return_value=FakeResp(ok_payload("   ")))

    async def test_backoff_skips_tier_after_repeated_failures(self):
        gen = make_gen()
        gen._call_ollama = mock.AsyncMock(return_value="ollama-text")
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("t")) as u:
            for _ in range(sg.OPENROUTER_FAIL_THRESHOLD):
                await gen._call_smart("p")
            self.assertEqual(u.call_count, sg.OPENROUTER_FAIL_THRESHOLD)
            await gen._call_smart("p")
            await gen._call_smart("p")
            self.assertEqual(u.call_count, sg.OPENROUTER_FAIL_THRESHOLD)  # skipped, no retry storm
            # after cooldown it is tried again
            gen._openrouter_skip_until = 0
            await gen._call_smart("p")
            self.assertEqual(u.call_count, sg.OPENROUTER_FAIL_THRESHOLD + 1)

    async def test_auth_error_trips_cooldown_immediately(self):
        gen = make_gen()
        gen._call_ollama = mock.AsyncMock(return_value="o")
        err = urllib.error.HTTPError(sg.OPENROUTER_URL, 401, "no", {}, io.BytesIO(b"bad key"))
        with mock.patch("urllib.request.urlopen", side_effect=err) as u:
            await gen._call_smart("p")
            await gen._call_smart("p")
        self.assertEqual(u.call_count, 1)

    async def test_recovery_resets_fail_count(self):
        gen = make_gen()
        gen._call_ollama = mock.AsyncMock(return_value="o")
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("t")):
            await gen._call_smart("p")
        self.assertEqual(gen._openrouter_fail_count, 1)
        with mock.patch("urllib.request.urlopen", return_value=FakeResp(ok_payload("fine"))):
            self.assertEqual(await gen._call_smart("p"), "fine")
        self.assertEqual(gen._openrouter_fail_count, 0)

    async def test_key_and_prompt_never_in_logs(self):
        secret_prompt = "SECRET-PROMPT-BODY-xyz"
        gen = make_gen()
        gen._call_ollama = mock.AsyncMock(return_value="o")
        # error body that echoes the key must be scrubbed too
        err = urllib.error.HTTPError(
            sg.OPENROUTER_URL, 500, "x", {}, io.BytesIO(f"bad {FAKE_KEY}".encode()))
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        root = logging.getLogger()
        old_level = root.level
        root.addHandler(handler)
        root.setLevel(logging.DEBUG)
        try:
            gen2 = make_gen()
            gen2._call_ollama = mock.AsyncMock(return_value="o")
            with mock.patch("urllib.request.urlopen", side_effect=err):
                await gen2._call_smart(secret_prompt)
            with mock.patch("urllib.request.urlopen", return_value=FakeResp(ok_payload("ok"))):
                await gen._call_smart(secret_prompt)
        finally:
            root.removeHandler(handler)
            root.setLevel(old_level)
        logs = stream.getvalue()
        self.assertIn("OpenRouter", logs)
        self.assertNotIn(FAKE_KEY, logs)
        self.assertNotIn("TESTKEY", logs)
        self.assertNotIn(secret_prompt, logs)

    async def test_generate_uses_shared_parse_and_validation(self):
        gen = make_gen()
        script = json.dumps([
            {"speaker": "host1", "text": "a", "type": "intro"},
            {"speaker": "host2", "text": "b", "type": "headlines"},
            {"speaker": "host1", "text": "c", "type": "outro"},
        ])
        fenced = f"```json\n{script}\n```"
        with mock.patch("urllib.request.urlopen", return_value=FakeResp(ok_payload(fenced))):
            segs = await gen.generate_transition()
        self.assertEqual([s.text for s in segs], ["a", "b", "c"])


if __name__ == "__main__":
    unittest.main()
