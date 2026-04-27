import { apiPost, sseStream, apiPostAudio } from './api';
import type { ExtractedDiff, Language } from './types';

export async function startChat(opts: { ephemeral?: boolean; language?: Language } = {}) {
  return apiPost<{ ok: boolean; session_id: string; language: Language }>(
    '/agent/chat/start',
    opts,
  );
}

export interface ChatTurnHandlers {
  onToken: (text: string) => void;
  onRewrite?: (text: string) => void;
  onDone: (messageId: string, language?: Language) => void;
  onExtracted: (diff: ExtractedDiff) => void;
  onError: (err: { error: string; message?: string }) => void;
}

export async function chatTurn(
  body: { session_id: string; user_message: string; audio_path?: string | null },
  handlers: ChatTurnHandlers,
): Promise<void> {
  try {
    for await (const evt of sseStream('/agent/chat/turn', body)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        continue;
      }
      switch (evt.event) {
        case 'token':
          handlers.onToken((parsed as { text: string }).text);
          break;
        case 'rewrite':
          handlers.onRewrite?.((parsed as { text: string }).text);
          break;
        case 'done': {
          const p = parsed as { message_id: string; language?: Language };
          handlers.onDone(p.message_id, p.language);
          break;
        }
        case 'extracted':
          handlers.onExtracted(parsed as ExtractedDiff);
          break;
        case 'error':
          handlers.onError(parsed as { error: string; message?: string });
          break;
      }
    }
  } catch (e) {
    handlers.onError({ error: 'stream_failed', message: String(e) });
  }
}

export async function endChat(session_id: string) {
  return apiPost<{ ok: boolean; summary: string }>('/agent/chat/end', { session_id });
}

// --- Planning mode (stubbed flow) -------------------------------------------

export async function startPlan(language?: Language) {
  return apiPost<{
    ok: boolean;
    session_id: string;
    assistant_message: string;
    state: string;
  }>('/agent/plan/start', { language });
}

export async function planTurn(body: {
  session_id: string;
  user_message: string;
  audio_path?: string | null;
}) {
  return apiPost<{
    ok: boolean;
    assistant_message: string;
    state: string;
    done: boolean;
    language?: Language;
  }>('/agent/plan/turn', body);
}

export async function endPlan(session_id: string) {
  return apiPost<{ ok: boolean; summary: string }>('/agent/plan/end', { session_id });
}

// --- TTS ---------------------------------------------------------------------

export async function synthesize(text: string, language: Language): Promise<Blob> {
  return apiPostAudio('/audio/tts', { text, language });
}
