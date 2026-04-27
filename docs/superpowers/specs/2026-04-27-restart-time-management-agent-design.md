# Restart Time-Management Agent — Product Requirements & Design

**Status:** Draft v1
**Date:** 2026-04-27
**Owner:** Leon Yurkovski
**Stakeholder:** Restart (wounded-leading-wounded peer support org)
**Project folder:** `restart-time/` (new, standalone — Eitan = reference only)

---

## 1. Executive summary

A bilingual (Hebrew / English), trauma-informed AI agent that helps wounded IDF soldiers and other PTSD-affected users plan and execute their day. The agent supports two interaction modes:

1. **Daily planning** — a calm, predictable conversation (morning anchor + optional evening reflection) driven by a deterministic state machine.
2. **On-demand help** — a flexible "I'm stuck / what's next / I lost track" conversation driven by an LLM with structured task-diff extraction.

The agent is voice **and** text first-class: the user can speak or type any turn, with the response delivered as voice, text, or both. All audio is captured with clear recording UX and persisted for journaling-style playback.

The MVP runs on a local LLM (LM Studio, `google/gemma-4-e2b`) reachable via Tailnet. Embeddings are also computed locally over Tailnet. Supabase provides auth, Postgres, and pgvector for RAG over four corpora (techniques, Restart narratives, user history, language guides). OpenAI handles speech I/O. Reminders are delivered via web push; tasks optionally sync with Google Calendar.

This is **MVP scope** for stakeholder demos at Restart. It is intentionally a web app, structured for a future React Native port to iOS / Android.

---

## 2. Userbase & design philosophy

**Userbase:** Wounded IDF soldiers in active recovery, served by Restart's three pillars (Makers, Mentors, Storytellers). Many present with PTSD; functional impact overlaps significantly with ADHD — executive dysfunction, time-blindness, hyperarousal, sleep disruption, and shame around "lost time." Some users have TBI affecting vision, memory, or fine motor control.

**Cultural context:** Restart's identity centers on the metaphor of *"restart"* / *"wound-birthday"* — choosing life anew. The recurring narrative shift is *"I can't"* → *"what if I can?"*. The agent's voice is **peer**, not clinical: wounded-leading-wounded.

**Design philosophy** (binding for all design decisions in this document):

1. **Predictability over flexibility** in the planning conversation. Trauma users benefit from knowing what comes next.
2. **Earn-only progress.** The user can never lose ground in this app. No streaks, no penalties, no shame language.
3. **Externalize executive function.** One next step at a time, never a menu of choices.
4. **Time-blindness aware.** "Before lunch" — not "by 11am." Sizes (`tiny / small / medium`) — not durations.
5. **Hebrew is native, not translated.** Idiomatic peer phrasing, not bilingual lipstick on an English bot.
6. **Calm by default.** Muted palette, no looping animations, no notification sounds, no badges, no red.
7. **Consensual memory.** The agent only references the user's history when the user invites it.
8. **Grounding always one tap away** — but no automatic crisis detection. The user is in control.

---

## 3. Goals & non-goals

### In scope (MVP)

- Bilingual planning + on-demand conversation
- Voice (push-to-talk with recording UX) and text input as equal peers
- Persistent audio playback of the user's own messages
- Local LLM (Gemma 2B-class via LM Studio over Tailnet)
- Local embeddings over Tailnet
- RAG over four corpora (Postgres + pgvector)
- Supabase auth (email + magic link)
- Tasks: create, complete, defer, drop; size-tagged; soft `when` (no hard times)
- Append-only `task_events` history
- Earn-only points & calm progress UI; level-up unlocks aesthetic + narrative rewards
- Google Calendar bidirectional sync (opt-in per task; OAuth via Supabase)
- Web push reminders (VAPID); opt-in per task; quiet hours; digest mode
- Always-visible grounding escape hatch (static content, no LLM)
- Trauma-informed system prompts with versioned templates
- Hebrew RTL layout, mixed-direction text rendering
- Ephemeral session mode (transcript + audio deleted on session close; tasks retained)

### Out of scope (explicit non-goals)

| # | Non-goal | Rationale |
|---|---|---|
| 1 | Crisis / suicide-risk detection | Userbase decision: agent's job is help, not triage |
| 2 | Outlook / Apple Calendar sync | Google only for MVP |
| 3 | Native iOS / Android apps | Codebase structured for React Native port; no native build yet |
| 4 | Multi-user shared planning, peer pairing | Single-user agent only |
| 5 | Custom / cloned TTS voices | TTS-1 stock voices only |
| 6 | Always-on listening, VAD, streaming STT | Push-to-talk only |
| 7 | Offline mode | Network required for Tailnet LLM + Supabase |
| 8 | Reranker over RAG retrieval | Flagged for v1.1 |
| 9 | Localization beyond HE / EN | Arabic + Russian deferred |
| 10 | Admin dashboard for Restart staff | Content ingestion via CLI only |
| 11 | Analytics / telemetry | Privacy-first; add later with explicit consent |
| 12 | A/B testing, feature flags | Not at MVP scale |
| 13 | Streaks of any kind | Forbidden by design philosophy |
| 14 | Mentor / Restart-staff intervention loop | Future feature |
| 15 | Auto-creation of calendar events / reminders | All scheduling is opt-in per item |

---

## 4. Architecture

### 4.1 Component diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  React + Vite (web MVP)                                          │
│  ─────────────────────────                                       │
│  - Supabase Auth (magic link)                                    │
│  - Composer (text input + push-to-talk + waveform/timer)         │
│  - Mode picker:  "Plan my day"  /  "I need help right now"       │
│  - MessageList (RTL-aware, audio playback per message)           │
│  - TaskList, ProgressCard, Settings sheet                        │
│  - GroundingButton (always visible; static, no LLM)              │
│  - core/ portable layer (api, auth, agent, audio, i18n, types)   │
└──────────────────────────────────────────────────────────────────┘
                              │ REST + SSE
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  FastAPI backend (Python)                                        │
│  ─────────────────────────                                       │
│  Routes:                                                         │
│    /audio/{stt,tts}                                              │
│    /agent/plan/*    (fixed-flow state machine)                   │
│    /agent/chat/*    (LLM-first + extractor, SSE)                 │
│    /tasks, /sessions, /settings                                  │
│    /calendar/{connect,disconnect,sync}                           │
│    /reminders, /push/subscribe                                   │
│  Services:                                                       │
│    llm.py            — LM Studio client                          │
│    audio.py          — Whisper-1 STT, TTS-1 synthesis            │
│    planning_flow.py  — deterministic state machine               │
│    extractor.py      — structured-output JSON diff               │
│    rag.py            — pgvector retrieval                        │
│    embeddings.py     — local embedding endpoint over Tailnet     │
│    points.py         — earn-only point ledger                    │
│    calendar.py       — Google Calendar OAuth + sync              │
│    reminders.py      — APScheduler tick + pywebpush dispatch     │
│    ingestion.py      — corpus → embeddings (CLI)                 │
└──────────────────────────────────────────────────────────────────┘
       │                │                  │                 │
       ▼                ▼                  ▼                 ▼
┌──────────────┐ ┌─────────────┐ ┌────────────────┐ ┌──────────────┐
│ LM Studio    │ │ Supabase    │ │ OpenAI APIs    │ │ Google APIs  │
│ Tailnet      │ │ ─────────   │ │ ─────────      │ │ ─────────    │
│ ─────────    │ │ auth        │ │ Whisper-1      │ │ Calendar v3  │
│ chat model:  │ │ Postgres    │ │ TTS-1 (echo,   │ │ OAuth 2.0    │
│ gemma-4-e2b  │ │ + pgvector  │ │  shimmer)      │ │              │
│ embed model: │ │ Storage     │ │                │ │              │
│ bge-m3 *     │ │ (audio)     │ │                │ │              │
└──────────────┘ └─────────────┘ └────────────────┘ └──────────────┘

* embedding model name pending final decision; bge-m3 recommended
```

### 4.2 Key architectural choices

| Choice | Rationale |
|---|---|
| **FastAPI (Python)** | Best-in-class for LLM tool-calling, structured outputs, audio piping, async streaming. Backend choice is independent of mobile path. |
| **React + Vite (not Next.js)** | SSR features don't transfer to React Native. Vite is lighter, simpler. `core/` layer built for portability. |
| **Two LLM calls per on-demand turn** (reply + extractor) | Resilience on a 2B-class model. Reply call doesn't need to produce JSON; extractor's failure doesn't break the conversation. |
| **Fixed flow for daily planning** | Predictability is a trauma-informed feature, not a UX limitation. Tiny model can't reliably drive multi-step flows. |
| **Embeddings via local model on Tailnet** | Aligns with on-prem privacy posture; user already has the GPU available; avoids cloud embedding costs. |
| **All audio routes through backend** | Frontend never holds OpenAI keys; LM Studio's Tailnet IP isn't browser-reachable. |
| **SSE for streaming reply** | Reduces perceived latency on small-model generation. Simpler than WebSocket; one-direction is all we need. |
| **No state library on frontend** | Surface area is small (4 hooks); a state library would obscure rather than help. Re-evaluate if it grows. |

### 4.3 Deployment topology (MVP)

- **LM Studio**: `100.122.52.86:1234`, Tailnet IP. Loads chat + embedding models.
- **Backend**: same Tailnet, runs `uvicorn` locally or on a Tailnet-joined server.
- **Frontend**: Vite dev server during demos; built static + served by FastAPI for stakeholder builds.
- **Supabase**: cloud-hosted (Restart's project once provisioned).
- **OpenAI**: public internet, called from backend.
- **Google Calendar**: public internet, called from backend.

Public deployment is post-MVP work — requires swapping LM Studio for a hosted endpoint.

---

## 5. Data model

### 5.1 Tables

All user-scoped tables enforce Row-Level Security (`user_id = auth.uid()`).

```sql
-- Settings -------------------------------------------------------------
CREATE TABLE user_settings (
  user_id                       UUID PRIMARY KEY REFERENCES auth.users(id),
  language                      TEXT NOT NULL DEFAULT 'en',  -- 'he' | 'en'
  voice_autoplay                BOOLEAN NOT NULL DEFAULT TRUE,
  tts_playback_mode             TEXT NOT NULL DEFAULT 'voice_turns_only',
                                  -- 'always' | 'voice_turns_only' | 'never'
  quiet_visual_mode             BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_planning_time       TEXT NOT NULL DEFAULT 'morning',
                                  -- 'morning' | 'evening' | 'both' | 'none'
  notification_quiet_start      TIME DEFAULT '21:00',
  notification_quiet_end        TIME DEFAULT '09:00',
  notification_digest_mode      BOOLEAN NOT NULL DEFAULT FALSE,
  notification_digest_time      TIME DEFAULT '09:00',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks ----------------------------------------------------------------
CREATE TABLE tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  title               TEXT NOT NULL,
  description         TEXT,
  state               TEXT NOT NULL DEFAULT 'open',
                        -- 'open' | 'done' | 'deferred' | 'dropped'
  size                TEXT,
                        -- 'tiny' | 'small' | 'medium'
  soft_when           TEXT,            -- free-text "morning" / "after lunch"
  deferred_to         DATE,            -- nullable; for state='deferred'
  created_in_session  UUID REFERENCES sessions(id),
  calendar_event_id   TEXT,            -- Google Calendar event ID (opt-in)
  calendar_synced_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX ON tasks (user_id, state, deferred_to);

-- Sessions -------------------------------------------------------------
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  mode        TEXT NOT NULL,            -- 'planning' | 'on_demand'
  language    TEXT NOT NULL,            -- frozen at session start
  ephemeral   BOOLEAN NOT NULL DEFAULT FALSE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  summary     TEXT
);
CREATE INDEX ON sessions (user_id, started_at DESC);

-- Messages -------------------------------------------------------------
CREATE TABLE messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
  content      TEXT NOT NULL,
  audio_path   TEXT,                    -- Supabase Storage path, NOT signed URL.
                                        -- Signed URLs generated at read time.
  language     TEXT,                    -- detected per-message (HE/EN switching)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON messages (session_id, created_at);

-- Append-only task event log -------------------------------------------
CREATE TABLE task_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(id),
  event_type   TEXT NOT NULL,
                -- 'created' | 'completed' | 'deferred' | 'dropped' | 'edited'
  session_id   UUID REFERENCES sessions(id),
  delta_json   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON task_events (task_id, created_at);

-- Earn-only point ledger -----------------------------------------------
CREATE TABLE point_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  source_type  TEXT NOT NULL,
                -- 'task_complete' | 'planning_session'
                -- | 'app_open_day' | 'carryover_done' | 'multiplier_bonus'
  source_id    UUID,                   -- task_id or session_id
  points       INTEGER NOT NULL,
  multiplier   INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON point_events (user_id, created_at DESC);

-- RAG store ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE rag_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus       TEXT NOT NULL,
                -- 'strategies' | 'restart' | 'user_history' | 'language_guide'
  user_id      UUID REFERENCES auth.users(id),  -- nullable; only for user_history
  language     TEXT NOT NULL,           -- 'he' | 'en'
  source_ref   TEXT NOT NULL,           -- file path / URL / session_id
  chunk_index  INTEGER NOT NULL,
  chunk_text   TEXT NOT NULL,
  embedding    VECTOR(1024),            -- dim depends on chosen model
  metadata     JSONB,
  redacted_at  TIMESTAMPTZ,             -- for restart corpus consent withdrawals
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corpus, source_ref, chunk_index)
);
CREATE INDEX ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX ON rag_chunks (corpus, user_id, language)
  WHERE redacted_at IS NULL;

-- Planning state machine scratch ---------------------------------------
CREATE TABLE planning_flow_state (
  session_id    UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  current_step  TEXT NOT NULL,
                  -- 'greet' | 'review_carryover' | 'propose_today'
                  --   | 'confirm' | 'close'
  step_data     JSONB,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reminders ------------------------------------------------------------
CREATE TABLE reminders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  task_id           UUID REFERENCES tasks(id) ON DELETE CASCADE,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  delivery_channel  TEXT NOT NULL DEFAULT 'webpush',
                     -- 'webpush' | 'fcm' | 'apns' | 'email'
  body_override     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
                     -- 'pending' | 'sent' | 'cancelled' | 'failed'
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON reminders (status, scheduled_at) WHERE status = 'pending';

CREATE TABLE push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- Google Calendar tokens -----------------------------------------------
CREATE TABLE google_oauth_tokens (
  user_id                  UUID PRIMARY KEY REFERENCES auth.users(id),
  encrypted_access_token   TEXT NOT NULL,
  encrypted_refresh_token  TEXT NOT NULL,
  scope                    TEXT NOT NULL,
  expires_at               TIMESTAMPTZ NOT NULL,
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 Data integrity rules

- **`task_events` is append-only.** Triggers on `tasks` write a corresponding event row. No UPDATE without a paired event.
- **Ephemeral mode** wipes `messages` and associated audio on session close, and skips `user_history` ingestion. Tasks survive.
- **Audio storage**: Supabase Storage bucket `user-audio/`, path `{user_id}/{session_id}/{message_id}.{ext}` stored as `messages.audio_path`. Signed URLs (1-hour expiry) are generated by the backend on demand when serving messages or transcripts. Never persist signed URLs.
- **Token encryption**: Google OAuth tokens encrypted at the application layer using libsodium symmetric encryption with `CALENDAR_ENCRYPTION_KEY` env var. Key rotation procedure documented separately.
- **`rag_chunks.user_id` RLS**: corpus IN ('strategies', 'restart', 'language_guide') is readable by all authenticated users; corpus = 'user_history' requires `user_id = auth.uid()`.

---

## 6. Agent design

### 6.1 Planning mode (deterministic state machine)

A Python state machine in `services/planning_flow.py`. Each state is a function:

```python
def state_fn(session, user_message, db) -> StateResult:
    return StateResult(
        assistant_reply=...,   # text generated by LLM in this slot
        next_state=...,
        side_effects=[...],    # task creates, point awards, etc.
    )
```

**State graph:**

```
START → greet ──────▶ review_carryover (if carryovers exist)
                  │   │
                  │   ├─ done?    → next carryover OR propose_today
                  │   ├─ open?    → propose_today (carries forward)
                  │   ├─ defer?   → set deferred_to, next or propose_today
                  │   └─ drop?    → mark dropped, next or propose_today
                  │
                  └─▶ propose_today ──▶ confirm ──▶ close → END
                          ▲     │
                          └─────┘  (loop up to 3 tasks)
```

**State responsibilities:**

| State | Server logic | LLM responsibility |
|---|---|---|
| `greet` | Load prior session summary; compute days since last session. Award `app_open_day` point if new day. | Generate 1-sentence warm greeting in user's language; reference gap if relevant. |
| `review_carryover` | Pull open tasks created in prior sessions (last 7 days, max 3). For each, parse user reply into intent: `done` / `still_open` / `defer` / `drop`. | Generate the carry-over question; on user reply, generate calm acknowledgment. **No shame language ever.** |
| `propose_today` | Receive free-text task description from user. Award `task_create` event. | Reflect the task back in 1 sentence; offer to add it. Cap at 3 total; ask "anything else?" until user says no or cap reached. |
| `confirm` | Read back the day's plan. | Restate plan in 2-3 calm sentences, using user's own phrasing where possible. |
| `close` | Generate session summary; write to `sessions.summary`; trigger `user_history` ingestion if not ephemeral. Award `planning_session` point. | Generate the summary itself. |

**Off-script handling rule:** if the user says something unrelated to the current state's expectation, the state machine acknowledges in 1 sentence ("noted — let's come back to that") and re-asks the current question. We do *not* attempt cross-state intent parsing. Users wanting to leave the flow end the session and use on-demand mode.

**Carryover review rule:** if the user reports a task as still open, the agent does not re-ask "do you want to do it today?" — it carries it forward into `propose_today` automatically and surfaces it there for the user to confirm or defer. This avoids relitigating the same task twice.

### 6.2 On-demand mode (LLM-first + extractor)

Each user turn runs **two LLM calls**:

**Call 1 — Reply generation** (streamed to client via SSE):

```
SYSTEM:
  <trauma-informed system prompt for session.language>
  <few-shot examples sampled from language_guide corpus>

  <known_techniques>
    {top-3 RAG hits from 'strategies' corpus, filtered by language}
  </known_techniques>

  <peer_voices>  (only if narrative trigger matched)
    {top-2 RAG hits from 'restart' corpus}
  </peer_voices>

  <your_recent_history>  (only if user invoked past)
    {top-5 RAG hits from 'user_history', user-scoped}
  </your_recent_history>

CONTEXT: <last 6 turns of this session>
USER: <new message>
→ assistant reply (target: 1-3 sentences)
```

**Call 2 — Task-diff extractor** (after reply, sent to client when ready):

```
SYSTEM:
  Read the exchange between user and assistant.
  Return JSON matching this schema. If nothing changed about
  the user's tasks, return {}.
  Never invent tasks the user did not mention.

SCHEMA:
  {
    "add":      [{"title": str, "size"?: str, "soft_when"?: str,
                  "description"?: str}],
    "complete": [task_id_or_title_match],
    "defer":    [{"task": str|id, "until": "tomorrow" | "YYYY-MM-DD"}],
    "drop":     [task_id_or_title_match],
    "note":     str | null
  }

INPUT: <user message + assistant reply>
→ JSON diff
```

**Server processing:**
1. Validate JSON against Pydantic model. Invalid JSON ⇒ ignore extractor result entirely; log warning at INFO level. Conversation continues.
2. Resolve task references (ID or fuzzy title match against this user's open tasks).
3. Apply diff in a transaction; write `task_events` rows.
4. Award point events as appropriate (`task_complete`, surprise multiplier roll).
5. Emit SSE `extracted` event to client with the applied diff so UI refreshes.

**Narrative trigger detection** (for `restart` corpus retrieval): regex / keyword match on the user's message. Triggers include:
- HE: `התחלה מחדש`, `אני לא מצליח`, `אבוד`, `חוזר לעצמי`, `תקוע`
- EN: `starting over`, `i can't`, `lost`, `what's the point`, `stuck`, `restart`

Keyword list is a config file (`prompts/narrative_triggers.yaml`) — easy to tune without code change. Upgrade to a small classifier post-MVP.

### 6.3 System prompt principles

Encoded into versioned prompt templates (`prompts/system_v1.{en,he}.md`). Concrete rules:

1. **Reply length cap.** Target 1-2 sentences. Never more than 3.
2. **Validate before redirecting.** If the user expresses difficulty, the first sentence acknowledges it. The second offers something concrete only if appropriate.
3. **One next step, never a menu.** Don't say "you could try X, Y, or Z." Pick one.
4. **No shame language.** Banned phrases (both languages): "you should have", "why didn't you", "just (do X)". Replace with: "no problem", "let's see what's possible now", "קורה", "מה אפשר עכשיו".
5. **Time-blindness aware.** Use sizes (`tiny / small / medium`) and rough times (`before lunch / this afternoon`) — never clock times.
6. **Peer voice, not clinical.** Avoid "I understand" — prefer "yeah, that's heavy" / "כן, זה כבד".
7. **Hebrew is native.** Hebrew prompts are written in Hebrew with idiomatic phrasing, not translated from English.
8. **Don't reach for the past.** Only reference user history when the user invited it (or in carryover review, which is structurally consensual).
9. **Never mention points or progress** unsolicited.
10. **Don't break character into "as an AI"-style disclaimers.** The peer voice is consistent.

Prompts are versioned (`v1`, `v2`, ...) so changes are explicit and reversible.

### 6.4 Voice & multimodal interaction

**Composer is dual-mode at all times.** Text input + send button on one side, mic button on the other. Both visible, both equally prominent. No mode switch.

**Per-turn choice.** User can type one turn, speak the next, type again. Agent doesn't care.

**TTS playback** controlled by `user_settings.tts_playback_mode`:
- `always` — every assistant reply auto-plays
- `voice_turns_only` — auto-play only when *that* user turn was voice (default)
- `never` — no auto-play; tap a small play icon next to any reply

**Push-to-talk recording UX (the "with recording" requirement):**
- Hold mic button (or spacebar when text input not focused) → starts MediaRecorder.
- **Live waveform** shown above composer while recording.
- **Live elapsed-time counter** ("0:07").
- **Cancel-by-swipe** (drag left/up to abort) — discards the recording without sending.
- Release button → stops, blob assembled, uploads to `/audio/stt`.
- Recording <500ms is auto-discarded (likely a misclick).
- Audio level meter shown subtly to confirm capture.

**User audio persistence (the "with recording" requirement):**
- Every user voice turn's audio is uploaded to Supabase Storage at `user-audio/{user_id}/{session_id}/{message_id}.webm`.
- `messages.audio_path` stores the storage path; backend generates signed URLs (1-hour expiry) on read.
- MessageList renders a play button next to user messages with audio.
- **Ephemeral sessions delete audio on session close** along with transcripts.

**Mime selection:**
- Default: `audio/webm;codecs=opus` (Chrome, Firefox, Edge, Safari ≥14.5).
- iOS Safari fallback: `audio/mp4` / `audio/aac`. Detected at startup.

**Cancellation:**
- New turn started before TTS plays → drop pending audio.
- Network failure on STT → calm UI message ("couldn't reach the server — let's try that again when you're ready"). No red banners, no spinner-of-doom.

---

## 7. Trauma-informed UI

### 7.1 Color & contrast

- **Default light theme:** background `#F6F3EE` (warm off-white), text `#2A2A2A` (soft graphite).
- **Default dark theme:** background `#1B1F26` (deep blue-grey), text `#E8E2D6` (warm cream).
- **No pure white, no pure black, no red anywhere in default theme.**
- **Accent colors used sparingly:**
  - Sage green `#7A9B7A` — completed / good states.
  - Soft amber — level-up moments only.
  - Muted clay (not red) — error states.
- **WCAG AA minimum** (4.5:1 body text contrast). Light grey on white is forbidden.

### 7.2 Motion

- **Linear or ease-out, max 250ms.** No spring physics, no bounces.
- **No looping animations** anywhere. No pulsing, no breathing buttons, no spinners.
- **Streamed-token rendering is opt-out** — users with `quiet_visual_mode` see full replies at once.
- **`prefers-reduced-motion` automatically enables `quiet_visual_mode` motion behavior.**

### 7.3 Sound

- **TTS is the only audio output.** No notification sounds, no level-up chime, no error beep.
- **TTS voice:** `echo` for English, `shimmer` placeholder for Hebrew. Voice selection finalized after listening test.
- **TTS speed default 0.9×.** User adjustable in settings.

### 7.4 Typography

- **System font stack only.** No web font downloads.
  - `-apple-system, "Segoe UI", "Heebo", sans-serif`.
  - Heebo is Android/Windows Hebrew system font; falls back gracefully.
- **Line height ≥ 1.6.**
- **Base size 17px** (not 14px) — accommodates TBI vision changes.
- **No all-caps anywhere** (reads as shouting).

### 7.5 Hebrew / RTL

- **Full UI mirroring** when `language=he`. Mic button on the left, back button on the right.
- **Mixed-direction message rendering.** A Hebrew sentence containing English task title uses Unicode bidi controls, tested in MessageList.
- **Per-message detected direction**, not session-wide. User may switch languages mid-conversation.
- **Hebrew is not a translation.** `i18n/he.json` is written natively. Hebrew-native review pass mandatory before MVP demo.

### 7.6 Layout principles

- **One primary action per screen.** Mode picker has two buttons; chat has the mic button.
- **No nested menus, no hamburger.** Settings is a bottom sheet.
- **Generous whitespace.**
- **Tap targets ≥56px.**
- **No badges, no notification dots, no streak counters.**

### 7.7 Mode picker (entry screen)

```
┌──────────────────────────────────────────┐
│   הי, איתן.   /   Hi, Eitan.             │
│                                          │
│   ┌──────────────┐  ┌──────────────┐     │
│   │ Plan my day  │  │ I need help  │     │
│   │              │  │  right now   │     │
│   └──────────────┘  └──────────────┘     │
│                                          │
│   Yesterday's open                       │
│   • call sister                          │
│   • walk 10 min                          │
│   • laundry                              │
│                                          │
│   ●  240 / 300                           │
│   ▓▓▓▓▓▓▓▓░░  Day by Day                 │
│   this month: 11 days here               │
│                                          │
│                                  [ ◐ ]   │ ← grounding button
└──────────────────────────────────────────┘
```

A small list of yesterday's open tasks below the buttons — a reminder that they exist, not an action prompt. ProgressCard at the bottom (hidden when `quiet_visual_mode=true`).

### 7.8 Grounding escape hatch

- **Always-visible** small icon, bottom-right (LTR) or bottom-left (RTL).
- **Single tap**: pauses any active conversation, shows a 3-line grounding script:
  - "Notice 3 things you can see."
  - "2 you can hear."
  - "1 you can feel."
- **No agent involvement, no LLM call.** Pure static content.
- **1-tap return** to where the user was.
- This is the one place the app steps outside the "no crisis detection" rule — not by detecting, but by making grounding always one tap away.

---

## 8. Points & progress

### 8.1 Earning rules

| Action | Points | Notes |
|---|---|---|
| Complete a `tiny` task | 5 | |
| Complete a `small` task | 10 | |
| Complete a `medium` task | 20 | |
| Do a planning session | 15 | Show-up reward, regardless of outcome |
| Open the app on a new day | 5 | First open per calendar day |
| Complete a carryover task | +5 bonus | On top of size-based points |
| Surprise multiplier | ×2 or ×3 | ~10% of completions; randomized |

**Critical rules** (binding):
- **Earn-only.** Points never decrease.
- **No streaks.** "Days engaged this month" replaces streak counters.
- **Defer / drop = 0 points, no penalty.** Pruning the day is a skill.
- **Agent never mentions points unsolicited** outside level-up moments.

### 8.2 Levels

| Level | Points to reach | EN name | HE name (placeholder; needs Restart input) |
|---|---|---|---|
| 1 | 0 | First Light | אור ראשון |
| 2 | 100 | Steady Step | צעד יציב |
| 3 | 300 | Day by Day | יום אחר יום |
| 4 | 700 | Restart | לידה מחדש |
| 5 | 1500 | Wide Awake | ער לחיים |
| 6+ | logarithmic curve | TBD | TBD |

Levels live as a constant in `services/points.py` — tunable without migrations.

### 8.3 Level-up experience

- Calm, single-screen fade-in.
- One sentence in agent's voice ("level 3 — day by day. you've shown up.").
- **No sound, no fanfare, no animation loops.**
- Tap to dismiss.

### 8.4 Rewards (level unlocks)

| Level | Unlock |
|---|---|
| L2 | Alternate agent voice (calmer, slower) |
| L3 | Quiet color theme |
| L4 | Peer story from Restart corpus (one testimonial chunk, surfaced as narrative reward) |
| L5+ | More themes, more stories |

**Every functional feature works at level 1.** Rewards are aesthetic + narrative, never gating.

### 8.5 Progress UI

Single small card on main screen:

```
●  240 / 300
▓▓▓▓▓▓▓▓░░  Day by Day
this month: 11 days here
```

Hidden entirely when `quiet_visual_mode = true`.

---

## 9. RAG corpus & ingestion

### 9.1 Corpus 1 — `strategies` (PTSD/ADHD time-management techniques)

**Sources** (curated, ~80-150 chunks at MVP launch):
- Russell Barkley's ADHD executive-function frameworks
- Trauma-informed productivity literature (license-checked)
- CBT-A protocol summaries
- Spoon Theory writing
- Body-doubling, pomodoro, interval-based work techniques
- 2-3 hand-written in-house technique cards in agent's voice

**Format:** Markdown in `content/strategies/{lang}/{topic}.md` with frontmatter:

```yaml
---
topic: task_decomposition | gentle_restart | energy | time_blindness | ...
tone: technique | reframe | story
language: en | he
license: public_domain | restart_internal | cited:<url>
---
```

**Chunking:** semantic split on `## ` H2 headings; merge consecutive small chunks under 200 tokens; target 200-400 tokens with 30-token overlap.

**Retrieval:** every on-demand turn, top-3 by cosine similarity, filtered by `language=session.language`. Inserted under `<known_techniques>` in system prompt.

### 9.2 Corpus 2 — `restart` (Restart organization narratives)

**Sources** (~30-60 chunks; require Restart cooperation):
- Workshop transcripts (Makers / Mentors / Storytellers)
- Public testimonial videos (transcribed where transcripts available)
- Wound-birthday / restart day framing materials
- Brothers for Life / Restart blog content

**Sensitivity:** personal narratives. Requirements:
- Written consent from each speaker before ingestion.
- `consent_ref` in metadata pointing to consent record.
- Speakers may request removal: set `redacted_at`; queries filter `WHERE redacted_at IS NULL`.

**Format:** `content/restart/{lang}/{source_id}.md`, one file per testimonial, paragraph-chunked.

**Retrieval:** triggered on on-demand turns when user message matches narrative trigger (regex/keyword in `prompts/narrative_triggers.yaml`). Top-2 chunks. Inserted under `<peer_voices>` in system prompt.

**Conservative use rule:** the agent is instructed to *quote or paraphrase only when the user is in a narrative-needing moment* — not as filler. If unsure, don't reach for it.

### 9.3 Corpus 3 — `user_history` (per-user past sessions)

**Source:** the user's own `messages` and `task_events` from prior sessions.

**Ingestion** (background task at session close):
1. Load just-closed session's messages (skip if `ephemeral=true`).
2. Chunk into "exchange units" (one user turn + assistant reply = one chunk).
3. Compute metadata: `session_id`, `task_ids_referenced`, `topic_summary` (1-line LLM-generated), `mood_signal` (`regulated | tense | low | hopeful | unclear`; LLM-extracted, never shown to user).
4. Embed and write to `rag_chunks` with `corpus='user_history'`, `user_id=<this user>`.

**Privacy:**
- Ephemeral sessions contribute nothing to user_history.
- Settings sheet has a "wipe my history" action: `DELETE FROM rag_chunks WHERE corpus='user_history' AND user_id = auth.uid()`.
- RLS policy enforces `user_id = auth.uid()` for this corpus — server bug cannot leak across users.

**Retrieval triggers:**
- User says "yesterday" / "last time" / "I told you" / "אתמול" / "פעם שעברה" / "אמרתי לך"
- Planning mode `review_carryover` step (always pulls user_history filtered to last 7 days)

Top-5 chunks. Inserted under `<your_recent_history>` in system prompt.

**Consensual memory rule:** the system prompt explicitly tells the model to **only reference user_history when the user invited it**. Retrieval gathers; the model decides whether to use. We accept that the model will sometimes ignore relevant history — that's the right failure mode.

### 9.4 Corpus 4 — `language_guide`

**Content:** ~50 hand-written phrase pairs per language demonstrating:
- Trauma-informed phrasings ("no problem, let's see what's possible now")
- Anti-patterns marked `❌` (what NOT to say)
- Peer-voice idioms in Hebrew (informal, warm, military-survivor culturally aware)
- Time-blindness phrasings ("before lunch", not "by 11am")

**Format:** YAML in `content/language_guide/{en,he}.yaml`:

```yaml
- situation: user_missed_a_task
  good_he: "קורה, מה אפשר לעשות עכשיו?"
  good_en: "happens. what's possible now?"
  bad: "you should have done it"
  rationale: "no shame language"
```

**Use:** *not* retrieved at runtime. Loaded once at server startup, sampled into the system prompt template (5 random examples per language as few-shot demos). Refreshed on a daily schedule for variety.

### 9.5 Embedding model

Local via Tailnet, OpenAI-compatible `/v1/embeddings` endpoint at `http://100.122.52.86:1234`. Model name set via `EMBEDDING_MODEL` env var.

**Recommended:** `bge-m3` (dim 1024, strong multilingual including Hebrew). Final choice TBD.

### 9.6 Retrieval tuning

- Chunk size: 200-400 tokens (semantic), 30-token overlap.
- HNSW: `m=16, ef_construction=64` (Supabase pgvector defaults).
- Cosine similarity. **Threshold 0.5** — below this, chunk discarded even if top-k.
- **Reranker out of scope for MVP**; flagged as v1.1 (`bge-reranker-v2-m3`).

### 9.7 Ingestion CLI

```
python -m ingestion ingest \
  --corpus strategies \
  --path ./content/strategies/en/ \
  --language en \
  [--dry-run]    # validates frontmatter, prints chunk plan, no DB write

python -m ingestion reindex --corpus user_history --user-id <uuid>
python -m ingestion stats   # chunk counts per corpus/language
```

Idempotent: re-running with same source files updates existing chunks (matched by `source_ref + chunk_index`); does not duplicate.

---

## 10. API surface

All routes (except `/health`) require `Authorization: Bearer <Supabase JWT>`. JWTs verified against Supabase JWKS; `user_id` derived from verified token.

Conventions:
- Success: `{ ok: true, ...payload }`.
- Error: HTTP 4xx/5xx with `{ ok: false, error: { code, message, hint? } }`.
- All timestamps ISO 8601 UTC; client renders local.

### 10.1 Audio

```
POST /audio/stt
  body: multipart audio (webm/ogg/wav/m4a/mp4)
  query: ?language=he|en (optional; Whisper auto-detects if omitted)
  → { text, detected_language, duration_ms, audio_path, audio_signed_url }
       -- audio_path: stored on the resulting message row
       -- audio_signed_url: 1-hour expiry, for immediate playback

POST /audio/tts
  body: { text, language: 'he'|'en', speed?: float }
  → audio/mpeg stream
```

`audio_path` is the Supabase Storage object path (persisted on the message row); `audio_signed_url` is a 1-hour-expiry URL for immediate playback. Clients pass `audio_path` to subsequent agent endpoints; signed URLs are regenerated by the backend whenever a transcript is loaded.

### 10.2 Planning mode

```
POST /agent/plan/start
  body: {}    -- language pulled from user_settings
  → { session_id, assistant_message, state: 'greet' }

POST /agent/plan/turn
  body: { session_id, user_message, audio_path? }
  → { assistant_message, state, done: bool, applied_diff? }
       -- when done=true, session auto-ends; summary generated

POST /agent/plan/end
  body: { session_id }
  → { summary }
```

### 10.3 On-demand mode (SSE)

```
POST /agent/chat/start
  body: { ephemeral?: bool }
  → { session_id }

POST /agent/chat/turn   (Server-Sent Events)
  body: { session_id, user_message, audio_path? }
  → SSE stream:
      event: token       data: {"text": "..."}
      event: done        data: {"message_id": "..."}
      event: extracted   data: {"add":[...], ...}
      event: error       data: {"error": "..."}

POST /agent/chat/end
  body: { session_id }
  → { summary }
```

### 10.4 Tasks

```
GET    /tasks?state=open|done|deferred&date=YYYY-MM-DD
       → list of tasks (default: today's open)
GET    /tasks/:id
       → task with full task_events history
PATCH  /tasks/:id
       body: { title?, state?, soft_when?, deferred_to?, size? }
DELETE /tasks/:id
       -- soft delete (state='dropped')
```

### 10.5 Sessions

```
GET /sessions?limit=20&before=<timestamp>
GET /sessions/:id
    → full transcript + task_events + audio URLs
```

### 10.6 Settings

```
GET   /settings
PATCH /settings
      body: { language?, voice_autoplay?, tts_playback_mode?,
              quiet_visual_mode?, preferred_planning_time?,
              notification_quiet_start?, notification_quiet_end?,
              notification_digest_mode?, notification_digest_time? }
```

### 10.7 Calendar

```
GET  /calendar/status                   → { connected, scope, expires_at }
POST /calendar/connect                  → { oauth_url }   (initiates OAuth)
POST /calendar/oauth/callback           (Supabase or custom)
POST /calendar/disconnect               → { ok }   (revokes scope, deletes tokens)
POST /calendar/sync/task/:id            -- explicit upsert
       body: { duration_minutes?, when? }
       → { event_id, html_link }
DELETE /calendar/sync/task/:id          -- removes calendar event, keeps task
GET  /calendar/events?from=...&to=...   -- read-only; agent uses for "I see you have something at 2pm"
```

### 10.8 Reminders & push

```
POST   /push/subscribe                  body: PushSubscription JSON
DELETE /push/subscribe                  body: { endpoint }

POST   /reminders                       body: { task_id, scheduled_at, body_override? }
GET    /reminders?task_id=...
DELETE /reminders/:id
```

Reminder creation respects quiet hours and digest mode automatically.

### 10.9 Health & ops

```
GET /health
    → { status, llm_reachable, embedding_reachable,
        supabase_reachable, openai_reachable }
    -- 2s timeout per probe; returns stale results if probes time out
```

### 10.10 RAG ingestion

Not exposed via HTTP. CLI only (Section 9.7).

---

## 11. Frontend structure

### 11.1 Repo layout

```
frontend/
├── index.html
├── package.json           (vite, react, supabase-js, lucide-react)
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── core/                          ← portable to React Native
    │   ├── api.ts                     (fetch + SSE client)
    │   ├── auth.ts                    (Supabase client + session hooks)
    │   ├── agent.ts                   (planning + on-demand flow logic)
    │   ├── audio.ts                   (record, encode, upload, playback)
    │   ├── calendar.ts                (Google Calendar client wrapper)
    │   ├── reminders.ts               (push subscription + reminder API)
    │   ├── i18n.ts                    (he/en string tables)
    │   └── types.ts                   (Task, Session, Message, Diff, ...)
    ├── components/                    ← web-only (swapped for RN)
    │   ├── auth/MagicLink.tsx
    │   ├── chat/MessageList.tsx
    │   ├── chat/Composer.tsx          (text + mic, equal prominence)
    │   ├── chat/VoiceButton.tsx       (push-to-talk + waveform + timer)
    │   ├── chat/AudioPlayback.tsx     (per-message playback)
    │   ├── tasks/TaskList.tsx
    │   ├── tasks/TaskItem.tsx
    │   ├── modes/ModePicker.tsx
    │   ├── modes/PlanningView.tsx
    │   ├── modes/OnDemandView.tsx
    │   ├── progress/ProgressCard.tsx
    │   ├── progress/LevelUpScreen.tsx
    │   ├── grounding/GroundingButton.tsx
    │   ├── grounding/GroundingScript.tsx
    │   ├── settings/SettingsSheet.tsx
    │   ├── calendar/CalendarConnectCard.tsx
    │   └── ui/                        (Button, Sheet, Toggle — generic)
    └── styles/
        ├── tokens.css                 (palette tokens)
        ├── globals.css
        └── rtl.css                    (RTL adjustments)
```

**Portability rule:** anything in `core/` must not import from `react-dom`, browser-only DOM APIs without a shim, or web-specific packages. Contract that lets us swap `components/` for React Native later.

### 11.2 State management

Plain React state + custom hooks: `useSession`, `useAgent`, `useTasks`, `useSettings`, `useReminders`, `useCalendar`. SSE updates flow into `useAgent` directly. Re-evaluate state library if surface grows.

### 11.3 Voice pipeline

```
1. Composer dispatches:
     - text path:  POST /agent/.../turn { user_message }
     - voice path: hold mic → record (waveform + timer) → release
                   → POST /audio/stt → POST /agent/.../turn
                     { user_message, audio_path }
2. SSE stream → tokens render in MessageList.
3. On 'done' event:
     - if tts_playback_mode allows → POST /audio/tts → play
     - else → small play icon on the message
4. On 'extracted' event (chat mode) → invalidate task list silently.
```

**Recording specifics:**
- Live waveform via Web Audio API analyser node.
- Live timer ("0:07").
- Cancel-by-swipe (drag left/up; mobile-friendly).
- <500ms recordings auto-discarded.
- Audio level meter in composer subtly confirms capture.
- Mime feature-detection: webm/opus default, m4a/aac iOS fallback.

---

## 12. Calendar sync (Google)

### 12.1 OAuth flow

- Supabase's Google provider handles OAuth (avoids us managing client secrets).
- Required scopes: `email`, `profile`, `https://www.googleapis.com/auth/calendar`.
- Calendar scope is requested *separately* from sign-in (upsell pattern): user signs in with email magic-link, then optionally connects calendar from settings or via prompt during a planning session ("connect your calendar so I can help you fit things in?").
- Tokens encrypted with libsodium symmetric encryption, key from `CALENDAR_ENCRYPTION_KEY` env var. Stored in `google_oauth_tokens`.
- Disconnect revokes scope, deletes tokens; task data intact.

### 12.2 Sync semantics

**Outbound (task → calendar):**
- Triggered when user explicitly opts to put a task on calendar ("want me to block 30 minutes on your calendar?").
- Creates Google Calendar event with: title = task title, description = task description, start = derived from `soft_when` + duration estimate, end = start + duration.
- Stores event ID in `tasks.calendar_event_id`, sets `calendar_synced_at`.

**Inbound (calendar → task):**
- Backend polls `events.list` for connected users every 5 minutes (MVP fallback if webhooks aren't set up).
- Webhook path (preferred, post-MVP if webhook setup proves painful): Google's "watch" API pushes change notifications.
- Events the user has on their calendar are *read* so the agent can avoid double-booking ("I see you've got something at 2pm — want to plan around it?").
- Edits to a task's source event: pull updated time into `tasks`.

**Conflict rules:**
- Tasks the agent created → agent's writes win on outbound conflict.
- User-created calendar events → user's edits win on inbound conflict.
- Concurrent edits within sync window: last-write-wins, log to `task_events`.

### 12.3 Trauma-informed friction

- **No automatic event creation.** Agent always asks: "want me to put this on your calendar, or keep it loose?"
- Default answer is loose (no event). Agent does not push.

### 12.4 Privacy

- Calendar data stays server-side; not embedded into RAG.
- User-visible "delete all calendar links" button in settings: removes `calendar_event_id` from all tasks (does not delete Google events; that's user's choice).

---

## 13. Reminders & push notifications

### 13.1 Web push (VAPID)

- VAPID keypair generated once, public key shipped to frontend, private key in backend env.
- Frontend requests notification permission, registers service worker, subscribes to push, sends `PushSubscription` to `/push/subscribe`.
- Backend stores in `push_subscriptions` table.

### 13.2 Reminder lifecycle

- **Opt-in per task.** Planning mode does not auto-create reminders. Agent asks: "want a quiet nudge before this?" — schedules only on user yes.
- Reminders attach to tasks via `reminders.task_id`.
- A reminder body (calm phrasing) is generated by the agent at creation time, stored in `body_override`. Default body is templated: "you mentioned wanting to {title}".

### 13.3 Quiet hours & digest mode

- `notification_quiet_start` / `notification_quiet_end` in `user_settings` (default 21:00–09:00).
- A reminder scheduled inside quiet hours is delayed until `notification_quiet_end`.
- `notification_digest_mode = true` → all reminders for a day collapse into one notification at `notification_digest_time` (default 09:00) summarizing the day's items.

### 13.4 Notification UX

- **No sound.** Silent notifications by default. User may opt to sound; agent never recommends it.
- **No badge.** No app-icon badge counts.
- **Calm body.** "you mentioned wanting to call your sister." Never urgency words ("REMINDER", "NOW", "!").

### 13.5 Scheduler

- `apscheduler` integrated with the FastAPI app, ticks every minute.
- Selects `reminders WHERE status='pending' AND scheduled_at <= now()`.
- Dispatches via `pywebpush` (web push) — falls back to `fcm`/`apns` channels post-MVP for native apps.
- On dispatch: marks `delivered_at`, sets `status='sent'`. On failure: `status='failed'`, log error.
- Single-process scheduler is sufficient at MVP scale; revisit for multi-instance deploy.

### 13.6 Native push readiness

- `delivery_channel` field supports `'fcm'` and `'apns'` already.
- Schema unchanged when native apps ship; only the dispatcher adds new branches.

---

## 14. Authentication & privacy

### 14.1 Auth

- **Supabase Auth, email + magic link.** No password.
- JWT verified at every backend route (Supabase JWKS).
- `user_id` derived from JWT, never trusted from request body.
- Sessions persist in browser via Supabase SDK (default).

### 14.2 RLS policies

Every user-scoped table has:

```sql
CREATE POLICY "user_isolation" ON <table>
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

`rag_chunks` has corpus-aware policy:

```sql
CREATE POLICY "rag_read" ON rag_chunks
  FOR SELECT USING (
    corpus IN ('strategies', 'restart', 'language_guide')
    OR user_id = auth.uid()
  );
```

### 14.3 Privacy controls

- **Ephemeral session mode:** transcript + audio deleted on session close; user_history corpus untouched.
- **"Wipe my history" action** in settings: deletes all `messages`, `rag_chunks WHERE corpus='user_history'`, and audio storage objects for the user. Does not delete `tasks` or `point_events` (those are *the user's plan*, not conversation history).
- **"Delete my account" action**: full cascade — auth.users, all tables, all storage objects.
- **No analytics, no telemetry.** No third-party tracking.

### 14.4 Audio storage

- Supabase Storage bucket `user-audio`, RLS: `auth.uid() = user_id` on the path.
- Signed URLs for playback, expire 1 hour.
- Audio for ephemeral sessions: deleted via storage API call when session closes.

---

## 15. Repo layout

```
restart-time/
├── README.md
├── .env.example
├── .gitignore                  (.env, content/restart/, secrets, build artifacts)
├── docker-compose.yml          (optional, for local dev)
├── backend/
│   ├── pyproject.toml          (uv; FastAPI, supabase, openai, httpx,
│   │                            pydantic, apscheduler, pywebpush,
│   │                            google-api-python-client, libsodium-py)
│   ├── src/
│   │   ├── main.py             (FastAPI app entry, CORS, scheduler start)
│   │   ├── config.py           (pydantic Settings; env vars)
│   │   ├── auth.py             (Supabase JWT middleware)
│   │   ├── routes/
│   │   │   ├── audio.py
│   │   │   ├── agent_plan.py
│   │   │   ├── agent_chat.py
│   │   │   ├── tasks.py
│   │   │   ├── sessions.py
│   │   │   ├── settings.py
│   │   │   ├── calendar.py
│   │   │   ├── reminders.py
│   │   │   └── push.py
│   │   ├── services/
│   │   │   ├── llm.py
│   │   │   ├── audio.py
│   │   │   ├── planning_flow.py
│   │   │   ├── extractor.py
│   │   │   ├── rag.py
│   │   │   ├── embeddings.py
│   │   │   ├── points.py
│   │   │   ├── calendar.py
│   │   │   ├── reminders.py
│   │   │   ├── ingestion.py
│   │   │   └── crypto.py        (libsodium token encryption)
│   │   ├── prompts/
│   │   │   ├── system_v1.en.md
│   │   │   ├── system_v1.he.md
│   │   │   ├── extractor_v1.md
│   │   │   ├── planning_slots_v1.en.md
│   │   │   ├── planning_slots_v1.he.md
│   │   │   ├── narrative_triggers.yaml
│   │   │   └── grounding_script.{en,he}.md
│   │   ├── db/
│   │   │   ├── client.py
│   │   │   ├── models.py        (Pydantic DTOs)
│   │   │   └── migrations/
│   │   │       └── 001_init.sql
│   │   └── tests/
│   │       ├── unit/
│   │       └── integration/
│   ├── content/
│   │   ├── strategies/
│   │   │   ├── en/
│   │   │   └── he/
│   │   ├── restart/             (.gitignore'd; private)
│   │   └── language_guide/
│   ├── evals/                   (~30 fixture conversations)
│   └── scripts/
│       ├── ingest.sh
│       └── generate_vapid_keys.py
├── frontend/                    (per Section 11.1)
└── docs/
    ├── prd.md                   (this PRD)
    └── superpowers/specs/       (this design doc)
```

---

## 16. Testing strategy

Pragmatic, not exhaustive — MVP, not enterprise software.

### 16.1 Backend (`pytest`)

- **Unit tests** for pure logic: `extractor.py` (model output → expected diff fixtures), `points.py` (event → score), `planning_flow.py` (state transitions), `crypto.py`.
- **Integration tests** with FastAPI `TestClient` against a Supabase test schema. Cover happy paths: planning session, on-demand session, task CRUD, settings, reminders.
- **Contract tests** for LLM service: mock LM Studio responses, verify error handling for malformed JSON, timeouts, empty replies.
- **No prompt-quality tests** in CI — that's evaluated by playtesting.

### 16.2 Frontend (`vitest` + Testing Library)

- Smoke: app renders, mode picker works, magic-link flow doesn't crash.
- VoiceButton records audio (mocked MediaRecorder), uploads, displays response.
- RTL layout test: `language=he` mirrors mic/back positions.
- Audio playback per message renders and triggers correctly.

### 16.3 End-to-end (`playwright`)

One script covering: log in → start planning → add a task → close session → see task in today list. Manual QA covers everything else for MVP.

### 16.4 LLM evaluation (lightweight)

`evals/` directory: ~30 bilingual fixture conversations, each tagged with what the agent SHOULD and SHOULD NOT do. Run before any prompt change. Pass criteria are subjective ("agent doesn't shame user", "agent doesn't invent tasks") — graded manually for MVP.

### 16.5 Manual playtesting

- **Hebrew-native review pass** mandatory before MVP demo (phrasing, peer-voice authenticity).
- **Restart staff playtest** before stakeholder demo (clinical / cultural appropriateness).
- **Listening test** for Hebrew TTS voice selection.

---

## 17. Deployment (MVP)

- Backend on a Tailnet-joined machine that can reach `100.122.52.86:1234`.
- Frontend served by Vite dev server during demos, or built static + served by FastAPI.
- Supabase cloud (Restart's project) accessible from anywhere.
- OpenAI (Whisper, TTS) called from backend over public internet.
- Google Calendar API called from backend.

**Local quickstart:**
```bash
cd backend && uv venv && uv pip install -e . && uv run uvicorn src.main:app --reload
cd frontend && pnpm install && pnpm dev
```

**Public deploy is post-MVP** — requires hosted-LLM swap.

---

## 18. Open questions / TODOs

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Final embedding model name (recommended `bge-m3`) | Leon | Before ingestion |
| 2 | Hebrew TTS voice selection (`shimmer` placeholder) | Leon + native listener | Before demo |
| 3 | Restart consent process for narrative content corpus | Restart | Before `restart` corpus ingestion |
| 4 | Final level-name ladder (Hebrew naming) | Restart | Before stakeholder demo |
| 5 | Hebrew-native phrasing review pass | Hebrew speaker | Before demo |
| 6 | Google Cloud Console OAuth consent screen verification | Leon | Before non-test users |
| 7 | VAPID keypair generation | Leon | Before push testing |
| 8 | `CALENDAR_ENCRYPTION_KEY` generation + key-rotation procedure | Leon | Before calendar sync |
| 9 | Decision: `gemma-4-e2b` model identity (not a published Google model name; user has loaded under that ID in LM Studio — confirm exact weights) | Leon | Before launch |
| 10 | Restart partnership: clinician partner for `strategies` corpus review | Restart | Nice-to-have |

---

## 19. Glossary

- **Restart** — Israeli wounded-leading-wounded peer-support organization. Three pillars: Makers (technology), Mentors (career/personal goals), Storytellers (narrative and voice).
- **Wound-birthday** — Restart's reframing of the date of injury as a "second birthday" — choosing life anew.
- **Carryover** — a task created in a previous session that is still open.
- **Soft when** — a free-text time qualifier ("morning", "after lunch") that is not a hard schedule, only a hint to the agent and a calendar input.
- **Size** — task complexity tag, `tiny | small | medium`. Used in lieu of duration estimates because PTSD/ADHD users have unreliable time estimation.
- **Ephemeral session** — a session whose transcript and audio are deleted on close. Tasks created in it survive.
- **User history corpus** — per-user RAG over the user's own past sessions. Privacy-isolated by RLS.
- **Grounding hatch** — always-visible button for a static 5-4-3-2-1-style grounding script. No LLM, no agent state.
