import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds, getRequestablePartRequestLines } from '@/lib/actions/sourcing';
import { requestPartRequestSlipFormAction } from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Deliberately nothing to pick, type, or search here — every real Store
 * Part line on this estimate was already matched to a real catalog Part,
 * priced, and approved long before this page exists to be visited at
 * all. This is a real, read-only preview of exactly what's about to be
 * requested, and one single action to actually raise it — the same
 * "everything's already decided, just confirm and go" shape as, say,
 * reviewing a cart before checkout, never a form asking you to re-enter
 * facts the system already knows. The header carries the same real Job
 * Card/vehicle context as the request's own detail page, so this reads
 * as one standard document family, not two different styles.
 */
export default async function RequestPartsPage({
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

  const [sourcingNeeds, requestableLines] = await Promise.all([getJobCardSourcingNeeds(id), getRequestablePartRequestLines(id)]);
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
          This Job Card isn&apos;t far enough along to request parts yet — it needs to be at least In Progress.
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
                  <th className="px-4 py-2">Part</th>
                  <th className="px-4 py-2">Part Type</th>
                  <th className="px-4 py-2">Part No.</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {requestableLines.map((line: (typeof requestableLines)[number]) => (
                  <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2 font-medium text-[var(--ejo-text)]">{line.matchedPart?.name ?? line.description}</td>
                    <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{line.partType?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{line.matchedPart?.partNumber ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-[var(--ejo-text)]">
                      {line.quantity} {line.unitOfMeasure ?? ''}
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--ejo-text)]">{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
                  </tr>
                ))}
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
          <form action={requestPartRequestSlipFormAction} className="border-t border-[var(--ejo-border)] p-4">
            <FormPendingOverlay />
            <input type="hidden" name="jobCardId" value={id} />
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
