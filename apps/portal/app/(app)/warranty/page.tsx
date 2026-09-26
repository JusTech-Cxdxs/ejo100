import { listWarranties } from '@/lib/actions/warranty';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { warrantyCoverage, WARRANTY_STATE_CLASS, WARRANTY_STATE_LABEL, type WarrantyCoverageState } from '@/lib/warranty-state';
import { formatDateOnly } from '@/lib/utils/format-date';

type Filter = 'all' | 'covered' | 'expiring' | 'pending' | 'expired' | 'inactive' | 'asset' | 'part';

const FILTER_STATES: Record<Exclude<Filter, 'all' | 'asset' | 'part'>, WarrantyCoverageState[]> = {
  covered: ['COVERED', 'EXPIRING_SOON'],
  expiring: ['EXPIRING_SOON'],
  pending: ['PENDING_VERIFICATION'],
  expired: ['EXPIRED'],
  inactive: ['SUSPENDED', 'VOID', 'TRANSFERRED'],
};

/**
 * Warranty register — every warranty number the organisation has issued:
 * vehicles registered by staff and parts warranted automatically at
 * release. Live coverage (computed, never stale), filters, search, and a
 * certificate for each.
 */
export default async function WarrantyRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { q, filter: rawFilter } = await searchParams;
  const filter: Filter = (['covered', 'expiring', 'pending', 'expired', 'inactive', 'asset', 'part'] as const).includes(rawFilter as never) ? (rawFilter as Filter) : 'all';
  const warranties = await listWarranties(q);
  const rows = warranties.map((w: (typeof warranties)[number]) => ({ w, cov: warrantyCoverage(w, w.vehicle?.mileage ?? null) }));
  const count = (states: WarrantyCoverageState[]) => rows.filter((r) => states.includes(r.cov.state)).length;
  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'asset' ? r.w.kind === 'ASSET' : filter === 'part' ? r.w.kind === 'PART' : FILTER_STATES[filter].includes(r.cov.state),
  );
  const card = (key: Filter, label: string, value: number, tone: string) => (
    <LoadingLink
      href={`/warranty?${[key === 'all' ? null : `filter=${key}`, q ? `q=${encodeURIComponent(q)}` : null].filter(Boolean).join('&')}`}
      className={`rounded-[var(--ejo-radius-lg)] border p-4 ${filter === key ? 'border-[var(--ejo-primary)] ring-1 ring-[var(--ejo-primary)]' : 'border-[var(--ejo-border)]'} bg-[var(--ejo-surface)] hover:border-[var(--ejo-primary)]`}
    >
      <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </LoadingLink>
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
            Every warranty number issued — vehicles registered by the warranty team, and parts warranted automatically the moment
            they are released to a customer&apos;s Job Card or Vehicle Service. Coverage is worked out live from dates and odometer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LoadingLink href="/warranty/register" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Register vehicle warranty
          </LoadingLink>
          <LoadingLink href="/warranty/claims" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
            Claims
          </LoadingLink>
          <LoadingLink href="/warranty/policies" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
            Policies
          </LoadingLink>
          <LoadingLink href="/warranty/providers" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
            Providers
          </LoadingLink>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {card('all', 'All warranties', rows.length, 'text-[var(--ejo-text)]')}
        {card('covered', 'Covered', count(['COVERED', 'EXPIRING_SOON']), 'text-[var(--ejo-success)]')}
        {card('expiring', 'Expiring in 30 days', count(['EXPIRING_SOON']), 'text-[var(--ejo-warning)]')}
        {card('pending', 'Pending verification', count(['PENDING_VERIFICATION']), 'text-[var(--ejo-info)]')}
        {card('expired', 'Expired', count(['EXPIRED']), 'text-[var(--ejo-text-muted)]')}
        {card('asset', 'Vehicle warranties', rows.filter((r) => r.w.kind === 'ASSET').length, 'text-[var(--ejo-text)]')}
        {card('part', 'Part warranties', rows.filter((r) => r.w.kind === 'PART').length, 'text-[var(--ejo-text)]')}
      </div>

      <form className="mb-4 flex gap-2" action="/warranty">
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by warranty number, customer, plate, VIN or part…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
          Search
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          {rows.length === 0 ? 'No warranties yet. Register a vehicle warranty, or set a warranty policy on a part so it is warranted when released.' : 'No warranties match this view.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Warranty</th>
                <th className="px-3 py-2">Covers</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Linked to</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Coverage</th>
                <th className="px-3 py-2 text-right">Print</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ w, cov }) => (
                <tr key={w.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2">
                    <LoadingLink href={`/warranty/${w.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {w.warrantyNumber}
                    </LoadingLink>
                    <div className="text-xs text-[var(--ejo-text-muted)]">
                      {w.kind === 'ASSET' ? 'Vehicle' : 'Part'} · {w.policy.code}
                      {w.policy.isSample ? ' · Sample terms' : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ejo-text)]">{w.subjectDescription}</td>
                  <td className="px-3 py-2 text-[var(--ejo-text)]">{w.customer.fullName}</td>
                  <td className="px-3 py-2 text-xs">
                    {w.jobCard ? (
                      <LoadingLink href={`/workshop/job-cards/${w.jobCard.id}`} className="block text-[var(--ejo-primary)] hover:underline">
                        {w.jobCard.jobNumber}
                      </LoadingLink>
                    ) : null}
                    {w.vehicleService ? (
                      <LoadingLink href={`/workshop/vehicle-service/${w.vehicleService.id}`} className="block text-[var(--ejo-primary)] hover:underline">
                        {w.vehicleService.serviceNumber}
                      </LoadingLink>
                    ) : null}
                    {w.slipLine ? (
                      <LoadingLink href={`/workshop/parts-requests/${w.slipLine.slip.id}`} className="block text-[var(--ejo-primary)] hover:underline">
                        {w.slipLine.slip.referenceNumber}
                      </LoadingLink>
                    ) : null}
                    {w.vehicle ? (
                      <LoadingLink href={`/workshop/vehicles/${w.vehicle.id}/edit`} className="block text-[var(--ejo-primary)] hover:underline">
                        {w.vehicle.plateNumber ?? 'Vehicle'}
                      </LoadingLink>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                    {formatDateOnly(w.startsAt)} → {formatDateOnly(w.endsAt)}
                    {w.distanceLimit !== null && w.startReading !== null ? <div>or {(w.startReading + w.distanceLimit).toLocaleString('en-NG')} km</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${WARRANTY_STATE_CLASS[cov.state]}`}>{WARRANTY_STATE_LABEL[cov.state]}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <PrintMenu orgHref={`/print/warranty/${w.id}`} clientHref={`/print/warranty/${w.id}?variant=client`} clientLabel="Customer Copy" size="compact" align="right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
