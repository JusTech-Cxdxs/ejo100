'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { setBranchLens, type LensOptions } from '@/lib/actions/branch-lens';
import { Icon } from '@/components/ui/Icon';
import { BRANCH_TYPE_WORDS, branchHostsModule, isBranchType, moduleOfPath } from '@/lib/branch-types';

/** How each branch-bound area is named when a branch does not have it. */
const AREA_WORDS: Record<string, string> = { workshop: 'a workshop', inventory: 'a store (Inventory)', warranty: 'a warranty desk', plant: 'an assembly line' };

/**
 * The branch bar for headquarters roles, under the header on every page:
 * "All branches" or one branch. Every module's lists and analytics follow it
 * (the server narrows what is read; records opened from a link still open).
 *
 * On a page of an area that only some kinds of branch have — Workshop,
 * Inventory, Warranty, the Assembly plant — the bar offers only the branches
 * that have it: the plant is not a choice under Inventory, and the workshop
 * is not a choice on the line. If the branch being viewed does not have the
 * area, the bar says so instead of showing an empty page without a reason.
 */
export function BranchLensBar({ options }: { options: NonNullable<LensOptions> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (id: string) => start(async () => {
    const r = await setBranchLens(id);
    if ('ok' in r) router.refresh();
  });
  const current = options.branches.find((b) => b.id === options.current) ?? null;
  // The area this page belongs to, and the branches that have it (every branch, for areas not tied to a kind of branch).
  const area = moduleOfPath(usePathname());
  const here = options.branches.filter((b) => branchHostsModule(area, b.type));
  const elsewhere = Boolean(current && area && !branchHostsModule(area, current.type));
  const chip = (active: boolean) => `inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${active ? 'bg-[var(--ejo-primary)] text-white shadow-sm' : 'border border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50'}`;
  return (
    <div className="border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]/70 px-3 py-2 sm:px-5" data-testid="branch-lens" aria-busy={pending}>
      <div className="flex items-center gap-2">
        <span className="hidden shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)] sm:inline-flex"><Icon name="branch" size={14} />Viewing</span>
        <nav aria-label="Branch" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button type="button" onClick={() => pick('')} aria-pressed={!current} disabled={pending} className={chip(!current)}>
            <Icon name="building" size={13} />All branches<span className={`rounded-full px-1.5 text-[10px] ${!current ? 'bg-white/20' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]'}`}>{here.length}</span>
          </button>
          {(elsewhere && current ? [current, ...here] : here).map((b) => (
            <button key={b.id} type="button" onClick={() => pick(b.id)} aria-pressed={current?.id === b.id} disabled={pending} className={chip(current?.id === b.id)} title={`${b.name}${b.city ? `, ${b.city}` : ''} · ${isBranchType(b.type) ? BRANCH_TYPE_WORDS[b.type] : b.type}`}>
              {b.type === 'ASSEMBLY_PLANT' ? <Icon name="garage" size={13} /> : null}{b.name}{b.city ? <span className={`hidden text-[10px] md:inline ${current?.id === b.id ? 'text-white/80' : 'text-[var(--ejo-text-muted)]'}`}>{b.city}</span> : null}
            </button>
          ))}
        </nav>
        <span className="hidden shrink-0 text-[11px] text-[var(--ejo-text-muted)] lg:inline" role="status">
          {pending ? 'Switching…' : elsewhere && current ? null : current ? `Every page shows ${current.name} only` : area && here.length < options.branches.length ? `Showing the ${here.length === 1 ? 'branch' : `${here.length} branches`} with ${AREA_WORDS[area] ?? 'this area'}` : 'Every page shows the whole organisation'}
        </span>
      </div>
      {/* The plant's own pages explain this themselves, with a one-tap switch (PlantReachNotice). */}
      {elsewhere && current && area && area !== 'plant' ? (
        <p role="alert" data-testid="branch-lens-elsewhere" className="mt-2 text-xs text-[var(--ejo-warning-text)]">
          You are viewing {current.name}, which does not have {AREA_WORDS[area] ?? 'this area'}. To see this page’s records, choose {here.length === 1 ? here[0]!.name : 'a branch that does'}, or All branches.
        </p>
      ) : null}
    </div>
  );
}
