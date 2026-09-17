import { getVehicleServiceCustodySummary } from '@/lib/actions/vehicle-service';
import { getWorkshopBranchId } from '@/lib/actions/workshop';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateOnly } from '@/lib/utils/format-date';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
};

/**
 * "Vehicles In Custody — Vehicle Service", the real Vehicle Service
 * equivalent of Job Card's own custody page. Genuinely different
 * categories, since this is about routine servicing rather than
 * physical-custody/collection deadlines: what's currently in
 * service, what's done and waiting on the customer, and — this is
 * the one real place a future reminder job would read from — which
 * real vehicles are coming due or already overdue for their next
 * service, reusing listVehiclesDueForService directly rather than a
 * second, separately-maintained calculation.
 */
export default async function VehicleServiceCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;
  const branchId = await getWorkshopBranchId();
  const summary = await getVehicleServiceCustodySummary(branchId, q);

  const showInService = !filter || filter === 'in_service';
  const showCompleted = !filter || filter === 'completed';
  const showDueSoon = !filter || filter === 'due_soon';
  const showOverdue = !filter || filter === 'overdue';

  return (
    <div className="p-8">
      <LoadingLink href="/workshop" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Workshop
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Vehicles In Custody — Vehicle Service</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
      </p>

      <form className="mb-8 flex gap-2" action="/workshop/vehicle-service-custody">
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by service number, plate, or customer…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
          Search
        </button>
        {q ? (
          <LoadingLink
            href={filter ? `/workshop/vehicle-service-custody?filter=${filter}` : '/workshop/vehicle-service-custody'}
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=in_service${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'in_service' ? 'border-[var(--ejo-info)]' : 'border-[var(--ejo-info)]/30'} bg-[var(--ejo-info)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">In Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-info)]">{summary.inService.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=completed${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'completed' ? 'border-[var(--ejo-success)]' : 'border-[var(--ejo-success)]/30'} bg-[var(--ejo-success)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Completed — Awaiting Collection</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-success)]">{summary.completed.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=due_soon${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'due_soon' ? 'border-[var(--ejo-warning)]' : 'border-[var(--ejo-warning)]/30'} bg-[var(--ejo-warning)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Due Soon</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-warning)]">{summary.dueSoon.length}</p>
        </LoadingLink>
        <LoadingLink
          href={`/workshop/vehicle-service-custody?filter=overdue${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={`block rounded-[var(--ejo-radius-lg)] border p-5 transition hover:opacity-80 ${filter === 'overdue' ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-error)]/30'} bg-[var(--ejo-error)]/5`}
        >
          <p className="text-xs text-[var(--ejo-text-muted)]">Overdue for Service</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-error)]">{summary.overdue.length}</p>
        </LoadingLink>
      </div>
      {filter ? (
        <div className="mb-6">
          <LoadingLink href={q ? `/workshop/vehicle-service-custody?q=${encodeURIComponent(q)}` : '/workshop/vehicle-service-custody'} className="text-xs text-[var(--ejo-primary)] hover:underline">
            ← Clear category filter, show everything
          </LoadingLink>
        </div>
      ) : null}

      {showInService ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">In Service</h2>
          {summary.inService.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">No vehicles currently in service.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="px-4 py-2">Service</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Vehicle</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.inService.map((entry: (typeof summary.inService)[number]) => (
                    <tr key={entry.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2">
                        <LoadingLink href={`/workshop/vehicle-service/${entry.id}`} className="text-[var(--ejo-primary)] hover:underline">
                          {entry.serviceNumber}
                        </LoadingLink>
                      </td>
                      <td className="px-4 py-2 text-[var(--ejo-text)]">{entry.customerName}</td>
                      <td className="px-4 py-2 text-[var(--ejo-text)]">{entry.vehicleDescription}</td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{STATUS_LABEL[entry.status] ?? entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showCompleted ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Completed — Awaiting Collection</h2>
          {summary.completed.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">Nothing currently waiting on collection.</p>
          ) : (
            <div className="space-y-3">
              {summary.completed.map((entry: (typeof summary.completed)[number]) => (
                <div key={entry.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <LoadingLink href={`/workshop/vehicle-service/${entry.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {entry.serviceNumber}
                      </LoadingLink>
                      <p className="text-sm text-[var(--ejo-text)]">{entry.customerName} — {entry.vehicleDescription}</p>
                    </div>
                    <span className="rounded-full bg-[var(--ejo-success)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-success)]">
                      Completed {formatDateOnly(entry.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showDueSoon ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Due Soon</h2>
          {summary.dueSoon.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">Nothing due for service soon.</p>
          ) : (
            <div className="space-y-3">
              {summary.dueSoon.map((entry: (typeof summary.dueSoon)[number]) => (
                <div key={entry.vehicleId} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {entry.vehicleDescription}{entry.plateNumber ? ` — ${entry.plateNumber}` : ''}
                      </LoadingLink>
                      <p className="text-sm text-[var(--ejo-text)]">{entry.customerName}</p>
                    </div>
                    <div className="text-right text-xs text-[var(--ejo-text-muted)]">
                      {entry.nextServiceDueOdometer ? <p>{entry.nextServiceDueOdometer.toLocaleString('en-NG')} km</p> : null}
                      {entry.nextServiceDueDate ? <p>{formatDateOnly(entry.nextServiceDueDate)}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showOverdue ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Overdue for Service</h2>
          {summary.overdue.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">{pluralize(0, 'vehicle')} overdue for service right now.</p>
          ) : (
            <div className="space-y-3">
              {summary.overdue.map((entry: (typeof summary.overdue)[number]) => (
                <div key={entry.vehicleId} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <LoadingLink href={`/workshop/vehicles/${entry.vehicleId}/edit`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {entry.vehicleDescription}{entry.plateNumber ? ` — ${entry.plateNumber}` : ''}
                      </LoadingLink>
                      <p className="text-sm text-[var(--ejo-text)]">{entry.customerName}</p>
                    </div>
                    <span className="rounded-full bg-[var(--ejo-error)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-error)]">
                      Overdue
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
