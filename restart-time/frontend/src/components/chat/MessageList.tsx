import Icon from '../ui/Icon';
import { detectLanguage } from '../../core/i18n';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  audio_signed_url?: string | null;
  streaming?: boolean;
}

export default function MessageList({ messages }: { messages: UiMessage[] }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-md) var(--space-margin)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
    </div>
  );
}

function Bubble({ m }: { m: UiMessage }) {
  const lang = detectLanguage(m.content);
  const isUser = m.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          className={lang === 'he' ? 'msg-rtl' : 'msg-ltr'}
          style={{
            maxWidth: '85%',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-xl)',
            borderTopRightRadius: 'var(--radius-md)',
            backgroundColor: 'var(--surface-container-high)',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            lineHeight: 1.55,
            wordBreak: 'break-word',
          }}
        >
          {m.content}
          {m.audio_signed_url && (
            <audio
              src={m.audio_signed_url}
              controls
              style={{ marginTop: 'var(--space-2)', width: '100%', maxWidth: 280 }}
            />
          )}
        </div>
      </div>
    );
  }

  // Assistant — leaf avatar + outlined bubble on the start side
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        justifyContent: 'flex-start',
      }}
    >
      <AssistantAvatar />
      <div
        className={lang === 'he' ? 'msg-rtl' : 'msg-ltr'}
        style={{
          maxWidth: '85%',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-xl)',
          borderTopLeftRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          lineHeight: 1.55,
          opacity: m.streaming ? 0.85 : 1,
          wordBreak: 'break-word',
        }}
      >
        {m.content || (m.streaming ? '…' : '')}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div
      aria-hidden
      style={{
        width: 32,
        height: 32,
        minWidth: 32,
        borderRadius: '50%',
        backgroundColor: 'var(--primary-container)',
        color: 'var(--on-primary-container)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
      }}
    >
      <Icon name="eco" size={18} filled />
    </div>
  );
}
