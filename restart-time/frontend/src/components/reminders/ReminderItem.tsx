import { useState } from 'react';
import { cancelReminder, type Reminder } from '../../core/reminders';
import type { Language, Task } from '../../core/types';
import { detectLanguage } from '../../core/i18n';

interface Props {
  reminder: Reminder;
  task: Task | undefined;        // joined for display, optional
  language: Language;
  onChange: () => void;
}

function fmt(when: string, language: Language): string {
  try {
    const d = new Date(when);
    return d.toLocaleString(language === 'he' ? 'he-IL' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return when;
  }
}

const STATUS_LABEL: Record<Reminder['status'], { en: string; he: string; color: string }> = {
  pending:   { en: 'pending', he: 'מחכה', color: 'var(--text-muted)' },
  sent:      { en: 'sent', he: 'נשלחה', color: 'var(--accent-good)' },
  cancelled: { en: 'cancelled', he: 'בוטלה', color: 'var(--text-muted)' },
  failed:    { en: 'failed', he: 'לא עברה', color: 'var(--accent-error)' },
};

export default function ReminderItem({ reminder, task, language, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const status = STATUS_LABEL[reminder.status];
  const titleSource = task?.title || reminder.body_override || (language === 'he' ? 'תזכורת' : 'reminder');
  const titleLang = detectLanguage(titleSource);

  async function doCancel() {
    if (busy || reminder.status !== 'pending') return;
    setBusy(true);
    try {
      await cancelReminder(reminder.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--bg-elevated)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        opacity: reminder.status !== 'pending' ? 0.65 : 1,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: 'var(--bg)',
          border: '1.5px solid var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        ◐
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className={titleLang === 'he' ? 'msg-rtl' : 'msg-ltr'}
          style={{ fontSize: 'var(--text-base)', wordBreak: 'break-word' }}
        >
          {titleSource}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-1)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          <span>{fmt(reminder.scheduled_at, language)}</span>
          <span style={{ color: status.color }}>· {status[language]}</span>
        </div>
      </div>
      {reminder.status === 'pending' && (
        <button
          onClick={doCancel}
          disabled={busy}
          aria-label="cancel reminder"
          title={language === 'he' ? 'בטל' : 'cancel reminder'}
          style={{
            minHeight: 'auto',
            padding: 'var(--space-1) var(--space-2)',
            fontSize: 13,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
