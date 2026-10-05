import asyncio
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import email_alerter as ea  # noqa: E402


class EmptyArgsTests(unittest.TestCase):
    def setUp(self):
        ea._state.recent.clear()
        ea._state.sent_today = 0

    def test_error_message_handles_empty_args(self):
        self.assertEqual(ea._error_message(TimeoutError()), "TimeoutError")
        self.assertEqual(ea._error_message(asyncio.TimeoutError()), "TimeoutError")
        self.assertEqual(ea._error_message(ValueError("boom")), "boom")
        self.assertEqual(ea._error_message("plain"), "plain")

    def test_fingerprint_with_empty_args(self):
        fp = ea._fingerprint(TimeoutError(), {"source": "x"})
        self.assertTrue(fp.startswith("x:TimeoutError:"))

    def test_report_error_with_empty_args_does_not_raise(self):
        # Regression: a bare TimeoutError() raised IndexError inside the alert path
        # (topic_podcast_injector_loop, 2026-10-04) and masked the real timeout.
        with mock.patch.object(ea, "_send_email", return_value=True):
            ea.report_error(asyncio.TimeoutError(), source="topic_podcast_injector_loop")


if __name__ == "__main__":
    unittest.main()
