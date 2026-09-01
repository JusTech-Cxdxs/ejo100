import { LoadingLink } from '@/components/LoadingLink';
import { listAllVehicles, currentUserIsMasterAdmin } from '@/lib/actions/workshop';
import { createVehicleFormAction, deleteVehicleFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SegmentedCodeInput } from '@/components/SegmentedCodeInput';
import { CustomerSearchField } from '@/components/CustomerSearchField';
import { VehicleMakeModelPicker } from '@/components/VehicleMakeModelPicker';
import { CategoryFilterTabs } from '@/components/CategoryFilterTabs';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export default async function WorkshopVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; error?: string }>;
}) {
  const { q, type, status, error } = await searchParams;
  const vehicleType = type === 'PASSENGER' || type === 'COMMERCIAL' ? type : undefined;
  const [vehicles, isMasterAdmin] = await Promise.all([
    listAllVehicles(q, vehicleType),
    currentUserIsMasterAdmin(),
  ]);

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </LoadingLink>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicles</h1>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
        </p>
      </div>

      {status === 'vehicle_created' ? (
        <FormFeedbackBanner kind="success" message="Vehicle registered successfully." />
      ) : null}
      {status === 'vehicle_updated' ? (
        <FormFeedbackBanner kind="success" message="Vehicle updated." />
      ) : null}
      {status === 'vehicle_deleted' ? (
        <FormFeedbackBanner kind="success" message="Vehicle deleted." />
      ) : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <CategoryFilterTabs basePath="/workshop/vehicles" currentType={vehicleType} preserveParams={{ q }} />

      <form className="mb-6 flex gap-2" action="/workshop/vehicles">
        {vehicleType ? <input type="hidden" name="type" value={vehicleType} /> : null}
        <input
          type="search"
          name="q"
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

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-x-auto">
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
                  {isMasterAdmin ? <th className="px-4 py-3 font-medium">&nbsp;</th> : null}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v: (typeof vehicles)[number]) => (
                  <tr key={v.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">
                      {v.plateNumber || <span className="text-[var(--ejo-text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--ejo-text-muted)]">
                      {v.chassisNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {v.vehicleType === 'PASSENGER' ? 'Passenger' : v.vehicleType === 'COMMERCIAL' ? 'Commercial' : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{v.customer.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {v.mileage != null ? `${v.mileage.toLocaleString()} km` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--ejo-text-muted)]">
                      {formatDateTimeCompact(v.createdAt)}
                      {v.createdBy ? <><br />by {v.createdBy.fullName}</> : null}
                    </td>
                    <td className="px-4 py-3">
                      <LoadingLink href={`/workshop/vehicles/${v.id}/edit`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">
                        Edit
                      </LoadingLink>
                    </td>
                    {isMasterAdmin ? (
                      <td className="px-4 py-3">
                        <form action={deleteVehicleFormAction}>
                          <FormPendingOverlay />
                          <input type="hidden" name="vehicleId" value={v.id} />
                          <ConfirmDeleteButton
                            confirmMessage={`Delete ${v.plateNumber || v.chassisNumber || 'this vehicle'}? This permanently deletes it and every Job Card for it. This cannot be undone.`}
                            className="text-xs font-medium text-[var(--ejo-error)] hover:underline"
                          />
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
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
