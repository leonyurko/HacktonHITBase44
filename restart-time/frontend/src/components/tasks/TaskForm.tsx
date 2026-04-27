import { useState } from 'react';
import { createTask } from '../../core/tasks';
import type { Language, TaskSize } from '../../core/types';

interface Props {
  language: Language;
  onCreated: () => void;
  onCancel: () => void;
}

export default function TaskForm({ language, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [size, setSize] = useState<TaskSize | ''>('');
  const [softWhen, setSoftWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTask({
        title: title.trim(),
        size: size || null,
        soft_when: softWhen.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
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
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={language === 'he' ? 'מה זה?' : 'what is it?'}
        autoFocus
        disabled={busy}
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value as TaskSize | '')}
          disabled={busy}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg)',
            color: 'var(--text)',
            minWidth: 120,
          }}
        >
          <option value="">{language === 'he' ? '— מידה —' : '— size —'}</option>
          <option value="tiny">{language === 'he' ? 'מהירה' : 'tiny'}</option>
          <option value="small">{language === 'he' ? 'קצרה' : 'small'}</option>
          <option value="medium">{language === 'he' ? 'בינונית' : 'medium'}</option>
        </select>
        <input
          value={softWhen}
          onChange={(e) => setSoftWhen(e.target.value)}
          placeholder={language === 'he' ? 'מתי? (אם רלוונטי)' : 'when? (optional)'}
          disabled={busy}
          style={{ flex: 1 }}
        />
      </div>
      {error && (
        <div style={{ color: 'var(--accent-error)', fontSize: 13 }}>{error}</div>
      )}
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
          disabled={!title.trim() || busy}
          style={{
            minHeight: 'auto',
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--accent-good)',
            color: 'white',
            border: '1px solid var(--accent-good)',
          }}
        >
          {language === 'he' ? 'הוסף' : 'add'}
        </button>
      </div>
    </form>
  );
}
