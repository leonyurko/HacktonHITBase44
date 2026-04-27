"""Pre-download Whisper large-v3 to the project-local cache.

Run before first use to avoid the first STT call paying the ~3GB download.

  uv run python -m scripts.download_whisper

Cache location: <project root>/.whisper-models/
"""

from __future__ import annotations

import os
from pathlib import Path

# Set HF cache before import
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CACHE_DIR = PROJECT_ROOT / ".whisper-models"
CACHE_DIR.mkdir(exist_ok=True)
os.environ["HF_HOME"] = str(CACHE_DIR)
os.environ["HUGGINGFACE_HUB_CACHE"] = str(CACHE_DIR)
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# NVIDIA DLL path fix (Windows) — must run before faster-whisper import
import sys
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))
from services.nvidia_dlls import fix_nvidia_path  # noqa: E402

added = fix_nvidia_path()
if added:
    print(f"[whisper-dl] registered {added} NVIDIA DLL dirs")

from faster_whisper import WhisperModel  # noqa: E402

MODEL = os.environ.get("WHISPER_MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "float16")


def main() -> None:
    print(f"Downloading Whisper '{MODEL}' to {CACHE_DIR} (device={DEVICE}, compute={COMPUTE})…")
    print("This is ~1.5GB compressed; first run takes a few minutes.")
    model = WhisperModel(
        MODEL,
        device=DEVICE,
        compute_type=COMPUTE,
        download_root=str(CACHE_DIR),
    )
    # Warm-up: a tiny silent transcribe (forces model load).
    print("Model ready. Cache size on disk:")
    total = 0
    for p in CACHE_DIR.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    print(f"  {total / (1024 * 1024):.1f} MB")
    del model


if __name__ == "__main__":
    main()
