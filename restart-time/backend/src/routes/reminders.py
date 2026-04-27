"""Reminders CRUD.

STUB — schema-backed but the dispatcher is not running. See PRD §13.
The endpoints are real (you can create/list/delete reminders) so the frontend
can wire up; nothing is *delivered* until the scheduler is implemented.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..db.client import supabase

router = APIRouter(prefix="/reminders")


class ReminderCreate(BaseModel):
    task_id: str
    scheduled_at: datetime
    body_override: str | None = None


@router.post("")
async def create_reminder(
    body: ReminderCreate, user: AuthUser = Depends(get_current_user)
) -> dict:
    sb = supabase()
    res = (
        sb.table("reminders")
        .insert(
            {
                "user_id": user.user_id,
                "task_id": body.task_id,
                "scheduled_at": body.scheduled_at.isoformat(),
                "body_override": body.body_override,
            }
        )
        .execute()
    )
    return {"ok": True, "reminder": (res.data or [{}])[0]}


@router.get("")
async def list_reminders(
    task_id: str | None = None, user: AuthUser = Depends(get_current_user)
) -> dict:
    sb = supabase()
    q = sb.table("reminders").select("*").eq("user_id", user.user_id)
    if task_id:
        q = q.eq("task_id", task_id)
    rows = q.order("scheduled_at").execute().data or []
    return {"ok": True, "reminders": rows}


@router.delete("/{reminder_id}")
async def delete_reminder(
    reminder_id: str, user: AuthUser = Depends(get_current_user)
) -> dict:
    sb = supabase()
    res = (
        sb.table("reminders")
        .update({"status": "cancelled"})
        .eq("id", reminder_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=404, detail={"error": {"code": "reminder_not_found"}}
        )
    return {"ok": True}
