import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import retell_handler  # noqa: E402
from queue_manager import QueueManager  # noqa: E402

KEY = "key_test_retell"


def _sign(body: bytes, key: str = KEY, ts_ms: int | None = None) -> str:
    ts = str(int(time.time() * 1000) if ts_ms is None else ts_ms)
    return f"v={ts},d=" + hmac.new(key.encode(), body + ts.encode(), hashlib.sha256).hexdigest()


class VerifyTests(unittest.TestCase):
    def test_valid_and_invalid(self):
        body = b'{"event":"call_ended"}'
        self.assertTrue(retell_handler.verify_retell_signature(body, KEY, _sign(body)))
        self.assertFalse(retell_handler.verify_retell_signature(body, KEY, _sign(body, "other")))
        self.assertFalse(retell_handler.verify_retell_signature(b'{"event":"x"}', KEY, _sign(body)))
        self.assertFalse(retell_handler.verify_retell_signature(body, KEY, ""))
        self.assertFalse(retell_handler.verify_retell_signature(body, "", _sign(body)))
        self.assertFalse(retell_handler.verify_retell_signature(body, KEY, "v=1,d=zz"))

    def test_stale_timestamp_rejected(self):
        body = b"{}"
        old = int(time.time() * 1000) - 6 * 60 * 1000
        self.assertFalse(retell_handler.verify_retell_signature(body, KEY, _sign(body, ts_ms=old)))


class WebhookPhase1Tests(unittest.TestCase):
    """Phase 1 observes only: an unsigned or badly signed request is still accepted, but counted and logged."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.qm = QueueManager(os.path.join(self.tmp.name, "ready"), os.path.join(self.tmp.name, "rendering"))
        retell_handler.set_queue_manager(self.qm)
        retell_handler.auth_counters.update(verified=0, failed=0)
        app = FastAPI()
        app.include_router(retell_handler.router)
        self.client = TestClient(app)
        os.environ["RETELL_API_KEY"] = KEY

    def tearDown(self):
        os.environ.pop("RETELL_API_KEY", None)
        self.tmp.cleanup()

    def _post(self, payload, signature=None):
        body = json.dumps(payload).encode()
        headers = {"content-type": "application/json"}
        if signature == "valid":
            headers["x-retell-signature"] = _sign(body)
        elif signature:
            headers["x-retell-signature"] = signature
        return self.client.post("/api/webhooks/retell", content=body, headers=headers)

    def _ended(self):
        return {"event": "call_ended", "call": {"call_id": "c1", "from_number": "+15550001111",
                "transcript": "Agent: hi\nUser: tell me about the history of jazz\nAgent: ok"}}

    def test_signed_request_is_counted_verified(self):
        r = self._post(self._ended(), "valid")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(retell_handler.auth_counters, {"verified": 1, "failed": 0})
        self.assertEqual(self.qm.get_request_queue_depth(), 1)

    def test_unsigned_request_still_accepted_but_counted_and_logged_without_content(self):
        with self.assertLogs("retell_handler", level="WARNING") as logs:
            r = self._post(self._ended())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(retell_handler.auth_counters, {"verified": 0, "failed": 1})
        text = "\n".join(logs.output)
        self.assertIn("signature_header=absent", text)
        self.assertNotIn("jazz", text)
        self.assertNotIn("5550001111", text)

    def test_bad_signature_counted_failed(self):
        self._post(self._ended(), "v=1700000000000,d=" + "0" * 64)
        self.assertEqual(retell_handler.auth_counters["failed"], 1)

    def test_invalid_json_is_400(self):
        r = self.client.post("/api/webhooks/retell", content=b"not json", headers={"content-type": "application/json"})
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
