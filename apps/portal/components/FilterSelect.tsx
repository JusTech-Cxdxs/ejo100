'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type FilterOption = { value: string; label: string; group?: string };

/**
 * A dropdown you can TYPE into to filter — grouped, keyboard friendly
 * (↑ ↓ Enter Esc), closes when clicking elsewhere. Submits the chosen value
 * under `name`, exactly like a normal select.
 */
export function FilterSelect({ name, options, placeholder, ariaLabel, required, className, defaultValue, large }: { name: string; options: FilterOption[]; placeholder: string; ariaLabel: string; required?: boolean; className?: string; defaultValue?: string; /** Full-size field (forms), not the compact inline one. */ large?: boolean }) {
  const initial = defaultValue ? options.find((o) => o.value === defaultValue) : undefined;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial?.label ?? '');
  const [value, setValue] = useState(initial?.value ?? '');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const q = text.trim().toLowerCase();
  const shown = useMemo(() => options.filter((o) => !q || o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q)), [options, q]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);
  const choose = (o: FilterOption) => { setValue(o.value); setText(o.label); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); choose(shown[active]!); }
    else if (e.key === 'Escape') setOpen(false);
  };
  let idx = -1;
  const groups = [...new Set(shown.map((o) => o.group ?? ''))];
  return (
    <div ref={box} className={`relative min-w-0 ${className ?? ''}`}>
      <input type="hidden" name={name} value={value} />
      <input
        type="text" value={text} placeholder={placeholder} aria-label={ariaLabel} required={required && !value} autoComplete="off"
        onChange={(e) => { setText(e.target.value); setValue(''); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onKeyDown={onKey}
        className={`w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)] ${large ? 'px-3 py-2 text-sm' : 'px-2 py-1.5 text-xs'}`}
      />
      {open ? (
        <div role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 min-w-[16rem] overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg">
          {shown.length === 0 ? <p className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">Nothing matches.</p> : null}
          {groups.map((g) => (
            <div key={g || 'all'}>
              {g ? <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{g}</p> : null}
              {shown.filter((o) => (o.group ?? '') === g).map((o) => {
                idx += 1; const me = idx;
                return <button key={o.value} type="button" role="option" aria-selected={value === o.value} onMouseEnter={() => setActive(me)} onClick={() => choose(o)} className={`block w-full px-3 text-left ${large ? 'py-2 text-sm' : 'py-1.5 text-xs'} ${active === me ? 'bg-[var(--ejo-primary)]/10' : ''} text-[var(--ejo-text)]`}>{o.label}</button>;
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
