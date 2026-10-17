'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Floating } from '@/components/ui/Floating';

export type FilterOption = { value: string; label: string; group?: string; hint?: string };

/**
 * A dropdown you can TYPE into to search — grouped, keyboard friendly
 * (↑ ↓ Enter Esc Tab), closes when clicking elsewhere. Submits the chosen
 * value under `name`, exactly like a normal select.
 *
 * Only a value picked from the list counts: text typed and left unpicked is
 * put back to the last choice (or cleared) when the field is left, so the
 * form never shows a choice it is not sending. Optional fields have a clear
 * button. Nothing is pre-filled unless the form passes a `defaultValue`.
 */
export function FilterSelect({
  name, options, placeholder, ariaLabel, required, className, defaultValue, large, onChange, id,
}: {
  name: string; options: FilterOption[]; placeholder: string; ariaLabel: string; required?: boolean; className?: string; defaultValue?: string;
  /** Full-size field (forms), not the compact inline one. */ large?: boolean;
  onChange?: (value: string) => void;
  /** The text field's id, for a <label htmlFor>. */ id?: string;
}) {
  const initial = defaultValue ? options.find((o) => o.value === defaultValue) : undefined;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial?.label ?? '');
  const [value, setValue] = useState(initial?.value ?? '');
  const [active, setActive] = useState(0);
  const chosen = useRef<FilterOption | undefined>(initial);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const q = text.trim().toLowerCase();
  // While a choice is showing, list everything (the person is browsing, not searching).
  const shown = useMemo(() => (value ? options : options.filter((o) => !q || o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q))), [options, q, value]);

  const set = (o: FilterOption | undefined) => {
    chosen.current = o;
    setValue(o?.value ?? '');
    setText(o?.label ?? '');
    onChange?.(o?.value ?? '');
  };
  const choose = (o: FilterOption) => { set(o); setOpen(false); };
  /** Leaving the field: an exact match counts as chosen; anything else goes back to the last choice. */
  const settle = () => {
    setOpen(false);
    if (value) return;
    const exact = options.find((o) => o.label.toLowerCase() === text.trim().toLowerCase());
    if (exact) set(exact);
    else { setText(chosen.current?.label ?? ''); setValue(chosen.current?.value ?? ''); }
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  useEffect(() => {
    const out = (e: MouseEvent) => { const t = e.target as Node; if (box.current && !box.current.contains(t) && !panel.current?.contains(t)) settleRef.current(); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); choose(shown[active]!); }
    else if (e.key === 'Escape') { e.preventDefault(); settle(); }
    else if (e.key === 'Tab') settle();
  };
  let idx = -1;
  const groups = [...new Set(shown.map((o) => o.group ?? ''))];
  return (
    <div ref={box} className={`relative min-w-0 ${className ?? ''}`}>
      <input type="hidden" name={name} value={value} />
      <input
        ref={field}
        id={id}
        type="text" value={text} placeholder={placeholder} aria-label={ariaLabel} required={required && !value} autoComplete="off"
        aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { setText(e.target.value); setValue(''); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey}
        className={`w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)] ${!required && value ? 'pr-9' : ''} ${large ? 'min-h-11 px-3 py-2 text-sm' : 'px-2 py-1.5 text-xs'}`}
      />
      {!required && value ? (
        <button type="button" onClick={() => { set(undefined); setOpen(false); }} aria-label={`Clear ${ariaLabel}`} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]">×</button>
      ) : null}
      {/* Drawn above the page (never clipped by a card or hidden behind the next one). */}
      <Floating anchor={field} open={open} panelRef={panel} id={listId} role="listbox" ariaLabel={ariaLabel} maxHeight={288}>
          {shown.length === 0 ? <p className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">Nothing matches “{text.trim()}”.</p> : null}
          {groups.map((g) => (
            <div key={g || 'all'}>
              {g ? <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{g}</p> : null}
              {shown.filter((o) => (o.group ?? '') === g).map((o) => {
                idx += 1; const me = idx;
                return (
                  <button key={o.value} type="button" role="option" aria-selected={value === o.value} onMouseEnter={() => setActive(me)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} className={`block w-full px-3 text-left ${large ? 'py-2 text-sm' : 'py-1.5 text-xs'} ${active === me ? 'bg-[var(--ejo-primary)]/10' : ''} ${value === o.value ? 'font-medium text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)]'}`}>
                    {o.label}{o.hint ? <span className="ml-1.5 text-xs font-normal text-[var(--ejo-text-muted)]">{o.hint}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
      </Floating>
    </div>
  );
}
