'use client';

import { useEffect, useRef, useState } from 'react';
import { searchCrmCustomers } from '@/lib/actions/crm';

type Picked = { id: string; fullName: string };

/** Choose customers by searching (name, email, phone or plate). Each choice is
 * posted as a hidden `name` input; chips remove it again. */
export function CustomerMultiPicker({ name = 'audienceIds', initial = [] }: { name?: string; initial?: Picked[] }) {
  const [picked, setPicked] = useState<Picked[]>(initial);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; fullName: string; email: string | null; phone: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const search = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) { setResults([]); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      try {
        const found = await searchCrmCustomers(text);
        if (mine === seq.current) { setResults(found); setOpen(true); }
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 250);
  };
  const add = (c: Picked) => { setPicked((p) => (p.some((x) => x.id === c.id) ? p : [...p, c])); setQ(''); setResults([]); setOpen(false); };
  const remove = (id: string) => setPicked((p) => p.filter((x) => x.id !== id));

  return (
    <div className="space-y-2">
      {picked.map((c) => <input key={c.id} type="hidden" name={name} value={c.id} />)}
      {picked.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen customers">
          {picked.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--ejo-primary)]/10 px-2.5 py-1 text-xs font-medium text-[var(--ejo-primary)]">
              {c.fullName}
              <button type="button" onClick={() => remove(c.id)} aria-label={`Remove ${c.fullName}`} className="rounded-full px-1 leading-none hover:bg-[var(--ejo-primary)]/20">×</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-[var(--ejo-text-muted)]">No customers chosen yet.</p>}
      <div className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) add(results[0]); } if (e.key === 'Escape') setOpen(false); }}
          placeholder="Search customers by name, email, phone or plate…"
          aria-label="Search customers to add"
          autoComplete="off"
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
        />
        {open && q.trim() ? (
          <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-1 shadow-lg">
            {busy && !results.length ? <li className="px-3 py-2 text-sm text-[var(--ejo-text-muted)]">Searching…</li> : null}
            {!busy && !results.length ? <li className="px-3 py-2 text-sm text-[var(--ejo-text-muted)]">No customer matches.</li> : null}
            {results.map((c) => {
              const chosen = picked.some((x) => x.id === c.id);
              return (
                <li key={c.id} role="option" aria-selected={chosen}>
                  <button type="button" onClick={() => add({ id: c.id, fullName: c.fullName })} className="block w-full px-3 py-2 text-left hover:bg-[var(--ejo-bg)]">
                    <span className="block text-sm font-medium text-[var(--ejo-text)]">{c.fullName}{chosen ? ' ✓' : ''}</span>
                    <span className="block truncate text-xs text-[var(--ejo-text-muted)]">{[c.email ?? 'No email on file', c.phone].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
