import { useState } from 'react';
import {
  completeTask,
  deferTask,
  dropTask,
  patchTask,
} from '../../core/tasks';
import { detectLanguage } from '../../core/i18n';
import type { Language, Task, TaskSize } from '../../core/types';

interface Props {
  task: Task;
  language: Language;
  onChange: () => void; // parent re-fetches the list
}

const SIZE_LABEL: Record<TaskSize, { en: string; he: string }> = {
  tiny: { en: 'tiny', he: 'מהירה' },
  small: { en: 'small', he: 'קצרה' },
  medium: { en: 'medium', he: 'בינונית' },
};

const STATE_BADGE: Record<Task['state'], { en: string; he: string; color: string }> = {
  open: { en: 'open', he: 'פתוחה', color: 'var(--text-muted)' },
  done: { en: 'done', he: 'נסגרה', color: 'var(--accent-good)' },
  deferred: { en: 'deferred', he: 'למחר', color: 'var(--accent-amber)' },
  dropped: { en: 'dropped', he: 'ירדה', color: 'var(--text-muted)' },
};

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function TaskItem({ task, language, onChange }: Props) {
  const titleLang = detectLanguage(task.title);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [size, setSize] = useState<TaskSize | ''>(task.size ?? '');
  const [softWhen, setSoftWhen] = useState(task.soft_when ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await patchTask(task.id, {
        title: title.trim() || task.title,
        size: size || null,
        soft_when: softWhen.trim() || null,
      });
      setEditing(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function doComplete() {
    if (busy) return;
    setBusy(true);
    try {
      await completeTask(task.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function doDefer() {
    if (busy) return;
    setBusy(true);
    try {
      await deferTask(task.id, tomorrowIso());
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function doDrop() {
    if (busy) return;
    setBusy(true);
    try {
      await dropTask(task.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const isOpen = task.state === 'open';
  const stateBadge = STATE_BADGE[task.state];

  return (
    <div
      style={{
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        opacity: task.state === 'dropped' || task.state === 'done' ? 0.65 : 1,
      }}
    >
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={language === 'he' ? 'מה זה?' : 'what is it?'}
            disabled={busy}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as TaskSize | '')}
              disabled={busy}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg)',
                color: 'var(--text)',
                minWidth: 120,
              }}
            >
              <option value="">{language === 'he' ? '— מידה —' : '— size —'}</option>
              <option value="tiny">{SIZE_LABEL.tiny[language]}</option>
              <option value="small">{SIZE_LABEL.small[language]}</option>
              <option value="medium">{SIZE_LABEL.medium[language]}</option>
            </select>
            <input
              value={softWhen}
              onChange={(e) => setSoftWhen(e.target.value)}
              placeholder={language === 'he' ? 'מתי? (אחרי ארוחת בוקר…)' : 'when? (before lunch…)'}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setEditing(false);
                setTitle(task.title);
                setSize(task.size ?? '');
                setSoftWhen(task.soft_when ?? '');
              }}
              disabled={busy}
              style={{ minHeight: 'auto', padding: 'var(--space-2) var(--space-3)' }}
            >
              {language === 'he' ? 'ביטול' : 'cancel'}
            </button>
            <button
              onClick={save}
              disabled={busy || !title.trim()}
              style={{
                minHeight: 'auto',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--accent-good)',
                color: 'white',
                border: '1px solid var(--accent-good)',
              }}
            >
              {language === 'he' ? 'שמור' : 'save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            {isOpen && (
              <button
                onClick={doComplete}
                disabled={busy}
                aria-label="mark complete"
                title={language === 'he' ? 'סיימתי' : 'mark complete'}
                style={{
                  minHeight: 'auto',
                  width: 28,
                  height: 28,
                  padding: 0,
                  borderRadius: '50%',
                  border: '1.5px solid var(--text-muted)',
                  backgroundColor: 'transparent',
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {' '}
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className={titleLang === 'he' ? 'msg-rtl' : 'msg-ltr'}
                style={{
                  fontSize: 'var(--text-base)',
                  textDecoration:
                    task.state === 'done' || task.state === 'dropped' ? 'line-through' : 'none',
                  wordBreak: 'break-word',
                }}
              >
                {task.title}
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
                <span style={{ color: stateBadge.color }}>{stateBadge[language]}</span>
                {task.size && <span>· {SIZE_LABEL[task.size][language]}</span>}
                {task.soft_when && <span>· {task.soft_when}</span>}
                {task.deferred_to && <span>· → {task.deferred_to}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
              <button
                onClick={() => setEditing(true)}
                disabled={busy}
                aria-label="edit"
                title={language === 'he' ? 'ערוך' : 'edit'}
                style={{
                  minHeight: 'auto',
                  padding: 'var(--space-1) var(--space-2)',
                  fontSize: 13,
                }}
              >
                ✎
              </button>
              {isOpen && (
                <button
                  onClick={doDefer}
                  disabled={busy}
                  aria-label="defer to tomorrow"
                  title={language === 'he' ? 'נדחה למחר' : 'defer to tomorrow'}
                  style={{
                    minHeight: 'auto',
                    padding: 'var(--space-1) var(--space-2)',
                    fontSize: 13,
                  }}
                >
                  →
                </button>
              )}
              {(task.state !== 'dropped') && (
                <button
                  onClick={doDrop}
                  disabled={busy}
                  aria-label="drop"
                  title={language === 'he' ? 'הורד' : 'drop'}
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
          </div>
        </>
      )}
    </div>
  );
}
