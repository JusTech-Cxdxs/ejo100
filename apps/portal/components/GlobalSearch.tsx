'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { globalSearch, type SearchGroup } from '@/lib/actions/search';
import { Icon, type IconName } from '@/components/ui/Icon';

/** Each result group's icon (the same icons the menu and pages use). */
const GROUP_ICON: Record<string, IconName> = {
  Pages: 'grid', 'Job Cards': 'clipboard', 'Vehicle Services': 'droplet', Vehicles: 'car', Customers: 'users', Parts: 'package',
  'Parts requests': 'package', 'External procurement': 'cart', 'Goods receipts': 'receipt', Warranties: 'shield-check', 'Warranty claims': 'file',
  Visitors: 'badge', 'Exit passes': 'exit', 'Road tests': 'road', Incidents: 'alert', Deliveries: 'truck', Contractors: 'hardhat',
  Appointments: 'calendar', Broadcasts: 'megaphone', 'Vehicles leaving (VX)': 'car', Refunds: 'refund', 'Warranty policies': 'file',
  'Warranty providers': 'building', 'Meeting rooms': 'room', Branches: 'branch', Departments: 'sitemap', Staff: 'user',
};

/** The typed words, highlighted inside a result. */
function Highlight({ text, q }: { text: string; q: string }) {
  const term = q.trim();
  if (!term) return <>{text}</>;
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i === -1) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="ejo-hit">{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>;
}

type Status = 'idle' | 'busy' | 'done' | 'error';

/**
 * The header's master search — results appear as you type (after a short
 * pause), grouped by kind with icons, each a direct link. ↑ ↓ to move,
 * Enter to open, Esc to close; Ctrl K / ⌘ K or "/" jumps here from
 * anywhere. Every result obeys the same access rules as the page it opens
 * (lib/actions/search.ts). On phones it opens as a full-screen sheet.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const listId = useId();
  const flat = groups.flatMap((g) => g.hits);

  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);

  // Debounced search; an answer to an older query is ignored (only the newest counts).
  useEffect(() => {
    const term = q.trim();
    const mine = ++seq.current;
    if (!term) { setGroups([]); setStatus('idle'); return; }
    setStatus('busy');
    const t = setTimeout(() => {
      globalSearch(term)
        .then((r) => { if (mine === seq.current) { setGroups(r); setActive(0); setStatus('done'); } })
        .catch(() => { if (mine === seq.current) { setGroups([]); setStatus('error'); } });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const focusSearch = useCallback(() => {
    if (window.matchMedia('(min-width: 768px)').matches) { input.current?.focus(); input.current?.select(); setOpen(true); }
    else setSheet(true);
  }, []);

  useEffect(() => {
    const outside = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); return; }
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); focusSearch(); }
    };
    document.addEventListener('mousedown', outside);
    // Capture phase, so nothing else on the page can swallow Ctrl/⌘ K first.
    window.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', keys, true); };
  }, [focusSearch]);

  useEffect(() => {
    if (!sheet) return;
    sheetInput.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sheet]);

  // Keep the highlighted result in view while moving with the arrows.
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const go = (href: string) => { setOpen(false); setSheet(false); setQ(''); router.push(href); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { if (q) setQ(''); else { setOpen(false); setSheet(false); e.currentTarget.blur(); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]!.href); }
  };

  const results = <Results q={q} groups={groups} status={status} active={active} setActive={setActive} go={go} listId={listId} />;
  const field = (ref: React.RefObject<HTMLInputElement | null>, big: boolean) => (
    <div className="group relative flex w-full items-center">
      <span className="pointer-events-none absolute left-3 text-[var(--ejo-text-muted)] transition-colors group-focus-within:text-[var(--ejo-primary)]" aria-hidden="true">
        {status === 'busy' ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[var(--ejo-primary)]/30 border-t-[var(--ejo-primary)]" /> : <Icon name="search" size={16} />}
      </span>
      <input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={big ? 'Job cards, plates, customers, parts…' : 'Search anything — JC, SV, plate, customer, part, page…'}
        aria-label="Search everything"
        role="combobox"
        aria-expanded={(open || big) && !!q.trim()}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={`w-full rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] pl-9 text-[var(--ejo-text)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[var(--ejo-text-muted)] focus:border-[var(--ejo-primary)] focus:bg-[var(--ejo-bg)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ejo-primary)_14%,transparent)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden ${big ? 'py-2.5 pr-4 text-base' : 'py-2 pr-16 text-sm'}`}
      />
      {!big ? (
        <kbd className="pointer-events-none absolute right-3 hidden items-center gap-0.5 rounded-md border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-1.5 py-0.5 font-sans text-[10px] font-medium text-[var(--ejo-text-muted)] lg:inline-flex" aria-hidden="true">
          {mac ? '⌘' : 'Ctrl'} K
        </kbd>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Tablets and desktops: in the header, front and centre. */}
      <div ref={box} className="relative hidden w-full max-w-xl md:block">
        {field(input, false)}
        {open && !sheet && q.trim() ? (
          <div className="ejo-pop absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-2xl shadow-black/10">
            <div className="ejo-scroll max-h-[min(70vh,34rem)] overflow-y-auto">{results}</div>
            <Footer />
          </div>
        ) : null}
      </div>

      {/* Phones: a search button that opens a full-screen sheet. */}
      <button type="button" onClick={() => setSheet(true)} aria-label="Open search" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] transition-colors hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)] md:hidden">
        <Icon name="search" size={19} />
      </button>
      {sheet ? (
        <div className="ejo-fade fixed inset-0 z-[60] flex flex-col overscroll-contain bg-[var(--ejo-bg)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:hidden" role="dialog" aria-modal="true" aria-label="Search">
          <div className="flex items-center gap-2 border-b border-[var(--ejo-border)] p-3">
            <div className="min-w-0 flex-1">{field(sheetInput, true)}</div>
            <button type="button" onClick={() => { setSheet(false); setQ(''); }} className="shrink-0 rounded-full px-3 py-2 text-sm font-medium text-[var(--ejo-primary)]">Cancel</button>
          </div>
          <div className="ejo-scroll min-h-0 flex-1 overflow-y-auto">
            {q.trim() ? results : (
              <div className="px-6 py-10 text-center text-sm text-[var(--ejo-text-muted)]">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="search" size={22} /></span>
                Type a job number, plate, customer, part, visitor or page name.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Footer() {
  const k = 'rounded border border-[var(--ejo-border)] px-1 font-sans';
  return (
    <div className="hidden items-center gap-4 border-t border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-[11px] text-[var(--ejo-text-muted)] sm:flex">
      <span><kbd className={k}>↑</kbd> <kbd className={k}>↓</kbd> to move</span>
      <span><kbd className={k}>Enter</kbd> to open</span>
      <span><kbd className={k}>Esc</kbd> to close</span>
    </div>
  );
}

function Results({ q, groups, status, active, setActive, go, listId }: { q: string; groups: SearchGroup[]; status: Status; active: number; setActive: (n: number) => void; go: (href: string) => void; listId: string }) {
  const term = q.trim();
  if (status === 'error') {
    return <p className="flex items-center gap-2 px-4 py-4 text-sm text-[var(--ejo-error)]" role="status"><Icon name="alert" size={16} />Search isn’t available right now — please try again in a moment.</p>;
  }
  if (groups.length === 0) {
    if (status !== 'done') {
      return (
        <div className="space-y-3 p-4" role="status" aria-label="Searching">
          {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><span className="h-8 w-8 animate-pulse rounded-lg bg-[var(--ejo-border)]/70" /><span className="h-3 flex-1 animate-pulse rounded bg-[var(--ejo-border)]/70" style={{ maxWidth: `${70 - i * 15}%` }} /></div>)}
        </div>
      );
    }
    return (
      <div className="px-6 py-8 text-center" role="status">
        <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="search" size={18} /></span>
        <p className="text-sm font-medium text-[var(--ejo-text)]">Nothing found for “{term}”</p>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Try a job number (JC-…), a plate, a part number or a customer’s name.</p>
      </div>
    );
  }
  let i = -1;
  return (
    <div id={listId} role="listbox" aria-label="Search results" className="py-1">
      {groups.map((g) => (
        <Fragment key={g.group}>
          <p role="presentation" className="flex items-center gap-2 px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]">
            {g.group}<span className="h-px flex-1 bg-[var(--ejo-border)]" />
          </p>
          {g.hits.map((h) => {
            i += 1;
            const idx = i;
            const on = active === idx;
            return (
              <button
                key={h.href + h.label}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={on}
                type="button"
                onMouseMove={() => { if (!on) setActive(idx); }}
                onClick={() => go(h.href)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${on ? 'bg-[var(--ejo-primary)]/10' : ''}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${on ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-bg)] text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-border)]'}`}>
                  <Icon name={GROUP_ICON[g.group] ?? 'grid'} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--ejo-text)]"><Highlight text={h.label} q={term} /></span>
                  {h.sub ? <span className="block truncate text-xs text-[var(--ejo-text-muted)]"><Highlight text={h.sub} q={term} /></span> : null}
                </span>
                <span className={`shrink-0 text-[var(--ejo-primary)] transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true"><Icon name="arrow-right" size={15} /></span>
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
