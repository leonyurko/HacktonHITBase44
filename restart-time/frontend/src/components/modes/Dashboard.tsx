import { useEffect, useState } from 'react';
import { listAllTasks } from '../../core/tasks';
import { listReminders, type Reminder } from '../../core/reminders';
import { daysThisMonthLabel } from '../../core/i18n';
import type { Progress, Task, UserSettings } from '../../core/types';
import Icon from '../ui/Icon';
import Mascot from '../ui/Mascot';
import TaskItem from '../tasks/TaskItem';
import TaskForm from '../tasks/TaskForm';
import TaskRowCompact from '../tasks/TaskRowCompact';
import ReminderItem from '../reminders/ReminderItem';
import ReminderForm from '../reminders/ReminderForm';

interface Props {
  settings: UserSettings;
  progress: Progress;
  onPlan: () => void;
  // onHelp: () => void;   // intentionally hidden; on-demand chat entry not exposed for now
}

type TabKey = 'today' | 'all' | 'done' | 'reminders';

const TAB_LABELS: Record<TabKey, { en: string; he: string }> = {
  today: { en: 'today', he: 'היום' },
  all: { en: 'all', he: 'הכל' },
  done: { en: 'done', he: 'הושלמו' },
  reminders: { en: 'reminders', he: 'תזכורות' },
};

function isDeferredForToday(task: Task): boolean {
  if (task.state !== 'deferred') return false;
  if (!task.deferred_to) return false;
  return task.deferred_to <= new Date().toISOString().slice(0, 10);
}

function greetingFor(hour: number, language: 'en' | 'he'): string {
  if (language === 'he') {
    if (hour < 5) return 'לילה טוב.';
    if (hour < 12) return 'בוקר טוב.';
    if (hour < 18) return 'צהריים טובים.';
    return 'ערב טוב.';
  }
  if (hour < 5) return 'late hours.';
  if (hour < 12) return 'good morning.';
  if (hour < 18) return 'good afternoon.';
  return 'good evening.';
}

export default function Dashboard({ settings, progress, onPlan }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('today');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);

  async function refresh(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    try {
      const [allTasks, rems] = await Promise.all([listAllTasks(), listReminders()]);
      setTasks(allTasks);
      setReminders(rems);
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  // Initial load.
  useEffect(() => {
    void refresh();
  }, []);

  // Refresh whenever the tab becomes visible again (user comes back from
  // another browser tab) and on a 30s background tick. Both are silent —
  // no loading flash so the UI stays calm.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void refresh({ silent: true });
    }
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => void refresh({ silent: true }), 30_000);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, []);

  const openTasks = tasks.filter((x) => x.state === 'open');
  const todayTasks = tasks.filter((x) => x.state === 'open' || isDeferredForToday(x));
  const doneTasks = tasks.filter((x) => x.state === 'done');

  const taskById = new Map(tasks.map((x) => [x.id, x]));

  const progressLabel = settings.language === 'he' ? 'ההתקדמות שלנו:' : 'Progress:';
  const nextThreshold = progress.next_level?.threshold ?? progress.total_points;
  const pct = nextThreshold > 0 ? Math.min(100, (progress.total_points / nextThreshold) * 100) : 0;

  const greeting = greetingFor(new Date().getHours(), settings.language);
  const subhead =
    settings.language === 'he' ? 'מה עושים היום?' : 'what are we doing today?';

  return (
    <div style={{ paddingBottom: 'var(--space-md)' }}>
      {/* Welcome — mascot peeking next to greeting */}
      <section
        style={{
          marginTop: 'var(--space-md)',
          marginBottom: 'var(--space-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <Mascot mood="idle" size={72} bob />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>{greeting}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
            {subhead}
          </p>
        </div>
      </section>

      {/* Mode picker — centered focal-point button. Brand-gradient, light
          decorative blob in the corner, large icon, prominent CTA. */}
      <section
        style={{
          marginBottom: 'var(--space-lg)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <PlanButton
          onClick={onPlan}
          title={settings.language === 'he' ? 'בוא נתכנן' : "let's plan"}
          subtitle={
            settings.language === 'he'
              ? 'נסדר את היום בקצב שלך'
              : 'lay out the day at your pace'
          }
        />
      </section>

      {/* Today preview (compact, read-only checkboxes) */}
      {tab === 'today' && (
        <section style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 className="label-caps" style={{ marginBottom: 'var(--space-sm)' }}>
            {settings.language === 'he' ? 'מה נשאר' : "what's left"}
          </h3>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div className="skeleton" style={{ height: 56 }} />
              <div className="skeleton" style={{ height: 56, opacity: 0.7 }} />
            </div>
          ) : todayTasks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              {settings.language === 'he'
                ? 'אין כלום עדיין. נתחיל בדבר אחד.'
                : "nothing yet. let's start with one."}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {todayTasks.map((task) => (
                <TaskRowCompact
                  key={task.id}
                  task={task}
                  language={settings.language}
                  onChange={() => void refresh()}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Progress card (Stitch style with seed dot) */}
      {!settings.quiet_visual_mode && (
        <section style={{ marginBottom: 'var(--space-lg)' }}>
          <div
            style={{
              padding: 'var(--space-md)',
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-2xl)',
              border: '1.5px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 'var(--space-sm)',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-lg)',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  {progressLabel}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'var(--font-body)' }}>
                  {daysThisMonthLabel(progress.days_engaged_this_month, settings.language)}
                </div>
              </div>
              <span className="label-caps" style={{ color: 'var(--primary)', fontSize: 18 }}>
                {progress.total_points}/{progress.next_level?.threshold ?? '∞'}
              </span>
            </div>
            {/* Progress bar with seed dot */}
            <div
              style={{
                height: 8,
                backgroundColor: 'var(--surface-variant)',
                borderRadius: 'var(--radius-full)',
                overflow: 'visible',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: 'var(--secondary)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width var(--motion-duration) var(--motion-ease)',
                  position: 'relative',
                }}
              >
                {/* Seed/leaf dot at the end */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    right: -4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: 'var(--tertiary-container)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tabs (today / all / done / reminders) */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {(['today', 'all', 'done', 'reminders'] as TabKey[]).map((k) => {
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                minHeight: 'auto',
                padding: 'var(--space-2) var(--space-3)',
                border: 'none',
                borderBottom: active
                  ? '2px solid var(--primary)'
                  : '2px solid transparent',
                borderRadius: 0,
                backgroundColor: 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: 14,
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
              }}
            >
              {TAB_LABELS[k][settings.language]}
            </button>
          );
        })}
      </div>

      {/* Add buttons + forms */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 'var(--space-3)',
        }}
      >
        {tab === 'reminders' ? (
          <button
            onClick={() => setShowReminderForm((v) => !v)}
            style={{ minHeight: 'auto', padding: 'var(--space-2) var(--space-3)', fontSize: 14 }}
          >
            {showReminderForm
              ? settings.language === 'he'
                ? 'ביטול'
                : 'cancel'
              : settings.language === 'he'
                ? '+ תזכורת'
                : '+ reminder'}
          </button>
        ) : (
          <button
            onClick={() => setShowTaskForm((v) => !v)}
            style={{ minHeight: 'auto', padding: 'var(--space-2) var(--space-3)', fontSize: 14 }}
          >
            {showTaskForm
              ? settings.language === 'he'
                ? 'ביטול'
                : 'cancel'
              : settings.language === 'he'
                ? '+ משימה'
                : '+ task'}
          </button>
        )}
      </div>

      {showTaskForm && tab !== 'reminders' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <TaskForm
            language={settings.language}
            onCreated={() => {
              setShowTaskForm(false);
              void refresh();
            }}
            onCancel={() => setShowTaskForm(false)}
          />
        </div>
      )}
      {showReminderForm && tab === 'reminders' && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <ReminderForm
            language={settings.language}
            openTasks={openTasks}
            onCreated={() => {
              setShowReminderForm(false);
              void refresh();
            }}
            onCancel={() => setShowReminderForm(false)}
          />
        </div>
      )}

      {/* Lists for non-today tabs (rich CRUD) */}
      {tab !== 'today' && (
        <>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div className="skeleton" style={{ height: 64 }} />
              <div className="skeleton" style={{ height: 64, opacity: 0.7 }} />
              <div className="skeleton" style={{ height: 64, opacity: 0.4 }} />
            </div>
          ) : tab === 'reminders' ? (
            reminders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                {settings.language === 'he' ? 'אין תזכורות עדיין.' : 'no reminders yet.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {reminders.map((r) => (
                  <ReminderItem
                    key={r.id}
                    reminder={r}
                    task={r.task_id ? taskById.get(r.task_id) : undefined}
                    language={settings.language}
                    onChange={() => void refresh()}
                  />
                ))}
              </div>
            )
          ) : (
            (() => {
              const list = tab === 'all' ? openTasks : doneTasks;
              if (list.length === 0) {
                return (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                    {settings.language === 'he' ? 'ריק כאן.' : 'empty here.'}
                  </p>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {list.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      language={settings.language}
                      onChange={() => void refresh()}
                    />
                  ))}
                </div>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}

function PlanButton({
  onClick,
  title,
  subtitle,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className="lift"
      style={{
        // Center, capped width — focal point of the home screen
        width: '100%',
        maxWidth: 360,
        minHeight: 200,
        padding: 'var(--space-6) var(--space-5)',
        // Brand-gradient body (sky-blue → lilac)
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
        color: 'var(--on-primary)',
        border: 'none',
        borderRadius: 'var(--radius-2xl)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        textAlign: 'center',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Soft decorative blob in the corner */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          insetInlineEnd: -40,
          top: -40,
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />
      {/* Big icon in a translucent circle */}
      <div
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="auto_awesome" size={32} filled color="white" />
      </div>
      <div style={{ position: 'relative' }}>
        <h2
          style={{
            margin: 0,
            marginBottom: 'var(--space-1)',
            color: 'white',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            color: 'rgba(255,255,255,0.88)',
            fontSize: 'var(--text-base)',
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      </div>
    </button>
  );
}
