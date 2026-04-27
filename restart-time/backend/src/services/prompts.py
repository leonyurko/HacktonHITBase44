"""Prompt assembly for the on-demand reply call.

Loads the system prompt template (versioned, language-specific), inserts
RAG hits and language-guide few-shot examples, and returns a list of
chat messages ready for the LLM client.
"""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any

import yaml

from ..db.models import Language, Message
from .rag import RagHit

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_LANG_GUIDE_DIR = (
    Path(__file__).resolve().parent.parent.parent / "content" / "language_guide"
)


def _load_system(language: Language) -> str:
    return (_PROMPTS_DIR / f"system_v1.{language}.md").read_text(encoding="utf-8")


def _load_language_guide(language: Language) -> list[dict[str, Any]]:
    path = _LANG_GUIDE_DIR / f"{language}.yaml"
    if not path.exists():
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    return raw if isinstance(raw, list) else []


def _format_few_shots(language: Language, n: int = 5) -> str:
    examples = _load_language_guide(language)
    if not examples:
        return ""
    sample = random.sample(examples, min(n, len(examples)))
    lines: list[str] = ["<voice_examples>"]
    for ex in sample:
        good_key = f"good_{language}"
        good = ex.get(good_key) or ex.get("good_en") or ""
        bad = ex.get("bad")
        situation = ex.get("situation", "")
        if good:
            lines.append(f"- {situation}: ✓ {good}")
        if bad:
            lines.append(f"- {situation}: ✗ {bad}")
    lines.append("</voice_examples>")
    return "\n".join(lines)


def _format_rag_block(label: str, hits: list[RagHit]) -> str:
    if not hits:
        return ""
    lines = [f"<{label}>"]
    for h in hits:
        lines.append(f"- {h.chunk_text.strip()}")
    lines.append(f"</{label}>")
    return "\n".join(lines)


def build_on_demand_messages(
    *,
    language: Language,
    history: list[Message],
    user_message: str,
    rag_hits: dict[str, list[RagHit]],
    history_window: int = 6,
    extra_system_blocks: list[str] | None = None,
) -> list[dict[str, str]]:
    """Build the full message list for the on-demand reply call.

    Window the conversation history to keep the prompt small for the
    2B-class local model. extra_system_blocks lets pass-2 inject web search
    results without re-loading the system prompt.
    """
    system_text = _load_system(language)
    few_shots = _format_few_shots(language)

    rag_blocks = "\n\n".join(
        b
        for b in [
            _format_rag_block("known_techniques", rag_hits.get("strategies", [])),
            _format_rag_block("peer_voices", rag_hits.get("restart", [])),
            _format_rag_block("your_recent_history", rag_hits.get("user_history", [])),
        ]
        if b
    )

    sys = system_text
    if few_shots:
        sys = f"{sys}\n\n{few_shots}"
    if rag_blocks:
        sys = f"{sys}\n\n{rag_blocks}"
    if extra_system_blocks:
        for block in extra_system_blocks:
            if block.strip():
                sys = f"{sys}\n\n{block}"

    messages: list[dict[str, str]] = [{"role": "system", "content": sys}]
    for m in history[-history_window:]:
        if m.role in ("user", "assistant"):
            messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": user_message})
    return messages
