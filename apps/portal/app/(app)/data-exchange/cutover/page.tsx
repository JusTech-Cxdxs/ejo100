import Link from 'next/link';
import { guardAnyPage } from '@/lib/authz/server';
import { listCutoverBranches } from '@/lib/actions/data-exchange-cutover';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** The cut-over, branch by branch: how far each has come, and which are signed off as cut over. */
export default async function CutoverPage() {
  await guardAnyPage(['dataexchange.import.run', 'dataexchange.import.approve'], '/data-exchange/cutover');
  const branches = await listCutoverBranches();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="check-circle" back={{ href: '/data-exchange', label: 'Back to Data Exchange' }} title="Cut-over checklist"
        description="For each branch, every file it needs from SAP or the old registers, in the order they load, and where each stands — worked out from the imports themselves. A step a branch has nothing for is marked not needed, with a reason. When every step is settled, the branch is signed off as cut over; the sign-off keeps the checklist as it stood." />
      <SectionCard icon="layers" title="Branches" flush>
        {branches.length === 0 ? <div className="p-4"><EmptyState compact icon="inbox" title="No workshop, warehouse or assembly plant yet." /></div> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {branches.map((b) => (
              <li key={b.id} data-testid="cutover-branch" className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/data-exchange/cutover/${b.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{b.name}</Link>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{b.typeWords} · {b.settled} of {b.total} steps settled</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-[var(--ejo-border)]" role="progressbar" aria-label={`${b.name}: ${b.settled} of ${b.total} steps settled`} aria-valuemin={0} aria-valuemax={b.total} aria-valuenow={b.settled}>
                    <div className="h-full bg-[var(--ejo-primary)]" style={{ width: `${b.total ? Math.round((b.settled / b.total) * 100) : 0}%` }} />
                  </div>
                  {b.signedOff ? <StatusChip label={`Cut over · ${formatDateTimeCompact(b.signedOff.at)}`} tone="success" /> : <StatusChip label="In progress" tone={b.settled ? 'warning' : 'neutral'} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
