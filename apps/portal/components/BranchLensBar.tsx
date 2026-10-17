'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBranchLens, type LensOptions } from '@/lib/actions/branch-lens';
import { Icon } from '@/components/ui/Icon';

/**
 * The branch bar for headquarters roles, under the header on every page:
 * "All branches" or one branch. Every module's lists and analytics follow it
 * (the server narrows what is read; records opened from a link still open).
 */
export function BranchLensBar({ options }: { options: NonNullable<LensOptions> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (id: string) => start(async () => {
    const r = await setBranchLens(id);
    if ('ok' in r) router.refresh();
  });
  const current = options.branches.find((b) => b.id === options.current) ?? null;
  const chip = (active: boolean) => `inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${active ? 'bg-[var(--ejo-primary)] text-white shadow-sm' : 'border border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50'}`;
  return (
    <div className="border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]/70 px-3 py-2 sm:px-5" data-testid="branch-lens" aria-busy={pending}>
      <div className="flex items-center gap-2">
        <span className="hidden shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)] sm:inline-flex"><Icon name="branch" size={14} />Viewing</span>
        <nav aria-label="Branch" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button type="button" onClick={() => pick('')} aria-pressed={!current} disabled={pending} className={chip(!current)}>
            <Icon name="building" size={13} />All branches<span className={`rounded-full px-1.5 text-[10px] ${!current ? 'bg-white/20' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]'}`}>{options.branches.length}</span>
          </button>
          {options.branches.map((b) => (
            <button key={b.id} type="button" onClick={() => pick(b.id)} aria-pressed={current?.id === b.id} disabled={pending} className={chip(current?.id === b.id)} title={b.city ? `${b.name}, ${b.city}` : b.name}>
              {b.name}{b.city ? <span className={`hidden text-[10px] md:inline ${current?.id === b.id ? 'text-white/80' : 'text-[var(--ejo-text-muted)]'}`}>{b.city}</span> : null}
            </button>
          ))}
        </nav>
        <span className="hidden shrink-0 text-[11px] text-[var(--ejo-text-muted)] lg:inline" role="status">
          {pending ? 'Switching…' : current ? `Every page shows ${current.name} only` : 'Every page shows the whole organisation'}
        </span>
      </div>
    </div>
  );
}
