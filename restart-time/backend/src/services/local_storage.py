"""Local-disk audio storage at <project root>/recordings/.

Replaces the Supabase Storage path used in the original PRD §14.4 with a
host-local layout:

    recordings/
      {user_id}/
        {session_id}/
          {message_id}.{ext}

Files are served by /audio/file/{user_id}/{session_id}/{filename} after
auth verifies the requesting user matches the path's user_id.

Why local: user requested audio be hosted on their laptop in the project
directory, not in cloud storage. Future cloud move = swap this module's
implementation only.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
RECORDINGS_ROOT = PROJECT_ROOT / "recordings"
RECORDINGS_ROOT.mkdir(exist_ok=True)

_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_\-]+$")
_SAFE_FILENAME = re.compile(r"^[A-Za-z0-9_\-]+\.[A-Za-z0-9]+$")


def _validate_segment(seg: str) -> str:
    """Reject path traversal / shell metacharacters."""
    if not _SAFE_SEGMENT.match(seg):
        raise ValueError(f"unsafe path segment: {seg!r}")
    return seg


def _validate_filename(name: str) -> str:
    if not _SAFE_FILENAME.match(name):
        raise ValueError(f"unsafe filename: {name!r}")
    return name


def save(
    *,
    user_id: str,
    session_id: str | None,
    audio_bytes: bytes,
    extension: str = "webm",
) -> tuple[str, Path]:
    """Save audio bytes; returns (relative_path, absolute_path).

    relative_path is what we store in `messages.audio_path`. It's a Unix-style
    forward-slash path under recordings/.
    """
    user_seg = _validate_segment(user_id.replace("-", ""))  # UUIDs have hyphens
    session_seg = _validate_segment((session_id or "unsessioned").replace("-", ""))
    audio_id = uuid.uuid4().hex
    if not extension or not extension.isalnum():
        extension = "webm"
    filename = f"{audio_id}.{extension}"
    filename = _validate_filename(filename)

    abs_dir = RECORDINGS_ROOT / user_seg / session_seg
    abs_dir.mkdir(parents=True, exist_ok=True)
    abs_path = abs_dir / filename
    abs_path.write_bytes(audio_bytes)

    rel_path = f"{user_seg}/{session_seg}/{filename}"
    return rel_path, abs_path


def resolve(rel_path: str) -> Path:
    """Resolve a relative audio_path against RECORDINGS_ROOT, with traversal check."""
    parts = rel_path.split("/")
    if len(parts) != 3:
        raise ValueError("audio path must be user/session/filename")
    user, session, filename = parts
    _validate_segment(user)
    _validate_segment(session)
    _validate_filename(filename)
    abs_path = RECORDINGS_ROOT / user / session / filename
    # Ensure the resolved path is under RECORDINGS_ROOT
    if RECORDINGS_ROOT.resolve() not in abs_path.resolve().parents:
        raise ValueError("resolved path escapes recordings root")
    return abs_path


def owner_of(rel_path: str) -> str:
    """Extract the user_id from a relative path. user_id stored without hyphens."""
    return rel_path.split("/", 1)[0]


def delete(rel_path: str) -> bool:
    """Delete a recording. Returns True if it existed."""
    try:
        abs_path = resolve(rel_path)
    except ValueError:
        return False
    if abs_path.exists():
        abs_path.unlink()
        return True
    return False


def delete_session(user_id: str, session_id: str) -> int:
    """Delete all recordings for a session. Returns count deleted."""
    user_seg = user_id.replace("-", "")
    session_seg = session_id.replace("-", "")
    sess_dir = RECORDINGS_ROOT / user_seg / session_seg
    if not sess_dir.exists():
        return 0
    count = 0
    for f in sess_dir.iterdir():
        if f.is_file():
            f.unlink()
            count += 1
    try:
        sess_dir.rmdir()
    except OSError:
        pass
    return count
