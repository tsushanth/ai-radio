"""
Retell Webhook Handler — receives call events from Retell AI,
extracts and validates topic requests from transcripts, pushes to request queue.
"""

import logging
import re

from fastapi import APIRouter, Request

from queue_manager import QueueManager

logger = logging.getLogger(__name__)

router = APIRouter()

# Module-level reference — set by main.py during startup
_queue_manager: QueueManager | None = None


def set_queue_manager(qm: QueueManager):
    global _queue_manager
    _queue_manager = qm


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
        return {"error": "Queue manager not initialized"}, 500

    try:
        event = await request.json()
    except Exception:
        return {"error": "Invalid JSON"}, 400

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
        return {"error": "Not initialized"}, 500

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
                if len(topic) > 3:
                    return topic

    # Fallback: use the longest user message
    longest = max(user_messages, key=len)
    cleaned = longest.strip().rstrip("?.!,")
    if len(cleaned) > 5:
        return cleaned

    return None
