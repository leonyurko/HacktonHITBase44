"""On-demand chat: LLM-first reply + extractor.

Flow per user turn (SSE):
  1. Persist the user message.
  2. Run RAG retrieval (returns [] in MVP scaffold).
  3. Stream tokens from the LLM → emit `event: token` lines.
  4. On stream completion, persist the assistant message → emit `event: done`.
  5. Run extractor (one extra LLM call, non-streaming). Apply diff.
  6. Emit `event: extracted` with the applied diff summary.
  7. Stream closes.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator

import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..db.client import supabase
from ..db.models import Language, Message
from ..db.timeutil import now_iso
from ..services import llm as llm_service
from ..services import local_storage
from ..services import rag as rag_service
from ..services import web_search as web_search_service
from ..services.actions_apply import apply_actions
from ..services.inline_actions import InlineAction, parse_actions, stats_for
from ..services.lang_detect import detect_language
from ..services.prompts import build_on_demand_messages

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/agent/chat")


# ---------------------------------------------------------------- start


class StartChatBody(BaseModel):
    ephemeral: bool = False
    language: Language | None = None  # if None, take from user_settings


@router.post("/start")
async def start_chat(body: StartChatBody, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    settings_row = (
        sb.table("user_settings")
        .select("language")
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    language: Language = (
        body.language
        or (settings_row.data or {}).get("language")  # type: ignore[assignment]
        or "en"
    )
    res = (
        sb.table("sessions")
        .insert(
            {
                "user_id": user.user_id,
                "mode": "on_demand",
                "language": language,
                "ephemeral": body.ephemeral,
            }
        )
        .execute()
    )
    sess = (res.data or [{}])[0]
    return {"ok": True, "session_id": sess.get("id"), "language": language}


# ---------------------------------------------------------------- turn


class TurnBody(BaseModel):
    session_id: str
    user_message: str
    audio_path: str | None = None


def _sse(event: str, data: dict | str) -> bytes:
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


async def _load_session(session_id: str, user_id: str) -> dict:
    sb = supabase()
    res = (
        sb.table("sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": {"code": "session_not_found"}})
    return res.data


async def _load_recent_messages(session_id: str, limit: int = 20) -> list[Message]:
    sb = supabase()
    res = (
        sb.table("messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .limit(limit)
        .execute()
    )
    return [Message.model_validate(r) for r in (res.data or [])]


async def _persist_message(
    session_id: str, role: str, content: str, *, language: Language | None = None,
    audio_path: str | None = None,
) -> str:
    sb = supabase()
    res = (
        sb.table("messages")
        .insert(
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "language": language,
                "audio_path": audio_path,
            }
        )
        .execute()
    )
    row = (res.data or [{}])[0]
    return row.get("id", "")


@router.post("/turn")
async def chat_turn(
    body: TurnBody, user: AuthUser = Depends(get_current_user)
) -> StreamingResponse:
    session = await _load_session(body.session_id, user.user_id)
    # Per-turn language detection — agent should reply in whatever language
    # the user just used, regardless of the session's start-of-day language.
    session_language: Language = session["language"]
    language: Language = detect_language(body.user_message, default=session_language)

    # Persist user message immediately so it survives if the stream errors out.
    await _persist_message(
        body.session_id,
        "user",
        body.user_message,
        language=language,
        audio_path=body.audio_path,
    )

    history = await _load_recent_messages(body.session_id)

    async def event_stream() -> AsyncIterator[bytes]:
        turn_t0 = time.perf_counter()
        # ---- RAG retrieval (stubbed for MVP) ----
        rag_hits = await rag_service.retrieve_for_on_demand_turn(
            query=body.user_message, language=language, user_id=user.user_id
        )
        rag_ms = int((time.perf_counter() - turn_t0) * 1000)

        prompt_messages = build_on_demand_messages(
            language=language,
            history=history[:-1],  # exclude the user msg we just inserted; we re-add
            user_message=body.user_message,
            rag_hits=rag_hits,
        )

        # ---- Stream the reply ----
        accumulated = ""
        try:
            async for token in llm_service.chat_stream(
                prompt_messages, temperature=0.7, max_tokens=200
            ):
                accumulated += token
                yield _sse("token", {"text": token})
        except llm_service.LLMUnavailable as exc:
            log.error("chat_turn_llm_unavailable", error=str(exc))
            yield _sse("error", {"error": "llm_unavailable", "message": str(exc)})
            return

        pass1_ms = int((time.perf_counter() - turn_t0) * 1000)

        # ---- Parse markers from pass 1 ----
        cleaned, actions = parse_actions(accumulated)
        search_actions = [a for a in actions if a.kind == "search"]

        # ---- If the agent wants to search, do it and re-prompt ----
        final_text = cleaned
        final_actions: list[InlineAction] = actions
        search_ms = 0
        pass2_ms = 0
        if search_actions:
            # Briefly show a "checking…" placeholder while we search.
            checking_msg = (
                "מחפש…" if language == "he" else "checking…"
            )
            yield _sse("rewrite", {"text": checking_msg})

            search_t0 = time.perf_counter()
            web_blocks: list[str] = []
            for sa in search_actions[:2]:  # cap to avoid bursting the free tier
                try:
                    answer = await web_search_service.search(sa.title)
                    block = web_search_service.format_for_prompt(answer)
                    if block:
                        web_blocks.append(block)
                except web_search_service.WebSearchUnavailable:
                    log.warning("web_search_unavailable_no_key")
                    break
                except web_search_service.WebSearchFailure as exc:
                    log.warning("web_search_failed", error=str(exc))
                    continue
            search_ms = int((time.perf_counter() - search_t0) * 1000)

            # Pass 2: re-prompt the agent with the search results.
            pass2_t0 = time.perf_counter()
            pass2_messages = build_on_demand_messages(
                language=language,
                history=history[:-1],  # same history as pass 1
                user_message=body.user_message,
                rag_hits=rag_hits,
                extra_system_blocks=web_blocks,
            )
            try:
                pass2_text = await llm_service.chat_complete(
                    pass2_messages,
                    temperature=0.7,
                    max_tokens=240,
                )
            except llm_service.LLMUnavailable as exc:
                log.error("chat_turn_pass2_unavailable", error=str(exc))
                pass2_text = cleaned  # fall back to pass 1 text

            pass2_ms = int((time.perf_counter() - pass2_t0) * 1000)
            final_text, final_actions = parse_actions(pass2_text)
            yield _sse("rewrite", {"text": final_text})

        elif cleaned != accumulated:
            # No search; just strip pass-1 markers from what we streamed.
            yield _sse("rewrite", {"text": cleaned})

        # ---- Persist the final assistant message ----
        message_id = await _persist_message(
            body.session_id, "assistant", final_text, language=language
        )
        yield _sse("done", {"message_id": message_id, "language": language})

        # ---- Apply non-search actions ----
        applicable = [a for a in final_actions if a.kind != "search"]
        if applicable:
            try:
                applied = await apply_actions(
                    user_id=user.user_id,
                    session_id=body.session_id,
                    actions=applicable,
                )
                yield _sse("extracted", applied)
            except Exception as exc:
                log.error("apply_actions_failed", error=str(exc))
                yield _sse("error", {"error": "apply_failed", "message": str(exc)})

        log.info(
            "chat_turn_done",
            rag_ms=rag_ms,
            pass1_ms=pass1_ms - rag_ms,
            search_ms=search_ms,
            pass2_ms=pass2_ms,
            total_ms=int((time.perf_counter() - turn_t0) * 1000),
            actions=stats_for(final_actions).by_kind,
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------- end


class EndBody(BaseModel):
    session_id: str


@router.post("/end")
async def end_chat(body: EndBody, user: AuthUser = Depends(get_current_user)) -> dict:
    sb = supabase()
    session = await _load_session(body.session_id, user.user_id)

    # Generate a 1-line summary from the session messages.
    messages = await _load_recent_messages(body.session_id, limit=50)
    summary = ""
    if messages:
        # Cheap summary: last assistant turn or first user turn truncated.
        snippet = next(
            (m.content for m in reversed(messages) if m.role == "assistant"),
            messages[0].content if messages else "",
        )
        summary = (snippet[:140] + "…") if len(snippet) > 140 else snippet

    sb.table("sessions").update(
        {"ended_at": now_iso(), "summary": summary}
    ).eq("id", body.session_id).eq("user_id", user.user_id).execute()

    # Ephemeral: wipe the messages and on-disk audio.
    if session.get("ephemeral"):
        try:
            local_storage.delete_session(user.user_id, body.session_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("ephemeral_audio_cleanup_failed", error=str(exc))
        sb.table("messages").delete().eq("session_id", body.session_id).execute()
        summary = "[ephemeral]"
        sb.table("sessions").update({"summary": summary}).eq(
            "id", body.session_id
        ).execute()

    return {"ok": True, "summary": summary}
