"""
Script Generator — auto-switching backend:
  1. Try Claude CLI (OAuth) first — free, uses subscription
  2. If CLI fails, try OpenRouter (cheap hosted model; needs OPENROUTER_API_KEY)
  3. If OpenRouter is disabled or fails, fall back to Ollama (local model)
  4. If Ollama fails, fall back to Anthropic API key (if set)
  5. Static fallback segments as last resort
"""

import asyncio
import json
import logging
import os
import shutil
import time
import urllib.error
import urllib.request
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

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# Default model choice (looked up against /api/v1/models, 2026-10):
#   deepseek/deepseek-v4-flash  $0.028/M in, $0.056/M out, 1M context.
# A ~500 word script is ~1.5k output tokens, so a call costs well under
# $0.001. It was the cheapest paid model with writing quality clearly above a
# 3B local model; llama-3.1-8b / mistral-nemo are similar in price but weaker
# at holding a strict JSON shape plus two distinct host voices. Runner-up:
# mistralai/mistral-small-3.2-24b-instruct ($0.094/$0.25, non-reasoning, so no
# hidden reasoning tokens). The model is reasoning-capable, so requests set
# reasoning.enabled=false to avoid paying for and waiting on thinking tokens.
# ":free" models are avoided on purpose: shared rate limits would make a
# 24/7 station flaky. Override with OPENROUTER_MODEL.
OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v4-flash"
OPENROUTER_MAX_TOKENS = 4096
# After this many consecutive failures the tier is skipped for the cooldown.
OPENROUTER_FAIL_THRESHOLD = 3
OPENROUTER_COOLDOWN_SEC = 300


class OpenRouterError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


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
        # OpenRouter tier: disabled when no key. Key is only ever held in
        # this attribute and sent in the Authorization header; never logged.
        self._openrouter_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
        self._openrouter_model = os.environ.get("OPENROUTER_MODEL") or OPENROUTER_DEFAULT_MODEL
        self._openrouter_timeout = self._env_float("OPENROUTER_TIMEOUT_SEC", 90.0)
        self._openrouter_fail_count = 0
        self._openrouter_skip_until = 0.0
        self.last_backend: str | None = None

        backends = ["CLI"]
        if self._openrouter_key:
            backends.append(f"OpenRouter ({self._openrouter_model})")
        else:
            logger.info("OpenRouter tier disabled: OPENROUTER_API_KEY not set")
        if self._check_ollama_available():
            backends.append(f"Ollama ({OLLAMA_MODEL})")
        if self.api_key:
            backends.append("API key")
        logger.info(f"Script generator backends: {' → '.join(backends)}")

    @staticmethod
    def _env_float(name: str, default: float) -> float:
        raw = os.environ.get(name)
        if not raw:
            return default
        try:
            value = float(raw)
            return value if value > 0 else default
        except ValueError:
            logger.warning(f"Invalid {name}, using default {default}")
            return default

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
        """Try CLI, then OpenRouter, then Ollama, then API key."""
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
                return self._used("claude-cli", result)
            except RuntimeError as e:
                self._cli_fail_count += 1
                self._cli_last_check = now
                error_str = str(e).lower()
                is_auth = any(k in error_str for k in ["401", "auth", "expired", "token", "logged in", "login"])
                is_quota = any(k in error_str for k in ["limit", "quota", "rate", "resets"])

                if is_auth or is_quota or self._cli_fail_count >= 2:
                    self._cli_healthy = False
                    logger.warning(f"CLI failed ({self._cli_fail_count}x): {str(e)[:100]} — trying next backend")
                else:
                    logger.warning(f"CLI error (attempt {self._cli_fail_count}): {str(e)[:100]}")
                    raise

        # 2. Try OpenRouter (cheap hosted model)
        if self._openrouter_key and now >= self._openrouter_skip_until:
            try:
                result = await self._call_openrouter(prompt)
                if self._openrouter_fail_count > 0:
                    logger.info("OpenRouter recovered")
                self._openrouter_fail_count = 0
                return self._used(f"openrouter:{self._openrouter_model}", result)
            except Exception as e:
                self._openrouter_fail_count += 1
                fatal = isinstance(e, OpenRouterError) and e.status in (401, 402, 403)
                logger.warning(f"OpenRouter failed ({self._openrouter_fail_count}x): {self._scrub(str(e))[:150]} — trying next backend")
                if fatal or self._openrouter_fail_count >= OPENROUTER_FAIL_THRESHOLD:
                    self._openrouter_skip_until = time.time() + OPENROUTER_COOLDOWN_SEC
                    self._openrouter_fail_count = 0
                    logger.error(f"OpenRouter skipped for {OPENROUTER_COOLDOWN_SEC}s")

        # 3. Try Ollama (local model)
        if self._ollama_healthy:
            try:
                result = await self._call_ollama(prompt)
                if self._ollama_fail_count > 0:
                    logger.info("Ollama recovered")
                self._ollama_fail_count = 0
                return self._used(f"ollama:{OLLAMA_MODEL}", result)
            except Exception as e:
                self._ollama_fail_count += 1
                logger.warning(f"Ollama failed ({self._ollama_fail_count}x): {str(e)[:100]}")
                if self._ollama_fail_count >= 3:
                    self._ollama_healthy = False
                    logger.error("Ollama marked unhealthy after 3 failures")

        # 4. Try Anthropic API key
        if self.api_key:
            logger.info("Falling back to Anthropic API key")
            return self._used("anthropic-api", await self._call_api(prompt))

        raise RuntimeError("All backends failed: CLI unavailable, Ollama failed, no API key")

    def _used(self, backend: str, text: str) -> str:
        self.last_backend = backend
        logger.info(f"Script backend: {backend} ({len(text)} chars)")
        return text

    def _scrub(self, msg: str) -> str:
        if self._openrouter_key:
            msg = msg.replace(self._openrouter_key, "[redacted]")
        return msg

    async def _call_openrouter(self, prompt: str) -> str:
        # Blocking urllib call run in a worker thread so the event loop stays free.
        # urllib's timeout is per socket read, not total (a real call took 112s with
        # a 90s timeout while tokens trickled in), so enforce a hard overall deadline.
        # On expiry the worker thread is abandoned; it ends when its socket does.
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(self._call_openrouter_sync, prompt),
                timeout=self._openrouter_timeout,
            )
        except asyncio.TimeoutError:
            raise OpenRouterError(f"OpenRouter exceeded {self._openrouter_timeout:.0f}s deadline") from None

    def _call_openrouter_sync(self, prompt: str) -> str:
        # Never log the prompt or key; only sizes and the model name.
        logger.debug(f"Calling OpenRouter ({self._openrouter_model}, {len(prompt)} chars)")
        body = json.dumps({
            "model": self._openrouter_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": OPENROUTER_MAX_TOKENS,
            "reasoning": {"enabled": False},
        }).encode("utf-8")
        req = urllib.request.Request(
            OPENROUTER_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._openrouter_key}",
                "Content-Type": "application/json",
                "X-Title": "Audexa Radio",
            },
        )
        started = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self._openrouter_timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:200]
            except Exception:
                pass
            raise OpenRouterError(f"OpenRouter error {e.code}: {detail}", status=e.code) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise OpenRouterError(f"OpenRouter request failed: {type(e).__name__}: {e}") from None

        try:
            data = json.loads(raw)
        except ValueError:
            raise OpenRouterError("OpenRouter returned malformed JSON") from None
        if not isinstance(data, dict):
            raise OpenRouterError("OpenRouter returned unexpected JSON shape")
        if data.get("error"):
            raise OpenRouterError(f"OpenRouter error in body: {str(data['error'])[:200]}")
        try:
            choice = data["choices"][0]
            text = choice["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise OpenRouterError("OpenRouter response missing choices[0].message.content") from None
        if not isinstance(text, str) or not text.strip():
            raise OpenRouterError("OpenRouter returned empty content")

        usage = data.get("usage") or {}
        if choice.get("finish_reason") == "length":
            logger.warning("OpenRouter output hit max_tokens; script may be truncated")
        logger.info(
            f"OpenRouter response: {len(text)} chars ({data.get('model', self._openrouter_model)}), "
            f"tokens in/out={usage.get('prompt_tokens')}/{usage.get('completion_tokens')}, "
            f"cost={usage.get('cost')}, {time.time() - started:.1f}s"
        )
        return text

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
