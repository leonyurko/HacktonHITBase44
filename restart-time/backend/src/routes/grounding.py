"""Grounding script — static content per language.

No LLM, no state. Cannot fail. Always available. See PRD §7.8.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from ..db.models import Language

router = APIRouter(prefix="/grounding")

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@router.get("/script")
async def get_script(language: Language = "en") -> dict:
    path = _PROMPTS_DIR / f"grounding_script.{language}.md"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = [line.strip() for line in text.split("\n\n") if line.strip()]
    return {"ok": True, "language": language, "lines": lines, "pause_seconds": 8}
