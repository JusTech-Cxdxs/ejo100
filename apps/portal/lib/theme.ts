/** Light / Dark / System — stored per device in a cookie (1 year). */
export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'ejo-theme';
export const THEMES: ThemeChoice[] = ['light', 'dark', 'system'];

export function parseTheme(v: string | null | undefined): ThemeChoice {
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Runs in <head> before the first paint: an explicit choice is applied at
 * once (System needs nothing — the CSS media query handles it), so no page
 * ever flashes the wrong colours. Kept tiny and dependency-free. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.setAttribute('data-theme',m[1]);}catch(e){}})();`;
