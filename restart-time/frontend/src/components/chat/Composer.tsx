import { useState } from 'react';
import { transcribe } from '../../core/audio';
import { getStrings } from '../../core/i18n';
import type { Language } from '../../core/types';
import VoiceButton from './VoiceButton';

interface Props {
  language: Language;
  sessionId: string | null;
  onSend: (text: string, audioPath: string | null, fromVoice: boolean) => void;
  disabled?: boolean;
}

export default function Composer({ language, sessionId, onSend, disabled }: Props) {
  const t = getStrings(language);
  const [text, setText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim(), null, false);
    setText('');
    setHint(null);
  }

  async function handleVoice(blob: Blob) {
    if (disabled) return;
    setTranscribing(true);
    setHint(null);
    try {
      const result = await transcribe(blob, {
        sessionId: sessionId ?? undefined,
        language,
      });
      const cleaned = result.text.trim();
      if (cleaned) {
        onSend(cleaned, result.audio_path, true);
      } else {
        setHint(
          language === 'he'
            ? 'לא הצלחתי לשמוע. נסה שוב, או תכתוב.'
            : "didn't catch that. try again, or type.",
        );
      }
    } catch (err) {
      console.error('stt_failed', err);
      setHint(
        language === 'he' ? 'משהו השתבש. נסה שוב.' : 'something went wrong. try again.',
      );
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <>
      {hint && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-margin)',
            color: 'var(--text-muted)',
            fontSize: 14,
            textAlign: 'center',
            backgroundColor: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {hint}
        </div>
      )}
      <form
        onSubmit={submit}
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          alignItems: 'center',
          padding: 'var(--space-3) var(--space-margin)',
          paddingBottom: `calc(var(--space-3) + env(safe-area-inset-bottom))`,
          backgroundColor: 'var(--bg)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {/* Pill text input — flex-grows to fill space */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-full)',
            padding: 'var(--space-1) var(--space-4)',
            minHeight: 48,
          }}
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={transcribing ? '…' : t.chat.placeholder}
            disabled={disabled || transcribing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                submit(e);
              }
            }}
            style={{
              border: 'none',
              backgroundColor: 'transparent',
              outline: 'none',
              padding: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              flex: 1,
              minWidth: 0,
            }}
          />
          {text.trim() && (
            <button
              type="submit"
              disabled={disabled || !text.trim() || transcribing}
              aria-label={t.chat.send}
              style={{
                minHeight: 32,
                width: 32,
                height: 32,
                padding: 0,
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                color: 'var(--on-primary)',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                marginInlineStart: 'var(--space-1)',
              }}
            >
              ↑
            </button>
          )}
        </div>
        {/* Big green mic */}
        <VoiceButton onResult={handleVoice} disabled={disabled || transcribing} />
      </form>
    </>
  );
}
