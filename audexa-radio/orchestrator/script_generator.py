"""
Script Generator — uses Claude CLI (claude code) to generate radio scripts.
Authenticates via `claude login` on the VM using your Claude subscription.
No Anthropic API key needed.
"""

import asyncio
import json
import logging
import shutil
from dataclasses import dataclass
from typing import Literal

from prompts import (
    RADIO_SYSTEM_PROMPT,
    build_deep_dive_prompt,
    build_headlines_prompt,
    build_listener_request_prompt,
    build_transition_prompt,
    format_stories_for_prompt,
)

logger = logging.getLogger(__name__)


@dataclass
class ScriptSegment:
    speaker: Literal["host1", "host2"]
    text: str
    type: str  # intro, headlines, deep_dive, listener_request, transition, outro


class RadioScriptGenerator:
    def __init__(self, claude_bin: str | None = None, model: str = "sonnet"):
        """
        Args:
            claude_bin: Path to claude CLI binary. Auto-detected if None.
            model: Model to use (sonnet, opus, haiku). Defaults to sonnet.
        """
        self.claude_bin = claude_bin or self._find_claude_bin()
        self.model = model

    def _find_claude_bin(self) -> str:
        """Find the claude CLI binary."""
        path = shutil.which("claude")
        if path:
            return path
        # Common install locations
        for candidate in [
            "/usr/local/bin/claude",
            "/usr/bin/claude",
            "/home/*/.local/bin/claude",
            "/root/.local/bin/claude",
        ]:
            import glob
            matches = glob.glob(candidate)
            if matches:
                return matches[0]
        raise RuntimeError(
            "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code\n"
            "Then authenticate with: claude login"
        )

    async def generate_headlines(
        self, topic_name: str, stories: list, prompt_context: str
    ) -> list[ScriptSegment]:
        """Generate a 2-3 minute headlines segment."""
        stories_text = format_stories_for_prompt(stories)
        user_prompt = build_headlines_prompt(topic_name, stories_text, prompt_context)
        return await self._generate(user_prompt)

    async def generate_deep_dive(
        self, topic_name: str, stories: list, prompt_context: str
    ) -> list[ScriptSegment]:
        """Generate a 3-5 minute deep dive segment."""
        stories_text = format_stories_for_prompt(stories)
        user_prompt = build_deep_dive_prompt(topic_name, stories_text, prompt_context)
        return await self._generate(user_prompt)

    async def generate_listener_request(self, topic_text: str) -> list[ScriptSegment]:
        """Generate a 2-4 minute segment for a caller's topic request."""
        user_prompt = build_listener_request_prompt(topic_text)
        return await self._generate(user_prompt)

    async def generate_transition(self) -> list[ScriptSegment]:
        """Generate a short DJ transition."""
        user_prompt = build_transition_prompt()
        return await self._generate(user_prompt)

    async def _generate(self, user_prompt: str, max_retries: int = 2) -> list[ScriptSegment]:
        """
        Call Claude CLI and parse the response into ScriptSegments.

        Uses: claude -p "prompt" --model sonnet --output-format text
        The system prompt is prepended to the user prompt since CLI
        doesn't have a separate system prompt flag for -p mode.
        """
        full_prompt = f"{RADIO_SYSTEM_PROMPT}\n\n---\n\n{user_prompt}"

        for attempt in range(max_retries + 1):
            try:
                text = await self._call_claude(full_prompt)
                segments = self._parse_response(text)

                if len(segments) < 3:
                    logger.warning(f"Only {len(segments)} segments generated, retrying...")
                    if attempt < max_retries:
                        continue
                    return self._fallback_segments()

                logger.info(
                    f"Generated {len(segments)} segments, "
                    f"~{self._estimate_words(segments)} words"
                )
                return segments

            except Exception as e:
                logger.error(f"Script generation attempt {attempt + 1} failed: {e}")
                if attempt >= max_retries:
                    return self._fallback_segments()

        return self._fallback_segments()

    async def _call_claude(self, prompt: str) -> str:
        """
        Invoke Claude CLI as a subprocess.

        Uses `claude -p` (print mode) which takes a prompt, returns the
        response, and exits. No interactive session needed.
        """
        cmd = [
            self.claude_bin,
            "-p", prompt,
            "--model", self.model,
            "--output-format", "text",
        ]

        logger.debug(f"Calling Claude CLI ({len(prompt)} chars prompt)")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=120,  # 2 min timeout
        )

        if proc.returncode != 0:
            error_msg = stderr.decode().strip() if stderr else "Unknown error"
            raise RuntimeError(f"Claude CLI exited with code {proc.returncode}: {error_msg}")

        response = stdout.decode().strip()
        if not response:
            raise RuntimeError("Claude CLI returned empty response")

        logger.debug(f"Claude CLI response: {len(response)} chars")
        return response

    def _parse_response(self, text: str) -> list[ScriptSegment]:
        """Parse Claude's JSON response into ScriptSegments."""
        text = text.strip()

        # Handle markdown code blocks
        if "```" in text:
            # Extract content between code fences
            lines = text.split("\n")
            in_block = False
            block_lines = []
            for line in lines:
                if line.strip().startswith("```"):
                    if in_block:
                        break  # End of code block
                    in_block = True
                    continue
                if in_block:
                    block_lines.append(line)
            if block_lines:
                text = "\n".join(block_lines)

        # Find JSON array in the text
        if not text.startswith("["):
            start = text.find("[")
            end = text.rfind("]")
            if start != -1 and end != -1:
                text = text[start:end + 1]

        data = json.loads(text)
        segments = []
        for item in data:
            speaker = item.get("speaker", "host1")
            if speaker not in ("host1", "host2"):
                speaker = "host1"
            segments.append(ScriptSegment(
                speaker=speaker,
                text=item.get("text", ""),
                type=item.get("type", "headlines"),
            ))
        return segments

    def _estimate_words(self, segments: list[ScriptSegment]) -> int:
        return sum(len(s.text.split()) for s in segments)

    def _fallback_segments(self) -> list[ScriptSegment]:
        """Emergency fallback if Claude fails."""
        return [
            ScriptSegment(
                speaker="host1",
                text="Welcome back to Audexa Radio! We're having a little technical hiccup with our news feed, but don't worry.",
                type="transition",
            ),
            ScriptSegment(
                speaker="host2",
                text="That's right. While we sort that out, let's play another great track. We'll be right back with more news and updates.",
                type="transition",
            ),
            ScriptSegment(
                speaker="host1",
                text="Stay tuned, you're listening to Audexa Radio.",
                type="transition",
            ),
        ]
