'use client';

import { useEffect, useState } from 'react';
import { THEME_COOKIE, parseTheme, type ThemeChoice } from '@/lib/theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };

function readChoice(): ThemeChoice {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]+)`));
  return parseTheme(m?.[1]);
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  root.classList.add('ejo-theme-switching');
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.setTimeout(() => root.classList.remove('ejo-theme-switching'), 250);
}

function Icon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'light') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/**
 * Light → Dark → System, one click each, remembered on this device. Shown in
 * the header on every page for everyone; also offered as three buttons on
 * the profile page (variant="segmented").
 */
export function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'segmented' }) {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [ready, setReady] = useState(false);
  useEffect(() => { setChoice(readChoice()); setReady(true); }, []);

  const pick = (c: ThemeChoice) => { setChoice(c); applyTheme(c); };

  if (variant === 'segmented') {
    return (
      <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-0.5">
        {(['light', 'dark', 'system'] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={ready && choice === c}
            onClick={() => pick(c)}
            className={`flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-sm font-medium transition-colors ${ready && choice === c ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}
          >
            <Icon choice={c} />
            {LABEL[c]}
          </button>
        ))}
      </div>
    );
  }

  const next = NEXT[choice];
  return (
    <button
      type="button"
      onClick={() => pick(next)}
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[choice]} — click for ${LABEL[next]}`}
      className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-2.5 text-xs font-medium text-[var(--ejo-text-muted)] transition-colors hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-text)]"
    >
      <Icon choice={choice} />
      <span className="hidden sm:inline">{LABEL[choice]}</span>
    </button>
  );
}
