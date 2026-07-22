'use client';

import { useState } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ha', label: 'Hausa', flag: '🇳🇬' },
];

/**
 * UI only for now — selecting a language stores the preference but does
 * not yet translate content. Full i18n (see project constitution's
 * multi-language requirement) is a separate, larger phase.
 */
export function LanguageSelector({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(LANGUAGES[0]!);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          dark ? 'text-white/90 hover:bg-white/10' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.flag}</span>
        <span>{selected.label}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-1 shadow-xl"
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                role="option"
                aria-selected={selected.code === lang.code}
                onClick={() => {
                  setSelected(lang);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
              >
                <span>{lang.flag}</span>
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
