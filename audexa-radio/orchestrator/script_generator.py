"""
Script Generator — auto-switching backend:
  1. Try Claude CLI (OAuth) first — free, uses subscription
  2. If CLI fails, fall back to Ollama (local on-device model)
  3. If Ollama fails, fall back to Anthropic API key (if set)
  4. Static fallback segments as last resort
"""

import asyncio
import json
import logging
import os
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

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://172.17.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")


@dataclass
class ScriptSegment:
    speaker: Literal["host1", "host2"]
    text: str
    type: str


class RadioScriptGenerator:
    def __init__(self, claude_bin: str | None = None, model: str = "sonnet"):
        self.model = model
        self.api_key = os.environ.get("ANTHROPIC_FALLBACK_KEY")
        self.claude_bin = claude_bin or self._find_claude_bin()
        self._api_model = self._resolve_api_model(model)
        # Track CLI health — start optimistic
        self._cli_healthy = True
        self._cli_fail_count = 0
        self._cli_last_check = 0
        # Track Ollama health
        self._ollama_healthy = True
        self._ollama_fail_count = 0

        backends = ["CLI"]
        if self._check_ollama_available():
            backends.append(f"Ollama ({OLLAMA_MODEL})")
        if self.api_key:
            backends.append("API key")
        logger.info(f"Script generator backends: {' → '.join(backends)}")

    def _check_ollama_available(self) -> bool:
        try:
            import urllib.request
            req = urllib.request.Request(f"{OLLAMA_URL}/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read())
                models = [m["name"] for m in data.get("models", [])]
                if OLLAMA_MODEL in models or any(OLLAMA_MODEL.split(":")[0] in m for m in models):
                    return True
                logger.warning(f"Ollama available but model {OLLAMA_MODEL} not found. Available: {models}")
                return False
        except Exception as e:
            logger.info(f"Ollama not available: {e}")
            return False

    def _resolve_api_model(self, model: str) -> str:
        return {
            "sonnet": "claude-sonnet-4-6",
            "opus": "claude-opus-4-6",
            "haiku": "claude-haiku-4-5-20251001",
        }.get(model, model)

    def _find_claude_bin(self) -> str:
        path = shutil.which("claude")
        if path:
            return path
        for candidate in ["/usr/local/bin/claude", "/usr/bin/claude"]:
            import glob
            matches = glob.glob(candidate)
            if matches:
                return matches[0]
        return ""

    async def generate_headlines(self, topic_name, stories, prompt_context, language="en", region="us"):
        stories_text = format_stories_for_prompt(stories)
        return await self._generate(build_headlines_prompt(topic_name, stories_text, prompt_context, language, region), language=language)

    async def generate_deep_dive(self, topic_name, stories, prompt_context, language="en", region="us"):
        stories_text = format_stories_for_prompt(stories)
        return await self._generate(build_deep_dive_prompt(topic_name, stories_text, prompt_context, language, region), language=language)

    async def generate_listener_request(self, topic_text, language="en", region="us"):
        return await self._generate(build_listener_request_prompt(topic_text, language, region), language=language)

    async def generate_transition(self):
        return await self._generate(build_transition_prompt())

    async def _generate(self, user_prompt: str, max_retries: int = 2, language: str = "en") -> list[ScriptSegment]:
        full_prompt = f"{RADIO_SYSTEM_PROMPT}\n\n---\n\n{user_prompt}"

        for attempt in range(max_retries + 1):
            try:
                text = await self._call_smart(full_prompt)
                segments = self._parse_response(text)

                if len(segments) < 3:
                    logger.warning(f"Only {len(segments)} segments, retrying...")
                    if attempt < max_retries:
                        continue
                    return self._fallback_segments(language)

                logger.info(f"Generated {len(segments)} segments, ~{self._estimate_words(segments)} words")
                return segments

            except Exception as e:
                logger.error(f"Script generation attempt {attempt + 1} failed: {e}")
                if attempt >= max_retries:
                    return self._fallback_segments(language)

        return self._fallback_segments(language)

    async def _call_smart(self, prompt: str) -> str:
        """Try CLI first, then Ollama, then API key."""
        import time

        # Every 5 minutes, retry CLI even if it was failing
        now = time.time()
        if not self._cli_healthy and (now - self._cli_last_check) > 300:
            logger.info("Re-checking CLI health (periodic retry)...")
            self._cli_healthy = True
            self._cli_fail_count = 0

        # 1. Try Claude CLI
        if self._cli_healthy and self.claude_bin:
            try:
                result = await self._call_cli(prompt)
                if self._cli_fail_count > 0:
                    logger.info("CLI recovered — switching back from fallback")
                self._cli_fail_count = 0
                return result
            except RuntimeError as e:
                self._cli_fail_count += 1
                self._cli_last_check = now
                error_str = str(e).lower()
                is_auth = any(k in error_str for k in ["401", "auth", "expired", "token", "logged in", "login"])
                is_quota = any(k in error_str for k in ["limit", "quota", "rate", "resets"])

                if is_auth or is_quota or self._cli_fail_count >= 2:
                    self._cli_healthy = False
                    logger.warning(f"CLI failed ({self._cli_fail_count}x): {str(e)[:100]} — trying Ollama")
                else:
                    logger.warning(f"CLI error (attempt {self._cli_fail_count}): {str(e)[:100]}")
                    raise

        # 2. Try Ollama (local model)
        if self._ollama_healthy:
            try:
                result = await self._call_ollama(prompt)
                if self._ollama_fail_count > 0:
                    logger.info("Ollama recovered")
                self._ollama_fail_count = 0
                return result
            except Exception as e:
                self._ollama_fail_count += 1
                logger.warning(f"Ollama failed ({self._ollama_fail_count}x): {str(e)[:100]}")
                if self._ollama_fail_count >= 3:
                    self._ollama_healthy = False
                    logger.error("Ollama marked unhealthy after 3 failures")

        # 3. Try Anthropic API key
        if self.api_key:
            logger.info("Falling back to Anthropic API key")
            return await self._call_api(prompt)

        raise RuntimeError("All backends failed: CLI unavailable, Ollama failed, no API key")

    async def _call_ollama(self, prompt: str) -> str:
        import aiohttp

        logger.debug(f"Calling Ollama ({OLLAMA_MODEL}, {len(prompt)} chars)")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 4096,
                    },
                },
                timeout=aiohttp.ClientTimeout(total=180),
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise RuntimeError(f"Ollama error {resp.status}: {error_text[:200]}")

                data = await resp.json()
                text = data.get("response", "")
                if not text:
                    raise RuntimeError("Ollama returned empty response")
                logger.info(f"Ollama response: {len(text)} chars ({OLLAMA_MODEL})")
                return text

    async def _call_api(self, prompt: str) -> str:
        import aiohttp

        logger.debug(f"Calling Anthropic API ({len(prompt)} chars)")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self._api_model,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise RuntimeError(f"API error {resp.status}: {error_text[:200]}")

                data = await resp.json()
                text = data["content"][0]["text"]
                if not text:
                    raise RuntimeError("API returned empty response")
                logger.debug(f"API response: {len(text)} chars")
                return text

    async def _call_cli(self, prompt: str) -> str:
        cmd = [self.claude_bin, "-p", prompt, "--model", self.model, "--output-format", "text"]
        logger.debug(f"Calling Claude CLI ({len(prompt)} chars)")

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

        if proc.returncode != 0:
            stderr_text = stderr.decode().strip() if stderr else ""
            stdout_text = stdout.decode().strip() if stdout else ""
            error_msg = stderr_text or stdout_text or "Unknown error"
            raise RuntimeError(f"Claude CLI exited with code {proc.returncode}: {error_msg}")

        response = stdout.decode().strip()
        if not response:
            raise RuntimeError("Claude CLI returned empty response")
        logger.debug(f"Claude CLI response: {len(response)} chars")
        return response

    def _parse_response(self, text: str) -> list[ScriptSegment]:
        text = text.strip()
        if "```" in text:
            lines = text.split("\n")
            in_block = False
            block_lines = []
            for line in lines:
                if line.strip().startswith("```"):
                    if in_block:
                        break
                    in_block = True
                    continue
                if in_block:
                    block_lines.append(line)
            if block_lines:
                text = "\n".join(block_lines)

        if not text.startswith("["):
            start = text.find("[")
            end = text.rfind("]")
            if start != -1 and end != -1:
                text = text[start:end + 1]

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # LLMs occasionally emit trailing commas before ] or }. Strip and retry once.
            # Safer than json_repair as a dep; covers the most common LLM JSON failure.
            import re
            repaired = re.sub(r',\s*([}\]])', r'\1', text)
            data = json.loads(repaired)
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

    def _estimate_words(self, segments):
        return sum(len(s.text.split()) for s in segments)

    def _fallback_segments(self, language: str = "en"):
        # Only fall back to English boilerplate when the target language IS English.
        # For non-English streams, returning an empty list lets the caller skip
        # this generation cycle and play music — better than voicing English
        # boilerplate through a non-English TTS voice (the "English with Italian
        # accent" bug from 2026-06-24).
        if language != "en":
            return []
        return [
            ScriptSegment(speaker="host1", text="Welcome back to Audexa Radio! We're having a little technical hiccup with our news feed, but don't worry.", type="transition"),
            ScriptSegment(speaker="host2", text="That's right. While we sort that out, let's play another great track. We'll be right back with more news and updates.", type="transition"),
            ScriptSegment(speaker="host1", text="Stay tuned, you're listening to Audexa Radio.", type="transition"),
        ]
