import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds, getRequestableExternalProcurementLines } from '@/lib/actions/sourcing';
import { requestExternalProcurementFormAction } from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_LABEL: Record<string, string> = {
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
};

/**
 * One real document for the whole Job Card, not a separate one-off
 * click for every single line — a Lathe job and a Bushing both
 * needed for the same repair are one real trip to Finance for cash,
 * never two unconnected ones. Same shape as the Store Parts request:
 * a real header carrying the Job Card's own facts, a real table,
 * and exactly one action at the bottom.
 */
export default async function RequestProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const jobCard = await getJobCard(id);
  if (!jobCard) notFound();

  const [sourcingNeeds, requestableLines] = await Promise.all([getJobCardSourcingNeeds(id), getRequestableExternalProcurementLines(id)]);
  const totalAmount = requestableLines.reduce((sum: number, l: (typeof requestableLines)[number]) => sum + (l.amount !== null ? Number(l.amount) : 0), 0);
  const vehicle = jobCard.vehicle;
  const vehicleSummary = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';

  return (
    <div className="p-8">
      <LoadingLink
        href={`/workshop/job-cards/${id}`}
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Job Card {jobCard.jobNumber}
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Request External Procurement</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        Every line below is already priced on the approved estimate. Nothing here needs editing; raising the request
        sends this exact list forward as a cash advance request.
      </p>

      {error ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {!sourcingNeeds.isEligibleToSource ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          This Job Card isn&apos;t far enough along to request procurement yet — it needs to be at least In Progress.
        </p>
      ) : requestableLines.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          Nothing ready to request — either every External Part/Job line has already been requested, or none of this
          estimate&apos;s external-type lines are priced yet.
        </p>
      ) : (
        <div className="max-w-4xl overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <div className="grid gap-4 border-b border-[var(--ejo-border)] p-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Job Card</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{jobCard.jobNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{jobCard.customer.fullName}</dd>
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
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{jobCard.assignedTechnician?.fullName ?? '—'}</dd>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {requestableLines.map((line: (typeof requestableLines)[number]) => (
                  <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2 font-medium text-[var(--ejo-text)]">{line.description}</td>
                    <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{TYPE_LABEL[line.type] ?? line.type}</td>
                    <td className="px-4 py-2 text-right text-[var(--ejo-text)]">
                      {line.quantity} {line.unitOfMeasure ? pluralizeWord(line.quantity, line.unitOfMeasure) : ''}
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--ejo-text)]">{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--ejo-border)] font-medium text-[var(--ejo-text)]">
                  <td className="px-4 py-2" colSpan={2}>
                    {pluralize(requestableLines.length, 'Line')} total
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right">{formatNaira(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <form action={requestExternalProcurementFormAction} className="border-t border-[var(--ejo-border)] p-4">
            <FormPendingOverlay />
            <input type="hidden" name="jobCardId" value={id} />
            <SubmitButton
              label="Raise Procurement Request"
              pendingLabel="Raising…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      )}
    </div>
  );
}
