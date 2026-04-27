"""Tasks CRUD."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import AuthUser, get_current_user
from ..db.client import supabase
from ..db.models import TaskSize, TaskState

router = APIRouter(prefix="/tasks")


class TaskCreateBody(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    size: TaskSize | None = None
    soft_when: str | None = None
    deferred_to: date | None = None


@router.post("")
async def create_task(
    body: TaskCreateBody, user: AuthUser = Depends(get_current_user)
) -> dict:
    sb = supabase()
    payload = body.model_dump(exclude_none=True)
    if "deferred_to" in payload and payload["deferred_to"] is not None:
        payload["deferred_to"] = payload["deferred_to"].isoformat()
    payload["user_id"] = user.user_id
    if payload.get("deferred_to"):
        payload["state"] = "deferred"
    res = sb.table("tasks").insert(payload).execute()
    new = (res.data or [{}])[0]
    if new.get("id"):
        sb.table("task_events").insert(
            {
                "task_id": new["id"],
                "event_type": "created",
                "delta_json": body.model_dump(exclude_none=True),
            }
        ).execute()
    return {"ok": True, "task": new}


@router.get("")
async def list_tasks(
    state: TaskState | None = "open",
    user: AuthUser = Depends(get_current_user),
) -> dict:
    sb = supabase()
    q = sb.table("tasks").select("*").eq("user_id", user.user_id)
    if state:
        q = q.eq("state", state)
    rows = q.order("created_at", desc=True).execute().data or []
    return {"ok": True, "tasks": rows}


@router.get("/{task_id}")
async def get_task(task_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    res = (
        sb.table("tasks")
        .select("*")
        .eq("id", task_id)
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "task_not_found"}})
    events = (
        sb.table("task_events")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    return {"ok": True, "task": res.data, "events": events}


class TaskPatch(BaseModel):
    title: str | None = None
    state: TaskState | None = None
    size: TaskSize | None = None
    soft_when: str | None = None
    deferred_to: date | None = None


@router.patch("/{task_id}")
async def patch_task(
    task_id: str,
    body: TaskPatch,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    sb = supabase()
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail={"error": {"code": "empty_patch"}})
    if "deferred_to" in payload and payload["deferred_to"] is not None:
        payload["deferred_to"] = payload["deferred_to"].isoformat()
    res = (
        sb.table("tasks")
        .update(payload)
        .eq("id", task_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "task_not_found"}})
    sb.table("task_events").insert(
        {"task_id": task_id, "event_type": "edited", "delta_json": payload}
    ).execute()
    return {"ok": True, "task": res.data[0]}


@router.delete("/{task_id}")
async def delete_task(
    task_id: str, user: AuthUser = Depends(get_current_user)
) -> dict:
    sb = supabase()
    res = (
        sb.table("tasks")
        .update({"state": "dropped"})
        .eq("id", task_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "task_not_found"}})
    sb.table("task_events").insert(
        {"task_id": task_id, "event_type": "dropped"}
    ).execute()
    return {"ok": True}
