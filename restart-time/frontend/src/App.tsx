import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { onAuthChange, getCurrentSession } from './core/auth';
import { apiGet, apiPatch } from './core/api';
import type { Language, UserSettings, Progress } from './core/types';
import MagicLink from './components/auth/MagicLink';
import Dashboard from './components/modes/Dashboard';
import OnDemandView from './components/modes/OnDemandView';
import PlanningView from './components/modes/PlanningView';
import SettingsView from './components/modes/SettingsView';
import GroundingButton from './components/grounding/GroundingButton';
import TopAppBar from './components/ui/TopAppBar';
import BottomNav, { type NavTab } from './components/ui/BottomNav';

type View = 'dashboard' | 'settings' | 'on_demand' | 'planning';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<View>('dashboard');

  useEffect(() => {
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
    if (!session) return;
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

  if (!session) {
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
  const navTab: NavTab = view === 'settings' ? 'settings' : 'home';

  async function toggleLang() {
    const next: Language = language === 'en' ? 'he' : 'en';
    const r = await apiPatch<{ ok: boolean; settings: UserSettings }>('/settings', {
      language: next,
    });
    setSettings(r.settings);
  }

  return (
    <>
      {!inChat && (
        <TopAppBar
          email={session.user.email ?? null}
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
            onPlan={() => setView('planning')}
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
          onChange={(t) => setView(t === 'settings' ? 'settings' : 'dashboard')}
        />
      )}

      <GroundingButton language={language} />
    </>
  );
}
