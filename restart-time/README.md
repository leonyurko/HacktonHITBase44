# Restart Time

A trauma-informed AI agent for time management, built for [Restart](https://www.restart-il.org.il/) — wounded-leading-wounded peer support for IDF soldiers.

**Status:** MVP scaffold (in progress). See `docs/superpowers/specs/2026-04-27-restart-time-management-agent-design.md` (PRD) and `docs/system-design.md` for the design.

---

## What this is

A bilingual (Hebrew + English) voice-and-text AI agent that helps users with PTSD or ADHD-like executive dysfunction plan and execute their day.

Two interaction modes:
- **Plan my day** — calm, predictable conversation driven by a deterministic state machine.
- **I need help right now** — flexible "I'm stuck" conversation with structured task extraction.

Trauma-informed by design: short messages, no shame language, earn-only points (no streaks), one next step at a time, always-visible grounding hatch, calm visual palette, voice ↔ text are equal peers.

---

## Stack

- **Backend:** FastAPI (Python ≥ 3.11), Supabase (Postgres + Auth + Storage + pgvector)
- **Frontend:** React 18 + Vite + TypeScript
- **LLM:** LM Studio over Tailnet (`google/gemma-4-e2b` or similar)
- **Embeddings:** Local model over Tailnet (`bge-m3` recommended)
- **Audio:** OpenAI Whisper-1 (STT) + TTS-1
- **Push:** Web Push (VAPID)

---

## Quickstart

### Prerequisites

- Python 3.11+ (`uv` recommended: `pip install uv`)
- Node 20+ + `pnpm`
- Supabase project with the migration applied (see `backend/src/db/migrations/`)
- LM Studio running on the Tailnet, with chat and embed models loaded
- (optional) OpenAI API key for STT/TTS

### 1. Configure environment

```bash
cp .env.example .env
# fill in SUPABASE_ANON_KEY (from Supabase project settings → API)
# everything else has sensible dev defaults
```

### 2. Run database migrations

In Supabase Studio → SQL Editor, paste and run `backend/src/db/migrations/001_init.sql`.

### 3. Start backend

```bash
cd backend
uv venv
uv pip install -e .
uv run uvicorn src.main:app --reload --port 8000
```

Backend now listening on `http://localhost:8000`. Health check:

```bash
curl http://localhost:8000/health
```

### 4. Start frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend now serving at `http://localhost:5173`.

### 5. Sign in

Open `http://localhost:5173`, enter your email, click the magic link. The first sign-in auto-creates `user_settings` with defaults.

---

## Project layout

```
restart-time/
├── docs/                   PRD + system-design + workflow (in repo root /docs)
├── backend/
│   ├── pyproject.toml
│   ├── src/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── auth.py
│   │   ├── routes/             FastAPI routes
│   │   ├── services/           pure business logic
│   │   ├── prompts/            versioned LLM prompts (md/yaml)
│   │   ├── db/                 Supabase client + migrations
│   │   └── tests/
│   ├── content/                RAG source files (gitignored where private)
│   ├── scripts/                CLI helpers
│   └── evals/                  prompt-eval fixtures
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── core/               RN-portable layer
        ├── components/         web-only UI
        └── styles/             tokens, globals, RTL
```

---

## What works in this scaffold (MVP v0)

- Project scaffolding, env, migrations
- Supabase JWT auth middleware
- LM Studio chat client (streaming + non-streaming)
- On-demand chat: `/agent/chat/{start,turn,end}` with SSE streaming, two-call extractor pattern
- Audio: `/audio/{stt,tts}` (returns 503 cleanly if `OPENAI_API_KEY` is unset)
- Tasks CRUD: `/tasks/*`
- Sessions: `/sessions/*`
- Settings: `/settings`
- Health probe: `/health`
- Frontend: magic-link auth, mode picker, on-demand chat with text + voice composer, message list with audio playback, grounding hatch
- Trauma-informed CSS tokens (color, motion, typography)

## What's stubbed (returns 501 with TODO marker)

- Planning state machine (`/agent/plan/*`) — skeleton in place; states are stubs
- RAG retrieval (`services/rag.py` + ingestion CLI) — schema ready; retrieval logic stubbed
- Google Calendar sync (`/calendar/*`) — endpoint shells; OAuth flow not wired
- Web push reminders (`/reminders`, `/push/subscribe`) — endpoint shells; scheduler not started
- Points UI (`ProgressCard`, `LevelUpScreen`) — backend `points` service is real; frontend display stubbed
- User-history ingestion at session close — hook present, ingestion task stubbed

See PRD §18 (Open questions) and the TODO markers in code for the build queue.

---

## Configuration

All config via `.env`. See `.env.example` for the full list.

Critical env vars:

| Var | What | Required for |
|---|---|---|
| `SUPABASE_URL` | Project URL | All routes |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend full-access key | All routes |
| `SUPABASE_ANON_KEY` | Frontend public key | Frontend auth |
| `LOCAL_BASE_URL` | LM Studio Tailnet URL | Agent routes |
| `LOCAL_MODEL` | Chat model name | Agent routes |
| `EMBEDDING_MODEL` | Embed model name | RAG (post-MVP) |
| `OPENAI_API_KEY` | OpenAI key | STT/TTS |
| `VAPID_*` | Web push keys | Reminders (post-MVP) |
| `CALENDAR_ENCRYPTION_KEY` | Token encryption | Calendar (post-MVP) |

---

## Development notes

### Layering rule

`routes/` imports `services/`. `services/` imports `db/`. **Services never import FastAPI.** Pure logic never imports the framework. This is enforced by code review (and conscience).

### Frontend portability

Anything in `frontend/src/core/` must not import from `react-dom`, `lucide-react`, or browser-only APIs. The intent is to swap `components/` for React Native primitives later without touching `core/`.

### Prompts are versioned

`backend/src/prompts/system_v1.{en,he}.md` — bumping versions is explicit, with old versions retained for diffing. Prompts are the most fragile part of the system; treat them like code.

### Trauma-informed UX

Read `docs/workflow.md` before changing any user-visible string, color, or animation. The defaults are not arbitrary.

---

## License

Private; no license attached. Coordinate with Restart before any redistribution of corpus content.
