/**
 * Compact one-line task row, shown on the home Today preview.
 * Single-tap completes the task — no edit/defer/drop affordances here.
 * For full CRUD, the user goes to the All / Done tabs (or any explicit list).
 */
import { useState } from 'react';
import { completeTask } from '../../core/tasks';
import { detectLanguage } from '../../core/i18n';
import { useCelebrate } from '../../core/feedback';
import type { Language, Task, TaskSize } from '../../core/types';

const POINTS_BY_SIZE: Record<TaskSize, number> = { tiny: 5, small: 10, medium: 20 };

interface Props {
  task: Task;
  language: Language;
  onChange: () => void;
}

export default function TaskRowCompact({ task, onChange }: Omit<Props, 'language'> & { language?: Language }) {
  const [busy, setBusy] = useState(false);
  const titleLang = detectLanguage(task.title);
  const celebrate = useCelebrate();

  async function toggle() {
    if (busy || task.state !== 'open') return;
    setBusy(true);
    try {
      await completeTask(task.id);
      const points = POINTS_BY_SIZE[task.size ?? 'small'];
      celebrate({ points });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const checked = task.state === 'done';

  return (
    <div
      className="lift"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        opacity: task.state === 'open' ? 1 : 0.6,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <button
        onClick={toggle}
        disabled={busy || task.state !== 'open'}
        aria-label={checked ? 'completed' : 'mark complete'}
        style={{
          width: 22,
          height: 22,
          minHeight: 22,
          padding: 0,
          borderRadius: 'var(--radius-sm)',
          border: '2px solid var(--text-subtle)',
          backgroundColor: checked ? 'var(--accent-good)' : 'transparent',
          color: 'white',
          fontSize: 12,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? '✓' : ''}
      </button>
      <span
        className={titleLang === 'he' ? 'msg-rtl' : 'msg-ltr'}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          textDecoration: checked ? 'line-through' : 'none',
          flex: 1,
          minWidth: 0,
          wordBreak: 'break-word',
        }}
      >
        {task.title}
      </span>
    </div>
  );
}
