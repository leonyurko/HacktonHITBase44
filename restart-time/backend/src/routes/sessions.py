"""Sessions: list and detail (with transcript)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import AuthUser, get_current_user
from ..db.client import supabase

router = APIRouter(prefix="/sessions")


@router.get("")
async def list_sessions(
    limit: int = 20,
    before: str | None = None,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    sb = supabase()
    q = sb.table("sessions").select("*").eq("user_id", user.user_id)
    if before:
        q = q.lt("started_at", before)
    rows = q.order("started_at", desc=True).limit(limit).execute().data or []
    return {"ok": True, "sessions": rows}


@router.get("/{session_id}")
async def get_session(session_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    sess = (
        sb.table("sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    if not sess.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "session_not_found"}})
    msgs = (
        sb.table("messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    # Map local audio_path → /audio/file/<...> URL (auth-checked at serve time).
    for m in msgs:
        if m.get("audio_path"):
            m["audio_url"] = f"/audio/file/{m['audio_path']}"
    return {"ok": True, "session": sess.data, "messages": msgs}
