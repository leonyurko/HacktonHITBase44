/**
 * Tiny global "celebrate" context — any component below the provider can call
 *   useCelebrate()({ points: 10, multiplier: 1 })
 * to trigger the floating mascot+sparkle toast.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import CompletionFeedback from '../components/ui/CompletionFeedback';
import type { Language } from './types';

interface Trigger {
  points?: number;
  multiplier?: number;
  message?: string;
}

const CelebrateContext = createContext<((t: Trigger) => void) | null>(null);

export function CelebrateProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const [active, setActive] = useState<Trigger | null>(null);

  const trigger = useCallback((t: Trigger) => {
    setActive(t);
  }, []);

  return (
    <CelebrateContext.Provider value={trigger}>
      {children}
      <CompletionFeedback
        show={active !== null}
        language={language}
        points={active?.points}
        multiplier={active?.multiplier}
        message={active?.message}
        onDone={() => setActive(null)}
      />
    </CelebrateContext.Provider>
  );
}

export function useCelebrate(): (t: Trigger) => void {
  const fn = useContext(CelebrateContext);
  // No-op outside the provider (e.g., in tests).
  return fn ?? (() => {});
}
