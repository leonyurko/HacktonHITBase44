import { useEffect, useState } from 'react';
import { apiGet } from '../../core/api';
import { getStrings } from '../../core/i18n';
import { signOut } from '../../core/auth';
import type { Progress, Task, UserSettings } from '../../core/types';

interface Props {
  settings: UserSettings;
  progress: Progress;
  onPlan: () => void;
  onHelp: () => void;
}

export default function ModePicker({ settings, progress, onPlan, onHelp }: Props) {
  const t = getStrings(settings.language);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);

  useEffect(() => {
    void apiGet<{ ok: boolean; tasks: Task[] }>('/tasks?state=open').then((r) =>
      setOpenTasks(r.tasks ?? []),
    );
  }, []);

  const levelName = settings.language === 'he' ? progress.level.name_he : progress.level.name_en;
  const nextThreshold = progress.next_level?.threshold ?? progress.total_points;
  const pct = Math.min(100, (progress.total_points / nextThreshold) * 100);

  return (
    <div style={{ marginTop: 'var(--space-8)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-5)',
        }}
      >
        <h1 style={{ margin: 0 }}>{t.modePicker.hi}</h1>
        <button onClick={() => void signOut()} style={{ minHeight: 'auto', padding: 'var(--space-2) var(--space-3)' }}>
          {t.signOut}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <button
          onClick={onPlan}
          style={{
            padding: 'var(--space-6) var(--space-4)',
            fontSize: 'var(--text-lg)',
            backgroundColor: 'var(--bg-elevated)',
          }}
        >
          {t.modePicker.planMyDay}
        </button>
        <button
          onClick={onHelp}
          style={{
            padding: 'var(--space-6) var(--space-4)',
            fontSize: 'var(--text-lg)',
            backgroundColor: 'var(--bg-elevated)',
          }}
        >
          {t.modePicker.iNeedHelp}
        </button>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
          {t.modePicker.yesterdaysOpen}
        </h3>
        {openTasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t.modePicker.noTasks}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {openTasks.map((task) => (
              <li
                key={task.id}
                style={{
                  padding: 'var(--space-3) 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {task.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!settings.quiet_visual_mode && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{levelName}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {progress.total_points} / {progress.next_level?.threshold ?? '∞'}
            </span>
          </div>
          <div
            style={{
              height: 6,
              backgroundColor: 'var(--border)',
              borderRadius: 3,
              marginTop: 'var(--space-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: 'var(--accent-good)',
                transition: 'width var(--motion-duration) var(--motion-ease)',
              }}
            />
          </div>
          <div style={{ marginTop: 'var(--space-2)', color: 'var(--text-muted)', fontSize: 14 }}>
            {t.progress.thisMonth}: {progress.days_engaged_this_month} {t.progress.daysHere}
          </div>
        </div>
      )}
    </div>
  );
}
