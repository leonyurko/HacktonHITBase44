"""Health endpoint with live probes to external services."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter

from ..config import get_settings
from ..services import audio as audio_service
from ..services import llm as llm_service

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    s = get_settings()
    llm_ok, audio_status = await asyncio.gather(
        llm_service.health_probe(),
        audio_service.health_probe(),
    )
    return {
        "ok": True,
        "env": s.env,
        "llm_reachable": llm_ok,
        "audio": audio_status,
        "rag_enabled": s.enable_rag,
        "calendar_enabled": s.enable_calendar,
        "reminders_enabled": s.enable_reminders,
    }
