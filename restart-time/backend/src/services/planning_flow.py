"""Planning mode — deterministic state machine.

States:
  greet            → review_carryover (if any) | propose_today
  review_carryover → review_carryover (loop) | propose_today
  propose_today    → propose_today (loop, ≤ 3) | confirm
  confirm          → close
  close            → END

The LLM only fills natural-language slots. State transitions are pure Python
parsing of the user's reply. This protects the small local model from doing
control flow it can't reliably do.

Persistence: one row in `planning_flow_state` per session, with `current_step`
and `step_data` (state-specific scratch).

See PRD §6.1 and workflow.md Workflow B/D for the user-facing behavior.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from supabase import Client

from ..db.models import Language
from ..db.timeutil import now_iso
from .llm import LLMUnavailable, chat_complete

log = structlog.get_logger(__name__)

# --------------------------------------------------------------------------
# Carryover lookback window (days). Older open tasks are not surfaced.
CARRYOVER_LOOKBACK_DAYS = 7
# Maximum tasks to add per planning session.
MAX_TASKS_PER_PLAN = 3
# Maximum carryovers to review per session.
MAX_CARRYOVERS_REVIEW = 3
# --------------------------------------------------------------------------


# Steps as constants (also stored as DB CHECK values)
STEP_GREET = "greet"
STEP_REVIEW = "review_carryover"
STEP_PROPOSE = "propose_today"
STEP_CONFIRM = "confirm"
STEP_CLOSE = "close"


@dataclass
class TaskChange:
    """A single task mutation produced by a state step. Applied by the route."""

    op: str  # 'create' | 'complete' | 'defer' | 'drop'
    task_id: str | None = None
    title: str | None = None
    defer_to: str | None = None  # ISO date


@dataclass
class StepResult:
    assistant_reply: str
    next_step: str
    next_step_data: dict[str, Any] = field(default_factory=dict)
    task_changes: list[TaskChange] = field(default_factory=list)
    award_carryover_bonus_for: list[str] = field(default_factory=list)  # task_ids
    done: bool = False  # close → terminate session


# --------------------------------------------------------------------------
# Intent parsing (pre-LLM — simple keyword matching). Cheap and fast.
# --------------------------------------------------------------------------

_DONE_PATTERNS_EN = [r"\b(yes|yep|did|done|finished|completed)\b"]
_DONE_PATTERNS_HE = [r"כן", r"עשיתי", r"סיימתי", r"גמרתי", r"בוצע"]

_NOT_DONE_PATTERNS_EN = [
    r"\b(no|not yet|didn'?t|haven'?t|couldn'?t|still|tomorrow|later)\b"
]
_NOT_DONE_PATTERNS_HE = [r"לא הצלחתי", r"לא עוד", r"מחר", r"עוד לא", r"דחיתי"]

_DEFER_PATTERNS_EN = [r"\b(tomorrow|later|push|defer|move)\b"]
_DEFER_PATTERNS_HE = [r"מחר", r"לדחות", r"להזיז", r"אחר[\-\s]?כך"]

_DROP_PATTERNS_EN = [r"\b(drop|cancel|forget|nevermind|never\s*mind|remove)\b"]
_DROP_PATTERNS_HE = [r"לבטל", r"להסיר", r"לוותר", r"להוריד", r"שכח", r"שכחי"]

_NO_MORE_PATTERNS_EN = [
    r"\b(no|nope|done|enough|that'?s it|that\s+is\s+it|nothing)\b"
]
_NO_MORE_PATTERNS_HE = [
    r"\bלא\b",
    r"מספיק",
    r"זהו",
    r"זה הכל",
    r"כלום",
]


def _matches_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def _classify_carryover_response(text: str, language: Language) -> str:
    """Returns 'done' | 'defer' | 'drop' | 'still_open'."""
    drop_pats = _DROP_PATTERNS_HE if language == "he" else _DROP_PATTERNS_EN
    if _matches_any(text, drop_pats):
        return "drop"
    defer_pats = _DEFER_PATTERNS_HE if language == "he" else _DEFER_PATTERNS_EN
    if _matches_any(text, defer_pats):
        return "defer"
    done_pats = _DONE_PATTERNS_HE if language == "he" else _DONE_PATTERNS_EN
    not_done_pats = (
        _NOT_DONE_PATTERNS_HE if language == "he" else _NOT_DONE_PATTERNS_EN
    )
    if _matches_any(text, not_done_pats):
        return "still_open"
    if _matches_any(text, done_pats):
        return "done"
    # Default: assume still open, agent can re-ask if needed.
    return "still_open"


def _user_says_no_more(text: str, language: Language) -> bool:
    pats = _NO_MORE_PATTERNS_HE if language == "he" else _NO_MORE_PATTERNS_EN
    return _matches_any(text.strip(), pats)


# --------------------------------------------------------------------------
# LLM slot-fillers — short prompts, low temperature, capped tokens.
# --------------------------------------------------------------------------


async def _llm_short(system: str, user: str, *, max_tokens: int = 60) -> str:
    try:
        return (
            await chat_complete(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.5,
                max_tokens=max_tokens,
            )
        ).strip()
    except LLMUnavailable:
        return ""


def _greet_fallback(language: Language, days_since: int | None) -> str:
    if language == "he":
        if days_since is not None and days_since >= 3:
            return "טוב לראות אותך שוב. עבר רגע."
        return "טוב לראות אותך. בוא נראה איך היום."
    if days_since is not None and days_since >= 3:
        return "good to see you again. it's been a moment."
    return "good to see you. let's see how today goes."


async def _llm_greet(language: Language, days_since: int | None) -> str:
    if language == "he":
        sys = (
            "ברך את המשתמש בעברית במשפט אחד קצר ושקט. "
            "בלי 'איזה כיף', בלי 'כל הכבוד', בלי 'אלוף', בלי 'אחי' או 'אחותי' — וגם בלי לוכסן בין צורות מגדריות. "
            "ברירת המחדל: צורת זכר. בלי סימני קריאה. בלי אימוג'י. אותיות קטנות אם רלוונטי."
        )
        if days_since is not None and days_since >= 3:
            sys += f" עברו {days_since} ימים מאז שדיברנו — תאזכר את זה ברוגע, בלי דרמה."
    else:
        sys = (
            "Greet the user in english with one short, quiet sentence. "
            "No 'great to see you', no 'amazing', no 'champion' — peer voice, not coach. "
            "No exclamation marks. No emoji. Lowercase."
        )
        if days_since is not None and days_since >= 3:
            sys += f" It has been {days_since} days since we talked — mention it calmly if it fits."
    text = await _llm_short(sys, "(generate the greeting now)", max_tokens=50)
    return text or _greet_fallback(language, days_since)


async def _llm_carryover_question(task_title: str, language: Language) -> str:
    if language == "he":
        sys = (
            "שאל את המשתמש בקצרה אם הוא ביצע משימה ספציפית. "
            "משפט אחד, בלי סימני קריאה, בלי 'איך הולך', בלי שיפוטיות. "
            "בלי לוכסן בין צורות זכר/נקבה — תשתמש בצורת זכר ברירת מחדל. בלי 'אחי'/'אחותי'."
        )
        user = f"שם המשימה: {task_title}"
    else:
        sys = (
            "Ask the user briefly whether they did a specific task. "
            "One sentence, no exclamation marks, no 'how's it going', no judgment."
        )
        user = f"task: {task_title}"
    text = await _llm_short(sys, user, max_tokens=40)
    if text:
        return text
    return (
        f"מה לגבי \"{task_title}\"?" if language == "he"
        else f"what about \"{task_title}\"?"
    )


def _carryover_ack(intent: str, language: Language) -> str:
    """Calm, non-judgmental acknowledgment after a carryover answer."""
    table = {
        "en": {
            "done": "nice.",
            "defer": "got it. pushing it.",
            "drop": "done.",
            "still_open": "no problem. let's keep it for today.",
        },
        "he": {
            "done": "יפה.",
            "defer": "הבנתי. דוחה.",
            "drop": "הורדתי.",
            "still_open": "אין בעיה. נשמור לזה מקום היום.",
        },
    }
    return table[language][intent]


def _propose_first_question(language: Language) -> str:
    return "מה רוצה לעשות היום?" if language == "he" else "what's one thing you want to do today?"


def _propose_acknowledge(title: str, language: Language) -> str:
    return f"\"{title}\". הוספתי." if language == "he" else f"\"{title}\". added."


def _propose_more(language: Language, count: int) -> str:
    if count >= MAX_TASKS_PER_PLAN:
        return _propose_done(language)
    return "עוד משהו?" if language == "he" else "anything else?"


def _propose_done(language: Language) -> str:
    return "טוב. בוא נסכם." if language == "he" else "good. let's wrap up."


def _empty_plan_close(language: Language) -> str:
    return (
        "בסדר. גם זה תכנית. אני כאן כשתרצה."
        if language == "he"
        else "okay. that's also a plan. i'm here when you want."
    )


async def _llm_confirm(titles: list[str], language: Language) -> str:
    plain = ", ".join(titles)
    if language == "he":
        sys = (
            "סכם את התכנית להיום במשפט אחד או שניים, קצר ושקט. "
            "בלי עידוד, בלי 'אתה יכול', בלי 'מדהים'. בלי לוכסן בין צורות מגדריות; "
            "תשתמש בצורת זכר כברירת מחדל. בלי סימני קריאה."
        )
        user = f"המשימות להיום: {plain}"
    else:
        sys = (
            "Summarize today's plan in one or two short sentences, calm peer voice. "
            "No exuberance. No exclamation marks. No 'you can do it'."
        )
        user = f"today's tasks: {plain}"
    text = await _llm_short(sys, user, max_tokens=80)
    if text:
        return text
    if language == "he":
        return f"אז להיום: {plain}. מספיק."
    return f"so for today: {plain}. enough."


async def _llm_close_summary(titles: list[str], dropped: int, language: Language) -> str:
    if not titles and dropped == 0:
        return "[planning session — no tasks]"
    if language == "he":
        sys = (
            "סכם את השיחה במשפט אחד קצר. עובדתי, בלי שיפוטיות. בלי סימני קריאה."
        )
        user = f"משימות שנוספו היום: {', '.join(titles) or 'אין'}. ירדו: {dropped}."
    else:
        sys = (
            "Summarize the conversation in one short factual sentence. No judgment, no exclamation marks."
        )
        user = f"tasks added today: {', '.join(titles) or 'none'}. dropped: {dropped}."
    text = await _llm_short(sys, user, max_tokens=60)
    return text or "[planning session]"


# --------------------------------------------------------------------------
# State step functions
# --------------------------------------------------------------------------


def _load_carryovers(sb: Client, user_id: str) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=CARRYOVER_LOOKBACK_DAYS)).isoformat()
    rows = (
        sb.table("tasks")
        .select("id, title, size")
        .eq("user_id", user_id)
        .eq("state", "open")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(MAX_CARRYOVERS_REVIEW)
        .execute()
        .data
        or []
    )
    return rows


def _days_since(prior_session_at: str | None) -> int | None:
    if not prior_session_at:
        return None
    try:
        prior = datetime.fromisoformat(prior_session_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0, (datetime.now(timezone.utc) - prior).days)


# ---- greet ----


async def step_greet(
    *, sb: Client, user_id: str, session_id: str, language: Language
) -> StepResult:
    """Open the planning session. Uses STATIC strings (no LLM) so the user
    can start typing within ~200ms instead of waiting 1-3 s for the local
    model to generate a greeting. Personalization (days-since-last-session)
    is preserved via the fallback templates."""
    prior = (
        sb.table("sessions")
        .select("started_at")
        .eq("user_id", user_id)
        .neq("id", session_id)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    days = _days_since(prior[0]["started_at"]) if prior else None
    greeting = _greet_fallback(language, days)

    carryovers = _load_carryovers(sb, user_id)
    if carryovers:
        first = carryovers[0]
        # Static carryover question — same template the LLM-fallback used.
        question = (
            f"מה לגבי \"{first['title']}\"?"
            if language == "he"
            else f"what about \"{first['title']}\"?"
        )
        return StepResult(
            assistant_reply=f"{greeting} {question}",
            next_step=STEP_REVIEW,
            next_step_data={
                "carryovers": carryovers,
                "current_idx": 0,
            },
        )
    # No carryovers — go straight to proposing today's tasks.
    propose_q = _propose_first_question(language)
    return StepResult(
        assistant_reply=f"{greeting} {propose_q}",
        next_step=STEP_PROPOSE,
        next_step_data={"added_count": 0, "added_task_ids": []},
    )


# ---- review_carryover ----


async def step_review_carryover(
    *,
    sb: Client,
    user_id: str,
    session_id: str,
    language: Language,
    user_message: str,
    step_data: dict[str, Any],
) -> StepResult:
    carryovers: list[dict] = step_data.get("carryovers", [])
    idx: int = step_data.get("current_idx", 0)
    if idx >= len(carryovers):
        # Defensive: fall through to propose.
        propose_q = _propose_first_question(language)
        return StepResult(
            assistant_reply=propose_q,
            next_step=STEP_PROPOSE,
            next_step_data={"added_count": 0, "added_task_ids": []},
        )

    current = carryovers[idx]
    intent = _classify_carryover_response(user_message, language)
    ack = _carryover_ack(intent, language)
    changes: list[TaskChange] = []
    bonuses: list[str] = []

    if intent == "done":
        changes.append(TaskChange(op="complete", task_id=current["id"]))
        bonuses.append(current["id"])
    elif intent == "defer":
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        changes.append(TaskChange(op="defer", task_id=current["id"], defer_to=tomorrow))
    elif intent == "drop":
        changes.append(TaskChange(op="drop", task_id=current["id"]))
    # 'still_open': no change, task stays as-is and naturally surfaces tomorrow.

    next_idx = idx + 1
    if next_idx < len(carryovers):
        nxt = carryovers[next_idx]
        # Static template — same shape the LLM fallback used. Skipping the LLM
        # call here keeps each carryover-review turn snappy (~200ms vs 1-3s).
        question = (
            f"מה לגבי \"{nxt['title']}\"?"
            if language == "he"
            else f"what about \"{nxt['title']}\"?"
        )
        return StepResult(
            assistant_reply=f"{ack} {question}",
            next_step=STEP_REVIEW,
            next_step_data={"carryovers": carryovers, "current_idx": next_idx},
            task_changes=changes,
            award_carryover_bonus_for=bonuses,
        )

    # Done with carryovers. Move to propose.
    propose_q = _propose_first_question(language)
    return StepResult(
        assistant_reply=f"{ack} {propose_q}",
        next_step=STEP_PROPOSE,
        next_step_data={"added_count": 0, "added_task_ids": []},
        task_changes=changes,
        award_carryover_bonus_for=bonuses,
    )


# ---- propose_today ----


async def step_propose_today(
    *,
    language: Language,
    user_message: str,
    step_data: dict[str, Any],
) -> StepResult:
    added_count = step_data.get("added_count", 0)
    added_ids = list(step_data.get("added_task_ids", []))

    text = user_message.strip()

    # Did the user signal they're done adding?
    if added_count > 0 and _user_says_no_more(text, language):
        # No new task this turn. Move to confirm.
        return StepResult(
            assistant_reply=_propose_done(language),
            next_step=STEP_CONFIRM,
            next_step_data={"added_task_ids": added_ids},
        )

    # If first-turn and user clearly says nothing — empty plan, close softly.
    if added_count == 0 and _user_says_no_more(text, language):
        return StepResult(
            assistant_reply=_empty_plan_close(language),
            next_step=STEP_CLOSE,
            next_step_data={"added_task_ids": []},
            done=False,
        )

    # Otherwise treat the message as a task title.
    title = text
    if not title:
        # Empty input — re-ask softly.
        return StepResult(
            assistant_reply=_propose_first_question(language),
            next_step=STEP_PROPOSE,
            next_step_data=step_data,
        )

    # Add a task. Title is the user's own phrasing. Size is left null.
    new_change = TaskChange(op="create", title=title)
    new_count = added_count + 1
    ack = _propose_acknowledge(title, language)
    if new_count >= MAX_TASKS_PER_PLAN:
        # Cap reached — go straight to confirm with what we have plus this one.
        # The route applies the change first, then we confirm afterwards.
        return StepResult(
            assistant_reply=f"{ack} {_propose_done(language)}",
            next_step=STEP_CONFIRM,
            next_step_data={"added_task_ids": added_ids + ["__pending__"]},
            task_changes=[new_change],
        )
    more_q = _propose_more(language, new_count)
    return StepResult(
        assistant_reply=f"{ack} {more_q}",
        next_step=STEP_PROPOSE,
        next_step_data={
            "added_count": new_count,
            "added_task_ids": added_ids + ["__pending__"],
        },
        task_changes=[new_change],
    )


# ---- confirm ----


async def step_confirm(
    *,
    sb: Client,
    user_id: str,
    session_id: str,
    language: Language,
    step_data: dict[str, Any],
) -> StepResult:
    titles = (
        sb.table("tasks")
        .select("title")
        .eq("user_id", user_id)
        .eq("created_in_session", session_id)
        .execute()
        .data
        or []
    )
    title_list = [t["title"] for t in titles]
    if not title_list:
        return StepResult(
            assistant_reply=_empty_plan_close(language),
            next_step=STEP_CLOSE,
            next_step_data={},
        )
    summary = await _llm_confirm(title_list, language)
    return StepResult(
        assistant_reply=summary,
        next_step=STEP_CLOSE,
        next_step_data={"titles": title_list},
        done=True,  # close is invoked next turn or by /end
    )


# ---- close ----


async def step_close(
    *,
    sb: Client,
    user_id: str,
    session_id: str,
    language: Language,
    step_data: dict[str, Any],
) -> tuple[str, str]:
    """Generate session summary and return (summary_for_db, user_facing_close_msg).

    Called explicitly by the route on /end (or implicitly when confirm sets done=True
    and the next /turn arrives — but the route should call /end at that point).
    """
    titles = step_data.get("titles", [])
    if not titles:
        # Pull from DB (in case state_data lost it across requests).
        rows = (
            sb.table("tasks")
            .select("title")
            .eq("user_id", user_id)
            .eq("created_in_session", session_id)
            .execute()
            .data
            or []
        )
        titles = [r["title"] for r in rows]
    dropped_rows = (
        sb.table("task_events")
        .select("event_type")
        .eq("session_id", session_id)
        .eq("event_type", "dropped")
        .execute()
        .data
        or []
    )
    dropped = len(dropped_rows)
    summary = await _llm_close_summary(titles, dropped, language)
    user_msg = (
        "טוב. כל הזמן בעולם." if language == "he" else "good. take your time."
    )
    return summary, user_msg


# --------------------------------------------------------------------------
# Persistence helpers — used by the route to load/save flow_state.
# --------------------------------------------------------------------------


def load_state(sb: Client, session_id: str) -> dict | None:
    rows = (
        sb.table("planning_flow_state")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def save_state(
    sb: Client,
    session_id: str,
    *,
    current_step: str,
    step_data: dict[str, Any],
) -> None:
    sb.table("planning_flow_state").upsert(
        {
            "session_id": session_id,
            "current_step": current_step,
            "step_data": step_data,
            "updated_at": now_iso(),
        }
    ).execute()
