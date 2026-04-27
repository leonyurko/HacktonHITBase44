"""FastAPI app entry."""

from __future__ import annotations

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import (
    agent_chat,
    agent_plan,
    audio,
    calendar,
    grounding,
    health,
    push,
    reminders,
    sessions,
    settings as settings_route,
    tasks,
)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)

log = structlog.get_logger()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Restart Time",
        version="0.1.0",
        description="Trauma-informed AI agent for time management",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(audio.router)
    app.include_router(agent_chat.router)
    app.include_router(agent_plan.router)
    app.include_router(tasks.router)
    app.include_router(sessions.router)
    app.include_router(settings_route.router)
    app.include_router(calendar.router)
    app.include_router(reminders.router)
    app.include_router(push.router)
    app.include_router(grounding.router)

    @app.on_event("startup")
    async def _startup() -> None:
        log.info(
            "app_starting",
            env=s.env,
            llm_url=s.local_base_url,
            audio_enabled=s.audio_enabled,
            rag_enabled=s.enable_rag,
            calendar_enabled=s.enable_calendar,
            reminders_enabled=s.enable_reminders,
        )

    return app


app = create_app()
