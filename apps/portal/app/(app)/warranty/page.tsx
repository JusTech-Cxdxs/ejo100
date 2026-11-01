import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { listWarranties, listWarrantyIdsWithReminderDue } from '@/lib/actions/warranty';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { warrantyCoverage, WARRANTY_STATE_LABEL, type WarrantyCoverageState } from '@/lib/warranty-state';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { EmptyState, HeaderAction, Icon, PageHeader, StatusChip, type IconName } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

import { parseWarrantyFilter, warrantyMatchesFilter, type WarrantyListFilter as Filter } from '@/lib/warranty-list';
import { ExportAction } from '@/components/ExportAction';

/**
 * Warranty register — every warranty number the organisation has issued:
 * vehicles registered by staff and parts warranted automatically at
 * release. Live coverage (computed, never stale), filters, search, and a
 * certificate for each.
 */
export default async function WarrantyRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await guardAnyPage(['warranty.view'], '/warranty');
  const { q, filter: rawFilter } = await searchParams;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const filter: Filter = parseWarrantyFilter(rawFilter);
  const [warranties, reminderDueIds, canAnalytics] = await Promise.all([listWarranties(q), listWarrantyIdsWithReminderDue(), allows('analytics.warranty.view')]);
  const reminderDue = new Set(reminderDueIds);
  const rows = warranties.map((w: (typeof warranties)[number]) => ({ w, cov: warrantyCoverage(w, w.vehicle?.mileage ?? null) }));
  const count = (states: WarrantyCoverageState[]) => rows.filter((r) => states.includes(r.cov.state)).length;
  const shown = rows.filter((r) => warrantyMatchesFilter(filter, { kind: r.w.kind, state: r.cov.state, reminderDue: reminderDue.has(r.w.id) }));
  const card = (key: Filter, label: string, value: number, tone: string, icon: IconName) => (
    <LoadingLink
      href={`/warranty?${[key === 'all' ? null : `filter=${key}`, q ? `q=${encodeURIComponent(q)}` : null].filter(Boolean).join('&')}`}
      aria-current={filter === key ? 'true' : undefined}
      className={`ejo-lift group rounded-[var(--ejo-radius-lg)] border p-4 ${filter === key ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/5 ring-1 ring-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'} hover:border-[var(--ejo-primary)]`}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ejo-bg)] ring-1 ring-[var(--ejo-border)] ${tone === 'text-[var(--ejo-text)]' ? 'text-[var(--ejo-primary)]' : tone}`}><Icon name={icon} size={16} /></span>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
    </LoadingLink>
  );

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="shield-check"
        eyebrow="Module"
        title="Warranty"
        description={<>Every warranty number issued — vehicles registered by the warranty team, and parts warranted automatically the moment
            they are released to a customer&apos;s Job Card or Vehicle Service. Coverage is worked out live from dates and odometer.</>}
        actions={<>
          <ExportAction kind="warranties" params={{ q, filter: rawFilter }} />
          <HeaderAction href="/warranty/register">Register vehicle warranty</HeaderAction>
          <HeaderAction href="/warranty/claims" icon="file" variant="secondary">Claims</HeaderAction>
          {canAnalytics ? <HeaderAction href="/warranty/analytics" icon="chart" variant="secondary">Analytics</HeaderAction> : null}
          <HeaderAction href="/warranty/policies" icon="list" variant="secondary">Policies</HeaderAction>
          <HeaderAction href="/warranty/providers" icon="building" variant="secondary">Providers</HeaderAction>
        </>}
      />

      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {card('all', 'All warranties', rows.length, 'text-[var(--ejo-text)]', 'shield-check')}
        {card('covered', 'Covered', count(['COVERED', 'EXPIRING_SOON']), 'text-[var(--ejo-success)]', 'check-circle')}
        {card('expiring', 'Expiring in 30 days', count(['EXPIRING_SOON']), 'text-[var(--ejo-warning-text)]', 'clock')}
        {card('pending', 'Pending verification', count(['PENDING_VERIFICATION']), 'text-[var(--ejo-info)]', 'eye')}
        {card('expired', 'Expired', count(['EXPIRED']), 'text-[var(--ejo-text-muted)]', 'history')}
        {card('asset', 'Vehicle warranties', rows.filter((r) => r.w.kind === 'ASSET').length, 'text-[var(--ejo-text)]', 'car')}
        {card('part', 'Part warranties', rows.filter((r) => r.w.kind === 'PART').length, 'text-[var(--ejo-text)]', 'package')}
        {card('reminder', 'Expiry reminders due', rows.filter((r) => reminderDue.has(r.w.id)).length, 'text-[var(--ejo-warning-text)]', 'bell')}
      </div>

      <form className="mb-4 flex gap-2" action="/warranty">
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <LiveSearchInput
          type="search" name="q"
          defaultValue={q ?? ''}
          placeholder="Search by warranty number, customer, plate, VIN or part…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
          Search
        </button>
      </form>

      {shown.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <EmptyState icon="shield-check" title={rows.length === 0 ? 'No warranties yet' : 'Nothing in this view'}>
            {rows.length === 0 ? 'No warranties yet. Register a vehicle warranty, or set a warranty policy on a part so it is warranted when released.' : 'No warranties match this view.'}
          </EmptyState>
        </div>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
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
                  <td data-label="Covers" className="px-3 py-2 text-[var(--ejo-text)]">{w.subjectDescription}</td>
                  <td data-label="Customer" className="px-3 py-2 text-[var(--ejo-text)]"><CustomerLink id={w.customerId} name={w.customer.fullName} canView={canSeeCustomers} /></td>
                  <td data-label="Linked to" className="px-3 py-2 text-xs">
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
                  <td data-label="Period" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                    {formatDateOnly(w.startsAt)} → {formatDateOnly(w.endsAt)}
                    {w.distanceLimit !== null && w.startReading !== null ? <div>or {(w.startReading + w.distanceLimit).toLocaleString('en-NG')} km</div> : null}
                  </td>
                  <td data-label="Coverage" className="px-3 py-2">
                    <StatusChip status={cov.state} label={WARRANTY_STATE_LABEL[cov.state]} />
                  </td>
                  <td data-actions className="px-3 py-2 text-right">
                    <PrintMenu orgHref={`/print/warranty/${w.id}`} clientHref={`/print/warranty/${w.id}?variant=client`} clientLabel="Customer Copy" size="compact" align="right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
