"""Audio service: local Whisper STT + OpenAI TTS.

STT runs on a local Whisper large-v3 (faster-whisper). TTS still goes to
OpenAI TTS-1 — degrades to AudioNotConfigured when OPENAI_API_KEY is empty.

The "synthesize" function is what callers TTS through; "transcribe" is for
STT. Wrappers preserve the previous public API.
"""

from __future__ import annotations

import tempfile
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Literal

import httpx
import structlog
from openai import AsyncOpenAI

from ..config import get_settings
from . import whisper_local

log = structlog.get_logger(__name__)


class AudioNotConfigured(RuntimeError):
    """OPENAI_API_KEY is missing — TTS is disabled."""


class AudioFailure(RuntimeError):
    """Audio operation failed (transient or unrecoverable)."""


def _openai_client() -> AsyncOpenAI:
    s = get_settings()
    if not s.openai_api_key:
        raise AudioNotConfigured("OPENAI_API_KEY not set")
    return AsyncOpenAI(api_key=s.openai_api_key)


# ---- STT (local Whisper large-v3) -----------------------------------------


async def transcribe(
    audio_bytes: bytes,
    filename: str,
    *,
    language: str | None = None,
) -> tuple[str, str | None, float | None]:
    """Run local Whisper STT on raw audio bytes.

    Writes a temporary file (faster-whisper accepts paths), runs the model,
    cleans up. Returns (text, detected_language, duration_seconds).
    """
    suffix = "." + (filename.rsplit(".", 1)[-1] if "." in filename else "webm")
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)
        try:
            text, detected, duration = await whisper_local.transcribe_file(
                str(tmp_path), language=language
            )
        except Exception as exc:  # noqa: BLE001
            log.error("whisper_failure", error=str(exc))
            raise AudioFailure(str(exc)) from exc
        return text, detected, duration
    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


async def transcribe_path(
    audio_path: str, *, language: str | None = None
) -> tuple[str, str | None, float | None]:
    """Convenience: transcribe an existing on-disk file directly."""
    try:
        return await whisper_local.transcribe_file(audio_path, language=language)
    except Exception as exc:  # noqa: BLE001
        log.error("whisper_failure", error=str(exc))
        raise AudioFailure(str(exc)) from exc


# ---- TTS (OpenAI TTS-1) ---------------------------------------------------


VoiceName = Literal["echo", "shimmer", "alloy", "nova", "onyx", "fable"]


async def synthesize(
    text: str,
    *,
    language: str = "en",
    voice: VoiceName | None = None,
    speed: float = 0.9,
) -> AsyncIterator[bytes]:
    """Stream TTS audio bytes (mp3) via OpenAI TTS-1."""
    client = _openai_client()
    chosen: VoiceName = voice or ("shimmer" if language == "he" else "echo")
    try:
        async with client.audio.speech.with_streaming_response.create(
            model="tts-1",
            voice=chosen,
            input=text,
            speed=speed,
        ) as response:
            async for chunk in response.iter_bytes():
                yield chunk
    except Exception as exc:  # noqa: BLE001
        log.error("tts_failure", error=str(exc))
        raise AudioFailure(str(exc)) from exc


# ---- Health probes --------------------------------------------------------


async def health_probe(timeout: float = 2.0) -> dict:
    """Returns reachability info for both STT (local) and TTS (OpenAI)."""
    s = get_settings()
    tts_ok = False
    if s.openai_api_key:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {s.openai_api_key}"},
                )
                tts_ok = r.status_code < 500
        except httpx.HTTPError:
            tts_ok = False
    return {
        "stt_local_ready": whisper_local.is_model_ready(),
        "stt_cache_mb": round(whisper_local.cache_size_mb(), 1),
        "tts_configured": bool(s.openai_api_key),
        "tts_reachable": tts_ok,
    }
