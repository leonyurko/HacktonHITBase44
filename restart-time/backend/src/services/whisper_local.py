"""Local Whisper STT via faster-whisper, GPU-first.

Defaults match the user's working transcription_service:
  - model:   large-v3 (override via WHISPER_MODEL)
  - device:  cuda    (override via WHISPER_DEVICE; falls back to cpu on load failure)
  - compute: float16 (override via WHISPER_COMPUTE)

The NVIDIA DLL path fix runs before faster-whisper is imported, otherwise
ctranslate2 can't find cudnn / cublas DLLs on Windows.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import structlog

from . import nvidia_dlls

# Run path fix before any subsequent imports of faster-whisper/ctranslate2.
_nvidia_paths_added = nvidia_dlls.fix_nvidia_path()

log = structlog.get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
CACHE_DIR = PROJECT_ROOT / ".whisper-models"
CACHE_DIR.mkdir(exist_ok=True)

# faster-whisper reads HF_HOME for the cache root.
os.environ.setdefault("HF_HOME", str(CACHE_DIR))
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(CACHE_DIR))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

_MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")
_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
_COMPUTE = os.environ.get("WHISPER_COMPUTE", "float16")
_BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
_VAD_FILTER = os.environ.get("WHISPER_VAD_FILTER", "true").lower() in ("1", "true", "yes")
_VAD_MIN_SILENCE_MS = int(os.environ.get("WHISPER_VAD_MIN_SILENCE_MS", "500"))

_model = None
_loaded_device: str | None = None
_model_lock = asyncio.Lock()


def _load_model_sync(model_name: str, device: str, compute: str):
    """Blocking model load. Falls back from cuda → cpu on hard error."""
    from faster_whisper import WhisperModel

    try:
        return WhisperModel(
            model_name,
            device=device,
            compute_type=compute,
            download_root=str(CACHE_DIR),
        ), device
    except Exception as exc:
        if device != "cpu":
            log.warning(
                "whisper_gpu_load_failed_falling_back_to_cpu",
                error=str(exc),
                device=device,
            )
            return WhisperModel(
                model_name,
                device="cpu",
                compute_type="default",
                download_root=str(CACHE_DIR),
            ), "cpu"
        raise


async def _ensure_model():
    global _model, _loaded_device
    if _model is not None:
        return _model
    async with _model_lock:
        if _model is not None:
            return _model
        log.info(
            "whisper_loading",
            model=_MODEL_NAME,
            device=_DEVICE,
            compute=_COMPUTE,
            nvidia_paths_added=_nvidia_paths_added,
        )
        _model, _loaded_device = await asyncio.to_thread(
            _load_model_sync, _MODEL_NAME, _DEVICE, _COMPUTE
        )
        log.info("whisper_loaded", device=_loaded_device)
        return _model


def _run_transcribe(model, audio_path: str, language: str | None):
    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=_VAD_FILTER,
        vad_parameters={"min_silence_duration_ms": _VAD_MIN_SILENCE_MS},
        beam_size=_BEAM_SIZE,
    )
    return (
        " ".join(s.text for s in segments).strip(),
        info.language,
        info.duration,
    )


async def transcribe_file(
    audio_path: str, *, language: str | None = None
) -> tuple[str, str | None, float | None]:
    """Run Whisper STT on a file path. Returns (text, lang, duration_s)."""
    model = await _ensure_model()
    return await asyncio.to_thread(_run_transcribe, model, audio_path, language)


def is_model_ready() -> bool:
    return _model is not None


def loaded_device() -> str | None:
    return _loaded_device


def cache_size_mb() -> float:
    total = 0
    for p in CACHE_DIR.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total / (1024 * 1024)
