"""
Retell Webhook Handler — receives call events from Retell AI,
extracts topic requests from transcripts, pushes to request queue.
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
                position = await _queue_manager.add_listener_request(topic, caller_phone)
                logger.info(f"Topic request queued: '{topic}' at position {position}")
            else:
                logger.info("No topic request found in transcript")

    elif event_type == "call_analyzed":
        # Future: use structured analysis data
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

    We look for what the user said they want to hear about.
    """
    if not transcript:
        return None

    # Split into lines and find user messages
    lines = transcript.strip().split("\n")
    user_messages = []
    for line in lines:
        line = line.strip()
        if line.startswith("User:"):
            user_messages.append(line[5:].strip())

    if not user_messages:
        return None

    # Try to find explicit topic request patterns
    patterns = [
        r"(?:talk|tell|hear|cover|discuss|report)\s+(?:about|on|regarding)\s+(.+)",
        r"(?:what(?:'s| is) (?:happening|going on) with)\s+(.+)",
        r"(?:i(?:'m| am) interested in)\s+(.+)",
        r"(?:can you (?:do|cover))\s+(.+)",
        r"(?:how about)\s+(.+)",
    ]

    for msg in user_messages:
        msg_lower = msg.lower().rstrip("?.!")
        for pattern in patterns:
            match = re.search(pattern, msg_lower)
            if match:
                topic = match.group(1).strip().rstrip("?.!,")
                if len(topic) > 3:  # Ignore very short matches
                    return topic

    # Fallback: use the longest user message as the topic
    # (caller probably just stated the topic directly)
    longest = max(user_messages, key=len)
    cleaned = longest.strip().rstrip("?.!,")
    if len(cleaned) > 5:
        return cleaned

    return None
