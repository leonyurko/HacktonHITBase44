"""Per-turn language detection.

Cheap and fast: any Hebrew code-point => Hebrew, otherwise English. We don't
try to detect mixed-language messages — the dominant Hebrew presence is
enough signal that the user wants Hebrew responses.
"""

from __future__ import annotations

from ..db.models import Language


def detect_language(text: str, *, default: Language = "en") -> Language:
    if not text:
        return default
    for ch in text:
        # Hebrew unicode block: U+0590 to U+05FF
        if "֐" <= ch <= "׿":
            return "he"
    return default
