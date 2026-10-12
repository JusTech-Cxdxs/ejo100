// Sets the .dark class on <html> before hydration/paint so toggling
// between light/dark never causes a visible flash of the wrong theme.
// Also restores the saved language + text direction the same way, so a
// returning visitor's language choice doesn't flash back to English/LTR.
export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('ejo-theme');
    var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var theme = stored || preferred;
    if (theme === 'dark') document.documentElement.classList.add('dark');

    var lang = localStorage.getItem('ejo-language');
    if (lang) {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }
  } catch (e) {}
})();
`;
