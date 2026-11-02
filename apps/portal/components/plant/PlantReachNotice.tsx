'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBranchLens } from '@/lib/actions/branch-lens';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';

type Reach = { branches: { id: string; name: string }[]; reason: 'ok' | 'no-access' | 'no-branch-of-type' | 'lens-elsewhere'; elsewhere: { id: string; name: string }[] };

/**
 * Why a plant page is empty for this person, in plain words — never another
 * branch's records: their branch is not an assembly plant, the organisation
 * has none yet, or their branch lens points at a workshop (one tap moves it).
 */
export function PlantReachNotice({ reach, canManageStructure }: { reach: Reach; canManageStructure: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (reach.reason === 'ok') return null;
  if (reach.reason === 'lens-elsewhere') {
    return (
      <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]" data-testid="plant-reach">
        <EmptyState compact icon="garage" title="You are looking at a branch that is not an assembly plant.">
          <span>The plant’s kits, line, PDIs and yard are at {reach.elsewhere.map((b) => b.name).join(' and ')}.</span>
          <span className="mt-3 flex flex-wrap justify-center gap-2">
            {reach.elsewhere.map((b) => (
              <button key={b.id} type="button" disabled={pending} onClick={() => start(async () => { const r = await setBranchLens(b.id); if ('ok' in r) router.refresh(); })} className="ejo-press rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Look at {b.name}</button>
            ))}
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setBranchLens(''); if ('ok' in r) router.refresh(); })} className="ejo-press rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-semibold text-[var(--ejo-text)] disabled:opacity-50">All branches</button>
          </span>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]" data-testid="plant-reach">
      <EmptyState compact icon="garage" title={reach.reason === 'no-access' ? 'The assembly plant is for the plant team.' : 'No assembly plant is in your reach.'}>
        {reach.reason === 'no-access' ? null : canManageStructure
          ? <span>Plant records live on a branch of kind <b>Assembly plant</b>. Open one under <Link href="/structure" className="font-medium text-[var(--ejo-primary)] hover:underline">Organisation structure</Link> (with its SAP plant code), or set an existing branch’s kind under <Link href="/branches" className="font-medium text-[var(--ejo-primary)] hover:underline">Branches</Link>.</span>
          : <span>Your branch is a workshop, not an assembly plant. If you work at the plant, ask an administrator to move you to the plant’s branch.</span>}
      </EmptyState>
    </div>
  );
}
