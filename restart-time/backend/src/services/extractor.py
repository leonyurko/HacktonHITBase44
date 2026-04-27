"""Extractor: Call 2 of the on-demand turn.

Reads the user message + assistant reply, asks the LLM to emit a JSON diff
matching `ExtractorDiff`, validates with Pydantic. Invalid JSON is silently
ignored (the conversation already succeeded; we just don't apply changes).

The extractor is intentionally NOT given the full conversation history —
only the last user/assistant pair. Keeps the prompt small and prevents
"creative" task invention from earlier context.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import structlog
from pydantic import ValidationError

from ..db.models import ExtractorDiff
from .llm import LLMUnavailable, chat_complete

log = structlog.get_logger(__name__)


_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt() -> str:
    return (_PROMPTS_DIR / "extractor_v1.md").read_text(encoding="utf-8")


def _strip_code_fence(text: str) -> str:
    """Models often wrap JSON in ```json ... ```. Strip it."""
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return text


def _find_json_object(text: str) -> str | None:
    """Find the first balanced {...} block in the text. Tolerates leading prose."""
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                return text[start : i + 1]
    return None


async def extract_diff(user_message: str, assistant_reply: str) -> ExtractorDiff:
    """Run the extractor and return a validated diff. Returns empty diff on any failure."""
    sys_prompt = _load_prompt()
    user_payload = (
        f"USER:\n{user_message}\n\nASSISTANT:\n{assistant_reply}\n\n"
        "Return JSON only — no prose, no code fences."
    )

    try:
        raw = await chat_complete(
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_payload},
            ],
            temperature=0.0,
            max_tokens=400,
        )
    except LLMUnavailable as exc:
        log.warning("extractor_llm_unavailable", error=str(exc))
        return ExtractorDiff()

    candidate = _strip_code_fence(raw)
    if not candidate.startswith("{"):
        # Try to fish out a JSON block from prose wrapping.
        found = _find_json_object(candidate)
        if not found:
            log.warning("extractor_no_json", raw=raw[:200])
            return ExtractorDiff()
        candidate = found

    try:
        obj = json.loads(candidate)
    except json.JSONDecodeError as exc:
        log.warning("extractor_invalid_json", error=str(exc), raw=candidate[:200])
        return ExtractorDiff()

    try:
        return ExtractorDiff.model_validate(obj)
    except ValidationError as exc:
        log.warning("extractor_validation_failed", error=str(exc))
        return ExtractorDiff()
