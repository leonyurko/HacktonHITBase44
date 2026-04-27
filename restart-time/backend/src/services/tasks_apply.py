"""Apply an ExtractorDiff to a user's task list.

Owns the transactional semantics: tasks + task_events + point_events all
move together. Resolves task references via UUID first, then by fuzzy title
match against the user's currently-open tasks (rapidfuzz ratio >= 80).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

import structlog
from rapidfuzz import fuzz, process

from ..db.client import supabase
from ..db.models import (
    ExtractorDiff,
    TaskAdd,
    TaskDefer,
    TaskRef,
)
from ..db.timeutil import now_iso
from .points import (
    CARRYOVER_BONUS_POINTS,
    award,
    points_for_size,
    roll_multiplier,
)

log = structlog.get_logger(__name__)


_FUZZY_THRESHOLD = 80


def _parse_until(value: str) -> date | None:
    v = value.strip().lower()
    if v in ("today",):
        return date.today()
    if v in ("tomorrow", "מחר"):
        return date.today() + timedelta(days=1)
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


async def _resolve_ref(
    ref: TaskRef | TaskDefer, user_id: str, open_tasks: list[dict]
) -> str | None:
    if ref.task_id:
        return str(ref.task_id)
    if not ref.task_match:
        return None
    titles = [t["title"] for t in open_tasks]
    if not titles:
        return None
    match = process.extractOne(ref.task_match, titles, scorer=fuzz.WRatio)
    if not match:
        return None
    matched_title, score, idx = match
    if score < _FUZZY_THRESHOLD:
        log.warning("task_ref_unresolved", match=ref.task_match, best=matched_title, score=score)
        return None
    return str(open_tasks[idx]["id"])


async def apply_diff(
    *,
    user_id: str,
    session_id: str,
    diff: ExtractorDiff,
) -> dict[str, Any]:
    """Apply the diff. Returns a summary of what changed (for SSE 'extracted' event)."""
    sb = supabase()
    summary: dict[str, Any] = {"added": [], "completed": [], "deferred": [], "dropped": []}

    open_tasks = (
        sb.table("tasks")
        .select("id, title, size")
        .eq("user_id", user_id)
        .eq("state", "open")
        .execute()
        .data
        or []
    )

    # --- adds -------------------------------------------------------------
    for add in diff.add:
        title = (add.title or "").strip()
        if not title:
            continue
        row = {
            "user_id": user_id,
            "title": title,
            "description": add.description,
            "size": add.size,
            "soft_when": add.soft_when,
            "created_in_session": session_id,
        }
        res = sb.table("tasks").insert(row).execute()
        new_task = (res.data or [{}])[0]
        if new_task.get("id"):
            sb.table("task_events").insert(
                {
                    "task_id": new_task["id"],
                    "event_type": "created",
                    "session_id": session_id,
                    "delta_json": add.model_dump(exclude_none=True),
                }
            ).execute()
            summary["added"].append(new_task)

    # --- completions ------------------------------------------------------
    for ref in diff.complete:
        task_id = await _resolve_ref(ref, user_id, open_tasks)
        if not task_id:
            continue
        sb.table("tasks").update(
            {"state": "done", "completed_at": now_iso()}
        ).eq("id", task_id).eq("user_id", user_id).execute()
        sb.table("task_events").insert(
            {
                "task_id": task_id,
                "event_type": "completed",
                "session_id": session_id,
            }
        ).execute()
        size = next((t.get("size") for t in open_tasks if str(t["id"]) == task_id), None)
        pts = points_for_size(size)
        mult = roll_multiplier()
        await award(
            user_id=user_id,
            source_type="task_complete",
            source_id=task_id,
            points=pts,
            multiplier=mult,
        )
        if mult > 1:
            await award(
                user_id=user_id,
                source_type="multiplier_bonus",
                source_id=task_id,
                points=0,
                multiplier=mult,
            )
        summary["completed"].append({"id": task_id, "points": pts, "multiplier": mult})

    # --- defers -----------------------------------------------------------
    for d in diff.defer:
        task_id = await _resolve_ref(d, user_id, open_tasks)
        if not task_id:
            continue
        until = _parse_until(d.until) if d.until else None
        sb.table("tasks").update(
            {
                "state": "deferred",
                "deferred_to": until.isoformat() if until else None,
            }
        ).eq("id", task_id).eq("user_id", user_id).execute()
        sb.table("task_events").insert(
            {
                "task_id": task_id,
                "event_type": "deferred",
                "session_id": session_id,
                "delta_json": {"until": d.until},
            }
        ).execute()
        summary["deferred"].append({"id": task_id, "until": d.until})

    # --- drops ------------------------------------------------------------
    for ref in diff.drop:
        task_id = await _resolve_ref(ref, user_id, open_tasks)
        if not task_id:
            continue
        sb.table("tasks").update({"state": "dropped"}).eq("id", task_id).eq(
            "user_id", user_id
        ).execute()
        sb.table("task_events").insert(
            {
                "task_id": task_id,
                "event_type": "dropped",
                "session_id": session_id,
            }
        ).execute()
        summary["dropped"].append({"id": task_id})

    return summary
