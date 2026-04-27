/**
 * Grounding screen — Stitch-style.
 * All three 5-4-3-2-1 lines shown at once, big green numerals,
 * pill "Return" button at bottom. No timed sequencing — the user
 * paces themselves.
 */
import { getStrings } from '../../core/i18n';
import type { Language } from '../../core/types';

interface Props {
  language: Language;
  onClose: () => void;
}

interface Line {
  prefix: string;   // text before the numeral (or empty)
  numeral: string;  // the big green number
  suffix: string;   // text after the numeral
}

const LINES: Record<Language, Line[]> = {
  en: [
    { prefix: 'Notice ', numeral: '3', suffix: ' things you can see.' },
    { prefix: '', numeral: '2', suffix: ' you can hear.' },
    { prefix: '', numeral: '1', suffix: ' you can feel.' },
  ],
  he: [
    { prefix: 'שים לב ל-', numeral: '3', suffix: ' דברים שאתה רואה.' },
    { prefix: '', numeral: '2', suffix: ' שאתה שומע.' },
    { prefix: '', numeral: '1', suffix: ' שאתה מרגיש.' },
  ],
};

export default function GroundingScript({ language, onClose }: Props) {
  const t = getStrings(language);
  const lines = LINES[language];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-lg)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-md)',
          maxWidth: 560,
          width: '100%',
          marginBottom: 'var(--space-xl)',
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 28,
              lineHeight: 1.5,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              justifyContent: 'flex-start',
            }}
          >
            {line.prefix && <span>{line.prefix}</span>}
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 48,
                fontWeight: 600,
                color: 'var(--primary)',
                lineHeight: 1,
              }}
            >
              {line.numeral}
            </span>
            <span>{line.suffix}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        style={{
          minWidth: 240,
          padding: 'var(--space-3) var(--space-lg)',
          backgroundColor: 'var(--primary)',
          color: 'var(--on-primary)',
          border: 'none',
          borderRadius: 'var(--radius-full)',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
        }}
      >
        {t.grounding.whenReady}
      </button>
    </div>
  );
}
