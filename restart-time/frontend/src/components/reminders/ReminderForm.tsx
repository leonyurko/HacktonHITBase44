import { useState } from 'react';
import { createReminder } from '../../core/reminders';
import type { Language, Task } from '../../core/types';

interface Props {
  language: Language;
  openTasks: Task[];
  onCreated: () => void;
  onCancel: () => void;
}

function defaultDateTimeValue(): string {
  // local datetime, +30 min, formatted for <input type="datetime-local">
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  d.setSeconds(0);
  d.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReminderForm({ language, openTasks, onCreated, onCancel }: Props) {
  const [taskId, setTaskId] = useState(openTasks[0]?.id ?? '');
  const [scheduled, setScheduled] = useState(defaultDateTimeValue());
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId || !scheduled || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createReminder({
        task_id: taskId,
        scheduled_at: new Date(scheduled).toISOString(),
        body_override: body.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (openTasks.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-4)',
          backgroundColor: 'var(--bg-elevated)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          {language === 'he'
            ? 'אין משימות פתוחות. תוסיף משימה קודם.'
            : 'no open tasks yet. add one first.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
          <button
            onClick={onCancel}
            style={{ minHeight: 'auto', padding: 'var(--space-2) var(--space-3)' }}
          >
            {language === 'he' ? 'סגור' : 'close'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{
        padding: 'var(--space-4)',
        backgroundColor: 'var(--bg-elevated)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <select
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        disabled={busy}
        required
        style={{
          padding: 'var(--space-2) var(--space-3)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
        }}
      >
        {openTasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={scheduled}
        onChange={(e) => setScheduled(e.target.value)}
        disabled={busy}
        required
      />
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={language === 'he' ? 'הודעה (אם תרצה)' : 'message (optional)'}
        disabled={busy}
      />
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
        {language === 'he'
          ? 'נשמור את התזכורת. כרגע אנחנו לא דוחפים התראות.'
          : "we'll save it. push notifications aren't on yet."}
      </p>
      {error && <div style={{ color: 'var(--accent-error)', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{ minHeight: 'auto', padding: 'var(--space-2) var(--space-3)' }}
        >
          {language === 'he' ? 'ביטול' : 'cancel'}
        </button>
        <button
          type="submit"
          disabled={busy || !taskId || !scheduled}
          style={{
            minHeight: 'auto',
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--accent-good)',
            color: 'white',
            border: '1px solid var(--accent-good)',
          }}
        >
          {language === 'he' ? 'תזכר אותי' : 'remind me'}
        </button>
      </div>
    </form>
  );
}
