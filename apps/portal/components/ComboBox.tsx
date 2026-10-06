'use client';

import { useId, useMemo, useRef, useState } from 'react';

export type ComboOption = { value: string; label: string; group?: string };

/**
 * A type-to-search picker (replaces long drop-downs). Submits `name` = value
 * with its form. ↑ ↓ to move, Enter to choose, Esc to close.
 */
export function ComboBox({ name, options, placeholder = 'Type to search…', required, ariaLabel, className = '' }: { name: string; options: ComboOption[]; placeholder?: string; required?: boolean; ariaLabel?: string; className?: string }) {
  const [q, setQ] = useState('');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? options.filter((o) => `${o.label} ${o.group ?? ''}`.toLowerCase().includes(t)) : options).slice(0, 60);
  }, [q, options]);
  const pick = (o: ComboOption) => { setValue(o.value); setQ(o.label); setOpen(false); };
  return (
    <div ref={box} className={`relative min-w-0 ${className}`} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        value={q}
        required={required && !value}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setValue(''); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter' && open && hits[active]) { e.preventDefault(); pick(hits[active]!); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
      />
      {open ? (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-1 shadow-lg">
          {hits.length === 0 ? <li className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">Nothing matches.</li> : hits.map((o, i) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={value === o.value} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)} className={`block w-full px-3 py-1.5 text-left text-xs ${i === active ? 'bg-[var(--ejo-primary)]/10' : ''}`}>
                <span className="text-[var(--ejo-text)]">{o.label}</span>{o.group ? <span className="ml-2 text-[10px] text-[var(--ejo-text-muted)]">{o.group}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
