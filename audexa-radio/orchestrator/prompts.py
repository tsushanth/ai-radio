"""
Radio-format prompt templates for Claude script generation.
Adapted from ai-radio-backend prompts.ts with radio-specific instructions.
"""

from datetime import datetime, timezone

RADIO_SYSTEM_PROMPT = """You are a professional radio script writer for Audexa Radio, a 24/7 AI-powered news and talk station. Create engaging, natural conversation between two hosts.

HOST PERSONALITIES:
- Host 1 (Alex): Upbeat, energetic, and enthusiastic. Uses casual language, brings excitement, asks questions, and drives the discussion forward. Think of a morning radio host.
- Host 2 (Jordan): More analytical and thoughtful. Provides context and deeper insights. Balances Alex's energy with calm, clear explanations.

RADIO GUIDELINES:
1. This is LIVE RADIO — reference "listeners tuning in", the time of day, and the station name "Audexa Radio"
2. Natural banter with back-and-forth dialogue, occasional humor, and smooth transitions
3. Conversational and warm — use contractions, verbal markers ("So", "Alright", "Now", "Here's the thing")
4. Summarize stories concisely — don't read full articles. Hit the key points conversationally
5. End segments with teases: "Stick around, we've got more coming up after this track" or "Don't go anywhere"
6. Vary energy — not everything needs to be high energy. Deep dives can be more reflective

FORMAT YOUR RESPONSE as a JSON array of segments:
[
  {"speaker": "host1", "text": "...", "type": "intro"},
  {"speaker": "host2", "text": "...", "type": "headlines"},
  ...
]

Valid segment types: "intro", "headlines", "deep_dive", "listener_request", "transition", "outro"
Each segment should be a natural speaking turn, typically 1-3 sentences."""


def build_headlines_prompt(
    topic_name: str, stories_text: str, prompt_context: str,
    language: str = "en", region: str = "us",
) -> str:
    """Build prompt for a 2-3 minute headlines segment."""
    now = datetime.now(timezone.utc)
    time_of_day = _get_time_of_day(now.hour)
    lang_note = f"\nIMPORTANT: Write the entire script in {_language_name(language)}. Tailor references and context for {_region_name(region)} listeners." if language != "en" or region != "us" else ""

    return f"""Generate a HEADLINES segment for Audexa Radio.

Topic: {topic_name}
Time: {time_of_day} ({now.strftime('%I:%M %p UTC')})
Region: {_region_name(region)}
Duration target: 2-3 minutes (~350-500 words total across all segments){lang_note}

Context: {prompt_context}

Cover 4-5 of these stories as quick headlines with brief commentary:

{stories_text}

Start with a brief intro referencing the time and topic. Cover each story in 2-3 speaking turns. End with a tease for what's coming next. Return ONLY valid JSON."""


def build_deep_dive_prompt(
    topic_name: str, stories_text: str, prompt_context: str,
    language: str = "en", region: str = "us",
) -> str:
    """Build prompt for a 3-5 minute deep dive segment."""
    now = datetime.now(timezone.utc)
    lang_note = f"\nIMPORTANT: Write the entire script in {_language_name(language)}. Tailor references and context for {_region_name(region)} listeners." if language != "en" or region != "us" else ""

    return f"""Generate a DEEP DIVE segment for Audexa Radio.

Topic: {topic_name}
Region: {_region_name(region)}
Duration target: 3-5 minutes (~500-750 words total across all segments){lang_note}

Context: {prompt_context}

Pick the 2-3 most interesting stories below and go deeper. Discuss implications, context, and what it means for listeners:

{stories_text}

The hosts should have a real discussion — Alex asks probing questions, Jordan provides analysis. End with "we'll be right back after this track." Return ONLY valid JSON."""


def build_listener_request_prompt(
    topic_text: str,
    language: str = "en", region: str = "us",
) -> str:
    """Build prompt for a listener-requested topic segment."""
    lang_note = f"\nIMPORTANT: Write the entire script in {_language_name(language)}." if language != "en" else ""

    return f"""Generate a LISTENER REQUEST segment for Audexa Radio.

A listener just called in and requested we cover: "{topic_text}"{lang_note}

Duration target: 2-4 minutes (~350-600 words total)

Start with Alex saying something like "We just got a call from a listener who wants to hear about {topic_text}" — make it feel special and acknowledged.

Then have both hosts discuss the topic naturally. Use your knowledge to cover it well. If it's a current event, provide context and implications. If it's a general topic, make it interesting and informative.

End with thanking the listener and a transition to the next segment. Return ONLY valid JSON."""


def build_transition_prompt() -> str:
    """Build a short DJ transition between segments."""
    now = datetime.now(timezone.utc)
    time_of_day = _get_time_of_day(now.hour)

    return f"""Generate a very short TRANSITION for Audexa Radio.

Time: {time_of_day}

Just 2-3 speaking turns (Alex and Jordan). Something like:
- Welcome back from the song
- Brief mention of what's coming up
- Keep it under 30 seconds of speaking time (~50-80 words)

Return ONLY valid JSON."""


def format_stories_for_prompt(stories: list) -> str:
    """Format aggregated stories into a text block for the prompt."""
    lines = []
    for i, story in enumerate(stories[:10], 1):
        line = f"{i}. [{story.source}] {story.title}"
        if story.summary:
            line += f"\n   {story.summary[:200]}"
        if story.score:
            line += f" (score: {story.score})"
        lines.append(line)
    return "\n\n".join(lines)


def _language_name(code: str) -> str:
    names = {
        "en": "English", "de": "German", "fr": "French", "es": "Spanish",
        "pt": "Portuguese", "ja": "Japanese", "ko": "Korean", "hi": "Hindi",
        "ar": "Arabic", "zh": "Mandarin Chinese",
    }
    return names.get(code, code)


def _region_name(code: str) -> str:
    names = {
        "us": "United States", "uk": "United Kingdom", "in": "India",
        "au": "Australia", "ca": "Canada", "de": "Germany", "fr": "France",
        "es": "Spain", "br": "Brazil", "jp": "Japan", "kr": "South Korea",
        "sg": "Singapore", "ae": "UAE", "za": "South Africa",
    }
    return names.get(code, code.upper())


def _get_time_of_day(hour_utc: int) -> str:
    # Rough mapping — adjust for listener timezone later
    if 5 <= hour_utc < 12:
        return "morning"
    elif 12 <= hour_utc < 17:
        return "afternoon"
    elif 17 <= hour_utc < 21:
        return "evening"
    else:
        return "late night"
