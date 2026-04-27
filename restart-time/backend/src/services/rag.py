"""RAG retrieval over pgvector.

MVP scaffold: stubbed retrieval that returns empty results until the
ingestion CLI populates the corpora. Wire-up is here so the agent service
can call retrieval points and the call returns a list (possibly empty)
without crashing.

See PRD §9 for retrieval policies. Once corpora are ingested, replace
each function body with the actual pgvector RPC.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

from ..config import get_settings
from ..db.models import Language, RagCorpus

log = structlog.get_logger(__name__)


@dataclass
class RagHit:
    chunk_text: str
    source_ref: str
    score: float
    metadata: dict | None = None


# Narrative trigger keywords (PRD §6.2). Loaded from prompts/narrative_triggers.yaml
# in production; hard-coded here for the MVP scaffold.
NARRATIVE_TRIGGERS_HE = ["התחלה מחדש", "אני לא מצליח", "אבוד", "חוזר לעצמי", "תקוע"]
NARRATIVE_TRIGGERS_EN = ["starting over", "i can't", "lost", "what's the point", "stuck", "restart"]

USER_HISTORY_TRIGGERS_HE = ["אתמול", "פעם שעברה", "אמרתי לך", "סיפרתי"]
USER_HISTORY_TRIGGERS_EN = ["yesterday", "last time", "i told you", "we talked"]


def matches_narrative_trigger(text: str, language: Language) -> bool:
    s = text.lower()
    if language == "he":
        return any(t in s for t in NARRATIVE_TRIGGERS_HE)
    return any(t in s for t in NARRATIVE_TRIGGERS_EN)


def matches_history_trigger(text: str, language: Language) -> bool:
    s = text.lower()
    if language == "he":
        return any(t in s for t in USER_HISTORY_TRIGGERS_HE)
    return any(t in s for t in USER_HISTORY_TRIGGERS_EN)


async def retrieve(
    *,
    corpus: RagCorpus,
    query: str,
    language: Language,
    user_id: str | None = None,
    top_k: int = 3,
) -> list[RagHit]:
    """Retrieve top-k chunks. STUB — returns [] until ingestion is wired up.

    TODO (PRD §9):
      1. Embed `query` via embeddings service.
      2. Call Supabase RPC: `match_rag_chunks(corpus, language, user_id, embedding, k)`.
      3. Filter by score threshold (0.5).
      4. Return List[RagHit].
    """
    if not get_settings().enable_rag:
        return []
    log.debug(
        "rag_retrieve_stub",
        corpus=corpus,
        language=language,
        user_id=user_id,
        top_k=top_k,
    )
    # TODO: implement after ingestion pipeline is in place.
    return []


async def retrieve_for_on_demand_turn(
    *, query: str, language: Language, user_id: str
) -> dict[str, list[RagHit]]:
    """Run all retrieval triggers for one on-demand turn. Returns dict by corpus.

    Strategies: always (top-3).
    Restart:    only when narrative trigger matched (top-2).
    User hist:  only when history trigger matched (top-5).
    Language:   never retrieved at runtime (loaded into prompt template).
    """
    out: dict[str, list[RagHit]] = {
        "strategies": await retrieve(
            corpus="strategies", query=query, language=language, top_k=3
        ),
    }
    if matches_narrative_trigger(query, language):
        out["restart"] = await retrieve(
            corpus="restart", query=query, language=language, top_k=2
        )
    if matches_history_trigger(query, language):
        out["user_history"] = await retrieve(
            corpus="user_history",
            query=query,
            language=language,
            user_id=user_id,
            top_k=5,
        )
    return out
