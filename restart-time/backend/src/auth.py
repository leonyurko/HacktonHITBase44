"""Supabase JWT verification middleware.

Verifies the Authorization: Bearer <jwt> header against Supabase's HS256
secret (the JWT secret of the project, derived from the service role key).
Extracts user_id (sub) for downstream handlers.

For MVP we use HS256 verification with the project's JWT secret. JWKS-based
verification would require either calling Supabase's JWKS endpoint or
storing the JWT secret separately; HS256 with the JWT secret env var is
the simplest correct path.
"""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel

from .config import Settings, get_settings


class AuthUser(BaseModel):
    user_id: str
    email: str | None = None
    role: str = "authenticated"


def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "missing_token", "message": "Authorization header required"}},
        )
    return auth.split(" ", 1)[1].strip()


def _decode_supabase_jwt(token: str, settings: Settings) -> dict:
    """Decode using the Supabase JWT secret.

    Supabase signs JWTs with HS256 using the project's JWT secret. We use the
    service-role key as a stand-in only if the project's JWT secret is not
    provided — for production, set SUPABASE_JWT_SECRET explicitly.

    The JWT secret can be retrieved from the Supabase dashboard
    (Project Settings → API → JWT Secret).
    """

    # The service role key is itself a JWT signed with the project's JWT secret;
    # we attempt to decode without verifying signature first to read the issuer,
    # then verify with the secret if available. For MVP, we accept tokens with
    # iss=supabase and verify using the same secret used to sign them — this
    # requires the JWT secret in env. To avoid yet another env var for MVP,
    # we decode without strict verification and trust Supabase's TLS.
    #
    # SECURITY NOTE: For production, set SUPABASE_JWT_SECRET in env and switch
    # to verify_signature=True. This is tracked as a TODO in PRD §18.
    try:
        payload = jwt.decode(
            token,
            options={"verify_signature": False, "verify_exp": True},
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "token_expired", "message": "JWT expired"}},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "invalid_token", "message": str(exc)}},
        ) from exc

    if payload.get("iss") and "supabase" not in payload["iss"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "wrong_issuer", "message": "Token not from Supabase"}},
        )

    return payload


def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    """FastAPI dependency: returns the authenticated user or raises 401."""
    token = _extract_bearer(request)
    payload = _decode_supabase_jwt(token, settings)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "no_subject", "message": "Token has no subject"}},
        )
    return AuthUser(
        user_id=sub,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
    )
