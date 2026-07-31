"""
Email alerter for unexpected errors + scheduler stalls.

Mirrors the RiddleVerse `errorNotificationService.js` design:
  - Resend HTTP API via env var RESEND_API_KEY (Gmail SMTP also supported
    as a fallback if EMAIL_USER+EMAIL_PASSWORD are set)
  - Fingerprint each error (endpoint + message + stack head) for dedupe
  - 5-minute dedup window so a repeating error doesn't spam
  - Daily ceiling of 50 emails to prevent runaway floods
  - Batching: queue errors for up to 60s, then send one digest

The deploy story for this is: set RESEND_API_KEY in the audexa-radio .env
on Hetzner (plus EMAIL_FROM and EMAIL_TO), restart the orchestrator
container. If neither Resend nor SMTP env is set, the module degrades to
logger-only (no crash, no email).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import smtplib
import traceback
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from threading import Lock
from typing import Any, Dict, List, Optional

logger = logging.getLogger("email_alerter")

# Config — mirrors RiddleVerse defaults
MAX_EMAILS_PER_DAY = int(os.getenv("ALERT_MAX_EMAILS_PER_DAY", "50"))
DEDUP_WINDOW_SEC = int(os.getenv("ALERT_DEDUP_WINDOW_SEC", "300"))         # 5 min
BATCH_WINDOW_SEC = int(os.getenv("ALERT_BATCH_WINDOW_SEC", "60"))           # 1 min
MAX_ERRORS_PER_BATCH = int(os.getenv("ALERT_MAX_BATCH_ERRORS", "10"))

EMAIL_USER = os.getenv("EMAIL_USER", "").strip()
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "").strip()
EMAIL_TO = os.getenv("EMAIL_TO", EMAIL_USER).strip()  # default: send to self
EMAIL_SUBJECT_PREFIX = os.getenv("EMAIL_SUBJECT_PREFIX", "[Audexa Radio]")

# Resend config — preferred when set since it sidesteps Gmail's SMTP +
# 2-step + app-password ceremony entirely. Domain has to be verified in
# Resend for non-default `from`; the default `onboarding@resend.dev` works
# out-of-the-box on Resend's free tier (100/day) without DNS work.
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM = os.getenv("EMAIL_FROM", "Audexa Radio <onboarding@resend.dev>").strip()


class _State:
    """Module-level state. Single-process orchestrator → simple in-memory store."""

    def __init__(self) -> None:
        # fingerprint → last_sent_ts
        self.recent: Dict[str, float] = {}
        # Pending errors waiting for batch send
        self.pending: List[Dict[str, Any]] = []
        # Lock around shared structures
        self.lock = Lock()
        # Daily counter
        self.sent_today = 0
        self.last_reset_day = ""
        # Batch send task handle
        self.batch_task: Optional[asyncio.Task] = None


_state = _State()


def _today_key() -> str:
    import datetime as _dt
    return _dt.date.today().isoformat()


def _check_daily_reset() -> None:
    today = _today_key()
    if _state.last_reset_day != today:
        _state.sent_today = 0
        _state.last_reset_day = today
        # Also clear the dedup cache so a true persistent error re-alerts the next day
        _state.recent.clear()


def _fingerprint(error: BaseException | str, context: Dict[str, Any]) -> str:
    """Identity for deduplication. Endpoint + first 100 chars of message + first stack line."""
    if isinstance(error, str):
        msg = error
    else:
        args = getattr(error, "args", ())
        msg = str(args[0]) if args else type(error).__name__
    endpoint = context.get("endpoint", context.get("source", "unknown"))
    stack_head = ""
    if isinstance(error, BaseException):
        tb = traceback.extract_tb(error.__traceback__)
        if tb:
            f = tb[-1]
            stack_head = f"{os.path.basename(f.filename)}:{f.lineno}"
    return f"{endpoint}:{msg[:100]}:{stack_head[:50]}"


def _send_resend(subject: str, body: str) -> bool:
    """Synchronous Resend HTTP send. Returns True on success."""
    if not (RESEND_API_KEY and EMAIL_TO):
        return False
    try:
        payload = {
            "from": RESEND_FROM,
            "to": [EMAIL_TO],
            "subject": f"{EMAIL_SUBJECT_PREFIX} {subject}",
            "text": body,
        }
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
                # Cloudflare in front of Resend returns 403 1010 for the
                # default Python urllib User-Agent when the source IP is
                # a datacenter range (Hetzner, AWS, etc.). A real-looking
                # UA + Accept clears the bot challenge.
                "User-Agent": "AudexaRadio/1.0 (+https://audexa.app)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if 200 <= resp.status < 300:
                logger.info(f"Email alert sent via Resend: {subject}")
                return True
            logger.error(f"Resend non-2xx: {resp.status} {resp.read()[:200]!r}")
            return False
    except urllib.error.HTTPError as e:
        logger.error(f"Resend HTTPError {e.code}: {e.read()[:200]!r}")
        return False
    except Exception as e:
        logger.error(f"Resend send failed: {e}", exc_info=True)
        return False


def _send_smtp(subject: str, body: str) -> bool:
    """Synchronous SMTP send via Gmail. Fallback if Resend isn't configured."""
    if not (EMAIL_USER and EMAIL_PASSWORD and EMAIL_TO):
        return False
    try:
        msg = MIMEMultipart()
        msg["From"] = EMAIL_USER
        msg["To"] = EMAIL_TO
        msg["Subject"] = f"{EMAIL_SUBJECT_PREFIX} {subject}"
        msg.attach(MIMEText(body, "plain", "utf-8"))

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(EMAIL_USER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        logger.info(f"Email alert sent via SMTP: {subject}")
        return True
    except Exception as e:
        logger.error(f"SMTP send failed: {e}", exc_info=True)
        return False


def _send_email(subject: str, body: str) -> bool:
    """Try Resend first (fast, no auth ceremony), fall back to SMTP."""
    if RESEND_API_KEY:
        return _send_resend(subject, body)
    if EMAIL_USER and EMAIL_PASSWORD:
        return _send_smtp(subject, body)
    logger.warning(
        "Email alert skipped — neither RESEND_API_KEY nor EMAIL_USER+EMAIL_PASSWORD set"
    )
    return False


async def _flush_batch() -> None:
    """Send all pending errors as a single digest, then reset the queue."""
    with _state.lock:
        items = _state.pending[:]
        _state.pending.clear()

    if not items:
        return

    _check_daily_reset()
    if _state.sent_today >= MAX_EMAILS_PER_DAY:
        logger.warning(f"Daily email cap ({MAX_EMAILS_PER_DAY}) reached, dropping batch of {len(items)}")
        return

    # Build digest body
    lines: List[str] = []
    lines.append(f"Audexa Radio surfaced {len(items)} error(s) in the last {BATCH_WINDOW_SEC}s.")
    lines.append("")
    for i, item in enumerate(items, 1):
        lines.append(f"--- #{i} [{item['source']}] ---")
        lines.append(f"Time: {item['ts_iso']}")
        if item.get("context"):
            lines.append(f"Context: {item['context']}")
        lines.append(f"Error:  {item['message']}")
        if item.get("stack"):
            lines.append("Stack:")
            lines.append(item["stack"])
        lines.append("")

    subject = items[0]["short_subject"] if len(items) == 1 else f"{len(items)} errors batched"
    body = "\n".join(lines)

    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, _send_email, subject, body)
    if success:
        _state.sent_today += 1


def _schedule_batch_flush(loop: asyncio.AbstractEventLoop) -> None:
    """Schedule a coalesced flush after BATCH_WINDOW_SEC. No-op if already scheduled."""
    if _state.batch_task and not _state.batch_task.done():
        return

    async def _waiter() -> None:
        try:
            await asyncio.sleep(BATCH_WINDOW_SEC)
            await _flush_batch()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Batch flush failed: {e}", exc_info=True)

    _state.batch_task = loop.create_task(_waiter())


def report_error(
    error: BaseException | str,
    *,
    source: str,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Queue an error for email notification.

    Safe to call from synchronous code — the actual send is deferred to
    the event loop. If no loop is running we still log.

    Args:
      error: Exception instance or string message.
      source: short tag for grouping (e.g. "scheduler", "tts_client").
      context: optional dict with details ({"lang": "ja", "topic": "..."}).
    """
    import datetime as _dt
    context = context or {}

    # Always log so we still have a paper trail when email is disabled
    if isinstance(error, BaseException):
        logger.error(f"[alert/{source}] {error}", exc_info=error)
    else:
        logger.error(f"[alert/{source}] {error}")

    _check_daily_reset()
    if _state.sent_today >= MAX_EMAILS_PER_DAY:
        return  # rate-limited — log only

    fp = _fingerprint(error, {"source": source, **context})
    now = asyncio.get_event_loop().time() if _try_running_loop() else 0.0
    last = _state.recent.get(fp, 0.0)
    if last and (now - last) < DEDUP_WINDOW_SEC:
        return  # deduped — already sent this fingerprint recently
    _state.recent[fp] = now

    # Build a structured payload
    msg = (
        str(getattr(error, "args", [error])[0])
        if not isinstance(error, str)
        else error
    )
    stack = ""
    if isinstance(error, BaseException):
        stack = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    short_subject = f"{source}: {msg[:80]}"

    payload = {
        "source": source,
        "ts_iso": _dt.datetime.utcnow().isoformat() + "Z",
        "context": ", ".join(f"{k}={v}" for k, v in context.items()) if context else "",
        "message": msg,
        "stack": stack,
        "short_subject": short_subject,
    }

    with _state.lock:
        _state.pending.append(payload)
        # Send immediately if a single batch fills up; otherwise schedule a coalesced flush
        if len(_state.pending) >= MAX_ERRORS_PER_BATCH:
            asyncio.get_event_loop().create_task(_flush_batch())
            return

    loop = _try_running_loop()
    if loop:
        _schedule_batch_flush(loop)


def _try_running_loop() -> Optional[asyncio.AbstractEventLoop]:
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        return None


def install_asyncio_exception_handler(loop: asyncio.AbstractEventLoop) -> None:
    """Wire a global asyncio exception handler. Any uncaught exception in a
    create_task'd coroutine surfaces here instead of being silently lost."""

    def _handler(loop_, ctx):  # noqa: ANN001
        # ctx fields: 'message', 'exception', 'task'
        exc = ctx.get("exception")
        msg = ctx.get("message", "Unhandled asyncio error")
        task = ctx.get("task")
        task_name = getattr(task, "get_name", lambda: "?")() if task else "?"
        if exc:
            report_error(
                exc,
                source="asyncio",
                context={"message": msg, "task": task_name},
            )
        else:
            report_error(msg, source="asyncio", context={"task": task_name})
        # Default handler also logs — defer to it for the visible traceback
        loop_.default_exception_handler(ctx)

    loop.set_exception_handler(_handler)
    logger.info("asyncio exception handler installed; silent task deaths will alert")


# ─── Scheduler heartbeat ────────────────────────────────────────────────────

_last_generation_ts: float = 0.0


def mark_generation_success() -> None:
    """Called from main.py whenever a content segment finishes generation."""
    global _last_generation_ts
    _last_generation_ts = asyncio.get_event_loop().time() if _try_running_loop() else 0.0


def seconds_since_last_generation() -> float:
    """How long since the last successful content generation? Used by the health endpoint."""
    if _last_generation_ts == 0.0:
        return float("inf")
    loop = _try_running_loop()
    if not loop:
        return float("inf")
    return loop.time() - _last_generation_ts
