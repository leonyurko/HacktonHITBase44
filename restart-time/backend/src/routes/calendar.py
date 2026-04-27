"""Google Calendar OAuth + sync.

STUB — endpoints return 501 with clear messages until OAuth is wired up.
See PRD §12.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user
from ..config import get_settings

router = APIRouter(prefix="/calendar")


def _disabled() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "error": {
                "code": "calendar_not_implemented",
                "message": (
                    "Google Calendar sync is in scope per PRD §12 but not yet "
                    "implemented in this MVP scaffold. Set ENABLE_CALENDAR=true and "
                    "wire up the OAuth flow to enable."
                ),
            }
        },
    )


@router.get("/status")
async def calendar_status(user: AuthUser = Depends(get_current_user)) -> dict:
    s = get_settings()
    return {"ok": True, "connected": False, "enabled_in_env": s.enable_calendar}


@router.post("/connect")
async def calendar_connect(user: AuthUser = Depends(get_current_user)) -> dict:
    raise _disabled()


@router.post("/disconnect")
async def calendar_disconnect(user: AuthUser = Depends(get_current_user)) -> dict:
    raise _disabled()


@router.post("/sync/task/{task_id}")
async def calendar_sync(task_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    raise _disabled()
