"""Planning mode — full state machine flow.

Drives services/planning_flow.py via /agent/plan/{start, turn, end}.

Per turn:
  1. Load planning_flow_state for this session.
  2. Run the appropriate step function with the user's reply.
  3. Apply any task_changes the step produced (create/complete/defer/drop).
  4. Persist the new state row.
  5. Save the assistant message.
  6. Return the assistant message + new state to the client.

Side-effects (point awards):
  - on /start: app_open_day (once per calendar day, deduplicated cheaply)
  - on carryover completion: task_complete + carryover bonus
  - on /end: planning_session
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..db.client import supabase
from ..db.models import Language
from ..db.timeutil import now_iso
from ..services import planning_flow as pf
from ..services.lang_detect import detect_language
from ..services.points import (
    APP_OPEN_DAY_POINTS,
    CARRYOVER_BONUS_POINTS,
    PLANNING_SESSION_POINTS,
    award,
    points_for_size,
    roll_multiplier,
)

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/agent/plan")


# --- helpers ----------------------------------------------------------------


def _save_message(sb, session_id: str, role: str, content: str, language: Language) -> str:
    res = (
        sb.table("messages")
        .insert(
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "language": language,
            }
        )
        .execute()
    )
    return ((res.data or [{}])[0] or {}).get("id", "")


async def _award_app_open_day_if_first(sb, user_id: str) -> None:
    """Cheap per-calendar-day dedup: only award if no app_open_day row today."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        sb.table("point_events")
        .select("id")
        .eq("user_id", user_id)
        .eq("source_type", "app_open_day")
        .gte("created_at", today_start.isoformat())
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return
    await award(user_id=user_id, source_type="app_open_day", points=APP_OPEN_DAY_POINTS)


async def _apply_changes(
    sb, user_id: str, session_id: str, changes: list[pf.TaskChange], bonuses: list[str]
) -> None:
    """Apply task_changes from a step. Mirrors services/tasks_apply.py for the
    extractor; planning has slightly different semantics (no fuzzy matching —
    everything is by task_id) so we keep the logic local."""
    for ch in changes:
        if ch.op == "create" and ch.title:
            sb.table("tasks").insert(
                {
                    "user_id": user_id,
                    "title": ch.title,
                    "created_in_session": session_id,
                }
            ).execute()
            # task_events row for the create — pull the new id
            new_row = (
                sb.table("tasks")
                .select("id")
                .eq("user_id", user_id)
                .eq("created_in_session", session_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
                .data
                or []
            )
            if new_row:
                sb.table("task_events").insert(
                    {
                        "task_id": new_row[0]["id"],
                        "event_type": "created",
                        "session_id": session_id,
                        "delta_json": {"title": ch.title},
                    }
                ).execute()
            continue

        if not ch.task_id:
            continue

        if ch.op == "complete":
            row = (
                sb.table("tasks")
                .select("size")
                .eq("id", ch.task_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            ).data or {}
            sb.table("tasks").update(
                {"state": "done", "completed_at": now_iso()}
            ).eq("id", ch.task_id).eq("user_id", user_id).execute()
            sb.table("task_events").insert(
                {
                    "task_id": ch.task_id,
                    "event_type": "completed",
                    "session_id": session_id,
                }
            ).execute()
            pts = points_for_size(row.get("size"))
            mult = roll_multiplier()
            await award(
                user_id=user_id,
                source_type="task_complete",
                source_id=ch.task_id,
                points=pts,
                multiplier=mult,
            )
        elif ch.op == "defer":
            sb.table("tasks").update(
                {"state": "deferred", "deferred_to": ch.defer_to}
            ).eq("id", ch.task_id).eq("user_id", user_id).execute()
            sb.table("task_events").insert(
                {
                    "task_id": ch.task_id,
                    "event_type": "deferred",
                    "session_id": session_id,
                    "delta_json": {"until": ch.defer_to},
                }
            ).execute()
        elif ch.op == "drop":
            sb.table("tasks").update({"state": "dropped"}).eq("id", ch.task_id).eq(
                "user_id", user_id
            ).execute()
            sb.table("task_events").insert(
                {
                    "task_id": ch.task_id,
                    "event_type": "dropped",
                    "session_id": session_id,
                }
            ).execute()

    for tid in bonuses:
        await award(
            user_id=user_id,
            source_type="carryover_done",
            source_id=tid,
            points=CARRYOVER_BONUS_POINTS,
        )


# --- routes -----------------------------------------------------------------


class StartBody(BaseModel):
    language: Language | None = None


@router.post("/start")
async def start_plan(body: StartBody, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    settings_row = (
        sb.table("user_settings")
        .select("language")
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    language: Language = (
        body.language or (settings_row.data or {}).get("language") or "en"  # type: ignore[assignment]
    )

    res = (
        sb.table("sessions")
        .insert({"user_id": user.user_id, "mode": "planning", "language": language})
        .execute()
    )
    sess = (res.data or [{}])[0]
    session_id = sess["id"]

    await _award_app_open_day_if_first(sb, user.user_id)

    # Run the greet step.
    result = await pf.step_greet(
        sb=sb, user_id=user.user_id, session_id=session_id, language=language
    )

    # Persist new state + assistant message.
    pf.save_state(
        sb,
        session_id,
        current_step=result.next_step,
        step_data=result.next_step_data,
    )
    _save_message(sb, session_id, "assistant", result.assistant_reply, language)

    return {
        "ok": True,
        "session_id": session_id,
        "assistant_message": result.assistant_reply,
        "state": result.next_step,
        "done": False,
    }


class TurnBody(BaseModel):
    session_id: str
    user_message: str
    audio_path: str | None = None


@router.post("/turn")
async def plan_turn(body: TurnBody, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    sess = (
        sb.table("sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    if not sess.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "session_not_found"}})
    if sess.data.get("ended_at"):
        raise HTTPException(status_code=409, detail={"error": {"code": "session_closed"}})

    # Per-turn language detection (PRD §6.4: users may switch mid-conversation).
    # Falls back to the session's frozen language only if the message has no
    # script signal (e.g., emoji-only or punctuation).
    session_language: Language = sess.data["language"]
    language: Language = detect_language(body.user_message, default=session_language)

    # Persist user message with the detected language.
    sb.table("messages").insert(
        {
            "session_id": body.session_id,
            "role": "user",
            "content": body.user_message,
            "language": language,
            "audio_path": body.audio_path,
        }
    ).execute()

    state_row = pf.load_state(sb, body.session_id)
    if not state_row:
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "no_flow_state", "message": "session not in planning mode"}},
        )

    current_step = state_row["current_step"]
    step_data = state_row.get("step_data") or {}

    if current_step == pf.STEP_REVIEW:
        result = await pf.step_review_carryover(
            sb=sb,
            user_id=user.user_id,
            session_id=body.session_id,
            language=language,
            user_message=body.user_message,
            step_data=step_data,
        )
    elif current_step == pf.STEP_PROPOSE:
        result = await pf.step_propose_today(
            language=language,
            user_message=body.user_message,
            step_data=step_data,
        )
    elif current_step == pf.STEP_CONFIRM:
        # In confirm we're waiting for user ack to close. Any reply moves to close.
        result = await pf.step_confirm(
            sb=sb,
            user_id=user.user_id,
            session_id=body.session_id,
            language=language,
            step_data=step_data,
        )
    elif current_step == pf.STEP_CLOSE:
        # Already closed; the route should have ended the session. Re-issue close.
        summary, msg = await pf.step_close(
            sb=sb,
            user_id=user.user_id,
            session_id=body.session_id,
            language=language,
            step_data=step_data,
        )
        return {
            "ok": True,
            "assistant_message": msg,
            "state": pf.STEP_CLOSE,
            "done": True,
        }
    else:
        # Unknown step; treat as propose.
        result = await pf.step_propose_today(
            language=language,
            user_message=body.user_message,
            step_data=step_data,
        )

    # Apply task changes (planning step results)
    if result.task_changes or result.award_carryover_bonus_for:
        await _apply_changes(
            sb,
            user.user_id,
            body.session_id,
            result.task_changes,
            result.award_carryover_bonus_for,
        )

    # Persist next state
    pf.save_state(
        sb,
        body.session_id,
        current_step=result.next_step,
        step_data=result.next_step_data,
    )

    # Persist assistant message
    _save_message(sb, body.session_id, "assistant", result.assistant_reply, language)

    return {
        "ok": True,
        "assistant_message": result.assistant_reply,
        "state": result.next_step,
        "done": result.done or result.next_step == pf.STEP_CLOSE,
        "language": language,
    }


class EndBody(BaseModel):
    session_id: str


@router.post("/end")
async def end_plan(body: EndBody, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    sess = (
        sb.table("sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    if not sess.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "session_not_found"}})

    language: Language = sess.data["language"]
    state_row = pf.load_state(sb, body.session_id)
    step_data = (state_row or {}).get("step_data") or {}

    summary, _user_msg = await pf.step_close(
        sb=sb,
        user_id=user.user_id,
        session_id=body.session_id,
        language=language,
        step_data=step_data,
    )

    sb.table("sessions").update(
        {"ended_at": now_iso(), "summary": summary}
    ).eq("id", body.session_id).eq("user_id", user.user_id).execute()

    # Always award planning_session points for showing up.
    await award(
        user_id=user.user_id,
        source_type="planning_session",
        points=PLANNING_SESSION_POINTS,
        source_id=body.session_id,
    )

    return {"ok": True, "summary": summary}
