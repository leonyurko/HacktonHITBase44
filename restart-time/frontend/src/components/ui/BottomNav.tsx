import Icon from './Icon';
import type { Language } from '../../core/types';

export type NavTab = 'home' | 'health' | 'community' | 'leaderboard' | 'settings';

interface Props {
  active: NavTab;
  language: Language;
  onChange: (tab: NavTab) => void;
}

const LABELS = {
  home: { en: 'Home', he: 'בית' },
  health: { en: 'Health', he: 'בריאות' },
  community: { en: 'Community', he: 'קהילה' },
  leaderboard: { en: 'Top', he: 'טבלה' },
  settings: { en: 'Settings', he: 'הגדרות' },
} as const;

const ICONS: Record<NavTab, string> = {
  home: 'home',
  health: 'favorite',
  community: 'group',
  leaderboard: 'leaderboard',
  settings: 'settings',
};

export default function BottomNav({ active, language, onChange }: Props) {
  const tabs: NavTab[] = ['home', 'health', 'community', 'leaderboard', 'settings'];
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'var(--bottomnav-height)',
        backgroundColor: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
        maxWidth: 720,
        margin: '0 auto',
        padding: '0 var(--space-margin)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 40,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              minHeight: 'var(--bottomnav-height)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isActive ? 'var(--primary-container)' : 'transparent',
              color: isActive ? 'var(--on-primary-container)' : 'var(--text-muted)',
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: 'var(--space-2)',
              margin: 'var(--space-1)',
            }}
          >
            <Icon name={ICONS[t]} size={22} filled={isActive} />
            <span>{LABELS[t][language]}</span>
          </button>
        );
      })}
    </nav>
  );
}
