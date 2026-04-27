import { useState } from 'react';
import { apiPatch } from '../../core/api';
import { signOut } from '../../core/auth';
import { getStrings } from '../../core/i18n';
import type { Language, TtsPlaybackMode, UserSettings } from '../../core/types';

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
