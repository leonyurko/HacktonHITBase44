import { useEffect, useState } from 'react';
import { apiPatch } from '../../core/api';
import { signOut } from '../../core/auth';
import { getStrings } from '../../core/i18n';
import type { Language, TtsPlaybackMode, UserSettings } from '../../core/types';
import Icon from '../ui/Icon';

interface Props {
  settings: UserSettings;
  onUpdate: (next: UserSettings) => void;
}

const TTS_LABELS: Record<TtsPlaybackMode, { en: string; he: string }> = {
  always: { en: 'always', he: 'תמיד' },
  voice_turns_only: { en: 'only after voice turns', he: 'רק אחרי שיחה בקול' },
  never: { en: 'never', he: 'אף פעם' },
};

export default function SettingsView({ settings, onUpdate }: Props) {
  const t = getStrings(settings.language);
  const [busy, setBusy] = useState(false);

  async function patch(diff: Partial<UserSettings>) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiPatch<{ ok: boolean; settings: UserSettings }>('/settings', diff);
      onUpdate(r.settings);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingTop: 'var(--space-md)' }}>
      <h1>{t.settings.title}</h1>

      <Section label={t.settings.language}>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <ChoiceButton
            label="English"
            active={settings.language === 'en'}
            onClick={() => patch({ language: 'en' as Language })}
          />
          <ChoiceButton
            label="עברית"
            active={settings.language === 'he'}
            onClick={() => patch({ language: 'he' as Language })}
          />
        </div>
      </Section>

      <Section label={t.settings.ttsMode}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {(Object.keys(TTS_LABELS) as TtsPlaybackMode[]).map((mode) => (
            <ChoiceButton
              key={mode}
              label={TTS_LABELS[mode][settings.language]}
              active={settings.tts_playback_mode === mode}
              onClick={() => patch({ tts_playback_mode: mode })}
            />
          ))}
        </div>
      </Section>

      <Section label={t.settings.voiceAutoplay}>
        <Toggle
          on={settings.voice_autoplay}
          onChange={(v) => patch({ voice_autoplay: v })}
        />
      </Section>

      <Section label={t.settings.quietVisual}>
        <Toggle
          on={settings.quiet_visual_mode}
          onChange={(v) => patch({ quiet_visual_mode: v })}
        />
      </Section>

      <Section label={settings.language === 'he' ? 'חיבורים' : 'Connections'}>
        <GoogleCalendarCard language={settings.language} />
      </Section>

      <div style={{ marginTop: 'var(--space-lg)' }}>
        <button
          onClick={() => void signOut()}
          style={{ minHeight: 'auto', padding: 'var(--space-3) var(--space-4)' }}
        >
          {t.signOut}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Google Calendar — frontend-only mock connection.
// State persists in localStorage; no real OAuth happens.
// ===========================================================================

const GCAL_KEY = 'galgal_gcal_state';

interface GcalState {
  connected: boolean;
  email?: string;
  connectedAt?: string;
}

function readGcalState(): GcalState {
  try {
    const raw = localStorage.getItem(GCAL_KEY);
    if (!raw) return { connected: false };
    return JSON.parse(raw) as GcalState;
  } catch {
    return { connected: false };
  }
}

function writeGcalState(s: GcalState) {
  try {
    localStorage.setItem(GCAL_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — silent */
  }
}

function GoogleCalendarCard({ language }: { language: Language }) {
  const isHe = language === 'he';
  const t = (en: string, he: string) => (isHe ? he : en);
  const [state, setState] = useState<GcalState>(() => readGcalState());
  const [busy, setBusy] = useState(false);

  // Keep state synced if another tab toggled it
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === GCAL_KEY) setState(readGcalState());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    // Mock 'OAuth' delay so the connect feedback feels real.
    await new Promise((r) => setTimeout(r, 700));
    const next: GcalState = {
      connected: true,
      email: 'leon.yurkovski@gmail.com',
      connectedAt: new Date().toISOString(),
    };
    writeGcalState(next);
    setState(next);
    setBusy(false);
  }

  function disconnect() {
    if (busy) return;
    if (
      !confirm(
        t(
          'disconnect Google Calendar from GalGal?',
          'לנתק את Google Calendar מ-GalGal?',
        ),
      )
    ) {
      return;
    }
    writeGcalState({ connected: false });
    setState({ connected: false });
  }

  return (
    <div
      className={state.connected ? '' : 'lift'}
      style={{
        padding: 'var(--space-4) var(--space-5)',
        backgroundColor: 'var(--bg-elevated)',
        border: `1.5px solid ${state.connected ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      {/* Calendar icon in a colored circle */}
      <div
        aria-hidden
        style={{
          width: 44,
          minWidth: 44,
          height: 44,
          borderRadius: 'var(--radius-md)',
          backgroundColor: state.connected ? 'var(--primary-container)' : 'var(--surface-container)',
          color: state.connected ? 'var(--on-primary-container)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="calendar_month" size={24} filled />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          Google Calendar
        </div>
        {state.connected ? (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {state.email ?? t('connected', 'מחובר')}
          </div>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            {t(
              'sync your tasks and reminders to your calendar.',
              'סנכרן משימות ותזכורות עם היומן.',
            )}
          </div>
        )}
      </div>

      {state.connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--accent-good)',
              color: 'white',
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Icon name="check_circle" size={14} filled color="white" />
            {t('linked', 'מחובר')}
          </span>
          <button
            onClick={disconnect}
            disabled={busy}
            style={{
              minHeight: 'auto',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 13,
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              boxShadow: 'none',
            }}
          >
            {t('disconnect', 'נתק')}
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={busy}
          style={{
            minHeight: 'auto',
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: 'var(--primary)',
            color: 'var(--on-primary)',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: 'var(--shadow-sm)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            t('connecting…', 'מתחבר…')
          ) : (
            <>
              <Icon name="link" size={16} color="white" />
              {t('Connect', 'חבר')}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-lg)' }}>
      <h3 className="label-caps" style={{ marginBottom: 'var(--space-sm)' }}>
        {label}
      </h3>
      {children}
    </section>
  );
}

function ChoiceButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 'auto',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: active ? 'var(--primary-container)' : 'var(--bg-elevated)',
        color: active ? 'var(--on-primary-container)' : 'var(--text)',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        textAlign: 'start',
        flex: '0 0 auto',
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        minHeight: 'auto',
        width: 56,
        height: 32,
        padding: 2,
        borderRadius: 'var(--radius-full)',
        backgroundColor: on ? 'var(--primary)' : 'var(--surface-variant)',
        border: 'none',
        position: 'relative',
        transition: 'background-color var(--motion-duration) var(--motion-ease)',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'block',
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: 'white',
          marginInlineStart: on ? 24 : 0,
          transition: 'margin var(--motion-duration) var(--motion-ease)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}
