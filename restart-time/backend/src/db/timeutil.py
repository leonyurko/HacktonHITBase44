"""ISO timestamp helpers.

Supabase's PostgREST does not evaluate SQL function names like `now()` when
passed as field values. Always send proper ISO 8601 strings.
"""

from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
