'use client';

import { useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '@/lib/languages';
import { useI18n } from '@/lib/i18n';

/**
 * align: which edge the list opens from ("left" inside the phone menu, so it stays on screen).
 * compact: the flag and the short code (EN, FR) until 1700px, the full name from there — so the header always has it without crowding.
 */
export function LanguageSelector({ dark = false, align = 'right', compact = false }: { dark?: boolean; align?: 'left' | 'right'; compact?: boolean }) {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          dark ? 'text-white/90 hover:bg-white/10' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        title={`Language: ${current.label}`}
      >
        <span>{current.flag}</span>
        {compact ? <><span className="uppercase min-[1700px]:hidden">{current.code}</span><span className="hidden min-[1700px]:inline">{current.label}</span></> : <span>{current.label}</span>}
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-50 mt-2 max-h-72 w-44 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-1 shadow-xl`}
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                role="option"
                aria-selected={current.code === lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setOpen(false);
                }}
                type="button"
                className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--ejo-surface)] ${
                  current.code === lang.code ? 'text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)]'
                }`}
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
