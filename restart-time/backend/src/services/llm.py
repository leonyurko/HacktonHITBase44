"""LM Studio chat client (OpenAI-compatible).

Two entry points:
  - chat_complete(): non-streaming, returns full text + usage.
  - chat_stream():   streams tokens; the caller forwards as SSE.

We do not use the official `openai` SDK here so we can keep the dependency
graph small and have full control over timeouts and error mapping.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog

from ..config import get_settings

log = structlog.get_logger(__name__)


class LLMUnavailable(RuntimeError):
    """Raised when the local LLM endpoint can't be reached or returns an error."""


# Shared client with keep-alive — connection reuse cuts ~10-30ms per call.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _client


def _build_headers() -> dict[str, str]:
    s = get_settings()
    return {
        "Authorization": f"Bearer {s.local_api_key}",
        "Content-Type": "application/json",
    }


def _build_url() -> str:
    return f"{get_settings().local_base_url.rstrip('/')}/chat/completions"


async def chat_complete(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    max_tokens: int = 200,
    model: str | None = None,
    timeout: float = 60.0,
) -> str:
    """Non-streaming completion. Returns the assistant text.

    Raises LLMUnavailable on any transport / non-2xx error.
    """
    s = get_settings()
    payload: dict[str, Any] = {
        "model": model or s.local_model,
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    t0 = time.perf_counter()
    try:
        client = _get_client()
        r = await client.post(
            _build_url(),
            json=payload,
            headers=_build_headers(),
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPError as exc:
        log.error("llm_unavailable", error=str(exc))
        raise LLMUnavailable(str(exc)) from exc

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        log.error("llm_malformed_response", data=data)
        raise LLMUnavailable("malformed LLM response") from exc

    usage = data.get("usage", {}) if isinstance(data, dict) else {}
    log.info(
        "llm_complete",
        elapsed_ms=elapsed_ms,
        model=payload["model"],
        max_tokens=max_tokens,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        text_len=len(text),
    )
    return text


async def chat_stream(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    max_tokens: int = 200,
    model: str | None = None,
    timeout: float = 120.0,
) -> AsyncIterator[str]:
    """Stream assistant tokens.

    Yields text deltas as they arrive. Closes cleanly on completion.
    Raises LLMUnavailable on transport error before any token.
    """
    s = get_settings()
    payload: dict[str, Any] = {
        "model": model or s.local_model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    t0 = time.perf_counter()
    first_token_ms: int | None = None
    token_count = 0
    text_len = 0

    try:
        client = _get_client()
        async with client.stream(
            "POST",
            _build_url(),
            json=payload,
            headers=_build_headers(),
            timeout=timeout,
        ) as r:
            r.raise_for_status()
            async for raw_line in r.aiter_lines():
                if not raw_line:
                    continue
                if raw_line.startswith("data: "):
                    chunk = raw_line[len("data: ") :]
                else:
                    chunk = raw_line
                if chunk.strip() == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                delta = (
                    obj.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content")
                )
                if delta:
                    if first_token_ms is None:
                        first_token_ms = int((time.perf_counter() - t0) * 1000)
                    token_count += 1
                    text_len += len(delta)
                    yield delta
    except httpx.HTTPError as exc:
        log.error("llm_stream_unavailable", error=str(exc))
        raise LLMUnavailable(str(exc)) from exc
    finally:
        total_ms = int((time.perf_counter() - t0) * 1000)
        rate = (token_count / (total_ms / 1000)) if total_ms > 0 else 0
        log.info(
            "llm_stream_complete",
            ttft_ms=first_token_ms,
            total_ms=total_ms,
            chunks=token_count,
            text_len=text_len,
            tok_per_s=round(rate, 1),
            model=payload["model"],
        )


async def health_probe(timeout: float = 2.0) -> bool:
    """Lightweight reachability probe used by /health."""
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(
                f"{s.local_base_url.rstrip('/')}/models",
                headers=_build_headers(),
            )
            return r.status_code < 500
    except httpx.HTTPError:
        return False
