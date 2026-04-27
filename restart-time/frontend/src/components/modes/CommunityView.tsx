/**
 * Community view — frontend-only, mock data.
 * Mirrors the "קהילה" mockup panel: three category rows (My communities,
 * Open events, Currently in the world), then a feed of upcoming events
 * with avatar / title / time / chevron.
 */

import Icon from '../ui/Icon';
import Mascot from '../ui/Mascot';
import type { Language } from '../../core/types';

interface Props {
  language: Language;
}

interface Category {
  key: string;
  icon: string;
  tone: string;
  titleEn: string;
  titleHe: string;
  subEn: string;
  subHe: string;
  count: number;
}

interface Event {
  id: string;
  initials: string;
  color: string;
  titleEn: string;
  titleHe: string;
  whenEn: string;
  whenHe: string;
}

const CATEGORIES: Category[] = [
  {
    key: 'my',
    icon: 'group',
    tone: 'var(--primary)',
    titleEn: 'My communities',
    titleHe: 'הקהילות שלי',
    subEn: '3 groups, 12 friends',
    subHe: '3 קבוצות, 12 חברים',
    count: 3,
  },
  {
    key: 'open',
    icon: 'event',
    tone: 'var(--secondary)',
    titleEn: 'Open events',
    titleHe: 'אירועים פתוחים',
    subEn: '5 happening this week',
    subHe: '5 קורים השבוע',
    count: 5,
  },
  {
    key: 'world',
    icon: 'public',
    tone: 'var(--tertiary)',
    titleEn: 'Now in the world',
    titleHe: 'כעת בעולם',
    subEn: 'live conversations',
    subHe: 'שיחות חיות',
    count: 12,
  },
];

const EVENTS: Event[] = [
  {
    id: 'e1',
    initials: 'YM',
    color: '#5BA3D0',
    titleEn: 'Peer circle: morning check-in',
    titleHe: 'מעגל פתוח: צ׳ק-אין בבוקר',
    whenEn: 'Tomorrow, 09:00',
    whenHe: 'מחר, 09:00',
  },
  {
    id: 'e2',
    initials: 'NB',
    color: '#B695C9',
    titleEn: 'Storyteller workshop with Noam',
    titleHe: 'סדנת מספרי סיפורים עם נועם',
    whenEn: 'Thu, 19:30',
    whenHe: 'יום ה׳, 19:30',
  },
  {
    id: 'e3',
    initials: 'TR',
    color: '#7BC9A3',
    titleEn: 'Mentors meetup — career chat',
    titleHe: 'מפגש מנטורים — שיחה על קריירה',
    whenEn: 'Sun, 18:00',
    whenHe: 'יום א׳, 18:00',
  },
  {
    id: 'e4',
    initials: 'IK',
    color: '#E8B49B',
    titleEn: 'Walk & talk in the park',
    titleHe: 'הליכה ושיחה בפארק',
    whenEn: 'Sat, 16:00',
    whenHe: 'שבת, 16:00',
  },
];

export default function CommunityView({ language }: Props) {
  const isHe = language === 'he';
  const t = (en: string, he: string) => (isHe ? he : en);

  return (
    <div style={{ paddingTop: 'var(--space-md)', paddingBottom: 'var(--space-md)' }}>
      {/* Hero */}
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
          <h1 style={{ marginBottom: 'var(--space-1)' }}>{t('community', 'קהילה')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
            {t('the Restart, with you.', 'The Restart, אתה לא לבד.')}
          </p>
        </div>
      </section>

      {/* Categories */}
      <section style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 className="label-caps" style={{ marginBottom: 'var(--space-sm)' }}>
          {t('my places', 'המקומות שלי')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {CATEGORIES.map((c) => (
            <CategoryRow
              key={c.key}
              icon={c.icon}
              tone={c.tone}
              title={t(c.titleEn, c.titleHe)}
              sub={t(c.subEn, c.subHe)}
              count={c.count}
              isHe={isHe}
            />
          ))}
        </div>
      </section>

      {/* Events feed */}
      <section>
        <h3 className="label-caps" style={{ marginBottom: 'var(--space-sm)' }}>
          {t('upcoming events', 'אירועים קרובים')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {EVENTS.map((e) => (
            <EventRow
              key={e.id}
              initials={e.initials}
              color={e.color}
              title={t(e.titleEn, e.titleHe)}
              when={t(e.whenEn, e.whenHe)}
              isHe={isHe}
            />
          ))}
        </div>
      </section>

      <p
        style={{
          color: 'var(--text-subtle)',
          fontSize: 13,
          marginTop: 'var(--space-md)',
          textAlign: 'center',
        }}
      >
        {t('mock data — full community is coming.', 'נתוני דמה — הקהילה המלאה בדרך.')}
      </p>
    </div>
  );
}

function CategoryRow({
  icon,
  tone,
  title,
  sub,
  count,
  isHe,
}: {
  icon: string;
  tone: string;
  title: string;
  sub: string;
  count: number;
  isHe: boolean;
}) {
  return (
    <button
      className="lift"
      onClick={() => {
        /* mock */
      }}
      style={{
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--bg-elevated)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        textAlign: 'start',
        minHeight: 'auto',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          minWidth: 40,
          borderRadius: 'var(--radius-md)',
          backgroundColor: `${tone}22`,
          color: tone,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={22} filled color={tone} />
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
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          {sub}
        </div>
      </div>
      <div
        aria-hidden
        style={{
          minWidth: 28,
          height: 28,
          padding: '0 8px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--surface-container)',
          color: 'var(--text-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {count}
      </div>
      <Icon name={isHe ? 'chevron_left' : 'chevron_right'} size={20} color="var(--text-subtle)" />
    </button>
  );
}

function EventRow({
  initials,
  color,
  title,
  when,
  isHe,
}: {
  initials: string;
  color: string;
  title: string;
  when: string;
  isHe: boolean;
}) {
  return (
    <button
      className="lift"
      onClick={() => {
        /* mock */
      }}
      style={{
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--bg-elevated)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        textAlign: 'start',
        minHeight: 'auto',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          minWidth: 36,
          borderRadius: '50%',
          backgroundColor: color,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {when}
        </div>
      </div>
      <Icon name={isHe ? 'chevron_left' : 'chevron_right'} size={18} color="var(--text-subtle)" />
    </button>
  );
}
