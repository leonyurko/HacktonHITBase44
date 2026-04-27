# Restart Time Agent — System Design

**Companion to:** `docs/superpowers/specs/2026-04-27-restart-time-management-agent-design.md`
**Audience:** Engineers building or extending the system.
**Scope:** Technical architecture, runtime topology, sequence diagrams, and integration contracts.

---

## 1. Runtime topology

```
                    ┌──────────────────────────────────────────┐
                    │           Browser (React + Vite)          │
                    │  ┌────────────────────────────────────┐  │
                    │  │  core/   (RN-portable layer)       │  │
                    │  │   api.ts, auth.ts, agent.ts,       │  │
                    │  │   audio.ts, types.ts, i18n.ts      │  │
                    │  └────────────────────────────────────┘  │
                    │  ┌────────────────────────────────────┐  │
                    │  │  components/  (web-only)           │  │
                    │  │   chat, modes, tasks, grounding    │  │
                    │  └────────────────────────────────────┘  │
                    └──────────────────────────────────────────┘
                                       │
                                       │  HTTPS
                                       │  REST + SSE + multipart
                                       ▼
        ┌───────────────────────────────────────────────────────┐
        │                   FastAPI backend                     │
        │                                                       │
        │   Auth middleware  ──▶  Routes  ──▶  Services         │
        │   (Supabase JWKS)        │             │              │
        │                          │             ├─▶ LLM        │
        │                          │             ├─▶ Audio      │
        │                          │             ├─▶ Extractor  │
        │                          │             ├─▶ RAG        │
        │                          │             ├─▶ Embeddings │
        │                          │             ├─▶ Points     │
        │                          │             ├─▶ Calendar   │
        │                          │             └─▶ Reminders  │
        │                                                       │
        │   APScheduler tick (1 min) ──▶ pywebpush dispatcher   │
        └───────────────────────────────────────────────────────┘
                  │           │             │             │
                  ▼           ▼             ▼             ▼
          ┌───────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐
          │ LM Studio │ │ Supabase │ │  OpenAI    │ │  Google  │
          │ (Tailnet) │ │  (cloud) │ │  (public)  │ │  (public)│
          │           │ │          │ │            │ │          │
          │ chat:     │ │ auth     │ │ Whisper-1  │ │ Calendar │
          │ gemma-... │ │ Postgres │ │ TTS-1      │ │ v3       │
          │ embed:    │ │ pgvector │ │            │ │ OAuth2   │
          │ bge-m3    │ │ Storage  │ │            │ │          │
          └───────────┘ └──────────┘ └────────────┘ └──────────┘
```

**Network reachability (MVP):**

| Component | Reaches | Reachable from |
|---|---|---|
| Browser | Backend (HTTPS) | User's network |
| Backend | LM Studio (Tailnet), Supabase, OpenAI, Google | Browser only |
| LM Studio | — | Backend (Tailnet) |
| Supabase | — | Browser (via SDK) and Backend |

The backend is the only component that crosses Tailnet ↔ public-internet trust boundaries. The browser never sees Tailnet IPs.

---

## 2. Layered module map

### Backend (`backend/src/`)

```
main.py               app entry; CORS, route registration, scheduler boot
config.py             pydantic Settings; env var loading and validation
auth.py               FastAPI dependency that validates Supabase JWT against JWKS

db/
  client.py           Supabase Python client (service role)
  models.py           Pydantic DTOs for all tables
  migrations/
    001_init.sql      initial schema (tables, indexes, RLS policies, triggers)

services/             pure business logic; no FastAPI imports
  llm.py              OpenAI-compatible client → LM Studio
  audio.py            OpenAI client → Whisper STT, TTS-1
  extractor.py        runs Call 2 of on-demand turn; validates JSON via Pydantic
  planning_flow.py    state machine (greet → carryover → propose → confirm → close)
  rag.py              pgvector retrieval; per-corpus retrieval policies
  embeddings.py       OpenAI-compat client → local embed model on Tailnet
  points.py           earn-only point ledger; level lookup; multiplier roll
  calendar.py         Google Calendar client; OAuth token mgmt; sync semantics
  reminders.py        scheduled push dispatch; quiet-hours and digest logic
  ingestion.py        CLI entry point: corpus → embeddings; idempotent
  crypto.py           libsodium symmetric encryption for OAuth tokens

prompts/              versioned templates (markdown + YAML)
  system_v1.{en,he}.md
  extractor_v1.md
  planning_slots_v1.{en,he}.md
  narrative_triggers.yaml
  grounding_script.{en,he}.md

routes/               thin FastAPI wrappers; call services
  audio.py
  agent_plan.py       /agent/plan/{start,turn,end}
  agent_chat.py       /agent/chat/{start,turn,end}; SSE
  tasks.py
  sessions.py
  settings.py
  calendar.py         /calendar/{status,connect,disconnect,sync,events}
  reminders.py
  push.py             /push/subscribe
  health.py
```

**Layering rule:** routes import services; services import db. Services NEVER import from routes. Pure logic NEVER imports FastAPI. This means we can write unit tests without spinning up the app.

### Frontend (`frontend/src/`)

```
core/                 RN-portable; no react-dom, no DOM-only APIs
  types.ts            shared with backend via mirrored Pydantic shapes
  api.ts              fetch wrapper, JSON encoding, error normalization
  sse.ts              EventSource wrapper with auto-reconnect
  auth.ts             Supabase client, useSession hook
  agent.ts            high-level: planTurn(), chatTurn(), endSession()
  audio.ts            record/encode/upload primitives; mime detection
  calendar.ts         /calendar/* client
  reminders.ts        /push/subscribe + /reminders/* client
  i18n.ts             string tables; useT() hook
  storage.ts          localStorage wrapper (settings cache, draft messages)

components/           web-only React UI
  auth/MagicLink.tsx
  modes/{ModePicker,PlanningView,OnDemandView}.tsx
  chat/{MessageList,Composer,VoiceButton,AudioPlayback}.tsx
  tasks/{TaskList,TaskItem}.tsx
  progress/{ProgressCard,LevelUpScreen}.tsx
  grounding/{GroundingButton,GroundingScript}.tsx
  settings/SettingsSheet.tsx
  calendar/CalendarConnectCard.tsx
  ui/                  generic Button, Sheet, Toggle, Sheet (shadcn-ish)

styles/
  tokens.css          color, spacing, font, motion tokens
  globals.css         resets, body, base
  rtl.css             RTL-specific overrides
```

**Portability contract:** anything importing from `react-dom`, `lucide-react`, or browser-specific APIs lives in `components/`. RN port = swap `components/` and provide platform-specific shims for `core/audio.ts` and `core/storage.ts`.

---

## 3. Sequence diagrams

### 3.1 On-demand turn (voice path)

```
User      Browser              Backend         LM Studio    OpenAI       Supabase
 │          │                     │                │           │            │
 │ hold mic │                     │                │           │            │
 ├─────────▶│ MediaRecorder start │                │           │            │
 │          │ (waveform, timer)   │                │           │            │
 │ release  │                     │                │           │            │
 ├─────────▶│ blob assembled      │                │           │            │
 │          │                     │                │           │            │
 │          │ POST /audio/stt     │                │           │            │
 │          ├────────────────────▶│ multipart blob │           │            │
 │          │                     │ → Whisper-1    │           │            │
 │          │                     ├──────────────────────────▶ │            │
 │          │                     │           transcript      │            │
 │          │                     │◀──────────────────────────┤            │
 │          │                     │ store audio in Storage    │            │
 │          │                     ├─────────────────────────────────────▶│
 │          │ {text, audio_path}  │                │           │            │
 │          │◀────────────────────┤                │           │            │
 │          │                     │                │           │            │
 │          │ POST /agent/chat/   │                │           │            │
 │          │       turn (SSE)    │                │           │            │
 │          ├────────────────────▶│                │           │            │
 │          │                     │ load session, settings,   │            │
 │          │                     │ recent messages, RAG hits ├──────────▶ │
 │          │                     │◀──────────────────────────┤            │
 │          │                     │                │           │            │
 │          │                     │ build prompt   │           │            │
 │          │                     │ stream chat    │           │            │
 │          │                     ├───────────────▶│           │            │
 │          │ ←─event: token─╮    │ tokens stream  │           │            │
 │          │ ←─event: token─┤    │◀───────────────┤           │            │
 │          │ ←─event: token─┤    │ ─emit SSE─────▶            │            │
 │          │ ←─event: token─╯    │                │           │            │
 │          │ ←─event: done       │ save assistant message ─────────────▶ │
 │          │                     │                │           │            │
 │          │                     │ extractor call │           │            │
 │          │                     ├───────────────▶│           │            │
 │          │                     │ JSON diff      │           │            │
 │          │                     │◀───────────────┤           │            │
 │          │                     │ validate, apply diff       │            │
 │          │                     │ → tasks + task_events ────────────────▶│
 │          │                     │ → award points                          │
 │          │ ←─event: extracted  │                │           │            │
 │          │                     │                │           │            │
 │          │ POST /audio/tts     │                │           │            │
 │          ├────────────────────▶│ TTS-1 ─────────────────────▶            │
 │          │                     │ ←──────────────────────────┤            │
 │          │ audio stream ◀──────┤                │           │            │
 │          │ <audio>.play()      │                │           │            │
 │          │                     │                │           │            │
 │ hears reply                    │                │           │            │
 │ sees task list update          │                │           │            │
```

### 3.2 Planning turn (state machine)

```
User      Browser              Backend         LM Studio       Supabase
 │          │                     │                │              │
 │ tap "Plan my day"              │                │              │
 ├─────────▶│ POST /agent/plan/   │                │              │
 │          │       start         │                │              │
 │          ├────────────────────▶│                │              │
 │          │                     │ create session ─────────────▶ │
 │          │                     │ load prior summary, days gap  │
 │          │                     │◀──────────────────────────────┤
 │          │                     │                │              │
 │          │                     │ planning_flow  │              │
 │          │                     │ .greet()       │              │
 │          │                     ├───────────────▶│              │
 │          │                     │ greeting text  │              │
 │          │                     │◀───────────────┤              │
 │          │                     │ load carryovers ────────────▶ │
 │          │                     │◀──────────────────────────────┤
 │          │ {session_id,        │                │              │
 │          │  assistant_msg,     │                │              │
 │          │  state:'greet'}     │                │              │
 │          │◀────────────────────┤                │              │
 │          │                     │                │              │
 │ user types/speaks reply        │                │              │
 ├─────────▶│ POST /agent/plan/   │                │              │
 │          │       turn          │                │              │
 │          ├────────────────────▶│                │              │
 │          │                     │ load flow_state ────────────▶ │
 │          │                     │ run state_fn(reply)           │
 │          │                     │ → next_state, side_effects    │
 │          │                     │ ↳ may apply task changes ────▶│
 │          │                     │ ↳ may award points       ────▶│
 │          │                     │ persist new flow_state ─────▶ │
 │          │ {assistant_msg,     │                │              │
 │          │  state:'carryover', │                │              │
 │          │  done:false,        │                │              │
 │          │  applied_diff?}     │                │              │
 │          │◀────────────────────┤                │              │
 │          │                     │                │              │
 │ ... loop until done=true ...                                   │
 │                                │                │              │
 │ on done=true:                  │                │              │
 │          │                     │ generate summary─────────────▶│
 │          │                     │ end session                   │
 │          │                     │ trigger user_history          │
 │          │                     │ ingestion (background)        │
```

### 3.3 Reminder dispatch tick

```
APScheduler        reminders svc      pywebpush     Browser SW
    │                   │                │              │
    │ tick (every 1m)   │                │              │
    ├──────────────────▶│                │              │
    │                   │ SELECT *       │              │
    │                   │ FROM reminders │              │
    │                   │ WHERE pending  │              │
    │                   │   AND scheduled_at <= now()   │
    │                   │ AND not in quiet_hours        │
    │                   │                │              │
    │                   │ for each:      │              │
    │                   │ load push_subs │              │
    │                   │ build payload  │              │
    │                   ├───────────────▶│              │
    │                   │                │ HTTPS push  ▶│
    │                   │                │              │ show notification
    │                   │ mark sent      │              │
    │                   │ status='sent'  │              │
    │                   │ delivered_at   │              │
```

---

## 4. Integration contracts

### 4.1 LLM (LM Studio) — chat completions

OpenAI-compatible. Endpoint: `${LOCAL_BASE_URL}/chat/completions`.

```
POST /chat/completions
Body:
  model: "google/gemma-4-e2b" | configured value
  messages: [{role, content}, ...]
  stream: true | false
  temperature: 0.7    // hard ceiling per call
  max_tokens: 200     // hard ceiling for reply turns
  ...
```

**Resilience:**
- Connection errors → log, return calm UI message ("couldn't reach the server...").
- Streaming aborts mid-reply → emit accumulated tokens + `event: error` → save partial.
- Empty replies (`""`) → retry once, then surface a fallback ("let me try again — what was that?").

### 4.2 LLM — embeddings

Same Tailnet endpoint, OpenAI-compatible. `${LOCAL_BASE_URL}/embeddings`.

```
POST /embeddings
Body:
  model: env EMBEDDING_MODEL (e.g., "bge-m3")
  input: "..." | ["..."]
Returns:
  data: [{embedding: [float; N]}]
  model: ...
```

Caller responsible for batching. Default batch size = 32.

### 4.3 Whisper / TTS

OpenAI's official SDK. Whisper transcription, TTS-1 synthesis (voice 'echo' for EN, 'shimmer' for HE pending listening test).

Audio routes degrade to HTTP 503 with `{ error: "audio_not_configured" }` when `OPENAI_API_KEY` is empty.

### 4.4 Supabase

- Backend uses **service role key**, bypassing RLS, but explicitly `SET LOCAL "request.jwt.claims" = ...` before user-scoped queries to maintain RLS semantics. Pattern: `with_user(user_id) { ... }` context manager in `db/client.py`.
- Storage uploads use service role + path-based authorization in our code; bucket policies are belt-and-suspenders.

### 4.5 Google Calendar

OAuth 2.0 via Supabase's Google provider. Backend stores encrypted tokens, refreshes on expiry.

API endpoints used:
- `events.list` (read user's calendar to avoid double-booking)
- `events.insert`, `events.patch`, `events.delete` (sync agent-managed tasks)
- `events.watch` (webhook setup, post-MVP if MVP relies on polling)

### 4.6 Web push (VAPID)

`pywebpush` library. Public key (already provisioned: `BO2nHpMEZOPQGt3rn_s7UHX_uWIBZugUpsrGnu5aNznsEUcZIVzAADG7OnLIMoybScjPtIMTEmZI5Ep7KU4QzBU`) shipped to frontend. Private key in backend env. Subject email: `admin@eitan-app.com` (placeholder).

---

## 5. Concurrency & async

- **FastAPI runs async** (`uvicorn` with `asyncio` loop). All I/O is `await`ed.
- **APScheduler** runs in-process (`AsyncIOScheduler`). Single instance. Adequate for MVP; multi-instance deploy will need a proper queue (Redis + RQ, or Celery).
- **Supabase Python client** is sync-by-default; we wrap in `asyncio.to_thread` for non-blocking calls. This is a known wart; consider `asyncpg` direct for hot paths post-MVP.
- **LM Studio streaming** via `httpx.AsyncClient.stream()`. SSE forwarding from LLM stream → client SSE without buffering.
- **Two LLM calls per on-demand turn** are sequential in MVP (reply must complete before extractor starts). Could parallelize in v1.1 (give the extractor the user message alone), but reply-then-extract gives the extractor more context.

---

## 6. Failure modes & recovery

| Failure | Behavior |
|---|---|
| LM Studio unreachable | Health probe shows red. Agent endpoints return 503 with calm message; UI prompts retry. |
| LM Studio returns malformed JSON in extractor | Pydantic validation catches; warning logged; conversation continues, no diff applied. |
| Whisper times out | Audio route returns 504; UI shows "couldn't transcribe — try typing?" and keeps the audio blob for retry. |
| TTS times out | Reply already shown as text; UI shows the play icon as if `tts_playback_mode='never'`. User can tap to retry. |
| Supabase write fails mid-turn | Reply already streamed to user; error logged. Background task reconciles via task_events idempotency on next operation. |
| Google webhook setup fails | Fallback to 5-minute polling. Health probe reports degraded calendar status. |
| Push delivery fails (subscription expired) | Subscription marked expired; user re-prompted to re-enable on next app open. |

**Idempotency:**
- Task creation extractor outputs are normalized so re-running on the same message doesn't double-create.
- Reminder dispatch checks `delivered_at IS NULL` before sending.
- RAG ingestion keys on `(corpus, source_ref, chunk_index)` UNIQUE.

---

## 7. Observability (MVP-light)

- **Logging:** structured JSON logs via `structlog`. Levels: ERROR (anything user-visible), WARNING (extractor failed, retry succeeded), INFO (turn taken, session opened/closed).
- **No metrics, no tracing, no Sentry** in MVP. Add when there's a user base.
- **Health endpoint** does live probes; cheap external monitor can poll it.

---

## 8. Configuration

All config via env vars (`pydantic-settings`). See `.env.example` for the full list.

**Critical secrets:**
- `SUPABASE_SERVICE_ROLE_KEY` — full DB access; never logged, never to client.
- `OPENAI_API_KEY` — for STT/TTS only.
- `CALENDAR_ENCRYPTION_KEY` — symmetric key for OAuth token encryption. Generated once via `scripts/generate_keys.py`.
- `VAPID_PRIVATE_KEY` — web push signing key.

**Tailnet endpoints:**
- `LOCAL_BASE_URL=http://100.122.52.86:1234/v1` — chat completions.
- `EMBEDDING_BASE_URL=${LOCAL_BASE_URL}` — embeddings (same host).
- `LOCAL_MODEL` — chat model name in LM Studio (e.g., `google/gemma-4-e2b`).
- `EMBEDDING_MODEL` — embed model name (e.g., `bge-m3`).

**Feature flags (env-controlled, no flag service):**
- `ENABLE_CALENDAR=false` (default off in MVP)
- `ENABLE_REMINDERS=false`
- `ENABLE_RAG=true`

---

## 9. Security & privacy posture

- **JWT verification** at the FastAPI middleware level for every authenticated request. JWKS cached for 1 hour.
- **RLS as defense-in-depth.** Even though backend uses service role, we set `request.jwt.claims` so policies fire as a second layer.
- **No PII in logs.** User content is logged only as session_id + length, never message text.
- **OpenAI privacy mode.** API requests sent with `X-Anthropic-...`-style headers — wait, scratch that, this is OpenAI. We rely on OpenAI's API data-retention defaults (no training opt-out applied; flag for review with Restart). Whisper requests carry only audio bytes, no user metadata.
- **Tokens encrypted at rest** (Google OAuth). At-rest encryption for Supabase row data is Supabase-managed.
- **TLS everywhere.** Frontend ↔ backend HTTPS in production. Browser ↔ Supabase HTTPS by default.

---

## 10. Path to production / mobile

**To go from MVP to production web:**
1. Move backend off Tailnet → hosted LLM endpoint (NVIDIA NIM, OpenAI, Anthropic, or self-hosted GPU).
2. Set up CI/CD (GitHub Actions → Fly.io or Railway).
3. Configure custom domain + Cloudflare in front of FastAPI.
4. Restrict CORS to production origins only.
5. Run Hebrew-native review pass + clinical review.
6. Generate production VAPID keys (rotate from dev keys).
7. Submit Google OAuth consent screen for verification.

**To go from web to React Native:**
1. Initialize RN project (Expo router recommended).
2. Copy `frontend/src/core/` verbatim. Replace browser-only deps (e.g., `localStorage` → `AsyncStorage`).
3. Rebuild components in `components/` for native primitives.
4. Replace `MediaRecorder` audio with `expo-av`.
5. Switch push delivery to FCM/APNs (`reminders.delivery_channel` already supports these).
6. Native magic-link deep link handling for Supabase auth.

The schema, API, and `core/` layer don't change.
