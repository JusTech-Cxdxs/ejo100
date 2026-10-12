'use client';

import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';

/** A compact light / dark switch for the customer portal's own header. */
export function ThemeSwitch({ tone = 'default' }: { tone?: 'default' | 'onDark' }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ejo-primary)]/40 ${
        tone === 'onDark'
          ? 'border-white/15 bg-white/5 text-white/80 hover:text-white'
          : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'
      }`}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
