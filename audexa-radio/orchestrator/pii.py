"""
Personal contact details in listener text.

A topic typed or spoken by a listener is shown to every listener (/api/status, /api/upcoming-plays) and read on air, so
an email address or phone number must be refused on the way in and masked on the way out.
"""

import re

# What a masked listener segment is called in the public feed.
PUBLIC_PLACEHOLDER = "Listener request"

_EMAIL = re.compile(r"[^\s@]+@[^\s@]+")
# "name at example dot com", "name (at) example (dot) org": how an address is typed to dodge filters or transcribed on a
# call. The word "dot" (or a bracketed one) is required, so "look at Booking.com" stays a topic, and the domain cannot be
# an article, so "what happened at the dot com crash" does too.
_SPOKEN_EMAIL = re.compile(
    r"[\w.+-]+\s*(?:\(at\)|\[at\]|\bat\b)\s*(?!(?:the|a|an|this|that)\b)[\w-]+(?:\s*(?:\(dot\)|\[dot\]|\bdot\b|\.)\s*[\w-]+)*?"
    r"\s*(?:\(dot\)|\[dot\]|\bdot\b)\s*(?:com|net|org|edu|gov|io|co|in|uk|au|ca|de|fr|es|app|ai|me)\b",
    re.IGNORECASE,
)
# Digits with the separators people put in phone numbers. Nine digits or more, so years and ranges ("2024-2025") pass.
_NUMBER_RUN = re.compile(r"\+?\d(?:[\s().-]{0,2}\d){8,}")


def contains_personal_info(text: str) -> bool:
    if not text:
        return False
    return bool(_EMAIL.search(text) or _SPOKEN_EMAIL.search(text) or _NUMBER_RUN.search(text))


def redact(text: str) -> str:
    """Mask contact details inside a piece of text (for logs)."""
    if not text:
        return text
    for pattern in (_EMAIL, _SPOKEN_EMAIL, _NUMBER_RUN):
        text = pattern.sub("[redacted]", text)
    return text


def public_topic_name(name: str) -> str:
    """Topic name safe to publish. A name holding contact details is replaced whole: what surrounds it may identify the person."""
    if not contains_personal_info(name):
        return name
    prefix = re.match(r"^\[[a-z]{2}\] ", name)  # keep the "[es] " routing tag of non-English segments
    return (prefix.group(0) if prefix else "") + PUBLIC_PLACEHOLDER
