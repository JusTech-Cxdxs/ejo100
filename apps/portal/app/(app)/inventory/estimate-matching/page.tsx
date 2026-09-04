import { listUnmatchedStorePartLines, getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';

const WRENCH_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-[var(--ejo-warning)]">
    <path
      d="M14.5 3.5a3 3 0 00-3.86 3.86L4 14l2 2 6.64-6.64a3 3 0 003.86-3.86l-2.1 2.1-1.9-.5-.5-1.9 2.1-2.1z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Store's own real starting point — every Job Card that currently has
 * at least one Store Part line waiting to be matched, one clickable
 * card per Job Card rather than the actual matching work happening
 * here directly. The real matching itself lives on this Job Card's
 * own dedicated page (/inventory/estimate-matching/[jobCardId]) —
 * properly styled with its own vehicle details, the same way a real
 * Job Card or Part detail page gets its own page rather than
 * everything stacked together in one shared view.
 */
export default async function EstimateMatchingPage() {
  const branchId = await getStoreBranchId();
  const lines = await listUnmatchedStorePartLines(branchId);

  const groupsByJobCard = new Map<string, { jobCard: (typeof lines)[number]['estimate']['jobCard']; count: number }>();
  for (const line of lines) {
    const jobCardId = line.estimate.jobCard.id;
    const existing = groupsByJobCard.get(jobCardId);
    if (existing) {
      existing.count += 1;
    } else {
      groupsByJobCard.set(jobCardId, { jobCard: line.estimate.jobCard, count: 1 });
    }
  }
  const groups = [...groupsByJobCard.values()];

  return (
    <div className="p-8">
      <LoadingLink href="/inventory" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Inventory
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Estimate Matching</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Every Job Card currently waiting on Store — open one to match its own Store Part lines.
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Nothing waiting on Store right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const vehicle = group.jobCard.vehicle;
            const vehicleLine = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
            return (
              <LoadingLink
                key={group.jobCard.id}
                href={`/inventory/estimate-matching/${group.jobCard.id}`}
                className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5 transition hover:border-[var(--ejo-warning)]/60"
              >
                <div className="flex items-center gap-2">
                  {WRENCH_ICON}
                  <span className="text-sm font-semibold text-[var(--ejo-text)]">{group.jobCard.jobNumber}</span>
                </div>
                <p className="mt-1 pl-7 text-xs text-[var(--ejo-text-muted)]">{vehicleLine}</p>
                <span className="mt-3 inline-block rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)]">
                  {pluralize(group.count, 'line')} to match
                </span>
              </LoadingLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
