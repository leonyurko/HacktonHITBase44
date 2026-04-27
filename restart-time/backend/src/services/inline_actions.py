"""Inline action markers in agent replies.

The agent decides when something becomes a task / reminder by appending an
action marker to its reply, on its own line. Markers are parsed by regex
(no second LLM call) and the marker text is stripped before display.

Replaces the previous "extractor" pattern (which read the user's message and
inferred intent). Putting the agent in charge of writes:
  - Halves on-demand latency (one LLM call instead of two)
  - Matches user expectation that the agent only writes things when it
    explicitly says so in conversation
  - Works reliably on small instruction-tuned models (regex is grammar-free)

Marker syntax (case-insensitive):

  [task: <title>]
  [task: <title> @ <when>]                  -- 'when' is free-text "morning", "after lunch", etc.
  [task: <title> #<size>]                   -- size: tiny | small | medium
  [task: <title> @ <when> #<size>]
  [done: <title-or-fragment>]
  [defer: <title-or-fragment> @ <until>]    -- until: 'tomorrow' | YYYY-MM-DD
  [drop: <title-or-fragment>]
  [remind: <title-or-fragment> @ <when> #freq:<recurrence>]
                                            -- recurrence: once | daily | weekly | monthly | every:30m | every:2h
                                            -- when: '1h', '30m', 'tomorrow 9am', or ISO datetime
  [search: <query>]                         -- two-pass: server runs Tavily, re-prompts LLM

Multiple markers can appear in one reply (each on its own line at the end).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

ActionKind = Literal["task", "done", "defer", "drop", "remind", "search"]
TaskSize = Literal["tiny", "small", "medium"]
Recurrence = Literal["once", "daily", "weekly", "monthly", "interval"]


@dataclass
class InlineAction:
    kind: ActionKind
    title: str                          # for 'task' = new title; for 'search' = query; otherwise = matcher fragment
    when: str | None = None             # 'soft_when' for task, 'until' for defer, time for remind
    size: TaskSize | None = None        # only for 'task'
    recurrence: Recurrence | None = None
    recurrence_minutes: int | None = None  # only when recurrence='interval'
    raw: str = ""                       # the original marker text (for debugging)


# One regex matches any marker. Captures kind + body.
# Body is everything between the first ':' and the closing ']'.
_MARKER_RE = re.compile(
    r"\[\s*(task|done|defer|drop|remind|search)\s*:\s*([^\[\]\n]+?)\s*\]",
    re.IGNORECASE,
)


_FREQ_KEYWORDS = {
    "once": "once",
    "one": "once",
    "single": "once",
    "daily": "daily",
    "day": "daily",
    "weekly": "weekly",
    "week": "weekly",
    "monthly": "monthly",
    "month": "monthly",
}

_INTERVAL_RE = re.compile(r"every\s*:\s*(\d+)\s*(m|min|minute|h|hr|hour)s?", re.IGNORECASE)


def _parse_freq(value: str) -> tuple[Recurrence | None, int | None]:
    """Parse a #freq:<value> token. Returns (recurrence, minutes)."""
    v = value.strip().lower()
    interval_m = _INTERVAL_RE.match(v)
    if interval_m:
        amount = int(interval_m.group(1))
        unit = interval_m.group(2).lower()
        minutes = amount * 60 if unit.startswith("h") else amount
        return "interval", minutes
    if v in _FREQ_KEYWORDS:
        return _FREQ_KEYWORDS[v], None  # type: ignore[return-value]
    return None, None


def _parse_body(kind: ActionKind, body: str) -> InlineAction:
    """Pull #size, #freq, and @when fragments out of the body."""
    size: TaskSize | None = None
    when: str | None = None
    recurrence: Recurrence | None = None
    recurrence_minutes: int | None = None

    # #freq:<value> first (more specific than #size).
    freq_match = re.search(
        r"#\s*freq\s*:\s*([^\s\[\]#]+(?:\s*\d*\s*(?:m|min|minute|h|hr|hour)s?)?)",
        body,
        re.IGNORECASE,
    )
    if freq_match:
        # Tavily-friendly slice: keep only up to the next '#' or ']'.
        raw_freq = freq_match.group(1).strip()
        recurrence, recurrence_minutes = _parse_freq(raw_freq)
        body = body[: freq_match.start()] + body[freq_match.end() :]

    size_match = re.search(r"#\s*(tiny|small|medium)\b", body, re.IGNORECASE)
    if size_match:
        size = size_match.group(1).lower()  # type: ignore[assignment]
        body = body[: size_match.start()] + body[size_match.end() :]

    at_match = re.search(r"@\s*([^@#\[\]]+?)\s*$", body)
    if at_match:
        when = at_match.group(1).strip()
        body = body[: at_match.start()].rstrip()

    title = body.strip().strip(",;.")
    return InlineAction(
        kind=kind,
        title=title,
        when=when,
        size=size,
        recurrence=recurrence,
        recurrence_minutes=recurrence_minutes,
    )


def parse_actions(text: str) -> tuple[str, list[InlineAction]]:
    """Find all markers, return (cleaned_text, actions).

    cleaned_text has the markers removed and trailing whitespace tidied,
    so the displayed reply doesn't show the bracket syntax.
    """
    actions: list[InlineAction] = []
    for m in _MARKER_RE.finditer(text):
        kind = m.group(1).lower()
        body = m.group(2)
        action = _parse_body(kind, body)  # type: ignore[arg-type]
        action.raw = m.group(0)
        if not action.title:
            continue  # ignore empty markers
        actions.append(action)

    cleaned = _MARKER_RE.sub("", text)
    # Collapse blank lines and trim trailing whitespace.
    cleaned = re.sub(r"\n[ \t]*\n+", "\n", cleaned)
    cleaned = cleaned.rstrip()
    return cleaned, actions


def has_marker_start(text: str) -> bool:
    """Cheap check: would parsing find anything? Used to short-circuit."""
    return "[" in text


@dataclass
class ParseStats:
    marker_count: int = 0
    by_kind: dict[str, int] = field(default_factory=dict)


def stats_for(actions: list[InlineAction]) -> ParseStats:
    s = ParseStats(marker_count=len(actions))
    for a in actions:
        s.by_kind[a.kind] = s.by_kind.get(a.kind, 0) + 1
    return s
