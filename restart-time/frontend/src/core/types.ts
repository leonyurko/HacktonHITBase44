// Mirrors backend Pydantic models. Keep in sync.

export type Language = 'en' | 'he';
export type SessionMode = 'planning' | 'on_demand';
export type TaskState = 'open' | 'done' | 'deferred' | 'dropped';
export type TaskSize = 'tiny' | 'small' | 'medium';
export type MessageRole = 'user' | 'assistant' | 'system';
export type TtsPlaybackMode = 'always' | 'voice_turns_only' | 'never';
export type PlanningTime = 'morning' | 'evening' | 'both' | 'none';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  state: TaskState;
  size?: TaskSize | null;
  soft_when?: string | null;
  deferred_to?: string | null;
  created_in_session?: string | null;
  calendar_event_id?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  audio_path?: string | null;
  audio_signed_url?: string | null;
  language?: Language | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  mode: SessionMode;
  language: Language;
  ephemeral: boolean;
  started_at: string;
  ended_at?: string | null;
  summary?: string | null;
}

export interface UserSettings {
  user_id: string;
  language: Language;
  voice_autoplay: boolean;
  tts_playback_mode: TtsPlaybackMode;
  quiet_visual_mode: boolean;
  preferred_planning_time: PlanningTime;
  notification_quiet_start?: string | null;
  notification_quiet_end?: string | null;
  notification_digest_mode: boolean;
  notification_digest_time?: string | null;
}

export interface Level {
  number: number;
  name_en: string;
  name_he: string;
  threshold?: number;
}

export interface Progress {
  total_points: number;
  level: Level;
  next_level: Level | null;
  days_engaged_this_month: number;
}

export interface ExtractedDiff {
  added: Array<{ id: string; title: string; size?: TaskSize | null }>;
  completed: Array<{ id: string; points: number; multiplier: number }>;
  deferred: Array<{ id: string; until?: string | null }>;
  dropped: Array<{ id: string }>;
}

export type SSEEvent =
  | { event: 'token'; data: { text: string } }
  | { event: 'rewrite'; data: { text: string } }
  | { event: 'done'; data: { message_id: string; language?: Language } }
  | { event: 'extracted'; data: ExtractedDiff }
  | { event: 'error'; data: { error: string; message?: string } };
