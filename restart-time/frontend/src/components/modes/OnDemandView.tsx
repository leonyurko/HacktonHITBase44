import { useEffect, useRef, useState } from 'react';
import { startChat, chatTurn, endChat, synthesize } from '../../core/agent';
import { playAudioBlob } from '../../core/audio';
import { getStrings } from '../../core/i18n';
import type { ExtractedDiff, Language, UserSettings } from '../../core/types';
import ChatHeader from '../chat/ChatHeader';
import Composer from '../chat/Composer';
import MessageList, { type UiMessage } from '../chat/MessageList';

interface Props {
  settings: UserSettings;
  onExit: () => void;
}

export default function OnDemandView({ settings, onExit }: Props) {
  const t = getStrings(settings.language);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState<Date>(() => new Date());
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startChat({ language: settings.language }).then((r) => setSessionId(r.session_id));
  }, [settings.language]);

  async function send(text: string, audioPath: string | null, fromVoice: boolean) {
    if (!sessionId || streaming) return;
    setError(null);

    const userMsg: UiMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const placeholderId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: placeholderId, role: 'assistant', content: '', streaming: true },
    ]);
    setStreaming(true);

    let accumulated = '';
    let displayed = '';
    let replyLanguage: Language = settings.language;

    await chatTurn(
      { session_id: sessionId, user_message: text, audio_path: audioPath },
      {
        onToken: (delta) => {
          accumulated += delta;
          displayed = accumulated;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: displayed } : m,
            ),
          );
        },
        onRewrite: (cleaned) => {
          // Server stripped action markers; replace what we showed with the cleaned version.
          displayed = cleaned;
          accumulated = cleaned;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: cleaned } : m,
            ),
          );
        },
        onDone: (messageId, lang) => {
          if (lang) replyLanguage = lang;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, id: messageId, streaming: false }
                : m,
            ),
          );
        },
        onExtracted: (diff: ExtractedDiff) => {
          // Frontend-side: we could refresh a task list here.
          // For MVP, the mode picker will reload when the user goes back.
          console.log('extracted', diff);
        },
        onError: (e) => {
          setError(e.message ?? e.error);
          setMessages((prev) =>
            prev.map((m) => (m.id === placeholderId ? { ...m, streaming: false } : m)),
          );
        },
      },
    );

    setStreaming(false);

    // TTS playback?
    const mode = settings.tts_playback_mode;
    const shouldPlay = mode === 'always' || (mode === 'voice_turns_only' && fromVoice);
    if (shouldPlay && accumulated && settings.voice_autoplay) {
      try {
        const blob = await synthesize(accumulated, replyLanguage);
        await playAudioBlob(blob);
      } catch (err) {
        // Audio not configured or failed — silently skip; text reply is already shown.
        console.warn('tts_skipped', err);
      }
    }
  }

  async function close() {
    if (sessionId) {
      try {
        await endChat(sessionId);
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
      {error && (
        <div
          style={{
            color: 'var(--accent-error)',
            padding: 'var(--space-3)',
            textAlign: 'center',
            fontSize: 14,
          }}
        >
          {t.chat.networkIssue}
        </div>
      )}
      <Composer
        language={settings.language}
        sessionId={sessionId}
        onSend={send}
        disabled={!sessionId || streaming}
      />
    </div>
  );
}
