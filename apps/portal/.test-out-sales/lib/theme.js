"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_BOOT_SCRIPT = exports.THEMES = exports.THEME_COOKIE = void 0;
exports.parseTheme = parseTheme;
exports.THEME_COOKIE = 'ejo-theme';
exports.THEMES = ['light', 'dark', 'system'];
function parseTheme(v) {
    return v === 'light' || v === 'dark' ? v : 'system';
}
/** Runs in <head> before the first paint: an explicit choice is applied at
 * once (System needs nothing — the CSS media query handles it), so no page
 * ever flashes the wrong colours. Kept tiny and dependency-free. */
exports.THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${exports.THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.setAttribute('data-theme',m[1]);}catch(e){}})();`;
