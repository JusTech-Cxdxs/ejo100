import { FormJumpLink } from '@/components/ui/FormJumpLink';
import { SOURCE_PARAMS } from '@/lib/source-filter';
import { SourceFilterBar } from '@/components/SourceFilterBar';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { guardAnyPage, allows } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { listAllVehicles } from '@/lib/actions/workshop';
import { createVehicleFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { BinnedNotice } from '@/components/RecycleBinPanel';
import { SegmentedCodeInput } from '@/components/SegmentedCodeInput';
import { CustomerSearchField } from '@/components/CustomerSearchField';
import { VehicleMakeModelPicker } from '@/components/VehicleMakeModelPicker';
import { CategoryFilterTabs } from '@/components/CategoryFilterTabs';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { PageHeader } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

export default async function WorkshopVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; error?: string; binned?: string } & Partial<Record<(typeof SOURCE_PARAMS)[number], string>>>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const sp = await searchParams;
  const { q, type, status, error, binned } = sp;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const vehicleType = type === 'PASSENGER' || type === 'COMMERCIAL' ? type : undefined;
  // Deleting a vehicle is done from its own page (Danger zone).
  const vehicles = await listAllVehicles(q, vehicleType, sp);

  return (
    <div className="p-8">
      <PageHeader
        icon="car"
        back={{ href: "/workshop", label: "Back to Workshop" }}
        title="Vehicles"
        description={<><OrgTrail area="Workshop" /></>}
      />

      {status === 'vehicle_created' ? (
        <FormFeedbackBanner kind="success" message="Vehicle registered successfully." />
      ) : null}
      {status === 'vehicle_updated' ? (
        <FormFeedbackBanner kind="success" message="Vehicle updated." />
      ) : null}
      <BinnedNotice reference={binned} />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <CategoryFilterTabs basePath="/workshop/vehicles" currentType={vehicleType} preserveParams={{ q }} />

      <form className="mb-6 flex gap-2" action="/workshop/vehicles">
        {vehicleType ? <input type="hidden" name="type" value={vehicleType} /> : null}
        <LiveSearchInput
          type="search" name="q"
          defaultValue={q ?? ''}
          placeholder="Search by plate, chassis/VIN, make, or model…"
          className="w-full max-w-sm rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
      </form>
      <div className="mb-6"><SourceFilterBar action="/workshop/vehicles" values={sp} keep={{ q, type: vehicleType }} /></div>

      <FormJumpLink target="register-vehicle">New vehicle</FormJumpLink>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          {vehicles.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              {q || vehicleType
                ? 'No vehicles match this filter.'
                : 'No vehicles registered yet.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Plate</th>
                  <th className="px-4 py-3 font-medium">Chassis / VIN</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Mileage</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                  <th className="px-4 py-3 font-medium">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v: (typeof vehicles)[number]) => (
                  <tr key={v.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">
                      {v.plateNumber || <span className="text-[var(--ejo-text-muted)]">—</span>}
                    </td>
                    <td data-label="Chassis / VIN" className="px-4 py-3 font-mono text-xs text-[var(--ejo-text-muted)]">
                      {v.chassisNumber || '—'}
                    </td>
                    <td data-label="Vehicle" className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      <LoadingLink href={`/workshop/vehicles/${v.id}/edit`} className="hover:underline hover:text-[var(--ejo-text)]">
                        {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
                      </LoadingLink>
                    </td>
                    <td data-label="Type" className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {v.vehicleType === 'PASSENGER' ? 'Passenger' : v.vehicleType === 'COMMERCIAL' ? 'Commercial' : '—'}
                    </td>
                    <td data-label="Owner" className="px-4 py-3 text-[var(--ejo-text-muted)]"><CustomerLink id={v.customerId} name={v.customer.fullName} canView={canSeeCustomers} /></td>
                    <td data-label="Mileage" className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {v.mileage != null ? `${v.mileage.toLocaleString('en-NG')} km` : '—'}
                    </td>
                    <td data-label="Registered" className="px-4 py-3 text-xs text-[var(--ejo-text-muted)]">
                      {formatDateTimeCompact(v.createdAt)}
                      {v.createdBy ? <><br />by {v.createdBy.fullName}</> : null}
                    </td>
                    <td data-actions className="px-4 py-3">
                      <LoadingLink href={`/workshop/vehicles/${v.id}/edit`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">
                        View
                      </LoadingLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ResponsiveTable>

        <div id="register-vehicle" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 xl:sticky xl:top-6 scroll-mt-20">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Register vehicle</h2>
          <form action={createVehicleFormAction} className="mt-4 space-y-4">
              <FormPendingOverlay />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Owner</label>
                <CustomerSearchField required />
              </div>
              <VehicleMakeModelPicker />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Year <span className="text-[var(--ejo-error)]">*</span></label>
                  <input name="year" type="number" required className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage (km)</label>
                  <input name="mileage" type="number" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                  Plate number <span className="text-[var(--ejo-error)]">*</span>{' '}
                  <span className="text-[var(--ejo-text-muted)] font-normal">(AAA 000 AA)</span>
                </label>
                <SegmentedCodeInput name="plateNumber" length={8} groups={[3, 3, 2]} placeholder="LAGXXXAA" />
                <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
                  No two registered vehicles can share the same plate.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                  Chassis / VIN <span className="text-[var(--ejo-error)]">*</span>{' '}
                  <span className="text-[var(--ejo-text-muted)] font-normal">(17 characters)</span>
                </label>
                <SegmentedCodeInput name="chassisNumber" length={17} groups={[9, 8]} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Engine number</label>
                <input name="engineNumber" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>

              <SubmitButton
                label="Register vehicle"
                pendingLabel="Registering…"
                className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              />
            </form>
        </div>
      </div>
    </div>
  );
}
