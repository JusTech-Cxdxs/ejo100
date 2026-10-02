'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { globalSearch, type SearchGroup } from '@/lib/actions/search';

/**
 * The header's master search — results appear as you type (after a short
 * pause), grouped by category, each a direct link. ↑ ↓ to move, Enter to
 * open, Esc to close, "/" to jump here from anywhere.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const flat = groups.flatMap((g) => g.hits);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setGroups([]); setBusy(false); return; }
    setBusy(true);
    const mine = ++seq.current;
    const t = setTimeout(() => {
      globalSearch(term)
        .then((r) => { if (mine === seq.current) { setGroups(r); setActive(0); setBusy(false); } })
        .catch(() => { if (mine === seq.current) { setGroups([]); setBusy(false); } });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const outside = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const slash = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', slash);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', slash); };
  }, []);

  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]!.href); }
  };
  let i = -1;
  return (
    <div ref={box} className="relative w-full max-w-md">
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search anything — JC, SV, plate, part, visitor, page…  ( / )"
        aria-label="Search everything"
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-2 text-sm outline-none focus:border-[var(--ejo-primary)]"
      />
      {open && q.trim() ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg">
          {busy && groups.length === 0 ? <p className="px-4 py-3 text-sm text-[var(--ejo-text-muted)]">Searching…</p> : null}
          {!busy && groups.length === 0 ? <p className="px-4 py-3 text-sm text-[var(--ejo-text-muted)]">Nothing found for “{q.trim()}”.</p> : null}
          {groups.map((g) => (
            <div key={g.group} className="border-b border-[var(--ejo-border)] last:border-0">
              <p className="px-4 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{g.group}</p>
              {g.hits.map((h) => {
                i += 1;
                const idx = i;
                return (
                  <button key={h.href + h.label} type="button" onMouseEnter={() => setActive(idx)} onClick={() => go(h.href)} className={`block w-full px-4 py-1.5 text-left ${active === idx ? 'bg-[var(--ejo-primary)]/10' : 'hover:bg-[var(--ejo-bg)]'}`}>
                    <span className="text-sm font-medium text-[var(--ejo-text)]">{h.label}</span>
                    {h.sub ? <span className="ml-2 text-xs text-[var(--ejo-text-muted)]">{h.sub}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
