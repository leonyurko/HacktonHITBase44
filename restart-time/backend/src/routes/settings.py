"""User settings."""

from __future__ import annotations

from datetime import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..db.client import supabase
from ..db.models import Language, PlanningTime, TtsPlaybackMode
from ..db.timeutil import now_iso
from ..services.points import days_engaged_this_month, find_level, next_level, total_points

router = APIRouter(prefix="/settings")


@router.get("")
async def get_settings_(user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    res = (
        sb.table("user_settings")
        .select("*")
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    if not res.data:
        # Trigger should auto-create on signup. Defensive insert if missing.
        sb.table("user_settings").insert({"user_id": user.user_id}).execute()
        res = (
            sb.table("user_settings")
            .select("*")
            .eq("user_id", user.user_id)
            .single()
            .execute()
        )

    pts = await total_points(user.user_id)
    days = await days_engaged_this_month(user.user_id)
    level = find_level(pts)
    nxt = next_level(pts)

    return {
        "ok": True,
        "settings": res.data,
        "progress": {
            "total_points": pts,
            "level": {"number": level.number, "name_en": level.name_en, "name_he": level.name_he},
            "next_level": (
                {"number": nxt.number, "threshold": nxt.threshold, "name_en": nxt.name_en, "name_he": nxt.name_he}
                if nxt
                else None
            ),
            "days_engaged_this_month": days,
        },
    }


class SettingsPatch(BaseModel):
    language: Language | None = None
    voice_autoplay: bool | None = None
    tts_playback_mode: TtsPlaybackMode | None = None
    quiet_visual_mode: bool | None = None
    preferred_planning_time: PlanningTime | None = None
    notification_quiet_start: time | None = None
    notification_quiet_end: time | None = None
    notification_digest_mode: bool | None = None
    notification_digest_time: time | None = None


@router.patch("")
async def patch_settings(
    body: SettingsPatch, user: AuthUser = Depends(get_current_user)
) -> dict:
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail={"error": {"code": "empty_patch"}})
    # Convert time fields to strings
    for k in (
        "notification_quiet_start",
        "notification_quiet_end",
        "notification_digest_time",
    ):
        if k in payload and payload[k] is not None:
            payload[k] = payload[k].isoformat()
    payload["updated_at"] = now_iso()
    sb = supabase()
    res = (
        sb.table("user_settings")
        .update(payload)
        .eq("user_id", user.user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "settings_not_found"}})
    return {"ok": True, "settings": res.data[0]}
