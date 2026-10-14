'use client';

/**
 * Per-browser Enyo preferences (speak answers aloud, daily greeting, the
 * avatar's look, the day the greeting was last shown). Conveniences only:
 * every read and write is wrapped, so a private window or blocked storage
 * simply means the defaults.
 */
const KEY = 'ejo-enyo-prefs';

export type EnyoPrefs = {
  speak: boolean;
  greeting: boolean;
  hair: 'straight' | 'curly';
  glasses: boolean;
  /** Lagos day (YYYY-MM-DD) the greeting was last shown, per person. */
  greeted: Record<string, string>;
};

export const DEFAULT_PREFS: EnyoPrefs = { speak: false, greeting: true, hair: 'straight', glasses: false, greeted: {} };

export function readPrefs(): EnyoPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const v = JSON.parse(raw) as Partial<EnyoPrefs>;
    return {
      speak: v.speak === true,
      greeting: v.greeting !== false,
      hair: v.hair === 'curly' ? 'curly' : 'straight',
      glasses: v.glasses === true,
      greeted: v.greeted && typeof v.greeted === 'object' ? Object.fromEntries(Object.entries(v.greeted).filter(([, d]) => typeof d === 'string').slice(-5)) : {},
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(next: EnyoPrefs): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: keep in memory only */ }
}
