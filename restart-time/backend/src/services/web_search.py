"""Tavily web search client.

Free tier: 1000 calls/month. https://app.tavily.com/
Endpoint: POST https://api.tavily.com/search

Used by the agent via the [search: <query>] inline marker. The agent
emits the marker on its first pass; the route detects it, runs this,
and re-prompts the LLM with the results injected.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
import structlog

from ..config import get_settings

log = structlog.get_logger(__name__)

_TAVILY_URL = "https://api.tavily.com/search"
_TIMEOUT = 15.0


class WebSearchUnavailable(RuntimeError):
    """No API key configured."""


class WebSearchFailure(RuntimeError):
    """Network / API error."""


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str       # short excerpt
    content: str = ""  # longer text (optional)


@dataclass
class SearchAnswer:
    """Tavily can return a synthesized answer + a list of sources."""

    answer: str | None
    results: list[SearchResult]


async def search(query: str, *, max_results: int = 5, depth: str = "basic") -> SearchAnswer:
    s = get_settings()
    if not s.tavily_api_key:
        raise WebSearchUnavailable("TAVILY_API_KEY not set")

    payload = {
        "query": query,
        "search_depth": depth,                  # 'basic' | 'advanced'
        "max_results": max_results,
        "include_answer": True,
        "include_raw_content": False,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                _TAVILY_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {s.tavily_api_key}",
                    "Content-Type": "application/json",
                },
            )
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as exc:
        log.error("tavily_failure", error=str(exc), query=query[:80])
        raise WebSearchFailure(str(exc)) from exc

    raw_results = data.get("results") or []
    results: list[SearchResult] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        results.append(
            SearchResult(
                title=str(item.get("title", "")),
                url=str(item.get("url", "")),
                snippet=str(item.get("content", ""))[:400],
                content=str(item.get("content", "")),
            )
        )

    answer = data.get("answer")
    log.info(
        "tavily_search",
        query=query[:80],
        result_count=len(results),
        has_answer=bool(answer),
    )
    return SearchAnswer(answer=answer if isinstance(answer, str) else None, results=results)


def format_for_prompt(answer: SearchAnswer) -> str:
    """Format results as a compact <web_results> block to inject into the prompt."""
    if not answer.results and not answer.answer:
        return ""
    lines: list[str] = ["<web_results>"]
    if answer.answer:
        lines.append(f"summary: {answer.answer.strip()}")
    for i, r in enumerate(answer.results[:5], start=1):
        title = r.title.strip() or r.url
        snippet = r.snippet.strip().replace("\n", " ")
        if len(snippet) > 220:
            snippet = snippet[:220] + "…"
        lines.append(f"{i}. {title}")
        if snippet:
            lines.append(f"   {snippet}")
        if r.url:
            lines.append(f"   ({r.url})")
    lines.append("</web_results>")
    return "\n".join(lines)
