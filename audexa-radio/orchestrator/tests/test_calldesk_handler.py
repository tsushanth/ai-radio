import hashlib
import hmac
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import calldesk_handler  # noqa: E402
from queue_manager import QueueManager  # noqa: E402

SECRET = "whsec_test"


def _sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _t(*pairs):
    return [{"role": r, "content": c} for r, c in pairs]


class TopicsTests(unittest.TestCase):
    def test_pattern_and_fallback(self):
        t = _t(("assistant", "What topic would you like?"), ("user", "Tell me about the Mars rover"))
        self.assertEqual(calldesk_handler.topics_from_transcript(t), ["the mars rover"])
        t = _t(("assistant", "Topic?"), ("user", "Sourdough bread baking"))
        self.assertEqual(calldesk_handler.topics_from_transcript(t), ["Sourdough bread baking"])

    def test_filler_replies_are_not_topics(self):
        t = _t(
            ("user", "Tell me about volcanoes"),
            ("assistant", "Added! Another topic?"),
            ("user", "No thanks, that's all"),
        )
        self.assertEqual(calldesk_handler.topics_from_transcript(t), ["volcanoes"])
        self.assertEqual(calldesk_handler.topics_from_transcript(_t(("user", "yes"), ("user", "okay"))), [])

    def test_engine_system_markers_are_not_topics(self):
        t = _t(
            ("user", "[Call connected \u2014 begin the flow.]"),
            ("assistant", "Welcome to Audexa Radio!"),
            ("user", "Tell me about the history of hot air balloons."),
            ("user", "No. Thanks. That is all."),
        )
        self.assertEqual(calldesk_handler.topics_from_transcript(t), ["the history of hot air balloons"])

    def test_multiple_topics_capped(self):
        t = _t(*[("user", f"tell me about subject number {n}") for n in range(6)])
        self.assertEqual(len(calldesk_handler.topics_from_transcript(t)), calldesk_handler.MAX_TOPICS_PER_CALL)

    def test_ignores_assistant_and_bad_shapes(self):
        self.assertEqual(calldesk_handler.topics_from_transcript(None), [])
        self.assertEqual(calldesk_handler.topics_from_transcript("User: hi"), [])
        self.assertEqual(calldesk_handler.topics_from_transcript([{"role": "assistant", "content": "tell me about x y z"}, 5, {"role": "user"}]), [])


class SignatureTests(unittest.TestCase):
    def test_verify(self):
        body = b'{"a":1}'
        self.assertTrue(calldesk_handler.verify_signature(SECRET, body, _sign(body)))
        self.assertFalse(calldesk_handler.verify_signature(SECRET, body, _sign(body, "other")))
        self.assertFalse(calldesk_handler.verify_signature(SECRET, body, ""))
        self.assertFalse(calldesk_handler.verify_signature("", body, _sign(body, "")))


class WebhookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.qm = QueueManager(os.path.join(self.tmp.name, "ready"), os.path.join(self.tmp.name, "rendering"))
        calldesk_handler.set_queue_manager(self.qm)
        calldesk_handler._seen_calls.clear()
        app = FastAPI()
        app.include_router(calldesk_handler.router)
        self.client = TestClient(app)
        os.environ["CALLDESK_WEBHOOK_SECRET"] = SECRET

    def tearDown(self):
        os.environ.pop("CALLDESK_WEBHOOK_SECRET", None)
        self.tmp.cleanup()

    def _post(self, payload, sign=True, secret=SECRET):
        body = json.dumps(payload).encode()
        headers = {"content-type": "application/json"}
        if sign:
            headers["x-calldesk-signature"] = _sign(body, secret)
        return self.client.post("/api/webhooks/calldesk", content=body, headers=headers)

    def _event(self, transcript, call_id="CA1", event="call.completed"):
        return {"event": event, "created_at": "x", "data": {"call_id": call_id, "transcript": transcript}}

    def test_queues_valid_topic(self):
        r = self._post(self._event(_t(("user", "tell me about the history of jazz"))))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.qm.get_request_queue_depth(), 1)

    def test_rejects_bad_signature_and_missing_secret(self):
        self.assertEqual(self._post(self._event(_t(("user", "tell me about jazz music"))), sign=False).status_code, 401)
        self.assertEqual(self._post(self._event(_t(("user", "tell me about jazz music"))), secret="wrong").status_code, 401)
        self.assertEqual(self.qm.get_request_queue_depth(), 0)
        os.environ.pop("CALLDESK_WEBHOOK_SECRET")
        self.assertEqual(self._post(self._event(_t(("user", "tell me about jazz music")))).status_code, 503)

    def test_blocked_topic_not_queued(self):
        self._post(self._event(_t(("user", "tell me about how to make a bomb"))))
        self.assertEqual(self.qm.get_request_queue_depth(), 0)

    def test_duplicate_delivery_queues_once(self):
        ev = self._event(_t(("user", "tell me about deep sea fishing")))
        self._post(ev)
        self._post(ev)
        self.assertEqual(self.qm.get_request_queue_depth(), 1)

    def test_other_events_ignored(self):
        self._post(self._event(_t(("user", "tell me about jazz music")), event="call.analyzed"))
        self.assertEqual(self.qm.get_request_queue_depth(), 0)


if __name__ == "__main__":
    unittest.main()
