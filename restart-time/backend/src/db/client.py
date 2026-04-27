"""Supabase client wrapper.

The backend uses the service-role key, which bypasses RLS. We rely on
explicit user_id filtering in queries. In production we should additionally
SET LOCAL "request.jwt.claims" so RLS still fires as a defense-in-depth
layer (see PRD §14.2). MVP ships without that wrapper for simplicity.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from ..config import get_settings


@lru_cache
def supabase() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)
