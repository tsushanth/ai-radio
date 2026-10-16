"""
Calldesk Webhook Handler -- receives `call.completed` from the Calldesk "Audexa DJ" agent,
extracts topic requests from the transcript, validates them and pushes them to the request queue.

Calldesk signs every delivery: X-CallDesk-Signature = "sha256=" + HMAC-SHA256(secret, raw body).
The transcript arrives as a list of {"role": "user"|"assistant", "content": str}.
"""

import hashlib
import hmac
import json
import logging
import os
import re
from collections import OrderedDict

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from queue_manager import QueueManager
from retell_handler import extract_topic_from_user_messages, validate_topic_request

logger = logging.getLogger(__name__)

router = APIRouter()

_queue_manager: QueueManager | None = None

# The agent offers "another topic?" after each one; cap what a single call can queue.
MAX_TOPICS_PER_CALL = 3

# Calldesk delivers once, but a retry must not queue a topic twice.
_SEEN_CALLS_MAX = 500
_seen_calls: "OrderedDict[str, None]" = OrderedDict()

# Short replies to "anything else?" / goodbyes, which are not topics.
_FILLER = re.compile(
    r"^(yes|yeah|yep|yup|no|nope|nah|sure|ok|okay|thanks|thank you|thank you so much|"
    r"that'?s (all|it)|no thanks|no thank you|nothing else|that will be all|goodbye|bye|"
    r"hello|hi|hey)\b[\s.,!?a-z']*$",
    re.IGNORECASE,
)


def set_queue_manager(qm: QueueManager):
    global _queue_manager
    _queue_manager = qm


def verify_signature(secret: str, body: bytes, header: str) -> bool:
    if not secret or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):])


def topics_from_transcript(transcript) -> list[str]:
    """One topic per substantive caller message, in order (max MAX_TOPICS_PER_CALL)."""
    if not isinstance(transcript, list):
        return []
    topics: list[str] = []
    for msg in transcript:
        if not isinstance(msg, dict) or msg.get("role") != "user":
            continue
        text = msg.get("content")
        if not isinstance(text, str):
            continue
        text = text.strip()
        if not text or (len(text.split()) <= 6 and _FILLER.match(text)):
            continue
        topic = extract_topic_from_user_messages([text])
        if topic and topic not in topics:
            topics.append(topic)
        if len(topics) >= MAX_TOPICS_PER_CALL:
            break
    return topics


@router.post("/api/webhooks/calldesk")
async def calldesk_webhook(request: Request):
    secret = os.getenv("CALLDESK_WEBHOOK_SECRET", "")
    if not secret:
        # Fail closed: without a secret anyone could inject topics into the station.
        return JSONResponse({"error": "calldesk webhook not configured"}, status_code=503)
    if _queue_manager is None:
        return JSONResponse({"error": "Queue manager not initialized"}, status_code=503)

    body = await request.body()
    if not verify_signature(secret, body, request.headers.get("x-calldesk-signature", "")):
        logger.warning("Calldesk webhook rejected: bad signature")
        return JSONResponse({"error": "invalid signature"}, status_code=401)

    try:
        event = json.loads(body)
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    event_type = event.get("event", "")
    data = event.get("data") or {}
    call_id = str(data.get("call_id", "unknown"))
    logger.info(f"Calldesk webhook: {event_type}, call_id={call_id}")

    if event_type != "call.completed":
        return {"success": True}

    if call_id in _seen_calls:
        logger.info(f"Calldesk call {call_id} already processed, ignoring")
        return {"success": True}
    _seen_calls[call_id] = None
    while len(_seen_calls) > _SEEN_CALLS_MAX:
        _seen_calls.popitem(last=False)

    topics = topics_from_transcript(data.get("transcript"))
    if not topics:
        logger.info("No topic request found in transcript")
    for topic in topics:
        valid, reason = validate_topic_request(topic)
        if valid:
            position = await _queue_manager.add_listener_request(topic, "")
            logger.info(f"Topic request queued: '{topic}' pos={position} via=calldesk")
        else:
            logger.info(f"Topic request rejected ({reason}): '{topic}'")

    return {"success": True}
