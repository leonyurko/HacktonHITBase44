import type { Language } from './types';

const STRINGS = {
  en: {
    appTitle: 'Restart Time',
    tagline: 'a calmer way to plan your day',
    enterEmail: 'email',
    sendLink: 'send me a link',
    linkSent: 'check your email. we sent a link.',
    signOut: 'sign out',
    modePicker: {
      hi: 'hi.',
      planMyDay: "let's plan",
      iNeedHelp: 'need help right now',
      yesterdaysOpen: "what's left",
      noTasks: "nothing yet. let's start with one.",
    },
    chat: {
      placeholder: 'type or hold the mic',
      hold: 'hold to talk',
      send: 'send',
      cancel: 'cancel',
      ending: 'ending session…',
      end: 'end session',
      networkIssue: "couldn't reach the server — let's try that again when you're ready",
    },
    grounding: {
      label: 'ground',
      whenReady: 'when ready',
    },
    settings: {
      title: 'settings',
      language: 'language',
      voiceAutoplay: 'voice autoplay',
      ttsMode: 'voice replies',
      always: 'always',
      voiceTurnsOnly: 'only after voice turns',
      never: 'never',
      quietVisual: 'quiet visual mode',
    },
    progress: {
      thisMonth: 'this month',
      daysHere: 'days here',
    },
  },
  he: {
    appTitle: 'Restart Time',
    tagline: 'דרך רגועה לתכנן את היום',
    enterEmail: 'מייל',
    sendLink: 'שלח לי קישור',
    linkSent: 'תבדוק את המייל. שלחנו קישור.',
    signOut: 'התנתקות',
    modePicker: {
      hi: 'היי.',
      planMyDay: 'בוא נתכנן',
      iNeedHelp: 'צריך עזרה עכשיו',
      yesterdaysOpen: 'מה נשאר',
      noTasks: 'אין כלום עדיין. נתחיל בדבר אחד.',
    },
    chat: {
      placeholder: 'כתוב, או תחזיק לדבר',
      hold: 'תחזיק כדי לדבר',
      send: 'שלח',
      cancel: 'ביטול',
      ending: 'סוגר…',
      end: 'סיום',
      networkIssue: 'לא הצלחנו להתחבר. ננסה שוב כשתרצה.',
    },
    grounding: {
      label: 'עוגן',
      whenReady: 'חזרה',
    },
    settings: {
      title: 'הגדרות',
      language: 'שפה',
      voiceAutoplay: 'השמעה אוטומטית',
      ttsMode: 'תגובות קוליות',
      always: 'תמיד',
      voiceTurnsOnly: 'רק אחרי שדיברתי',
      never: 'אף פעם',
      quietVisual: 'מצב חזותי שקט',
    },
    progress: {
      thisMonth: 'החודש',
      daysHere: 'ימים כאן',
    },
  },
} as const;

export type StringTable = (typeof STRINGS)[Language];

export function getStrings(lang: Language): StringTable {
  return STRINGS[lang];
}

/** Detect language of a text by Hebrew unicode block. */
export function detectLanguage(text: string): Language {
  return /[֐-׿]/.test(text) ? 'he' : 'en';
}

/**
 * Hebrew-aware pluralization for "X days [here] this month".
 *  0 → "עוד לא החודש"
 *  1 → "יום אחד החודש"
 *  2 → "יומיים החודש"
 *  ≥3 → "5 ימים החודש"
 *
 * English uses simple "1 day" / "N days" without the dual form.
 */
export function daysThisMonthLabel(n: number, language: Language): string {
  if (language === 'he') {
    if (n <= 0) return 'עוד לא החודש';
    if (n === 1) return 'יום אחד החודש';
    if (n === 2) return 'יומיים החודש';
    return `${n} ימים החודש`;
  }
  if (n <= 0) return 'no days yet this month';
  if (n === 1) return '1 day here this month';
  return `${n} days here this month`;
}
