"""Earn-only points ledger + level lookup.

Three rules (PRD §8):
  - Earn-only: never decrease.
  - No streaks: "days engaged this month" replaces consecutive-day counters.
  - No comparison: per-user only.

A surprise multiplier applies to ~10% of task completions, value 2 or 3.
This is variable-reward dopamine for ADHD users — undocumented in UI on purpose.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import structlog

from ..db.client import supabase
from ..db.models import PointSource, TaskSize

log = structlog.get_logger(__name__)


SIZE_POINTS: dict[TaskSize, int] = {
    "tiny": 5,
    "small": 10,
    "medium": 20,
}

PLANNING_SESSION_POINTS = 15
APP_OPEN_DAY_POINTS = 5
CARRYOVER_BONUS_POINTS = 5

MULTIPLIER_PROBABILITY = 0.10


@dataclass(frozen=True)
class Level:
    number: int
    name_en: str
    name_he: str
    threshold: int  # cumulative points needed to enter this level


# Logarithmic-ish curve. Final names pending Restart input.
LEVELS: list[Level] = [
    Level(1, "First Light",   "ראשית הדרך",   0),
    Level(2, "Steady Step",   "צעד אחר צעד", 100),
    Level(3, "Day by Day",    "יום אחר יום", 300),
    Level(4, "Restart",       "התחלה חדשה",  700),
    Level(5, "Wide Awake",    "מתעורר",      1500),
    Level(6, "Open Sky",      "שמיים פתוחים", 3000),
]


def roll_multiplier() -> int:
    """Return 1, 2, or 3. ~10% chance of >1; within that, equally split."""
    if random.random() < MULTIPLIER_PROBABILITY:
        return random.choice([2, 3])
    return 1


def points_for_size(size: TaskSize | None) -> int:
    if size is None:
        return SIZE_POINTS["small"]  # safe default
    return SIZE_POINTS[size]


def find_level(total_points: int) -> Level:
    current = LEVELS[0]
    for level in LEVELS:
        if total_points >= level.threshold:
            current = level
        else:
            break
    return current


def next_level(total_points: int) -> Level | None:
    current = find_level(total_points)
    next_idx = LEVELS.index(current) + 1
    if next_idx >= len(LEVELS):
        return None
    return LEVELS[next_idx]


async def award(
    *,
    user_id: UUID | str,
    source_type: PointSource,
    points: int,
    source_id: UUID | str | None = None,
    multiplier: int = 1,
) -> dict:
    """Insert a point_event row. Returns the inserted row."""
    if points <= 0:
        return {}
    sb = supabase()
    row = {
        "user_id": str(user_id),
        "source_type": source_type,
        "source_id": str(source_id) if source_id else None,
        "points": points,
        "multiplier": multiplier,
    }
    res = sb.table("point_events").insert(row).execute()
    log.info(
        "points_awarded",
        user_id=str(user_id),
        source=source_type,
        points=points,
        multiplier=multiplier,
    )
    return (res.data or [{}])[0]


async def total_points(user_id: UUID | str) -> int:
    sb = supabase()
    # Sum done in Python; for MVP scale this is fine. Replace with DB SUM in v1.1.
    rows = sb.table("point_events").select("points,multiplier").eq("user_id", str(user_id)).execute()
    return sum((r["points"] or 0) * (r.get("multiplier") or 1) for r in (rows.data or []))


async def days_engaged_this_month(user_id: UUID | str) -> int:
    sb = supabase()
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = (
        sb.table("point_events")
        .select("created_at")
        .eq("user_id", str(user_id))
        .eq("source_type", "app_open_day")
        .gte("created_at", start.isoformat())
        .execute()
    )
    days: set[str] = set()
    for r in rows.data or []:
        ts = r.get("created_at")
        if not ts:
            continue
        days.add(ts.split("T", 1)[0])
    return len(days)
