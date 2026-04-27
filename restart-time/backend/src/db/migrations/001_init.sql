-- Restart Time — initial schema
-- Run in Supabase SQL Editor on a fresh project.
-- See docs/superpowers/specs/2026-04-27-restart-time-management-agent-design.md §5

-- Extensions ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =========================================================================
-- user_settings
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language                      TEXT NOT NULL DEFAULT 'en'
                                  CHECK (language IN ('en', 'he')),
  voice_autoplay                BOOLEAN NOT NULL DEFAULT TRUE,
  tts_playback_mode             TEXT NOT NULL DEFAULT 'voice_turns_only'
                                  CHECK (tts_playback_mode IN ('always', 'voice_turns_only', 'never')),
  quiet_visual_mode             BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_planning_time       TEXT NOT NULL DEFAULT 'morning'
                                  CHECK (preferred_planning_time IN ('morning', 'evening', 'both', 'none')),
  notification_quiet_start      TIME DEFAULT '21:00',
  notification_quiet_end        TIME DEFAULT '09:00',
  notification_digest_mode      BOOLEAN NOT NULL DEFAULT FALSE,
  notification_digest_time      TIME DEFAULT '09:00',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_self" ON public.user_settings
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- sessions
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('planning', 'on_demand')),
  language     TEXT NOT NULL CHECK (language IN ('en', 'he')),
  ephemeral    BOOLEAN NOT NULL DEFAULT FALSE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  summary      TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_started
  ON public.sessions (user_id, started_at DESC);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_self" ON public.sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- tasks
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  state               TEXT NOT NULL DEFAULT 'open'
                        CHECK (state IN ('open', 'done', 'deferred', 'dropped')),
  size                TEXT CHECK (size IN ('tiny', 'small', 'medium')),
  soft_when           TEXT,
  deferred_to         DATE,
  created_in_session  UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  calendar_event_id   TEXT,
  calendar_synced_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_state
  ON public.tasks (user_id, state, deferred_to);
CREATE INDEX IF NOT EXISTS idx_tasks_user_created
  ON public.tasks (user_id, created_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_self" ON public.tasks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- messages
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content      TEXT NOT NULL,
  audio_path   TEXT,
  language     TEXT CHECK (language IN ('en', 'he')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON public.messages (session_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_via_session" ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = messages.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = messages.session_id AND s.user_id = auth.uid()
    )
  );

-- =========================================================================
-- task_events (append-only)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.task_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL
                CHECK (event_type IN ('created', 'completed', 'deferred', 'dropped', 'edited')),
  session_id   UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  delta_json   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task
  ON public.task_events (task_id, created_at);

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_events_via_task" ON public.task_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_events.task_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_events.task_id AND t.user_id = auth.uid()
    )
  );

-- =========================================================================
-- point_events (earn-only ledger)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.point_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL
                CHECK (source_type IN (
                  'task_complete', 'planning_session', 'app_open_day',
                  'carryover_done', 'multiplier_bonus'
                )),
  source_id    UUID,
  points       INTEGER NOT NULL CHECK (points >= 0),
  multiplier   INTEGER NOT NULL DEFAULT 1 CHECK (multiplier >= 1),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_events_user
  ON public.point_events (user_id, created_at DESC);

ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "point_events_self" ON public.point_events
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- rag_chunks (pgvector)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.rag_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus       TEXT NOT NULL
                CHECK (corpus IN ('strategies', 'restart', 'user_history', 'language_guide')),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  language     TEXT NOT NULL CHECK (language IN ('en', 'he')),
  source_ref   TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  chunk_text   TEXT NOT NULL,
  embedding    vector(1024),
  metadata     JSONB,
  redacted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corpus, source_ref, chunk_index)
);

-- HNSW for fast ANN. Tunable.
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_filter
  ON public.rag_chunks (corpus, user_id, language)
  WHERE redacted_at IS NULL;

ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rag_chunks_read" ON public.rag_chunks
  FOR SELECT USING (
    corpus IN ('strategies', 'restart', 'language_guide')
    OR user_id = auth.uid()
  );

-- Writes only via service role; no user-facing INSERT policy.

-- =========================================================================
-- planning_flow_state
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.planning_flow_state (
  session_id    UUID PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  current_step  TEXT NOT NULL
                  CHECK (current_step IN (
                    'greet', 'review_carryover', 'propose_today', 'confirm', 'close'
                  )),
  step_data     JSONB,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.planning_flow_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_flow_via_session" ON public.planning_flow_state
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = planning_flow_state.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = planning_flow_state.session_id AND s.user_id = auth.uid()
    )
  );

-- =========================================================================
-- reminders + push_subscriptions
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.reminders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id           UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  delivery_channel  TEXT NOT NULL DEFAULT 'webpush'
                     CHECK (delivery_channel IN ('webpush', 'fcm', 'apns', 'email')),
  body_override     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON public.reminders (status, scheduled_at)
  WHERE status = 'pending';

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_self" ON public.reminders
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_self" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- google_oauth_tokens
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_access_token   TEXT NOT NULL,
  encrypted_refresh_token  TEXT NOT NULL,
  scope                    TEXT NOT NULL,
  expires_at               TIMESTAMPTZ NOT NULL,
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_tokens_self" ON public.google_oauth_tokens
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- Auto-create user_settings when a new auth user is added
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- Storage bucket for user audio
-- =========================================================================
-- NOTE: Storage buckets are created via Supabase Studio or supabase CLI.
-- Required bucket: 'user-audio' (private). Apply this policy:
--
--   CREATE POLICY "user_audio_self" ON storage.objects
--     FOR ALL USING (
--       bucket_id = 'user-audio'
--       AND (storage.foldername(name))[1] = auth.uid()::text
--     );
--
-- We document this here; the migration cannot create the bucket itself.
