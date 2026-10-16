'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { searchMailRecipients, type Recipient } from '@/lib/actions/mail';

/**
 * To / Cc with a people finder: type a name, a branch or a department and
 * pick a colleague (or a customer, for people who may see customers); their
 * registered email is added. Typing an address by hand works as before.
 */
export function RecipientField({ id, name, label, defaultValue, required, placeholder, className }: { id: string; name: string; label: string; defaultValue?: string; required?: boolean; placeholder?: string; className: string }) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [items, setItems] = useState<Recipient[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const term = value.split(/[,;]/).pop()?.trim() ?? '';

  useEffect(() => {
    if (term.length < 2 || term.includes('@')) { setItems([]); return; }
    let live = true;
    const t = window.setTimeout(() => {
      void searchMailRecipients(term).then((r) => { if (live) { setItems(r); setActive(0); setOpen(true); } }).catch(() => undefined);
    }, 220);
    return () => { live = false; window.clearTimeout(t); };
  }, [term]);

  const pick = (r: Recipient) => {
    const parts = value.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    parts.pop();
    if (!parts.includes(r.email)) parts.push(r.email);
    setValue(`${parts.join(', ')}, `);
    setItems([]);
    setOpen(false);
    input.current?.focus();
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-[var(--ejo-text)]">{label}</label>
      <input
        ref={input}
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]!); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
      />
      {open && items.length ? (
        <ul id={listId} role="listbox" aria-label="People" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-1 shadow-xl">
          {items.map((r, i) => (
            <li key={r.email} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} className={`flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-[var(--ejo-primary)]/10' : 'hover:bg-[var(--ejo-surface)]'}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/12 text-xs font-semibold text-[var(--ejo-primary)]">{r.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--ejo-text)]">{r.name}</span>
                  <span className="block truncate text-xs text-[var(--ejo-text-muted)]">{r.email} · {r.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
