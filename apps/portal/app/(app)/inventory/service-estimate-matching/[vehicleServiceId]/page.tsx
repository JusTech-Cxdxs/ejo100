import { notFound } from 'next/navigation';
import { listUnmatchedServiceEstimateStorePartLinesForVehicleService } from '@/lib/actions/vehicle-service-estimate';
import { getFittingPartsForVehicle, getStoreBranchId } from '@/lib/actions/store';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import { matchServiceEstimateStorePartLineFormAction } from '@/lib/actions/vehicle-service-estimate-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

const WRENCH_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--ejo-warning)]">
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
 * /inventory/estimate-matching/[jobCardId]/page.tsx — one Vehicle
 * Service's own dedicated matching page, same real fitment-filtered
 * Part picker with real stock on hand, same real "everything's
 * matched" completion state.
 */
export default async function VehicleServiceMatchingPage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleServiceId: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { vehicleServiceId } = await params;
  const { error, status } = await searchParams;
  const [branchId, service, lines] = await Promise.all([
    getStoreBranchId(),
    getVehicleService(vehicleServiceId),
    listUnmatchedServiceEstimateStorePartLinesForVehicleService(vehicleServiceId),
  ]);
  if (!service) notFound();

  const linesWithFittingParts = await Promise.all(
    lines.map(async (line: (typeof lines)[number]) => ({
      line,
      fittingParts: await getFittingPartsForVehicle(branchId, service.vehicle, undefined, line.partTypeId ?? undefined),
    })),
  );

  const vehicleLine = [service.vehicle.year, service.vehicle.make, service.vehicle.model, service.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';

  return (
    <div className="p-8">
      <LoadingLink href="/inventory/service-estimate-matching" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Service Estimate Matching
      </LoadingLink>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Match — {service.serviceNumber}</h1>
        <LoadingLink href={`/workshop/vehicle-service/${service.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">
          Open Vehicle Service
        </LoadingLink>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        {service.customer.fullName} —{' '}
        <LoadingLink href={`/workshop/vehicles/${service.vehicle.id}/edit`} className="hover:underline">
          {vehicleLine}
        </LoadingLink>
        {service.vehicle.plateNumber ? ` — ${service.vehicle.plateNumber}` : ''}
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'line_matched' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Matched." />
        </div>
      ) : null}

      {linesWithFittingParts.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-6">
          <p className="text-sm font-medium text-[var(--ejo-text)]">Every requested line for this Vehicle Service is matched.</p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            The supervisor and technician were notified automatically the moment the last line was matched — this
            estimate is ready for submission.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {linesWithFittingParts.map(({ line, fittingParts }) => (
            <div key={line.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {WRENCH_ICON}
                <span className="text-sm font-medium text-[var(--ejo-text)]">{line.partType?.name ?? line.description}</span>
                {line.partType ? (
                  <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                    {line.partType.category.name}
                  </span>
                ) : null}
                <span className="text-xs text-[var(--ejo-text-muted)]">× {Number(line.quantity)}</span>
              </div>

              {fittingParts.length === 0 ? (
                <p className="mt-2 pl-6 text-xs text-[var(--ejo-error)]">
                  No catalog Part for this vehicle and Part Type yet — add one under Parts Catalog before this line can be matched.
                </p>
              ) : (
                <form action={matchServiceEstimateStorePartLineFormAction} className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                  <FormPendingOverlay />
                  <input type="hidden" name="lineItemId" value={line.id} />
                  <input type="hidden" name="vehicleServiceId" value={service.id} />
                  <select
                    name="partId"
                    required
                    className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  >
                    {fittingParts.map((part: (typeof fittingParts)[number]) => (
                      <option key={part.id} value={part.id}>
                        {part.name} — {pluralize(Number(part.stock?.quantityOnHand ?? 0), part.baseUnitOfMeasure)} on hand
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    label="Match"
                    pendingLabel="Matching…"
                    className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  />
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
