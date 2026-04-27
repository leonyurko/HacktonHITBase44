"""Apply InlineAction list (from agent reply) to the user's task list.

Replaces the role of the previous extractor + tasks_apply combo for the
on-demand chat: the AGENT decides what to log; this just executes.

Resolution rules:
  - 'task' → always create new task (title is the canonical title)
  - 'done' / 'defer' / 'drop' → resolve target by fuzzy title match against
    user's currently-open tasks (rapidfuzz, threshold 70 — looser than the
    extractor used because the agent is choosing words deliberately)
  - 'remind' → record reminder linked to a matched task; recurrence
    persisted; delivery requires the scheduler (PRD §13.5)
  - 'search' → ignored here; handled in the route (two-pass flow)

Returns a summary of applied changes for the SSE 'extracted' event.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

import structlog
from rapidfuzz import fuzz, process

from ..db.client import supabase
from ..db.timeutil import now_iso
from .inline_actions import InlineAction
from .points import (
    award,
    points_for_size,
    roll_multiplier,
)

log = structlog.get_logger(__name__)

_FUZZY_THRESHOLD = 70


def _parse_until(value: str | None) -> date | None:
    if not value:
        return None
    v = value.strip().lower()
    if v in ("today",):
        return date.today()
    if v in ("tomorrow", "מחר"):
        return date.today() + timedelta(days=1)
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


_RELATIVE_RE = re.compile(r"^\s*(?:in\s+)?(\d+)\s*(m|min|minute|h|hr|hour|d|day)s?\s*$", re.IGNORECASE)


def _parse_when_to_datetime(value: str | None) -> datetime:
    """Best-effort parse of the 'when' value for a reminder.

    Accepts:
      - '1h', 'in 30 min', '2 hours', '3d'   → relative to now
      - 'tomorrow [HH:MM]'                   → 09:00 tomorrow if no time
      - ISO datetime                          → exact
    Falls back to now + 1 hour.
    """
    fallback = datetime.now(timezone.utc) + timedelta(hours=1)
    if not value:
        return fallback

    v = value.strip()
    rel = _RELATIVE_RE.match(v)
    if rel:
        amount = int(rel.group(1))
        unit = rel.group(2).lower()
        if unit.startswith("m"):
            delta = timedelta(minutes=amount)
        elif unit.startswith("h"):
            delta = timedelta(hours=amount)
        else:
            delta = timedelta(days=amount)
        return datetime.now(timezone.utc) + delta

    if v.lower().startswith("tomorrow"):
        d = date.today() + timedelta(days=1)
        return datetime(d.year, d.month, d.day, 9, 0, tzinfo=timezone.utc)

    try:
        # ISO with or without timezone
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return fallback


def _resolve_match(matcher: str, open_tasks: list[dict]) -> dict | None:
    titles = [t["title"] for t in open_tasks]
    if not titles:
        return None
    best = process.extractOne(matcher, titles, scorer=fuzz.WRatio)
    if not best:
        return None
    matched_title, score, idx = best
    if score < _FUZZY_THRESHOLD:
        log.warning(
            "action_match_unresolved",
            matcher=matcher,
            best=matched_title,
            score=score,
        )
        return None
    return open_tasks[idx]


async def apply_actions(
    *,
    user_id: str,
    session_id: str,
    actions: list[InlineAction],
) -> dict[str, Any]:
    if not actions:
        return {"added": [], "completed": [], "deferred": [], "dropped": [], "reminded": []}
    # search markers are handled by the route's two-pass flow, not here.
    actions = [a for a in actions if a.kind != "search"]
    sb = supabase()
    summary: dict[str, Any] = {
        "added": [],
        "completed": [],
        "deferred": [],
        "dropped": [],
        "reminded": [],
    }

    open_tasks = (
        sb.table("tasks")
        .select("id, title, size")
        .eq("user_id", user_id)
        .eq("state", "open")
        .execute()
        .data
        or []
    )

    for a in actions:
        if a.kind == "task":
            row = (
                sb.table("tasks")
                .insert(
                    {
                        "user_id": user_id,
                        "title": a.title,
                        "size": a.size,
                        "soft_when": a.when,
                        "created_in_session": session_id,
                    }
                )
                .execute()
                .data
                or [{}]
            )[0]
            if row.get("id"):
                sb.table("task_events").insert(
                    {
                        "task_id": row["id"],
                        "event_type": "created",
                        "session_id": session_id,
                        "delta_json": {
                            "title": a.title,
                            "size": a.size,
                            "soft_when": a.when,
                        },
                    }
                ).execute()
                summary["added"].append(row)
            continue

        # All other kinds need a target task
        target = _resolve_match(a.title, open_tasks)
        if not target:
            continue

        if a.kind == "done":
            sb.table("tasks").update(
                {"state": "done", "completed_at": now_iso()}
            ).eq("id", target["id"]).eq("user_id", user_id).execute()
            sb.table("task_events").insert(
                {
                    "task_id": target["id"],
                    "event_type": "completed",
                    "session_id": session_id,
                }
            ).execute()
            pts = points_for_size(target.get("size"))
            mult = roll_multiplier()
            await award(
                user_id=user_id,
                source_type="task_complete",
                source_id=target["id"],
                points=pts,
                multiplier=mult,
            )
            summary["completed"].append({"id": target["id"], "points": pts, "multiplier": mult})

        elif a.kind == "defer":
            until = _parse_until(a.when)
            sb.table("tasks").update(
                {
                    "state": "deferred",
                    "deferred_to": until.isoformat() if until else None,
                }
            ).eq("id", target["id"]).eq("user_id", user_id).execute()
            sb.table("task_events").insert(
                {
                    "task_id": target["id"],
                    "event_type": "deferred",
                    "session_id": session_id,
                    "delta_json": {"until": a.when},
                }
            ).execute()
            summary["deferred"].append({"id": target["id"], "until": a.when})

        elif a.kind == "drop":
            sb.table("tasks").update({"state": "dropped"}).eq("id", target["id"]).eq(
                "user_id", user_id
            ).execute()
            sb.table("task_events").insert(
                {
                    "task_id": target["id"],
                    "event_type": "dropped",
                    "session_id": session_id,
                }
            ).execute()
            summary["dropped"].append({"id": target["id"]})

        elif a.kind == "remind":
            scheduled_dt = _parse_when_to_datetime(a.when)
            recurrence = a.recurrence or "once"
            payload = {
                "user_id": user_id,
                "task_id": target["id"],
                "scheduled_at": scheduled_dt.isoformat(),
                "delivery_channel": "webpush",
                "body_override": f"reminder: {target['title']}",
                "recurrence": recurrence,
                "recurrence_minutes": a.recurrence_minutes,
            }
            sb.table("reminders").insert(payload).execute()
            summary["reminded"].append(
                {
                    "task_id": target["id"],
                    "scheduled_at": scheduled_dt.isoformat(),
                    "recurrence": recurrence,
                    "recurrence_minutes": a.recurrence_minutes,
                }
            )

    return summary
