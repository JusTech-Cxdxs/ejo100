import { listUnmatchedStorePartLines, getStoreBranchId } from '@/lib/actions/store';
import { listUnmatchedServiceEstimateStorePartLines } from '@/lib/actions/vehicle-service-estimate';
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

type MatchingGroup = {
  id: string;
  kind: 'JOB_CARD' | 'VEHICLE_SERVICE';
  number: string;
  vehicleId: string;
  vehicleLine: string;
  count: number;
};

/**
 * Store's own real, single starting point — every real Job Card AND
 * every real Vehicle Service currently waiting on Store, merged into
 * one queue. Store shouldn't have to check two different places to
 * see everything waiting on them; the real matching work itself
 * still lives on each one's own dedicated page, kept separate since
 * a Job Card and a Vehicle Service are genuinely different real
 * records underneath.
 */
export default async function EstimateMatchingPage({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) {
  const { type, q } = await searchParams;
  const branchId = await getStoreBranchId();
  const [jcLines, svLines] = await Promise.all([listUnmatchedStorePartLines(branchId), listUnmatchedServiceEstimateStorePartLines(branchId)]);

  const groupsById = new Map<string, MatchingGroup>();
  for (const line of jcLines) {
    const jc = line.estimate.jobCard;
    const existing = groupsById.get(`JOB_CARD-${jc.id}`);
    if (existing) {
      existing.count += 1;
    } else {
      groupsById.set(`JOB_CARD-${jc.id}`, {
        id: jc.id,
        kind: 'JOB_CARD',
        number: jc.jobNumber,
        vehicleId: jc.vehicle.id,
        vehicleLine: [jc.vehicle.year, jc.vehicle.make, jc.vehicle.model, jc.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file',
        count: 1,
      });
    }
  }
  for (const line of svLines) {
    const sv = line.estimate.vehicleService;
    const existing = groupsById.get(`VEHICLE_SERVICE-${sv.id}`);
    if (existing) {
      existing.count += 1;
    } else {
      groupsById.set(`VEHICLE_SERVICE-${sv.id}`, {
        id: sv.id,
        kind: 'VEHICLE_SERVICE',
        number: sv.serviceNumber,
        vehicleId: sv.vehicle.id,
        vehicleLine: [sv.vehicle.year, sv.vehicle.make, sv.vehicle.model, sv.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file',
        count: 1,
      });
    }
  }

  let groups = [...groupsById.values()];
  if (type === 'JOB_CARD' || type === 'VEHICLE_SERVICE') {
    groups = groups.filter((g) => g.kind === type);
  }
  const query = q?.trim().toLowerCase();
  if (query) {
    groups = groups.filter((g) => g.number.toLowerCase().includes(query) || g.vehicleLine.toLowerCase().includes(query));
  }
  groups.sort((a, b) => a.number.localeCompare(b.number));

  const jcCount = [...groupsById.values()].filter((g) => g.kind === 'JOB_CARD').length;
  const svCount = [...groupsById.values()].filter((g) => g.kind === 'VEHICLE_SERVICE').length;

  return (
    <div className="p-8">
      <LoadingLink href="/inventory" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Inventory
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Estimate Matching</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Every Job Card and Vehicle Service currently waiting on Store — open one to match its own Store Part lines.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex gap-2" action="/inventory/estimate-matching">
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search job number, service number, or vehicle…"
            className="w-72 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
            Search
          </button>
        </form>
        <div className="flex gap-2">
          <LoadingLink
            href={`/inventory/estimate-matching${q ? `?q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${!type ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}
          >
            All ({jcCount + svCount})
          </LoadingLink>
          <LoadingLink
            href={`/inventory/estimate-matching?type=JOB_CARD${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${type === 'JOB_CARD' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}
          >
            Job Cards ({jcCount})
          </LoadingLink>
          <LoadingLink
            href={`/inventory/estimate-matching?type=VEHICLE_SERVICE${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${type === 'VEHICLE_SERVICE' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}
          >
            Vehicle Services ({svCount})
          </LoadingLink>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Nothing waiting on Store right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={`${group.kind}-${group.id}`} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <LoadingLink
                href={group.kind === 'JOB_CARD' ? `/inventory/estimate-matching/${group.id}` : `/inventory/service-estimate-matching/${group.id}`}
                className="block transition hover:opacity-80"
              >
                <div className="flex items-center gap-2">
                  {WRENCH_ICON}
                  <span className="text-sm font-semibold text-[var(--ejo-text)]">{group.number}</span>
                  <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[9px] font-medium uppercase text-[var(--ejo-text-muted)]">
                    {group.kind === 'JOB_CARD' ? 'Job Card' : 'Vehicle Service'}
                  </span>
                </div>
                <span className="mt-3 inline-block rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)]">
                  {pluralize(group.count, 'line')} to match
                </span>
              </LoadingLink>
              <LoadingLink href={`/workshop/vehicles/${group.vehicleId}/edit`} className="mt-1 block pl-7 text-xs text-[var(--ejo-primary)] hover:underline">
                {group.vehicleLine}
              </LoadingLink>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
