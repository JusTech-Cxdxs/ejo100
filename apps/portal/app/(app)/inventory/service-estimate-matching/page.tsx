import { listUnmatchedServiceEstimateStorePartLines } from '@/lib/actions/vehicle-service-estimate';
import { getStoreBranchId } from '@/lib/actions/store';
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
 * The real Vehicle Service equivalent of Job Card's own
 * /inventory/estimate-matching index page — same exact real pattern,
 * one clickable card per Vehicle Service currently waiting on Store,
 * with the actual matching work living on that Vehicle Service's own
 * dedicated page.
 */
export default async function ServiceEstimateMatchingPage() {
  const branchId = await getStoreBranchId();
  const lines = await listUnmatchedServiceEstimateStorePartLines(branchId);

  const groupsByVehicleService = new Map<string, { vehicleService: (typeof lines)[number]['estimate']['vehicleService']; count: number }>();
  for (const line of lines) {
    const vehicleServiceId = line.estimate.vehicleService.id;
    const existing = groupsByVehicleService.get(vehicleServiceId);
    if (existing) {
      existing.count += 1;
    } else {
      groupsByVehicleService.set(vehicleServiceId, { vehicleService: line.estimate.vehicleService, count: 1 });
    }
  }
  const groups = [...groupsByVehicleService.values()];

  return (
    <div className="p-8">
      <LoadingLink href="/inventory" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Inventory
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Service Estimate Matching</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Every Vehicle Service currently waiting on Store — open one to match its own Store Part lines.
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Nothing waiting on Store right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const vehicle = group.vehicleService.vehicle;
            const vehicleLine = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
            return (
              <LoadingLink
                key={group.vehicleService.id}
                href={`/inventory/service-estimate-matching/${group.vehicleService.id}`}
                className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5 transition hover:border-[var(--ejo-warning)]/60"
              >
                <div className="flex items-center gap-2">
                  {WRENCH_ICON}
                  <span className="text-sm font-semibold text-[var(--ejo-text)]">{group.vehicleService.serviceNumber}</span>
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
