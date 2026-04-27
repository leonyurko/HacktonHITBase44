"""Audio routes.

POST /audio/stt   — local Whisper transcription; saves audio to recordings/
POST /audio/tts   — OpenAI TTS-1 (503 if OPENAI_API_KEY missing)
GET  /audio/file/{user}/{session}/{name} — serve a saved recording
"""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..config import get_settings
from ..services import audio as audio_service
from ..services import local_storage

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/audio")


@router.post("/stt")
async def speech_to_text(
    audio: Annotated[UploadFile, File()],
    language: Annotated[str | None, Form()] = None,
    session_id: Annotated[str | None, Form()] = None,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail={"error": {"code": "empty_audio"}})

    filename = audio.filename or "voice.webm"

    # Save to local disk first so STT can run on the file path directly.
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "webm"
    if not extension.isalnum():
        extension = "webm"
    rel_path, abs_path = local_storage.save(
        user_id=user.user_id,
        session_id=session_id,
        audio_bytes=raw,
        extension=extension,
    )

    try:
        text, detected, duration = await audio_service.transcribe_path(
            str(abs_path), language=language
        )
    except audio_service.AudioFailure as exc:
        # Keep the file so it can be retried; surface a clear error.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": {"code": "stt_failed", "message": str(exc)}},
        ) from exc

    log.info(
        "stt_completed",
        user_id=user.user_id,
        bytes=len(raw),
        duration_s=duration,
        detected=detected,
        text_len=len(text),
        text_preview=text[:80] if text else "",
    )

    return {
        "ok": True,
        "text": text,
        "detected_language": detected,
        "duration_ms": int(duration * 1000) if duration else None,
        "audio_path": rel_path,
        "audio_url": f"/audio/file/{rel_path}",
    }


class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    speed: float = 0.9


@router.post("/tts")
async def text_to_speech(
    payload: TTSRequest,
    user: AuthUser = Depends(get_current_user),
) -> StreamingResponse:
    if not get_settings().audio_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "audio_not_configured"}},
        )
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail={"error": {"code": "empty_text"}})

    async def gen():
        try:
            async for chunk in audio_service.synthesize(
                payload.text, language=payload.language, speed=payload.speed
            ):
                yield chunk
        except audio_service.AudioFailure:
            return

    return StreamingResponse(gen(), media_type="audio/mpeg")


@router.get("/file/{user_seg}/{session_seg}/{filename}")
async def serve_recording(
    user_seg: str,
    session_seg: str,
    filename: str,
    user: AuthUser = Depends(get_current_user),
) -> FileResponse:
    """Serve a saved recording. Verifies the requesting user owns the path."""
    rel_path = f"{user_seg}/{session_seg}/{filename}"
    expected_user_seg = user.user_id.replace("-", "")
    if user_seg != expected_user_seg:
        # Defense: don't even reveal whether the file exists.
        raise HTTPException(status_code=404, detail={"error": {"code": "not_found"}})
    try:
        abs_path: Path = local_storage.resolve(rel_path)
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": {"code": "bad_path"}})
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail={"error": {"code": "not_found"}})
    media_type, _ = mimetypes.guess_type(str(abs_path))
    return FileResponse(str(abs_path), media_type=media_type or "application/octet-stream")
