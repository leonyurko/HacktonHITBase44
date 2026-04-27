"""Web push subscription management.

STUB — accepts subscriptions and stores them, but no scheduler is running
in MVP. See PRD §13.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..db.client import supabase

router = APIRouter(prefix="/push")


class PushSub(BaseModel):
    endpoint: str
    keys: dict[str, str]
    user_agent: str | None = None


@router.post("/subscribe")
async def subscribe(body: PushSub, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    p256dh = body.keys.get("p256dh")
    auth_key = body.keys.get("auth")
    if not p256dh or not auth_key:
        return {"ok": False, "error": {"code": "missing_keys"}}
    sb.table("push_subscriptions").upsert(
        {
            "user_id": user.user_id,
            "endpoint": body.endpoint,
            "p256dh": p256dh,
            "auth": auth_key,
            "user_agent": body.user_agent,
        },
        on_conflict="user_id,endpoint",
    ).execute()
    return {"ok": True}


class Unsub(BaseModel):
    endpoint: str


@router.delete("/subscribe")
async def unsubscribe(body: Unsub, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    sb.table("push_subscriptions").delete().eq("user_id", user.user_id).eq(
        "endpoint", body.endpoint
    ).execute()
    return {"ok": True}
