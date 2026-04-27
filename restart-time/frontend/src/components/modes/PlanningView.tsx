/**
 * Planning view — STUB.
 *
 * This is a thin one-shot wrapper around /agent/plan/{start,turn,end} for the
 * MVP scaffold. The full state machine (greet → review_carryover →
 * propose_today → confirm → close) is documented in PRD §6.1.
 *
 * To complete: render different UI affordances per `state`, route the
 * carryover prompts through a dedicated component, and surface the running
 * plan as it's built.
 */
import { useEffect, useRef, useState } from 'react';
import { endPlan, planTurn, startPlan, synthesize } from '../../core/agent';
import { playAudioBlob } from '../../core/audio';
import type { UserSettings } from '../../core/types';
import ChatHeader from '../chat/ChatHeader';
import Composer from '../chat/Composer';
import MessageList, { type UiMessage } from '../chat/MessageList';

interface Props {
  settings: UserSettings;
  onExit: () => void;
}

export default function PlanningView({ settings, onExit }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(true);
  const [startedAt] = useState<Date>(() => new Date());
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startPlan(settings.language).then((r) => {
      setSessionId(r.session_id);
      setMessages([
        {
          id: `assistant-greet-${r.session_id}`,
          role: 'assistant',
          content: r.assistant_message,
        },
      ]);
      setBusy(false);
    });
  }, [settings.language]);

  async function send(text: string, audioPath: string | null, fromVoice: boolean) {
    if (!sessionId || busy) return;
    setBusy(true);
    const userId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userId, role: 'user', content: text }]);
    try {
      const r = await planTurn({
        session_id: sessionId,
        user_message: text,
        audio_path: audioPath,
      });
      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: r.assistant_message },
      ]);
      const mode = settings.tts_playback_mode;
      const shouldPlay = mode === 'always' || (mode === 'voice_turns_only' && fromVoice);
      if (shouldPlay && settings.voice_autoplay) {
        try {
          const blob = await synthesize(r.assistant_message, r.language ?? settings.language);
          await playAudioBlob(blob);
        } catch {}
      }
    } catch (e) {
      console.error('plan_turn_failed', e);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (sessionId) {
      try {
        await endPlan(sessionId);
      } catch {}
    }
    onExit();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <ChatHeader
        language={settings.language}
        onBack={() => void close()}
        startedAt={startedAt}
      />
      <MessageList messages={messages} />
      <Composer
        language={settings.language}
        sessionId={sessionId}
        onSend={send}
        disabled={!sessionId || busy}
      />
    </div>
  );
}
