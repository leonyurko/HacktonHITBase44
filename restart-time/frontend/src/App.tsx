import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { onAuthChange, getCurrentSession } from './core/auth';
import { apiGet, apiPatch } from './core/api';
import type { Language, UserSettings, Progress } from './core/types';
import MagicLink from './components/auth/MagicLink';
import CommunityView from './components/modes/CommunityView';
import Dashboard from './components/modes/Dashboard';
import HealthView from './components/modes/HealthView';
import LeaderboardView from './components/modes/LeaderboardView';
import OnDemandView from './components/modes/OnDemandView';
import PlanningView from './components/modes/PlanningView';
import SettingsView from './components/modes/SettingsView';
// import GroundingButton from './components/grounding/GroundingButton'; // hidden for now
import TopAppBar from './components/ui/TopAppBar';
import BottomNav, { type NavTab } from './components/ui/BottomNav';
import { CelebrateProvider } from './core/feedback';

type View =
  | 'dashboard'
  | 'health'
  | 'community'
  | 'leaderboard'
  | 'settings'
  | 'on_demand'
  | 'planning';

// Dev bypass: when VITE_DEV_BYPASS=true, the magic-link screen is skipped
// and the app is rendered as if the user were signed in. The backend MUST
// also be configured with DEV_USER_ID (auth dependency uses that user_id
// for every request, no JWT check). Use only for local demos.
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === 'true';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!DEV_BYPASS);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<View>('dashboard');

  useEffect(() => {
    if (DEV_BYPASS) return;
    getCurrentSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
    return onAuthChange((s) => setSession(s));
  }, []);

  async function loadSettings() {
    const r = await apiGet<{ ok: boolean; settings: UserSettings; progress: Progress }>(
      '/settings',
    );
    setSettings(r.settings);
    setProgress(r.progress);
  }

  useEffect(() => {
    if (!session && !DEV_BYPASS) return;
    void loadSettings();
  }, [session]);

  // Apply language + theme attributes to <html>
  useEffect(() => {
    const lang: Language = settings?.language ?? 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.dataset.quiet = String(settings?.quiet_visual_mode ?? false);
  }, [settings]);

  if (loading) {
    return <div className="app-shell" />;
  }

  if (!session && !DEV_BYPASS) {
    return (
      <div className="app-shell">
        <MagicLink language={settings?.language ?? 'en'} />
      </div>
    );
  }

  if (!settings || !progress) {
    return <div className="app-shell" />;
  }

  const language = settings.language;
  const inChat = view === 'on_demand' || view === 'planning';
  const navTab: NavTab =
    view === 'settings' ? 'settings' :
    view === 'leaderboard' ? 'leaderboard' :
    view === 'health' ? 'health' :
    view === 'community' ? 'community' :
    'home';

  async function toggleLang() {
    const next: Language = language === 'en' ? 'he' : 'en';
    const r = await apiPatch<{ ok: boolean; settings: UserSettings }>('/settings', {
      language: next,
    });
    setSettings(r.settings);
  }

  return (
    <CelebrateProvider language={language}>
      {!inChat && (
        <TopAppBar
          email={session?.user?.email ?? (DEV_BYPASS ? 'dev@local' : null)}
          language={language}
          onLangToggle={() => void toggleLang()}
          onAvatarClick={() => setView('settings')}
        />
      )}

      <div className={inChat ? 'app-shell app-shell--no-scroll' : 'app-shell'}>
        {view === 'dashboard' && (
          <Dashboard
            settings={settings}
            progress={progress}
            // Plan button leads to the on-demand conversational chat —
            // the LLM-driven path with prior-turn context, task
            // decomposition, and inline-action markers. The deterministic
            // planning state machine remains in the codebase but isn't
            // exposed in the UI right now.
            onPlan={() => setView('on_demand')}
          />
        )}
        {view === 'health' && <HealthView language={language} />}
        {view === 'community' && <CommunityView language={language} />}
        {view === 'leaderboard' && (
          <LeaderboardView
            language={language}
            email={session?.user?.email ?? (DEV_BYPASS ? 'dev@local' : null)}
            progress={progress}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdate={(next) => {
              setSettings(next);
              // refresh progress in case anything changed
              void loadSettings();
            }}
          />
        )}
        {view === 'on_demand' && (
          <OnDemandView settings={settings} onExit={() => setView('dashboard')} />
        )}
        {view === 'planning' && (
          <PlanningView settings={settings} onExit={() => setView('dashboard')} />
        )}
      </div>

      {!inChat && (
        <BottomNav
          active={navTab}
          language={language}
          onChange={(t) => {
            if (t === 'settings') setView('settings');
            else if (t === 'leaderboard') setView('leaderboard');
            else if (t === 'health') setView('health');
            else if (t === 'community') setView('community');
            else setView('dashboard');
          }}
        />
      )}

      {/* <GroundingButton language={language} />  // hidden for now */}
    </CelebrateProvider>
  );
}
