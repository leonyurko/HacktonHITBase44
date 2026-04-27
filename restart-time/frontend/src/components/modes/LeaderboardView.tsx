/**
 * Leaderboard view — mock data only (no backend).
 * The current user is inserted at the rank corresponding to their actual
 * total_points so the placement always feels real.
 *
 * Trauma-aware caveat preserved: no streaks, no "you've fallen behind",
 * no shame copy. Just a quiet ranked list with cute Top-3 medals.
 */

import { useMemo } from 'react';
import Icon from '../ui/Icon';
import Mascot from '../ui/Mascot';
import type { Language, Progress } from '../../core/types';

interface Props {
  language: Language;
  email: string | null;
  progress: Progress;
}

interface Entry {
  id: string;
  name: string;
  points: number;
  levelEn: string;
  levelHe: string;
  initials: string;
  color: string;
  isCurrentUser?: boolean;
}

const MOCK: Entry[] = [
  { id: 'm1', name: 'Maya K.',   points: 1280, levelEn: 'Restart',     levelHe: 'התחלה חדשה',  initials: 'MK', color: '#5BA3D0' },
  { id: 'm2', name: 'Daniel R.', points: 1015, levelEn: 'Restart',     levelHe: 'התחלה חדשה',  initials: 'DR', color: '#B695C9' },
  { id: 'm3', name: 'Tomer S.',  points: 740,  levelEn: 'Restart',     levelHe: 'התחלה חדשה',  initials: 'TS', color: '#E8B49B' },
  { id: 'm4', name: 'Noa B.',    points: 525,  levelEn: 'Day by Day',  levelHe: 'יום אחר יום', initials: 'NB', color: '#7BC9A3' },
  { id: 'm5', name: 'Itai M.',   points: 410,  levelEn: 'Day by Day',  levelHe: 'יום אחר יום', initials: 'IM', color: '#F0C868' },
  { id: 'm6', name: 'Yael C.',   points: 305,  levelEn: 'Day by Day',  levelHe: 'יום אחר יום', initials: 'YC', color: '#92C4DF' },
  { id: 'm7', name: 'Avi L.',    points: 215,  levelEn: 'Steady Step', levelHe: 'צעד אחר צעד', initials: 'AL', color: '#C8AED8' },
  { id: 'm8', name: 'Rivka H.',  points: 130,  levelEn: 'Steady Step', levelHe: 'צעד אחר צעד', initials: 'RH', color: '#ECC8B3' },
  { id: 'm9', name: 'Yoni A.',   points: 70,   levelEn: 'First Light', levelHe: 'ראשית הדרך',  initials: 'YA', color: '#94B594' },
];

function initialsFromEmail(email: string | null): string {
  if (!email) return 'YOU';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._\-+]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? 'YOU').toUpperCase();
}

function makeEntries(progress: Progress, email: string | null, language: Language): Entry[] {
  const me: Entry = {
    id: 'me',
    name: language === 'he' ? 'את/ה' : 'you',
    points: progress.total_points,
    levelEn: progress.level.name_en,
    levelHe: progress.level.name_he,
    initials: initialsFromEmail(email),
    color: '#5BA3D0',
    isCurrentUser: true,
  };
  return [...MOCK, me].sort((a, b) => b.points - a.points);
}

export default function LeaderboardView({ language, email, progress }: Props) {
  const entries = useMemo(
    () => makeEntries(progress, email, language),
    [progress, email, language],
  );
  const myRank = entries.findIndex((e) => e.isCurrentUser) + 1;

  return (
    <div style={{ paddingTop: 'var(--space-md)', paddingBottom: 'var(--space-md)' }}>
      {/* Hero — title + mascot + my rank pill */}
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <Mascot mood="smile" size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>
            {language === 'he' ? 'איפה אנחנו' : 'where we stand'}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
            {language === 'he'
              ? `המקום שלך כרגע: #${myRank}. הקצב שלך הוא הקצב שלך.`
              : `your rank right now: #${myRank}. your pace is your pace.`}
          </p>
        </div>
      </section>

      {/* List */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {entries.map((e, i) => (
          <Row
            key={e.id}
            entry={e}
            rank={i + 1}
            language={language}
          />
        ))}
      </section>
    </div>
  );
}

function Row({
  entry,
  rank,
  language,
}: {
  entry: Entry;
  rank: number;
  language: Language;
}) {
  const isTop1 = rank === 1;
  const isTop3 = rank <= 3;
  const isMe = entry.isCurrentUser;
  const levelLabel = language === 'he' ? entry.levelHe : entry.levelEn;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: isMe ? 'var(--primary-pale)' : 'var(--bg-elevated)',
        border: isMe
          ? '1.5px solid var(--primary)'
          : '1.5px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: isTop1 ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      }}
    >
      {/* Rank badge */}
      <div
        aria-hidden
        style={{
          width: 32,
          minWidth: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 14,
          backgroundColor:
            rank === 1 ? 'var(--accent-amber)' :
            rank === 2 ? 'var(--surface-variant)' :
            rank === 3 ? 'var(--tertiary-container)' :
            'transparent',
          color:
            rank === 1 ? '#5C3F00' :
            rank === 2 ? 'var(--text)' :
            rank === 3 ? 'var(--on-tertiary-container)' :
            'var(--text-muted)',
        }}
      >
        {isTop1 ? <Icon name="emoji_events" size={18} filled color="#5C3F00" /> : rank}
      </div>

      {/* Avatar — mascot for current user, initials for others */}
      {isMe ? (
        <div style={{ flexShrink: 0 }}>
          <Mascot mood="smile" size={40} />
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            width: 40,
            minWidth: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: entry.color,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {entry.initials}
        </div>
      )}

      {/* Name + level */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-base)',
            fontWeight: isMe ? 700 : 500,
            color: 'var(--text)',
          }}
        >
          {entry.name}
          {isTop3 && !isTop1 && (
            <span style={{ marginInlineStart: 6 }}>
              <Icon
                name="workspace_premium"
                size={14}
                color={rank === 2 ? 'var(--text-subtle)' : 'var(--tertiary)'}
              />
            </span>
          )}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-body)' }}>
          {levelLabel}
        </div>
      </div>

      {/* Points */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          fontWeight: 700,
          color: isMe ? 'var(--primary)' : 'var(--text)',
          flexShrink: 0,
        }}
      >
        {entry.points.toLocaleString()}
      </div>
    </div>
  );
}
