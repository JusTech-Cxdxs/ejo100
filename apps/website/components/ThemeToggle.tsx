'use client';

import { useTheme } from '@/lib/theme';

export function ThemeToggle({ dark = false }: { dark?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className={`relative flex h-8 w-14 items-center rounded-full border transition-colors ${
        dark ? 'border-white/25 bg-white/10' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'
      }`}
    >
      <span
        className={`absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ejo-primary)] text-[10px] text-white shadow transition-transform duration-300 ${
          isDark ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
