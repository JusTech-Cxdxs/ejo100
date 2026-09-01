import { notFound } from 'next/navigation';
import { getVehicle, getLastEditInfo } from '@/lib/actions/workshop';
import { updateVehicleFormAction } from '@/lib/actions/workshop-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { VehicleMakeModelPicker } from '@/components/VehicleMakeModelPicker';
import { SegmentedCodeInput } from '@/components/SegmentedCodeInput';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

/**
 * Edits an existing vehicle — the same required fields as registration
 * (Type/Make/Model/Year/Plate/Chassis), same validation rules,
 * duplicate plate/chassis checks correctly excluding this vehicle's
 * own current row. Shows real "registered by" and "last edited by"
 * info — the second derived from the audit trail (the single source
 * of truth already used everywhere else in this project for history),
 * not a separate field that could drift out of sync with what actually
 * happened.
 */
export default async function EditVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();
  const lastEdit = await getLastEditInfo('CustomerVehicle', id, 'vehicle.updated');

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/vehicles" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Vehicles
      </LoadingLink>
      <h1 className="mb-1 text-2xl font-bold text-[var(--ejo-text)]">Edit Vehicle</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        {vehicle.plateNumber || vehicle.chassisNumber} — owned by {vehicle.customer.fullName}
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <form action={updateVehicleFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="id" value={vehicle.id} />

          <VehicleMakeModelPicker
            defaultCategory={vehicle.vehicleType ?? undefined}
            defaultMake={vehicle.make ?? undefined}
            defaultModel={vehicle.model ?? undefined}
            defaultEngineType={vehicle.engineType ?? undefined}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                Year <span className="text-[var(--ejo-error)]">*</span>
              </label>
              <input
                name="year"
                type="number"
                required
                defaultValue={vehicle.year ?? undefined}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage (km)</label>
              <input
                name="mileage"
                type="number"
                defaultValue={vehicle.mileage ?? undefined}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
              Plate number <span className="text-[var(--ejo-error)]">*</span>{' '}
              <span className="text-[var(--ejo-text-muted)] font-normal">(AAA 000 AA)</span>
            </label>
            <SegmentedCodeInput name="plateNumber" length={8} groups={[3, 3, 2]} defaultValue={vehicle.plateNumber ?? ''} placeholder="LAGXXXAA" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
              Chassis / VIN <span className="text-[var(--ejo-error)]">*</span>{' '}
              <span className="text-[var(--ejo-text-muted)] font-normal">(17 characters)</span>
            </label>
            <SegmentedCodeInput name="chassisNumber" length={17} groups={[9, 8]} defaultValue={vehicle.chassisNumber ?? ''} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Engine number</label>
            <input
              name="engineNumber"
              defaultValue={vehicle.engineNumber ?? ''}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <SubmitButton
            label="Save Changes"
            pendingLabel="Saving…"
            className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">History</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Registered</dt>
              <dd className="text-[var(--ejo-text)]">
                {formatDateTimeCompact(vehicle.createdAt)}
                {vehicle.createdBy ? <><br />by {vehicle.createdBy.fullName}</> : null}
              </dd>
            </div>
            {lastEdit ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Last Edited</dt>
                <dd className="text-[var(--ejo-text)]">
                  {formatDateTimeCompact(lastEdit.at)}
                  <br />by {lastEdit.userName}
                </dd>
              </div>
            ) : (
              <p className="text-xs text-[var(--ejo-text-muted)]">Not edited since registration.</p>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
