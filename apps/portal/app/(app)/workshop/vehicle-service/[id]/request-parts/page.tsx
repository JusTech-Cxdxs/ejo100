import { notFound } from 'next/navigation';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import { getVehicleServiceSourcingNeeds, getRequestableServiceEstimatePartRequestLines } from '@/lib/actions/sourcing';
import { requestServiceEstimatePartRequestSlipFormAction } from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The real Vehicle Service equivalent of Job Card's own request-parts
 * page — same read-only "review, then raise" preview, same header
 * context, same columns and total. Nothing here is re-entered: every
 * Store Part line was already matched, priced and approved before this
 * page can be reached at all.
 */
export default async function VehicleServiceRequestPartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const service = await getVehicleService(id);
  if (!service) notFound();

  const sourcingNeeds = await getVehicleServiceSourcingNeeds(id);
  const requestableLines = sourcingNeeds.serviceEstimateId ? await getRequestableServiceEstimatePartRequestLines(sourcingNeeds.serviceEstimateId) : [];
  const totalAmount = requestableLines.reduce((sum: number, l: (typeof requestableLines)[number]) => sum + (l.amount !== null ? Number(l.amount) : 0), 0);
  const vehicle = service.vehicle;
  const vehicleSummary = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';

  return (
    <div className="p-8">
      <LoadingLink
        href={`/workshop/vehicle-service/${id}`}
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Vehicle Service {service.serviceNumber}
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Request Store Parts</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        Every Part below was already matched and priced by Store. Nothing here needs editing; raising the request
        simply sends this exact list forward for approval.
      </p>

      {error ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {!sourcingNeeds.isEligibleToSource ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          This Vehicle Service isn&apos;t far enough along to request parts yet — the customer must have been notified
          and the 70% deposit recorded first.
        </p>
      ) : requestableLines.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          Nothing ready to request — either every matched Store Part line has already been requested, or none of this
          estimate&apos;s Store Part lines are matched yet.
        </p>
      ) : (
        <div className="max-w-4xl overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <div className="grid gap-4 border-b border-[var(--ejo-border)] p-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Vehicle Service</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{service.serviceNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{service.customer.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Vehicle</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicleSummary}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Plate No.</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.plateNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">VIN / Chassis</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.chassisNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Technician in Charge</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{service.assignedTechnician?.fullName ?? '—'}</dd>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2">Part</th>
                  <th className="px-4 py-2">Part Type</th>
                  <th className="px-4 py-2">Part No.</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {requestableLines.map((line: (typeof requestableLines)[number]) => {
                  const quantity = Number(line.quantity);
                  return (
                    <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2 font-medium text-[var(--ejo-text)]">{line.matchedPart?.name ?? line.description}</td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{line.partType?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{line.matchedPart?.partNumber ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-[var(--ejo-text)]">
                        {quantity} {line.unitOfMeasure ? pluralizeWord(quantity, line.unitOfMeasure) : ''}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--ejo-text)]">{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--ejo-border)] font-medium text-[var(--ejo-text)]">
                  <td className="px-4 py-2" colSpan={3}>
                    {pluralize(requestableLines.length, 'Part')} total
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right">{formatNaira(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <form action={requestServiceEstimatePartRequestSlipFormAction} className="border-t border-[var(--ejo-border)] p-4">
            <FormPendingOverlay />
            <input type="hidden" name="serviceEstimateId" value={sourcingNeeds.serviceEstimateId ?? ''} />
            <input type="hidden" name="vehicleServiceId" value={id} />
            <SubmitButton
              label="Raise Parts Request"
              pendingLabel="Raising…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      )}
    </div>
  );
}
