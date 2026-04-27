"""Pydantic DTOs mirroring the Supabase schema.

These are wire-format models used by routes and services. They intentionally
allow optional fields so that partial reads from Supabase don't fail
validation.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Language = Literal["en", "he"]
SessionMode = Literal["planning", "on_demand"]
TaskState = Literal["open", "done", "deferred", "dropped"]
TaskSize = Literal["tiny", "small", "medium"]
MessageRole = Literal["user", "assistant", "system"]
PointSource = Literal[
    "task_complete",
    "planning_session",
    "app_open_day",
    "carryover_done",
    "multiplier_bonus",
]
RagCorpus = Literal["strategies", "restart", "user_history", "language_guide"]
ReminderChannel = Literal["webpush", "fcm", "apns", "email"]
ReminderStatus = Literal["pending", "sent", "cancelled", "failed"]
TtsPlaybackMode = Literal["always", "voice_turns_only", "never"]
PlanningTime = Literal["morning", "evening", "both", "none"]


class UserSettings(BaseModel):
    user_id: UUID
    language: Language = "en"
    voice_autoplay: bool = True
    tts_playback_mode: TtsPlaybackMode = "voice_turns_only"
    quiet_visual_mode: bool = False
    preferred_planning_time: PlanningTime = "morning"
    notification_quiet_start: time | None = None
    notification_quiet_end: time | None = None
    notification_digest_mode: bool = False
    notification_digest_time: time | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Task(BaseModel):
    id: UUID | None = None
    user_id: UUID
    title: str
    description: str | None = None
    state: TaskState = "open"
    size: TaskSize | None = None
    soft_when: str | None = None
    deferred_to: date | None = None
    created_in_session: UUID | None = None
    calendar_event_id: str | None = None
    calendar_synced_at: datetime | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None


class Session(BaseModel):
    id: UUID | None = None
    user_id: UUID
    mode: SessionMode
    language: Language
    ephemeral: bool = False
    started_at: datetime | None = None
    ended_at: datetime | None = None
    summary: str | None = None


class Message(BaseModel):
    id: UUID | None = None
    session_id: UUID
    role: MessageRole
    content: str
    audio_path: str | None = None
    language: Language | None = None
    created_at: datetime | None = None


class TaskEvent(BaseModel):
    id: UUID | None = None
    task_id: UUID
    event_type: Literal["created", "completed", "deferred", "dropped", "edited"]
    session_id: UUID | None = None
    delta_json: dict[str, Any] | None = None
    created_at: datetime | None = None


class PointEvent(BaseModel):
    id: UUID | None = None
    user_id: UUID
    source_type: PointSource
    source_id: UUID | None = None
    points: int
    multiplier: int = 1
    created_at: datetime | None = None


# --- Extractor schema (Call 2 of on-demand turn) -----------------------------


class TaskAdd(BaseModel):
    title: str
    size: TaskSize | None = None
    soft_when: str | None = None
    description: str | None = None


class TaskRef(BaseModel):
    """Reference to an existing task: either ID or fuzzy title match."""

    task_id: UUID | None = None
    task_match: str | None = None


class TaskDefer(BaseModel):
    task_id: UUID | None = None
    task_match: str | None = None
    until: str  # 'tomorrow' | 'YYYY-MM-DD' (parsed by service)


class ExtractorDiff(BaseModel):
    """Output of the extractor LLM call. All fields optional — empty diff = {}."""

    add: list[TaskAdd] = Field(default_factory=list)
    complete: list[TaskRef] = Field(default_factory=list)
    defer: list[TaskDefer] = Field(default_factory=list)
    drop: list[TaskRef] = Field(default_factory=list)
    note: str | None = None
