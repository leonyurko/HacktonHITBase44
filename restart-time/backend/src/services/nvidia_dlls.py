"""Register NVIDIA DLL directories for ctranslate2 / faster-whisper on Windows.

Ported from the user's `transcription_service/start.py` `_fix_nvidia_path()`.
Must be called BEFORE faster-whisper / ctranslate2 are imported, otherwise
the dynamic loader won't find cublas64_*, cudnn_*, cudart64_* DLLs and
faster-whisper will fall back to CPU (or fail to load).

Idempotent — safe to call multiple times.
"""

from __future__ import annotations

import os
import site
from pathlib import Path

_registered = False


def fix_nvidia_path() -> int:
    """Register NVIDIA DLL paths on Windows.

    Returns the number of directories added. 0 on non-Windows or if no
    NVIDIA pip packages are present.
    """
    global _registered
    if _registered:
        return 0
    if os.name != "nt":
        _registered = True
        return 0

    dirs_to_add: list[str] = []
    all_sites: list[str] = []
    try:
        all_sites.extend(site.getsitepackages())
    except Exception:
        pass
    try:
        all_sites.append(site.getusersitepackages())
    except Exception:
        pass

    for site_dir in all_sites:
        nvidia_root = Path(site_dir) / "nvidia"
        if not nvidia_root.is_dir():
            continue
        for pkg in nvidia_root.iterdir():
            for sub in ("bin", "lib"):
                dll_dir = pkg / sub
                if dll_dir.is_dir():
                    dirs_to_add.append(str(dll_dir))

    if dirs_to_add:
        os.environ["PATH"] = (
            os.pathsep.join(dirs_to_add) + os.pathsep + os.environ.get("PATH", "")
        )
        for d in dirs_to_add:
            try:
                os.add_dll_directory(d)  # type: ignore[attr-defined]
            except (OSError, AttributeError):
                pass

    _registered = True
    return len(dirs_to_add)
