/**
 * Health view — frontend-only, mock data.
 * Mirrors the "מידע רפואי" mockup panel: current status badge, daily
 * recommendation card, two metric tiles (sleep + heart rate), and a
 * "send update" CTA. No backend wiring; if real data ever arrives this
 * component just consumes it instead of MOCK.
 */

import Icon from '../ui/Icon';
import Mascot from '../ui/Mascot';
import type { Language } from '../../core/types';

interface Props {
  language: Language;
}

interface Mock {
  status: { en: string; he: string; tone: 'good' | 'mid' | 'low' };
  recommendation: { en: string; he: string };
  sleepHours: number;
  pulseAvg: number;
}

const MOCK: Mock = {
  status: { en: 'moderate', he: 'בינוני', tone: 'mid' },
  recommendation: {
    en: 'try five slow breaths, or a short walk if you can.',
    he: 'נסה חמש נשימות איטיות, או הליכה קצרה אם אפשר.',
  },
  sleepHours: 6.1,
  pulseAvg: 72,
};

const TONE_BG: Record<Mock['status']['tone'], string> = {
  good: 'var(--accent-good)',
  mid: 'var(--primary-container)',
  low: 'var(--secondary-container)',
};
const TONE_FG: Record<Mock['status']['tone'], string> = {
  good: '#1F4A1F',
  mid: 'var(--on-primary-container)',
  low: 'var(--on-secondary-container)',
};

export default function HealthView({ language }: Props) {
  const isHe = language === 'he';
  const t = (en: string, he: string) => (isHe ? he : en);
  const status = MOCK.status[isHe ? 'he' : 'en'];
  const rec = MOCK.recommendation[isHe ? 'he' : 'en'];

  return (
    <div style={{ paddingTop: 'var(--space-md)', paddingBottom: 'var(--space-md)' }}>
      {/* Hero — title + mascot */}
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <Mascot mood="idle" size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>{t('how you are', 'איך אתה')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
            {t('a quick read on your day. mock data for now.', 'מבט מהיר על היום. כרגע נתוני דמה.')}
          </p>
        </div>
      </section>

      {/* Current status card */}
      <section
        className="lift"
        style={{
          padding: 'var(--space-md)',
          backgroundColor: 'var(--bg-elevated)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: TONE_BG[MOCK.status.tone],
              color: TONE_FG[MOCK.status.tone],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="favorite" size={22} filled />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="label-caps">{t('current status', 'מצב נוכחי')}</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-h2)',
                fontWeight: 600,
              }}
            >
              {status}
            </div>
          </div>
        </div>
      </section>

      {/* Daily recommendation */}
      <section
        style={{
          padding: 'var(--space-md)',
          backgroundColor: 'var(--primary-pale)',
          border: '1.5px solid var(--primary-container)',
          borderRadius: 'var(--radius-2xl)',
          marginBottom: 'var(--space-4)',
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
        }}
      >
        <Icon name="lightbulb" size={22} filled color="var(--primary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label-caps" style={{ color: 'var(--primary)' }}>
            {t('today', 'המלצה להיום')}
          </div>
          <p
            style={{
              margin: 'var(--space-1) 0 0',
              fontFamily: 'var(--font-body)',
              color: 'var(--text)',
              lineHeight: 1.55,
            }}
          >
            {rec}
          </p>
        </div>
      </section>

      {/* Two metric tiles */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-md)',
        }}
      >
        <MetricTile
          icon="bedtime"
          tone="secondary"
          label={t('sleep', 'שינה')}
          value={`${MOCK.sleepHours}`}
          unit={t('hrs', 'שעות')}
        />
        <MetricTile
          icon="monitor_heart"
          tone="primary"
          label={t('avg pulse', 'דופק ממוצע')}
          value={`${MOCK.pulseAvg}`}
          unit={t('bpm', 'פעימות')}
        />
      </section>

      {/* Send update CTA */}
      <button
        style={{
          width: '100%',
          padding: 'var(--space-4) var(--space-5)',
          backgroundColor: 'var(--primary)',
          color: 'var(--on-primary)',
          border: 'none',
          borderRadius: 'var(--radius-xl)',
          fontWeight: 600,
          fontSize: 'var(--text-base)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={() => {
          // Mock — would POST to a real endpoint.
          alert(
            isHe
              ? 'הסיכום נשלח (דמה).'
              : 'sent (mock).',
          );
        }}
      >
        <Icon name="send" size={20} />
        {t('send update to my doctor', 'שלח עדכון לרופא')}
      </button>

      <p
        style={{
          color: 'var(--text-subtle)',
          fontSize: 13,
          marginTop: 'var(--space-3)',
          textAlign: 'center',
        }}
      >
        {t('mock data — not a real medical record.', 'נתוני דמה — לא מסמך רפואי אמיתי.')}
      </p>
    </div>
  );
}

function MetricTile({
  icon,
  tone,
  label,
  value,
  unit,
}: {
  icon: string;
  tone: 'primary' | 'secondary';
  label: string;
  value: string;
  unit: string;
}) {
  const bg = tone === 'primary' ? 'var(--primary-pale)' : 'var(--secondary-pale)';
  const accent = tone === 'primary' ? 'var(--primary)' : 'var(--secondary)';
  return (
    <div
      className="lift"
      style={{
        padding: 'var(--space-4)',
        backgroundColor: bg,
        border: `1.5px solid ${accent}40`,
        borderRadius: 'var(--radius-xl)',
        textAlign: 'center',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Icon name={icon} size={26} filled color={accent} />
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-h2)',
          fontWeight: 700,
          color: accent,
          marginTop: 'var(--space-2)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--text-muted)',
          marginTop: 'var(--space-1)',
        }}
      >
        {unit}
      </div>
      <div className="label-caps" style={{ marginTop: 'var(--space-2)' }}>
        {label}
      </div>
    </div>
  );
}
