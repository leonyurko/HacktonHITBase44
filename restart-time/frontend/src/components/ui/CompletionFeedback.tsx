/**
 * Cute floating feedback for small wins (task complete, plan finished).
 * Shows a smiling mascot, a sparkle ring around it, an encouraging line,
 * and points-earned. Auto-dismisses after ~2.4s.
 *
 * Trauma-aware caveat: phrasing is warm but NOT loud — no exclamation marks,
 * no all-caps, no "AMAZING!". A line of quiet encouragement, then fades.
 */
import { useEffect, useState } from 'react';
import Mascot from './Mascot';
import type { Language } from '../../core/types';

interface Props {
  show: boolean;
  language: Language;
  /** Points earned this action; if 0, just shows the encouragement. */
  points?: number;
  /** Multiplier applied (>=2 means surprise bonus). */
  multiplier?: number;
  /** Override the encouraging copy. */
  message?: string;
  /** Called when the toast finishes auto-dismissing. */
  onDone?: () => void;
}

const ENCOURAGEMENTS_EN = [
  'one done.',
  'nice.',
  'kept it small. that worked.',
  'you showed up.',
  'small step. good.',
  'forward, gently.',
];
const ENCOURAGEMENTS_HE = [
  'אחד סגור.',
  'יפה.',
  'שמרת את זה קטן.',
  'הופעת. זה נחשב.',
  'צעד קטן. טוב.',
  'קדימה ברוגע.',
];

function pickMessage(language: Language): string {
  const list = language === 'he' ? ENCOURAGEMENTS_HE : ENCOURAGEMENTS_EN;
  return list[Math.floor(Math.random() * list.length)];
}

export default function CompletionFeedback({
  show,
  language,
  points = 0,
  multiplier = 1,
  message,
  onDone,
}: Props) {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    if (show) setText(message ?? pickMessage(language));
  }, [show, message, language]);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => onDone?.(), 2400);
    return () => clearTimeout(id);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        insetInlineEnd: 'var(--space-margin)',
        bottom: `calc(var(--bottomnav-height) + var(--space-md))`,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-5)',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        boxShadow: 'var(--shadow-lg)',
        animation: 'pop-in var(--motion-pop-duration) var(--motion-pop)',
        minWidth: 220,
        maxWidth: 320,
      }}
    >
      {/* Mascot with sparkle ring */}
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <Mascot mood="smile" size={56} />
        <Sparkle x={4} y={6} delay="0ms" />
        <Sparkle x={46} y={2} delay="120ms" />
        <Sparkle x={50} y={42} delay="280ms" />
        <Sparkle x={-2} y={36} delay="200ms" />
      </div>

      {/* Text + points */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            color: 'var(--text)',
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
        {points > 0 && (
          <div
            style={{
              marginTop: 2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: multiplier > 1 ? 'var(--secondary-pale)' : 'var(--primary-pale)',
              color: multiplier > 1 ? 'var(--on-secondary-container)' : 'var(--on-primary-container)',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            +{points * multiplier}
            {multiplier > 1 && (
              <span style={{ marginInlineStart: 4, fontSize: 11 }}>×{multiplier}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Sparkle({ x, y, delay }: { x: number; y: number; delay: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 8,
        height: 8,
        background: 'var(--accent-amber)',
        borderRadius: '50%',
        boxShadow: '0 0 6px var(--accent-amber)',
        animation: `sparkle-twinkle 1200ms ease-in-out ${delay} infinite`,
      }}
    />
  );
}
