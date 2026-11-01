"""
Retell Webhook Handler — receives call events from Retell AI,
extracts and validates topic requests from transcripts, pushes to request queue.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from queue_manager import QueueManager

logger = logging.getLogger(__name__)

router = APIRouter()

# Module-level reference — set by main.py during startup
_queue_manager: QueueManager | None = None


def set_queue_manager(qm: QueueManager):
    global _queue_manager
    _queue_manager = qm


# --- webhook authentication -------------------------------------------------------------------
# Retell signs every webhook: header `X-Retell-Signature: v=<unix ms>,d=<hex>`, where d is
# HMAC-SHA256(key = a Retell API key that carries the "webhook" badge, data = raw body + timestamp).
# The timestamp must be within 5 minutes (replay). Docs: docs.retellai.com/features/secure-webhook.
SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000
_SIG_RE = re.compile(r"^v=(\d{10,16}),d=([0-9a-fA-F]{64})$")

# Phase 1 (observe only): counts of what the verifier saw, readable from logs / a debugger.
auth_counters = {"verified": 0, "failed": 0}


def verify_retell_signature(raw_body: bytes, api_key: str, header: str, now_ms: int | None = None) -> bool:
    if not api_key or not header:
        return False
    m = _SIG_RE.match(header.strip())
    if not m:
        return False
    ts = int(m.group(1))
    now = int(time.time() * 1000) if now_ms is None else now_ms
    if abs(now - ts) > SIGNATURE_TOLERANCE_MS:
        return False
    expected = hmac.new(api_key.encode(), raw_body + m.group(1).encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2).lower())


def check_retell_auth(request: Request, raw_body: bytes) -> bool:
    """Phase 1: verify and record, but never reject. Logs header NAMES only (no values, no body)."""
    api_key = os.getenv("RETELL_API_KEY", "")
    header = request.headers.get("x-retell-signature", "")
    if verify_retell_signature(raw_body, api_key, header):
        auth_counters["verified"] += 1
        logger.info("Retell webhook signature verified (verified=%d failed=%d)", auth_counters["verified"], auth_counters["failed"])
        return True
    auth_counters["failed"] += 1
    logger.warning(
        "Retell webhook NOT verified, accepted anyway (phase 1): key_configured=%s signature_header=%s headers_present=%s verified=%d failed=%d",
        bool(api_key), "present" if header else "absent", sorted(request.headers.keys()),
        auth_counters["verified"], auth_counters["failed"],
    )
    return False


# Topics that are clearly off-limits for a public radio service
_BLOCKED_KEYWORDS = {
    "porn", "pornography", "sex", "nude", "naked", "xxx", "adult content",
    "kill", "murder", "bomb", "terrorist", "terrorism", "suicide", "self-harm",
    "drug", "cocaine", "heroin", "meth", "rape", "abuse", "violence",
    "hack", "exploit", "malware", "ransomware",
}


def validate_topic_request(topic: str) -> tuple[bool, str]:
    """
    Validate a listener topic request.

    Returns (is_valid, reason).
    reason is "ok" if valid, otherwise a short code explaining why not.
    """
    if not topic:
        return False, "empty"

    cleaned = topic.strip()

    if len(cleaned) < 3:
        return False, "too_short"

    if len(cleaned) > 200:
        return False, "too_long"

    topic_lower = cleaned.lower()

    # Block explicit/harmful content
    for kw in _BLOCKED_KEYWORDS:
        if kw in topic_lower:
            logger.warning(f"Blocked topic request (inappropriate): '{cleaned}'")
            return False, "inappropriate"

    # Reject mostly non-alphabetic input (gibberish, random chars)
    alpha_chars = sum(c.isalpha() or c.isspace() for c in cleaned)
    if alpha_chars / len(cleaned) < 0.5:
        return False, "gibberish"

    # Reject if it's purely a number or very short number string
    if cleaned.replace(" ", "").isdigit():
        return False, "invalid"

    return True, "ok"


@router.post("/api/webhooks/retell")
async def retell_webhook(request: Request):
    """Handle Retell webhook events."""
    if _queue_manager is None:
        return JSONResponse({"error": "Queue manager not initialized"}, status_code=500)

    raw = await request.body()
    check_retell_auth(request, raw)

    try:
        event = json.loads(raw)
        if not isinstance(event, dict):
            raise ValueError("not an object")
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    event_type = event.get("event", "")
    call_data = event.get("call", {})

    logger.info(f"Retell webhook: {event_type}, call_id={call_data.get('call_id', 'unknown')}")

    if event_type == "call_started":
        logger.info(f"Call started from {call_data.get('from_number', 'unknown')}")

    elif event_type == "call_ended":
        transcript = call_data.get("transcript", "")
        caller_phone = call_data.get("from_number", "")

        if transcript:
            topic = extract_topic_from_transcript(transcript)
            if topic:
                valid, reason = validate_topic_request(topic)
                if valid:
                    position = await _queue_manager.add_listener_request(topic, caller_phone)
                    logger.info(f"Topic request queued: '{topic}' at position {position}")
                else:
                    logger.info(f"Topic request rejected ({reason}): '{topic}'")
            else:
                logger.info("No topic request found in transcript")

    elif event_type == "call_analyzed":
        logger.debug(f"Call analyzed: {call_data.get('call_id')}")

    return {"success": True}


@router.get("/api/webhooks/retell/queue")
async def get_request_queue():
    """Get current request queue status (for Retell agent to estimate wait)."""
    if _queue_manager is None:
        return JSONResponse({"error": "Not initialized"}, status_code=500)

    return {
        "queue_depth": _queue_manager.get_request_queue_depth(),
        "estimated_wait_minutes": _queue_manager.estimate_wait_minutes(),
        "ready_segments": _queue_manager.count_ready_segments(),
    }


def extract_topic_from_transcript(transcript: str) -> str | None:
    """
    Extract a topic request from a Retell call transcript.

    Retell transcripts are formatted as:
      "Agent: Hello! ... \nUser: I want to hear about SpaceX\nAgent: Great! ..."
    """
    if not transcript:
        return None

    lines = transcript.strip().split("\n")
    user_messages = []
    for line in lines:
        line = line.strip()
        if line.startswith("User:"):
            user_messages.append(line[5:].strip())

    return extract_topic_from_user_messages(user_messages)


def extract_topic_from_user_messages(user_messages: list[str]) -> str | None:
    """Pick the topic out of what the caller said (shared by the Retell and Calldesk handlers)."""
    if not user_messages:
        return None

    patterns = [
        r"(?:talk|tell|hear|cover|discuss|report)\s+(?:about|on|regarding)\s+(.+)",
        r"(?:what(?:'s| is) (?:happening|going on) with)\s+(.+)",
        r"(?:i(?:'m| am) interested in)\s+(.+)",
        r"(?:can you (?:do|cover))\s+(.+)",
        r"(?:how about)\s+(.+)",
        r"(?:give me|play me|tell me)\s+(.+)",
        r"(?:something about)\s+(.+)",
    ]

    for msg in user_messages:
        msg_lower = msg.lower().rstrip("?.!")
        for pattern in patterns:
            match = re.search(pattern, msg_lower)
            if match:
                topic = match.group(1).strip().rstrip("?.!,")
                # "tell me about X" reaches the loose "tell me" pattern with "about X"
                topic = re.sub(r"^(?:about|on|regarding)\s+", "", topic)
                if len(topic) > 3:
                    return topic

    # Fallback: use the longest user message
    longest = max(user_messages, key=len)
    cleaned = longest.strip().rstrip("?.!,")
    if len(cleaned) > 5:
        return cleaned

    return None
