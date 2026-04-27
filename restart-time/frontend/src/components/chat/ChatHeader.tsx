/**
 * Header for the chat views (Planning / OnDemand). Slim back-button row
 * with the brand wordmark, plus a "Today, 8:45 AM" pill below.
 */
import Icon from '../ui/Icon';
import type { Language } from '../../core/types';

interface Props {
  language: Language;
  onBack: () => void;
  startedAt?: Date;
}

function dateLabel(d: Date, language: Language): string {
  const time = d.toLocaleTimeString(language === 'he' ? 'he-IL' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const today = language === 'he' ? 'היום' : 'Today';
  return `${today}, ${time}`;
}

export default function ChatHeader({ language, onBack, startedAt }: Props) {
  return (
    <>
      <header
        style={{
          height: 'var(--topbar-height)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-margin)',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="back"
          style={{
            minHeight: 40,
            width: 40,
            height: 40,
            padding: 0,
            borderRadius: '50%',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={language === 'he' ? 'arrow_forward' : 'arrow_back'} size={22} />
        </button>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            color: 'var(--primary)',
          }}
        >
          Restart
        </div>
        <div style={{ width: 40 }} />
      </header>
      {startedAt && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 'var(--space-3) 0 0',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-subtle)',
              backgroundColor: 'var(--surface-container)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {dateLabel(startedAt, language)}
          </span>
        </div>
      )}
    </>
  );
}
